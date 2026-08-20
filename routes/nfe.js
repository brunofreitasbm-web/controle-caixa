const express = require('express');
const router = express.Router();
const { db, normalizeRow } = require('../config/database');
const { registrarLog } = require('../config/logger');
const { enviarNotificacaoNfePendente } = require('../config/notifications');
const { publish } = require('../config/realtime');

// 1. Listar todas as NFEs para conferência
router.get('/', (req, res) => {
  const { loja, status, data } = req.query;
  let sql = 'SELECT * FROM nfe_conferencia WHERE 1=1';
  const params = [];

  if (loja) {
    sql += ' AND loja = ?';
    params.push(loja);
  }
  if (status) {
    sql += ' AND status = ?';
    params.push(status);
  }
  if (data) {
    sql += ' AND (dataEmissao LIKE ? OR criadoEm LIKE ?)';
    params.push(`${data}%`, `${data}%`);
  }

  sql += ' ORDER BY criadoEm DESC';

  db.all(sql, params, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    const normalized = (rows || []).map(normalizeRow);
    res.json(normalized);
  });
});

// 2. Registrar nova NFE para conferência
router.post('/', (req, res) => {
  const { loja, numeroNfe, chaveAcesso, dataEmissao, valor, observacoes } = req.body;

  if (!loja || !valor) {
    return res.status(400).json({ error: 'Loja e valor são obrigatórios.' });
  }

  const id = `nfe-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
  const agora = new Date().toISOString();
  const valorNum = Number(valor) || 0;

  db.run(
    `INSERT INTO nfe_conferencia (
      id, loja, numeroNfe, chaveAcesso, dataEmissao, valor, status, observacoes, conferidoPor, criadoEm, atualizadoEm
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      loja,
      numeroNfe || null,
      chaveAcesso || null,
      dataEmissao || agora.split('T')[0],
      valorNum,
      'pendente',
      observacoes || null,
      null,
      agora,
      agora
    ],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });

      enviarNotificacaoNfePendente(loja, numeroNfe, valorNum);

      const usuarioLog = req.query.usuario || 'Sistema';
      registrarLog(id, 'NFE_CREATE', `NFE registrada para conferência: ${loja} - R$ ${valorNum}`, usuarioLog);
      publish('nfe.criado', { id, loja, numeroNfe, valor: valorNum, status: 'pendente' }, { origem: req.query.clientId, usuario: usuarioLog });

      res.json({ success: true, id });
    }
  );
});

// 3. Atualizar status de conferência da NFE
router.put('/:id/status', (req, res) => {
  const { id } = req.params;
  const { status, observacoes, conferidoPor } = req.body;

  if (!['pendente', 'conferido', 'divergente'].includes(status)) {
    return res.status(400).json({ error: 'Status inválido. Use pendente, conferido ou divergente.' });
  }

  const agora = new Date().toISOString();
  const usuarioLog = conferidoPor || req.query.usuario || 'Owner';

  db.run(
    `UPDATE nfe_conferencia SET status = ?, observacoes = COALESCE(?, observacoes), conferidoPor = ?, atualizadoEm = ? WHERE id = ?`,
    [status, observacoes || null, usuarioLog, agora, id],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });

      registrarLog(id, 'NFE_STATUS', `Status da NFE alterado para ${status} por ${usuarioLog}`, usuarioLog);
      publish('nfe.alterado', { id, status, conferidoPor: usuarioLog, atualizadoEm: agora }, { origem: req.query.clientId, usuario: usuarioLog });

      res.json({ success: true });
    }
  );
});

// 4. Remover registro de NFE
router.delete('/:id', (req, res) => {
  const { id } = req.params;
  const usuarioLog = req.query.usuario || 'Desconhecido';

  db.run('DELETE FROM nfe_conferencia WHERE id = ?', [id], function(err) {
    if (err) return res.status(500).json({ error: err.message });

    registrarLog(id, 'NFE_DELETE', `Registro de NFE excluído por ${usuarioLog}`, usuarioLog);
    publish('nfe.excluido', { id }, { origem: req.query.clientId, usuario: usuarioLog });

    res.json({ success: true });
  });
});

module.exports = router;
