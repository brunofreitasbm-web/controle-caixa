const express = require('express');
const router = express.Router();
const { db } = require('../config/database');

// Regra padrão usada quando nenhuma competência foi cadastrada ainda —
// reflete exatamente as fórmulas da planilha original de bonificação.
const REGRA_PADRAO = {
  ouroPercentMin: 0.5,
  ouroValor: 100,
  diamantePercentMin: 0.6,
  diamanteValor: 150,
  pixMinVendas2h: 5,
  pixValor: 20,
  pixDiasSemana: JSON.stringify(["Sexta-feira", "Sábado", "Domingo"])
};

router.post('/diaria', (req, res) => {
  const { usuario, unidade, data, vendas30, vendas1h, vendas2h, locacoes } = req.body;
  if (!usuario || !unidade || !data) {
    return res.status(400).json({ error: 'Parâmetros obrigatórios ausentes.' });
  }

  const id = `${usuario}_${unidade}_${data}`;
  const criadoEm = new Date().toISOString();
  db.run(
    `INSERT INTO fa_bonificacao_diaria (id, usuario, unidade, data, vendas30, vendas1h, vendas2h, locacoes, criadoEm)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(usuario, unidade, data) DO UPDATE SET
       vendas30 = excluded.vendas30,
       vendas1h = excluded.vendas1h,
       vendas2h = excluded.vendas2h,
       locacoes = excluded.locacoes`,
    [id, usuario, unidade, data, vendas30 || 0, vendas1h || 0, vendas2h || 0, locacoes || 0, criadoEm],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true });
    }
  );
});

router.get('/mes', (req, res) => {
  const { usuario, unidade, competencia } = req.query;
  if (!usuario || !competencia) {
    return res.status(400).json({ error: 'Usuário e competência são obrigatórios.' });
  }

  const filtraUnidade = unidade && unidade !== 'todas';
  const sql = filtraUnidade
    ? 'SELECT * FROM fa_bonificacao_diaria WHERE usuario = ? AND unidade = ? AND data LIKE ? ORDER BY data ASC'
    : 'SELECT * FROM fa_bonificacao_diaria WHERE usuario = ? AND data LIKE ? ORDER BY data ASC';
  const params = filtraUnidade ? [usuario, unidade, `${competencia}%`] : [usuario, `${competencia}%`];

  db.all(sql, params, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ lancamentos: rows || [] });
  });
});

router.get('/mes-todas', (req, res) => {
  const { competencia, unidade } = req.query;
  if (!competencia) {
    return res.status(400).json({ error: 'Competência é obrigatória.' });
  }

  const filtraUnidade = unidade && unidade !== 'todas';
  const sql = filtraUnidade
    ? 'SELECT * FROM fa_bonificacao_diaria WHERE unidade = ? AND data LIKE ? ORDER BY usuario ASC, data ASC'
    : 'SELECT * FROM fa_bonificacao_diaria WHERE data LIKE ? ORDER BY usuario ASC, data ASC';
  const params = filtraUnidade ? [unidade, `${competencia}%`] : [`${competencia}%`];

  db.all(sql, params, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ lancamentos: rows || [] });
  });
});

// O Postgres dobra identificadores sem aspas para minúsculas, então um
// `SELECT *` devolveria `ouropercentmin` em vez de `ouroPercentMin`. Os
// aliases entre aspas preservam o camelCase esperado pelo frontend nos dois
// bancos (no SQLite os identificadores são case-insensitive).
const SELECT_REGRAS = `SELECT
  competencia,
  ouropercentmin AS "ouroPercentMin",
  ourovalor AS "ouroValor",
  diamantepercentmin AS "diamantePercentMin",
  diamantevalor AS "diamanteValor",
  pixminvendas2h AS "pixMinVendas2h",
  pixvalor AS "pixValor",
  pixdiassemana AS "pixDiasSemana"
FROM fa_bonificacao_regras`;

// Retorna a regra da competência pedida; se não existir, cai para a
// competência cadastrada mais recente anterior; se nenhuma existir ainda,
// usa a regra padrão (a mesma da planilha original).
router.get('/regras', (req, res) => {
  const { competencia } = req.query;
  if (!competencia) {
    return res.status(400).json({ error: 'Competência é obrigatória.' });
  }

  db.get(`${SELECT_REGRAS} WHERE competencia = ?`, [competencia], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (row) return res.json({ regra: row, origem: 'exata' });

    db.get(
      `${SELECT_REGRAS} WHERE competencia < ? ORDER BY competencia DESC LIMIT 1`,
      [competencia],
      (err2, fallbackRow) => {
        if (err2) return res.status(500).json({ error: err2.message });
        if (fallbackRow) return res.json({ regra: fallbackRow, origem: 'herdada' });
        return res.json({ regra: { competencia, ...REGRA_PADRAO }, origem: 'padrao' });
      }
    );
  });
});

