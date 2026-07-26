const express = require('express');
const router = express.Router();
const { db, normalizeRow } = require('../config/database');

// Importação vinda do Make.com (relatório de vendas diário). Protegida por
// um secret simples via header, no mesmo padrão do CRON_SECRET em server.js —
// evita dar a credencial de produção do Postgres para o Make.
router.post('/importar', (req, res) => {
  const secretEsperado = process.env.POS_VISITA_IMPORT_SECRET;
  if (secretEsperado) {
    const auth = req.headers['authorization'];
    if (auth !== `Bearer ${secretEsperado}`) {
      return res.status(401).json({ error: 'Não autorizado.' });
    }
  }

  const { registros } = req.body;
  if (!Array.isArray(registros)) {
    return res.status(400).json({ error: 'Campo "registros" (array) é obrigatório.' });
  }

  // Defesa extra: mesmo que o Make já filtre, só aceita quem ficou mais de 1h.
  const elegiveis = registros.filter(r => Number(r.tempoTotalMinutos) > 60);
  const criadoEm = new Date().toISOString();

  let promise = Promise.resolve();
  let inseridos = 0;
  elegiveis.forEach(r => {
    const { dataSessao, cliente, numeroCliente, crianca, tempoTotalMinutos } = r;
    if (!dataSessao || !cliente || !numeroCliente || !crianca) return;
    const id = `${dataSessao}_${numeroCliente}_${crianca}`;
    promise = promise.then(() => new Promise(resolve => {
      db.run(
        `INSERT INTO pos_visita_registros (id, dataSessao, cliente, numeroCliente, crianca, tempoTotalMinutos, criadoEm)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(dataSessao, numeroCliente, crianca) DO NOTHING`,
        [id, dataSessao, cliente, numeroCliente, crianca, tempoTotalMinutos, criadoEm],
        (err) => {
          if (!err) inseridos++;
          resolve();
        }
      );
    }));
  });

  promise.then(() => {
    res.json({ success: true, recebidos: registros.length, elegiveis: elegiveis.length, inseridos });
  });
});

// Fila de pendentes: não filtra por dia exato — o relatório chega à noite e
// é disparado só na manhã seguinte, então "pendente" é o filtro certo.
router.get('/pendentes', (req, res) => {
  db.all(
    `SELECT * FROM pos_visita_registros WHERE mensagemEnviada = 0 OR mensagemEnviada IS NULL ORDER BY dataSessao ASC, criadoEm ASC`,
    [],
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ registros: (rows || []).map(normalizeRow) });
    }
  );
});

router.post('/marcar-enviada', (req, res) => {
  const { id } = req.body;
  if (!id) {
    return res.status(400).json({ error: 'Campo "id" é obrigatório.' });
  }
  const agora = new Date().toISOString();
  db.run(
    `UPDATE pos_visita_registros SET mensagemEnviada = 1, mensagemEnviadaEm = ? WHERE id = ?`,
    [agora, id],
    (err) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true });
    }
  );
});

module.exports = router;
