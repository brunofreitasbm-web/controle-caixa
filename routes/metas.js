const express = require('express');
const router = express.Router();
const { db, normalizeRow } = require('../config/database');

// ==========================================================================
// Metas (meta do ano da operação)
// Estrutura pronta para receber a importação — o formato do arquivo/modelo
// ainda será definido; por enquanto o endpoint aceita um payload já
// estruturado (ano, loja, metaAnual, metaMensal) e apenas persiste.
// ==========================================================================

router.get('/metas', (req, res) => {
  const { ano, loja } = req.query;
  let sql = 'SELECT * FROM metas WHERE 1=1';
  const params = [];
  if (ano) {
    sql += ' AND ano = ?';
    params.push(ano);
  }
  if (loja) {
    sql += ' AND loja = ?';
    params.push(loja);
  }
  sql += ' ORDER BY ano DESC, loja ASC';

  db.all(sql, params, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    const normalized = (rows || []).map(normalizeRow).map(r => {
      let metaMensal = null;
      try { metaMensal = r.metaMensal ? JSON.parse(r.metaMensal) : null; } catch (e) { metaMensal = null; }
      return { ...r, metaMensal };
    });
    res.json(normalized);
  });
});

// Importação da meta do ano — placeholder à espera do modelo de arquivo.
// Aceita { ano, loja, metaAnual, metaMensal, origem } já parseado no cliente.
router.post('/metas/importar', (req, res) => {
  const { ano, loja, metaAnual, metaMensal, origem } = req.body;
  if (!ano || !loja) {
    return res.status(400).json({ error: 'Ano e loja são obrigatórios.' });
  }
  const agora = new Date().toISOString();

  db.run(
    'INSERT INTO metas (ano, loja, metaAnual, metaMensal, origem, criadoEm, importadoEm) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [ano, loja, metaAnual || null, metaMensal ? JSON.stringify(metaMensal) : null, origem || 'importacao_manual', agora, agora],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      res.status(201).json({ success: true });
    }
  );
});

router.delete('/metas/:id', (req, res) => {
  const { id } = req.params;
  db.run('DELETE FROM metas WHERE id = ?', [id], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true });
  });
});

// ==========================================================================
// Meta Hora a Hora — venda acumulada informada pelo(a) colaborador(a) a cada
// hora, para acompanhamento parcial da meta do dia.
// ==========================================================================

router.get('/vendas-horarias', (req, res) => {
  const { loja, data } = req.query;
  if (!loja || !data) {
    return res.status(400).json({ error: 'Loja e data são obrigatórias.' });
  }
  db.all(
    'SELECT * FROM vendas_horarias WHERE loja = ? AND data = ? ORDER BY hora ASC',
    [loja, data],
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json((rows || []).map(normalizeRow));
    }
  );
});

// Upsert por (loja, data, hora) — cada lançamento do colaborador substitui o
// valor da mesma hora.
router.post('/vendas-horarias', (req, res) => {
  const { loja, data, hora, vendaAcumulada, registradoPor } = req.body;
  if (!loja || !data || hora === undefined || hora === null) {
    return res.status(400).json({ error: 'Loja, data e hora são obrigatórias.' });
  }
  const agora = new Date().toISOString();

  db.run(
    `INSERT INTO vendas_horarias (loja, data, hora, vendaAcumulada, registradoPor, criadoEm)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(loja, data, hora) DO UPDATE SET vendaAcumulada = ?, registradoPor = ?`,
    [loja, data, hora, vendaAcumulada, registradoPor || null, agora, vendaAcumulada, registradoPor || null],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true });
    }
  );
});

module.exports = router;