router.post('/regras', (req, res) => {
  const {
    competencia, ouroPercentMin, ouroValor, diamantePercentMin, diamanteValor,
    pixMinVendas2h, pixValor, pixDiasSemana
  } = req.body;

  if (!competencia) {
    return res.status(400).json({ error: 'Competência é obrigatória.' });
  }

  const criadoEm = new Date().toISOString();
  db.run(
    `INSERT INTO fa_bonificacao_regras
       (competencia, ouroPercentMin, ouroValor, diamantePercentMin, diamanteValor, pixMinVendas2h, pixValor, pixDiasSemana, criadoEm)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(competencia) DO UPDATE SET
       ouroPercentMin = excluded.ouroPercentMin,
       ouroValor = excluded.ouroValor,
       diamantePercentMin = excluded.diamantePercentMin,
       diamanteValor = excluded.diamanteValor,
       pixMinVendas2h = excluded.pixMinVendas2h,
       pixValor = excluded.pixValor,
       pixDiasSemana = excluded.pixDiasSemana`,
    [
      competencia, ouroPercentMin, ouroValor, diamantePercentMin, diamanteValor,
      pixMinVendas2h, pixValor, JSON.stringify(pixDiasSemana || []), criadoEm
    ],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true });
    }
  );
});

// ==========================================================================
// REGRAS DE LOCAÇÕES — Parque Circuito (quiosque de carrinhos). Metodologia
// distinta da bonificação por conversão: a meta é contagem de locações/dia.
// ==========================================================================

// Valores padrão vindos do META.pdf do quiosque de carrinhos.
const REGRA_LOCACOES_PADRAO = {
  metaSegQui: 20,
  metaSexta: 38,
  metaSabado: 45,
  metaDomingo: 40,
  ticketMedio: 48,
  pisoMes: 455,
  metaMes: 840,
  superMetaMes: 1110,
  farolVerde: 1.0,
  farolAmarelo: 0.8
};

const SELECT_REGRAS_LOCACOES = `SELECT
  competencia,
  metasegqui AS "metaSegQui",
  metasexta AS "metaSexta",
  metasabado AS "metaSabado",
  metadomingo AS "metaDomingo",
  ticketmedio AS "ticketMedio",
  pisomes AS "pisoMes",
  metames AS "metaMes",
  supermetames AS "superMetaMes",
  farolverde AS "farolVerde",
  farolamarelo AS "farolAmarelo"
FROM fa_regras_locacoes`;

router.get('/regras-locacoes', (req, res) => {
  const { competencia } = req.query;
  if (!competencia) {
    return res.status(400).json({ error: 'Competência é obrigatória.' });
  }

  db.get(`${SELECT_REGRAS_LOCACOES} WHERE competencia = ?`, [competencia], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (row) return res.json({ regra: row, origem: 'exata' });

    db.get(
      `${SELECT_REGRAS_LOCACOES} WHERE competencia < ? ORDER BY competencia DESC LIMIT 1`,
      [competencia],
      (err2, fallbackRow) => {
        if (err2) return res.status(500).json({ error: err2.message });
        if (fallbackRow) return res.json({ regra: fallbackRow, origem: 'herdada' });
        return res.json({ regra: { competencia, ...REGRA_LOCACOES_PADRAO }, origem: 'padrao' });
      }
    );
  });
});

router.post('/regras-locacoes', (req, res) => {
  const {
    competencia, metaSegQui, metaSexta, metaSabado, metaDomingo, ticketMedio,
    pisoMes, metaMes, superMetaMes, farolVerde, farolAmarelo
  } = req.body;

  if (!competencia) {
    return res.status(400).json({ error: 'Competência é obrigatória.' });
  }

  const criadoEm = new Date().toISOString();
  db.run(
    `INSERT INTO fa_regras_locacoes
       (competencia, metaSegQui, metaSexta, metaSabado, metaDomingo, ticketMedio, pisoMes, metaMes, superMetaMes, farolVerde, farolAmarelo, criadoEm)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(competencia) DO UPDATE SET
       metaSegQui = excluded.metaSegQui,
       metaSexta = excluded.metaSexta,
       metaSabado = excluded.metaSabado,
       metaDomingo = excluded.metaDomingo,
       ticketMedio = excluded.ticketMedio,
       pisoMes = excluded.pisoMes,
       metaMes = excluded.metaMes,
       superMetaMes = excluded.superMetaMes,
       farolVerde = excluded.farolVerde,
       farolAmarelo = excluded.farolAmarelo`,
    [
      competencia, metaSegQui, metaSexta, metaSabado, metaDomingo, ticketMedio,
      pisoMes, metaMes, superMetaMes, farolVerde, farolAmarelo, criadoEm
    ],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true });
    }
  );
});

module.exports = router;
