const express = require('express');
const router = express.Router();
const { db } = require('../config/database');

// Importação em lote das metas diárias extraídas da planilha "$ Meta Total"
// por loja. `origem` diferencia linhas com detalhamento real por dia
// ('diaria') de linhas que representam o total do mês inteiro ('mensal') —
// o Meta Hora a Hora só usa as 'diaria'.
router.post('/importar', (req, res) => {
  const { loja, linhas } = req.body;
  if (!loja || !Array.isArray(linhas)) {
    return res.status(400).json({ error: 'Parâmetros obrigatórios ausentes.' });
  }
  if (linhas.length === 0) {
    return res.json({ success: true, count: 0 });
  }

  const criadoEm = new Date().toISOString();
  let completed = 0;
  let errors = [];

  linhas.forEach(linha => {
    const id = `${loja}_${linha.data}`;
    db.run(
      `INSERT INTO metas_diarias_lojas (id, loja, data, valor, origem, criadoEm)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(loja, data) DO UPDATE SET
         valor = excluded.valor,
         origem = excluded.origem`,
      [id, loja, linha.data, linha.valor, linha.origem, criadoEm],
      function(err) {
        completed++;
        if (err) errors.push(err.message);
        if (completed === linhas.length) {
          if (errors.length > 0) {
            return res.status(500).json({ success: false, errors });
          }
          return res.json({ success: true, count: linhas.length });
        }
      }
    );
  });
});

router.get('/dia', (req, res) => {
  const { loja, data } = req.query;
  if (!loja || !data) {
    return res.status(400).json({ error: 'Loja e data são obrigatórias.' });
  }

  db.get('SELECT * FROM metas_diarias_lojas WHERE loja = ? AND data = ?', [loja, data], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ meta: row || null });
  });
});

router.get('/mes', (req, res) => {
  const { loja, competencia } = req.query;
  if (!loja || !competencia) {
    return res.status(400).json({ error: 'Loja e competência são obrigatórias.' });
  }

  db.all(
    'SELECT * FROM metas_diarias_lojas WHERE loja = ? AND data LIKE ? ORDER BY data ASC',
    [loja, `${competencia}%`],
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ metas: rows || [] });
    }
  );
});

module.exports = router;
