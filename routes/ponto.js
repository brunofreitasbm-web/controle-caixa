const express = require('express');
const router = express.Router();
const { db } = require('../config/database');
const { publish } = require('../config/realtime');
const { enviarEmailGenerico } = require('../config/notifications');
const { registrarLog } = require('../config/logger');

router.post('/sync', (req, res) => {
  const records = req.body.records || [];
  if (!Array.isArray(records)) {
    return res.status(400).json({ error: 'Registros inválidos.' });
  }

  if (records.length === 0) {
    return res.json({ success: true, count: 0 });
  }

  const serverTime = new Date();
  const serverTimeIso = serverTime.toISOString();

  // Um upsert por batida de ponto virava um upsert por registro sincronizado
  // (normalmente 1, às vezes alguns quando o aparelho ficou offline). Agora é
  // um único INSERT multi-linha. Dedup por id — mesma chave do ON CONFLICT —
  // mantendo a última ocorrência caso o mesmo registro venha duas vezes no
  // mesmo lote.
  const porId = new Map();
  records.forEach(r => {
    const clientTime = new Date(r.timestamp);
    const deviationMs = Math.abs(serverTime.getTime() - clientTime.getTime());
    const deviationMinutes = deviationMs / (1000 * 60);
    porId.set(r.id, [r.id, r.usuario, r.timestamp, r.tipo, r.operacao || null, r.gps, r.accuracy, r.photo, r.hash, deviationMinutes, serverTimeIso]);
  });

  const placeholders = [];
  const params = [];
  porId.forEach(valores => {
    placeholders.push('(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
    params.push(...valores);
  });

  db.run(
    `INSERT INTO ponto_registros (id, usuario, timestamp, tipo, operacao, gps, accuracy, photo, hash, audit_deviation, criadoEm)
     VALUES ${placeholders.join(', ')}
     ON CONFLICT(id) DO UPDATE SET
       usuario = excluded.usuario,
       timestamp = excluded.timestamp,
       tipo = excluded.tipo,
       operacao = excluded.operacao,
       gps = excluded.gps,
       accuracy = excluded.accuracy,
       photo = excluded.photo,
       hash = excluded.hash,
       audit_deviation = excluded.audit_deviation`,
    params,
    function(err) {
      if (err) {
        return res.status(500).json({ success: false, errors: [err.message] });
      }
      // Só metadados no evento: a selfie (r.photo) e o GPS nunca trafegam
      // no canal em tempo real.
      publish('ponto.registro', {
        registros: records.map(x => ({ id: x.id, usuario: x.usuario, tipo: x.tipo, operacao: x.operacao || null, timestamp: x.timestamp }))
      }, { origem: req.body.clientId, usuario: records[0] && records[0].usuario });
      return res.json({ success: true, count: records.length });
    }
  );
});

router.post('/ajuste', (req, res) => {
  const { id, usuario, data, tipo, motivo, comprovante } = req.body;
  if (!id || !usuario || !data || !tipo) {
    return res.status(400).json({ error: 'Parâmetros obrigatórios ausentes.' });
  }

  const criadoEm = new Date().toISOString();
  db.run(
    'INSERT INTO ponto_ajustes (id, usuario, data, tipo, motivo, comprovante, status, criadoEm) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [id, usuario, data, tipo, motivo, comprovante, 'PENDING', criadoEm],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      publish('ponto.ajuste', { id, usuario, data, tipo, status: 'PENDING' },
        { origem: req.body.clientId, usuario });
      res.json({ success: true });
    }
  );
});

router.get('/historico', (req, res) => {
  const { usuario } = req.query;
  if (!usuario) {
    return res.status(400).json({ error: 'Usuário é obrigatório.' });
  }

  db.all('SELECT * FROM ponto_registros WHERE usuario = ? ORDER BY timestamp ASC', [usuario], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    
    db.all('SELECT * FROM ponto_ajustes WHERE usuario = ? ORDER BY data ASC', [usuario], (err2, rows2) => {
      if (err2) return res.status(500).json({ error: err2.message });
      res.json({ registros: rows || [], ajustes: rows2 || [] });
    });
  });
});

