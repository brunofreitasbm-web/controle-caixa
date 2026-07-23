const express = require('express');
const router = express.Router();
const { db } = require('../config/database');

router.post('/sync', (req, res) => {
  const records = req.body.records || [];
  if (!Array.isArray(records)) {
    return res.status(400).json({ error: 'Registros inválidos.' });
  }

  const serverTime = new Date();
  const serverTimeIso = serverTime.toISOString();
  
  let completed = 0;
  let errors = [];

  if (records.length === 0) {
    return res.json({ success: true, count: 0 });
  }

  records.forEach(r => {
    const clientTime = new Date(r.timestamp);
    const deviationMs = Math.abs(serverTime.getTime() - clientTime.getTime());
    const deviationMinutes = deviationMs / (1000 * 60);

    db.run(
      `INSERT INTO ponto_registros (id, usuario, timestamp, tipo, gps, accuracy, photo, hash, audit_deviation, criadoEm)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         usuario = excluded.usuario,
         timestamp = excluded.timestamp,
         tipo = excluded.tipo,
         gps = excluded.gps,
         accuracy = excluded.accuracy,
         photo = excluded.photo,
         hash = excluded.hash,
         audit_deviation = excluded.audit_deviation`,
      [r.id, r.usuario, r.timestamp, r.tipo, r.gps, r.accuracy, r.photo, r.hash, deviationMinutes, serverTimeIso],
      function(err) {
        completed++;
        if (err) {
          errors.push(err.message);
        }
        if (completed === records.length) {
          if (errors.length > 0) {
            return res.status(500).json({ success: false, errors });
          }
          return res.json({ success: true, count: records.length });
        }
      }
    );
  });
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

module.exports = router;
