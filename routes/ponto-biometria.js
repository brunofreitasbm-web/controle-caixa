const express = require('express');
const router = express.Router();
const { db } = require('../config/database');

// Espelha FACE_DETECTION_MIN_CONFIDENCE do frontend (webapp/app.js) — o
// servidor não roda o modelo, mas exige que o score reportado pelo cliente
// atinja o mesmo piso de confiança antes de aceitar um cadastro.
const FACE_DETECTION_MIN_CONFIDENCE = 0.85;
const MAX_TENTATIVAS = 3;
const BLOQUEIO_HORAS = 24;

router.get('/biometria/:usuario', (req, res) => {
  const { usuario } = req.params;

  db.get('SELECT embedding FROM ponto_biometria WHERE usuario = ?', [usuario], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ embedding: row ? JSON.parse(row.embedding) : null });
  });
});

router.post('/biometria', (req, res) => {
  const { usuario, embedding, detectionScore } = req.body;
  if (!usuario || !Array.isArray(embedding)) {
    return res.status(400).json({ error: 'Usuário e embedding são obrigatórios.' });
  }

  db.get('SELECT nome FROM colaboradores WHERE nome = ?', [usuario], (errColab, colab) => {
    if (errColab) return res.status(500).json({ error: errColab.message });
    if (!colab) return res.status(404).json({ error: 'Colaborador não encontrado para cadastrar biometria.' });

    const agora = new Date().toISOString();

    db.get('SELECT tentativasFalhas, bloqueadoAte FROM biometria_tentativas WHERE usuario = ?', [usuario], (err, tentativa) => {
    if (err) return res.status(500).json({ error: err.message });

    if (tentativa && tentativa.bloqueadoAte && new Date(tentativa.bloqueadoAte) > new Date()) {
      return res.status(423).json({
        status: 'TEMPORARILY_BLOCKED',
        unlockHint: 'Procure o RH/Administrador para liberar novas tentativas.'
      });
    }

    const embeddingValido = embedding.length === 128 && embedding.every(n => typeof n === 'number' && Number.isFinite(n));
    const scoreValido = typeof detectionScore === 'number' && detectionScore >= FACE_DETECTION_MIN_CONFIDENCE;

    if (embeddingValido && scoreValido) {
      db.run(
        `INSERT INTO ponto_biometria (usuario, embedding, criadoEm, atualizadoEm)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(usuario) DO UPDATE SET
           embedding = excluded.embedding,
           atualizadoEm = excluded.atualizadoEm`,
        [usuario, JSON.stringify(embedding), agora, agora],
        (errUpsert) => {
          if (errUpsert) return res.status(500).json({ error: errUpsert.message });
          db.run('UPDATE colaboradores SET hasBiometricEnrolled = 1 WHERE nome = ?', [usuario], (errUpdate) => {
            if (errUpdate) return res.status(500).json({ error: errUpdate.message });
            db.run('DELETE FROM biometria_tentativas WHERE usuario = ?', [usuario], () => {
              res.json({ status: 'ENROLLED' });
            });
          });
        }
      );
      return;
    }

    const tentativasFalhas = (tentativa ? tentativa.tentativasFalhas : 0) + 1;
    const bloqueado = tentativasFalhas > MAX_TENTATIVAS;
    const bloqueadoAte = bloqueado
      ? new Date(Date.now() + BLOQUEIO_HORAS * 60 * 60 * 1000).toISOString()
      : null;

    db.run(
      `INSERT INTO biometria_tentativas (usuario, tentativasFalhas, bloqueadoAte, ultimaTentativaEm)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(usuario) DO UPDATE SET
         tentativasFalhas = ?,
         bloqueadoAte = ?,
         ultimaTentativaEm = ?`,
      [usuario, tentativasFalhas, bloqueadoAte, agora, tentativasFalhas, bloqueadoAte, agora],
      (errTentativa) => {
        if (errTentativa) return res.status(500).json({ error: errTentativa.message });
        if (bloqueado) {
          return res.status(423).json({
            status: 'TEMPORARILY_BLOCKED',
            unlockHint: 'Procure o RH/Administrador para liberar novas tentativas.'
          });
        }
        res.json({ status: 'REJECTED_RETRYABLE', attemptsRemaining: MAX_TENTATIVAS - tentativasFalhas });
      }
    );
  });
 });
});

module.exports = router;
