const express = require('express');
const router = express.Router();
const { db } = require('../config/database');
const { publish } = require('../config/realtime');

const JANELA_ABERTURA_ANTES_MIN = 5;
const JANELA_FECHAMENTO_DEPOIS_MIN = 20;

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

function formatBRL(valor) {
  return (Number(valor) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

router.post('/registrar', (req, res) => {
  const { operacao, usuario, data, horaSlot, valor } = req.body;
  if (!operacao || !usuario || !data || !horaSlot || valor === undefined || valor === null) {
    return res.status(400).json({ error: 'Parâmetros obrigatórios ausentes.' });
  }

  const valorNum = Number(valor);
  if (!Number.isFinite(valorNum) || valorNum < 0) {
    return res.status(400).json({ error: 'Valor inválido. Informe um número maior ou igual a zero.' });
  }

  const agora = agoraBrasil();
  if (data !== agora.data) {
    return res.status(400).json({ error: 'Só é possível confirmar o intervalo do dia de hoje.' });
  }

  const slotMin = minutosDoHoraSlot(horaSlot);
  if (slotMin === null) {
    return res.status(400).json({ error: 'Intervalo de hora inválido.' });
  }
  if (agora.minutosDoDia < slotMin - JANELA_ABERTURA_ANTES_MIN || agora.minutosDoDia > slotMin + JANELA_FECHAMENTO_DEPOIS_MIN) {
    return res.status(400).json({ error: `Este intervalo só pode ser confirmado de ${JANELA_ABERTURA_ANTES_MIN} minutos antes até ${JANELA_FECHAMENTO_DEPOIS_MIN} minutos depois do horário estabelecido.` });
  }

  // Venda é ACUMULADA: um intervalo não pode ficar menor que um anterior já
  // confirmado nem maior que um posterior já confirmado, senão a curva do dia
  // deixa de ser monotônica (normalmente sinal de erro de digitação).
  db.all(
    `SELECT valor, horaslot AS "horaSlot" FROM metas_vendas WHERE operacao = ? AND data = ? AND horaSlot <> ?`,
    [operacao, data, horaSlot],
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });

      let minPermitido = 0;
      let maxPermitido = Infinity;
      let horaMin = null;
      let horaMax = null;
      (rows || []).forEach(row => {
        const rowMin = minutosDoHoraSlot(row.horaSlot);
        const rowValor = Number(row.valor);
        if (rowMin === null || !Number.isFinite(rowValor)) return;
        if (rowMin < slotMin && rowValor > minPermitido) {
          minPermitido = rowValor;
          horaMin = row.horaSlot;
        }
        if (rowMin > slotMin && rowValor < maxPermitido) {
          maxPermitido = rowValor;
          horaMax = row.horaSlot;
        }
      });

      if (valorNum < minPermitido) {
        return res.status(400).json({
          error: `O valor não pode ser menor que ${formatBRL(minPermitido)}, já confirmado às ${horaMin}, pois a venda é acumulada e só pode aumentar ao longo do dia.`
        });
      }
      if (valorNum > maxPermitido) {
        return res.status(400).json({
          error: `O valor não pode ser maior que ${formatBRL(maxPermitido)}, já confirmado às ${horaMax}. Confira se não houve erro de digitação.`
        });
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
        [id, operacao, usuario, valorNum, data, horaSlot, timestamp, timestamp],
        function(insertErr) {
          if (insertErr) return res.status(500).json({ error: insertErr.message });
          publish('meta.checkin', { id, operacao, usuario, valor: valorNum, data, horaSlot, timestamp },
            { origem: req.body.clientId, usuario });
          res.json({ success: true, timestamp });
        }
      );
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
