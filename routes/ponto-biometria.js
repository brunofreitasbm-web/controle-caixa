const express = require('express');
const router = express.Router();
const { db } = require('../config/database');

router.get('/biometria/:usuario', (req, res) => {
  const { usuario } = req.params;

  db.get('SELECT embedding FROM ponto_biometria WHERE usuario = ?', [usuario], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ embedding: row ? JSON.parse(row.embedding) : null });
  });
});

router.post('/biometria', (req, res) => {
  const { usuario, embedding } = req.body;
  if (!usuario || !Array.isArray(embedding)) {
    return res.status(400).json({ error: 'Usuário e embedding são obrigatórios.' });
  }

  const agora = new Date().toISOString();
  db.run(
    `INSERT INTO ponto_biometria (usuario, embedding, criadoEm, atualizadoEm)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(usuario) DO UPDATE SET
       embedding = excluded.embedding,
       atualizadoEm = excluded.atualizadoEm`,
    [usuario, JSON.stringify(embedding), agora, agora],
    (err) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true });
    }
  );
});

module.exports = router;