// Relatório administrativo: todas as colaboradoras se for gestor/owner, ou filtrado pelo próprio usuário.
router.get('/relatorio', (req, res) => {
  const { operacao, usuario } = req.query;
  const userTrim = (usuario || '').trim();

  if (!userTrim) {
    const sql = operacao && operacao !== 'todas'
      ? 'SELECT * FROM ponto_registros WHERE operacao = ? ORDER BY timestamp DESC LIMIT 5000'
      : 'SELECT * FROM ponto_registros ORDER BY timestamp DESC LIMIT 5000';
    const params = operacao && operacao !== 'todas' ? [operacao] : [];
    return db.all(sql, params, (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ registros: rows || [] });
    });
  }

  db.get('SELECT role FROM colaboradores WHERE nome = ?', [userTrim], (err, colab) => {
    if (err) return res.status(500).json({ error: err.message });
    const isGestor = colab && (colab.role === 'owner' || colab.role === 'consultora_dashboard');
    
    let sql, params;
    if (isGestor) {
      sql = operacao && operacao !== 'todas'
        ? 'SELECT * FROM ponto_registros WHERE operacao = ? ORDER BY timestamp DESC LIMIT 5000'
        : 'SELECT * FROM ponto_registros ORDER BY timestamp DESC LIMIT 5000';
      params = operacao && operacao !== 'todas' ? [operacao] : [];
    } else {
      sql = operacao && operacao !== 'todas'
        ? 'SELECT * FROM ponto_registros WHERE usuario = ? AND operacao = ? ORDER BY timestamp DESC LIMIT 5000'
        : 'SELECT * FROM ponto_registros WHERE usuario = ? ORDER BY timestamp DESC LIMIT 5000';
      params = operacao && operacao !== 'todas' ? [userTrim, operacao] : [userTrim];
    }

    db.all(sql, params, (err2, rows) => {
      if (err2) return res.status(500).json({ error: err2.message });
      res.json({ registros: rows || [] });
    });
  });
});

// Envio da Folha de Ponto (PDF) para o contador. O PDF é gerado no cliente
// (jsPDF, mesma função do download) e chega aqui já em base64 — assim não
// precisamos duplicar a montagem do layout no servidor.
router.post('/folha-email', (req, res) => {
  const { email, assunto, mensagem, pdfBase64, nomeArquivo, remetente } = req.body;

  if (!email || !pdfBase64) {
    return res.status(400).json({ error: 'E-mail do contador e o PDF são obrigatórios.' });
  }

  const destinatarios = String(email)
    .split(/[;,]/)
    .map(e => e.trim())
    .filter(Boolean);

  if (destinatarios.length === 0) {
    return res.status(400).json({ error: 'Nenhum e-mail válido informado.' });
  }

  // Aceita qualquer variação de data URI (o jsPDF do cliente gera algo como
  // "data:application/pdf;filename=generated.pdf;base64,XXXX", não o
  // "data:application/pdf;base64,XXXX" mais comum) ou o base64 puro.
  const base64Limpo = String(pdfBase64).replace(/^data:.*?;base64,/, '');

  enviarEmailGenerico(
    destinatarios,
    assunto || 'Folha de Ponto - Cacau Show',
    mensagem || 'Segue em anexo a folha de ponto do período.',
    null,
    [{
      filename: nomeArquivo || 'folha-de-ponto.pdf',
      content: base64Limpo,
      encoding: 'base64'
    }]
  )
    .then(() => {
      registrarLog(null, 'ENVIO_FOLHA_PONTO', `Folha de ponto enviada para ${destinatarios.join(', ')}`, remetente || 'Sistema');
      res.json({ success: true, destinatarios });
    })
    .catch(err => {
      console.error('Erro ao enviar folha de ponto por e-mail:', err);
      res.status(500).json({ error: err.message || 'Falha ao enviar o e-mail.' });
    });
});

module.exports = router;
