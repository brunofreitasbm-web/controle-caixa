const express = require('express');
const router = express.Router();
const { db } = require('../config/database');

const JANELA_CONFIRMACAO_MIN = 30;

// Data/hora "agora" no fuso de Brasília — usar UTC puro aqui causaria rejeição
// de check-ins legítimos à noite (quando UTC já virou o dia seguinte).
function agoraBrasil() {
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
  }).formatToParts(new Date());
  const obj = {};
  partes.forEach(p => { obj[p.type] = p.value; });
  return {
    data: `${obj.year}-${obj.month}-${obj.day}`,
    minutosDoDia: parseInt(obj.hour) * 60 + parseInt(obj.minute)
  };
}

function minutosDoHoraSlot(horaSlot) {
  const [h, m] = (horaSlot || '').split(':').map(Number);
  if (Number.isNaN(h)) return null;
  return h * 60 + (m || 0);
}

router.post('/registrar', (req, res) => {
  const { operacao, usuario, data, horaSlot, valor } = req.body;
  if (!operacao || !usuario || !data || !horaSlot || valor === undefined || valor === null) {
    return res.status(400).json({ error: 'Parâmetros obrigatórios ausentes.' });
  }

  const agora = agoraBrasil();
  if (data !== agora.data) {
    return res.status(400).json({ error: 'Só é possível confirmar o intervalo do dia de hoje.' });
  }

  const slotMin = minutosDoHoraSlot(horaSlot);
  if (slotMin === null) {
    return res.status(400).json({ error: 'Intervalo de hora inválido.' });
  }
  if (agora.minutosDoDia < slotMin || agora.minutosDoDia > slotMin + JANELA_CONFIRMACAO_MIN) {
    return res.status(400).json({ error: `Este intervalo só pode ser confirmado até ${JANELA_CONFIRMACAO_MIN} minutos depois do horário estabelecido.` });
  }

  const id = `${operacao}_${data}_${horaSlot}`;
  const timestamp = new Date().toISOString();
  db.run(
    `INSERT INTO metas_vendas (id, operacao, usuario, valor, data, horaSlot, timestamp, criadoEm)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(operacao, data, horaSlot) DO UPDATE SET
       usuario = excluded.usuario,
       valor = excluded.valor,
       timestamp = excluded.timestamp`,
    [id, operacao, usuario, valor, data, horaSlot, timestamp, timestamp],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true, timestamp });
    }
  );
});

router.get('/hoje', (req, res) => {
  const { operacao, data } = req.query;
  if (!operacao || !data) {
    return res.status(400).json({ error: 'Operação e data são obrigatórias.' });
  }

  // Alias entre aspas: no Postgres a coluna foi criada como `horaslot`
  // (identificadores sem aspas viram minúsculas), mas o frontend lê `horaSlot`.
  db.all(
    `SELECT id, operacao, usuario, valor, data, horaslot AS "horaSlot", timestamp
     FROM metas_vendas WHERE operacao = ? AND data = ? ORDER BY horaslot ASC`,
    [operacao, data],
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ vendas: rows || [] });
    }
  );
});

module.exports = router;
