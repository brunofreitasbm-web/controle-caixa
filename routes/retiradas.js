const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { db, normalizeRow } = require('../config/database');
const { registrarLog } = require('../config/logger');
const { publish } = require('../config/realtime');
const { enviarNotificacaoRetiradaSolicitada } = require('../config/notifications');
const requireOwner = require('./middleware/requireOwner');

const BCRYPT_ROUNDS = 10;

function tabelaDoTipo(tipo) {
  return tipo === 'fa' ? 'registros_fa' : 'registros';
}

function eventoRegistroAlterado(tipo) {
  return tipo === 'fa' ? 'registroFa.alterado' : 'registro.alterado';
}

function normalizarSolicitacao(row) {
  const s = normalizeRow(row);
  if (!s) return s;
  let registroIds = [];
  try {
    registroIds = JSON.parse(s.registroIds || '[]');
  } catch (e) {
    registroIds = [];
  }
  return { ...s, registroIds };
}

/**
 * Verifica o PIN de um owner (mesma lógica de /auth/verify, incluindo
 * migração de PIN antigo em texto puro para hash bcrypt).
 */
function verificarPin(usuario, pin) {
  return new Promise((resolve, reject) => {
    db.get('SELECT pin FROM pins WHERE usuario = ?', [usuario], (err, row) => {
      if (err) return reject(err);
      if (!row) return resolve(false);

      if (row.pin.startsWith('$2a$') || row.pin.startsWith('$2b$')) {
        bcrypt.compare(pin, row.pin, (err2, match) => {
          if (err2) return reject(err2);
          resolve(match);
        });
      } else {
        const match = pin === row.pin;
        if (match) {
          bcrypt.hash(pin, BCRYPT_ROUNDS, (hashErr, hash) => {
            if (!hashErr) db.run('UPDATE pins SET pin = ? WHERE usuario = ?', [hash, usuario]);
          });
        }
        resolve(match);
      }
    });
  });
}

// Cria uma solicitação de retirada: a Líder de Operações propõe a retirada de
// um ou mais envelopes, e Bruno/Isabella recebem push + um modal que abre
// sozinho para autorizar com o PIN deles (não o dela).
router.post('/solicitacoes-retirada', (req, res) => {
  const { id, tipo, registroIds, loja, valorTotal, responsavel, dataRetirada, actorUsuario } = req.body;

  if (!id || !tipo || !Array.isArray(registroIds) || registroIds.length === 0 || !actorUsuario) {
    return res.status(400).json({ error: 'id, tipo, registroIds e actorUsuario são obrigatórios.' });
  }
  if (!responsavel || !dataRetirada) {
    return res.status(400).json({ error: 'responsavel e dataRetirada são obrigatórios.' });
  }

  const criadoEm = new Date().toISOString();

  db.run(
    `INSERT INTO solicitacoes_retirada (
      id, tipo, registroIds, loja, valorTotal, responsavel, dataRetirada, solicitadoPor, status, criadoEm
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pendente', ?)`,
    [id, tipo, JSON.stringify(registroIds), loja || null, Number(valorTotal) || 0, responsavel, dataRetirada, actorUsuario, criadoEm],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });

      registrarLog(id, 'RETIRADA_SOLICITADA', `Solicitação de retirada criada (${registroIds.length} envelope(s), loja ${loja}).`, actorUsuario);

      const payload = { id, tipo, registroIds, loja, valorTotal: Number(valorTotal) || 0, responsavel, dataRetirada, solicitadoPor: actorUsuario, criadoEm };
      publish('retirada.solicitada', payload, { usuario: actorUsuario });

      enviarNotificacaoRetiradaSolicitada(loja, Number(valorTotal) || 0, registroIds.length, actorUsuario);

      res.json({ success: true, id });
    }
  );
});

// Lista solicitações (uso: Bruno/Isabella buscam pendentes ao abrir o app;
// a Líder de Operações acompanha o status das que ela mesma criou).
router.get('/solicitacoes-retirada', (req, res) => {
  const { status } = req.query;
  const sql = status
    ? 'SELECT * FROM solicitacoes_retirada WHERE status = ? ORDER BY criadoEm DESC'
    : 'SELECT * FROM solicitacoes_retirada ORDER BY criadoEm DESC LIMIT 100';
  const params = status ? [status] : [];

  db.all(sql, params, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json((rows || []).map(normalizarSolicitacao));
  });
});

// Owner autoriza: precisa ser owner E acertar o PRÓPRIO PIN, digitado no
// PRÓPRIO aparelho — nunca o PIN de quem solicitou.
router.post('/solicitacoes-retirada/:id/autorizar', requireOwner, async (req, res) => {
  const { id } = req.params;
  const { actorUsuario, pin } = req.body;

  if (!pin) return res.status(400).json({ error: 'PIN é obrigatório.' });

  try {
    const pinValido = await verificarPin(actorUsuario, pin);
    if (!pinValido) {
      return res.status(401).json({ error: 'PIN inválido.' });
    }
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }

  db.get('SELECT * FROM solicitacoes_retirada WHERE id = ?', [id], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    const solicitacao = normalizarSolicitacao(row);
    if (!solicitacao) return res.status(404).json({ error: 'Solicitação não encontrada.' });
    if (solicitacao.status !== 'pendente') {
      return res.status(409).json({ error: `Solicitação já foi ${solicitacao.status === 'aprovada' ? 'autorizada' : 'recusada'} por ${solicitacao.autorizadoPor || 'outro usuário'}.`, status: solicitacao.status, autorizadoPor: solicitacao.autorizadoPor });
    }

    const tabela = tabelaDoTipo(solicitacao.tipo);
    const respondidoEm = new Date().toISOString();
    const camposRetirada = {
      status: 'retirado',
      dataRetirada: solicitacao.dataRetirada,
      retiradoPor: solicitacao.responsavel,
      confirmadoPorApp: solicitacao.solicitadoPor,
      autorizadoPor: actorUsuario
    };

    // Antes: um UPDATE por envelope do lote, fora de transação. Agora: um
    // único UPDATE com WHERE id IN (...) — todos os envelopes recebem os
    // mesmos campos, então não há motivo pra separar por linha. Os eventos de
    // tempo real continuam um por registro (é broadcast em memória, não
    // round-trip de banco, e cada cliente precisa do id individual).
    if (!Array.isArray(solicitacao.registroIds) || solicitacao.registroIds.length === 0) {
      return res.status(400).json({ error: 'Nenhum envelope para autorizar nesta solicitação.' });
    }

    const placeholdersIds = solicitacao.registroIds.map(() => '?').join(',');
    db.run(
      `UPDATE ${tabela} SET status = ?, dataRetirada = ?, retiradoPor = ?, confirmadoPorApp = ?, autorizadoPor = ? WHERE id IN (${placeholdersIds})`,
      [camposRetirada.status, camposRetirada.dataRetirada, camposRetirada.retiradoPor, camposRetirada.confirmadoPorApp, camposRetirada.autorizadoPor, ...solicitacao.registroIds],
      (errUpdate) => {
        if (errUpdate) {
          console.error('Erro ao aplicar retirada autorizada:', errUpdate.message);
          return res.status(500).json({ error: 'Falha ao aplicar a retirada em um ou mais envelopes.' });
        }

        solicitacao.registroIds.forEach(registroId => {
          publish(eventoRegistroAlterado(solicitacao.tipo), { id: registroId, campos: camposRetirada }, { usuario: actorUsuario });
        });

        db.run(
          `UPDATE solicitacoes_retirada SET status = 'aprovada', autorizadoPor = ?, respondidoEm = ? WHERE id = ?`,
          [actorUsuario, respondidoEm, id],
          (errFinal) => {
            if (errFinal) return res.status(500).json({ error: errFinal.message });

            registrarLog(id, 'RETIRADA_AUTORIZADA', `Retirada de ${solicitacao.registroIds.length} envelope(s) autorizada (solicitada por ${solicitacao.solicitadoPor}).`, actorUsuario);
            publish('retirada.autorizada', { id, tipo: solicitacao.tipo, registroIds: solicitacao.registroIds, autorizadoPor: actorUsuario, solicitadoPor: solicitacao.solicitadoPor }, { usuario: actorUsuario });

            res.json({ success: true });
          }
        );
      }
    );
  });
});

// Owner recusa: não precisa de PIN (recusar não move dinheiro nem some com
// registro nenhum — só avisa quem propôs que precisa rever a solicitação).
router.post('/solicitacoes-retirada/:id/recusar', requireOwner, (req, res) => {
  const { id } = req.params;
  const { actorUsuario, motivo } = req.body;

  db.get('SELECT * FROM solicitacoes_retirada WHERE id = ?', [id], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    const solicitacao = normalizarSolicitacao(row);
    if (!solicitacao) return res.status(404).json({ error: 'Solicitação não encontrada.' });
    if (solicitacao.status !== 'pendente') {
      return res.status(409).json({ error: 'Solicitação já foi respondida.', status: solicitacao.status });
    }

    const respondidoEm = new Date().toISOString();
    db.run(
      `UPDATE solicitacoes_retirada SET status = 'recusada', autorizadoPor = ?, motivoRecusa = ?, respondidoEm = ? WHERE id = ?`,
      [actorUsuario, motivo || null, respondidoEm, id],
      (errUpdate) => {
        if (errUpdate) return res.status(500).json({ error: errUpdate.message });

        registrarLog(id, 'RETIRADA_RECUSADA', `Retirada de ${solicitacao.registroIds.length} envelope(s) recusada (solicitada por ${solicitacao.solicitadoPor}).${motivo ? ' Motivo: ' + motivo : ''}`, actorUsuario);
        publish('retirada.recusada', { id, tipo: solicitacao.tipo, registroIds: solicitacao.registroIds, autorizadoPor: actorUsuario, solicitadoPor: solicitacao.solicitadoPor, motivo: motivo || null }, { usuario: actorUsuario });

        res.json({ success: true });
      }
    );
  });
});

module.exports = router;
