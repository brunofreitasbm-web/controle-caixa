// ==========================================================================
// FLUXO DE CAIXA — módulo exclusivo Owner
// ==========================================================================
// Todas as rotas exigem requireOwner (checagem no servidor, não só o card
// escondido no client — ver routes/middleware/requireOwner.js). Painel e
// Diário do Caixa são maioria leitura: faturamento/dias abertos vêm de
// `registros` e títulos vêm de `boletos`, apurados em
// services/fluxo-caixa-dados.js. Só o que não existe em nenhuma outra
// tabela (saldos das 3 contas, retirada dos sócios, pedido de campanha
// oferecido, números de referência) é gravado nas tabelas fluxo_caixa_*.
// ==========================================================================

const express = require('express');
const router = express.Router();
const crypto = require('crypto');

const { dbAllAsync, dbGetAsync, dbRunAsync, normalizeRow } = require('../config/database');
const requireOwner = require('./middleware/requireOwner');
const {
  LOJAS_CACAU,
  vendaDiariaPorLoja,
  faturamentoMensalPorLoja,
  boletosPorLoja
} = require('../services/fluxo-caixa-dados');

router.use(requireOwner);

function validarMes(mes) {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(mes || '');
}

// --------------------------------------------------------------------------
// PAINEL — visão mensal por loja
// --------------------------------------------------------------------------
router.get('/painel', async (req, res) => {
  const mes = req.query.mes;
  if (!validarMes(mes)) {
    return res.status(400).json({ error: 'Parâmetro "mes" deve estar no formato YYYY-MM.' });
  }

  try {
    const [faturamento, boletos, referencia, manual] = await Promise.all([
      faturamentoMensalPorLoja(mes),
      boletosPorLoja(),
      dbAllAsync('SELECT * FROM fluxo_caixa_referencia_loja').then(rows => rows.map(normalizeRow)),
      dbAllAsync('SELECT * FROM fluxo_caixa_mensal WHERE mesReferencia = ?', [mes]).then(rows => rows.map(normalizeRow))
    ]);

    const referenciaPorLoja = {};
    referencia.forEach(r => { referenciaPorLoja[r.loja] = r; });
    const manualPorLoja = {};
    manual.forEach(m => { manualPorLoja[m.loja] = m; });

    const lojas = LOJAS_CACAU.map(loja => {
      const f = faturamento[loja] || { faturamento: 0, diasAbertos: 0 };
      const ref = referenciaPorLoja[loja] || {};
      const m = manualPorLoja[loja] || {};
      const b = boletos[loja] || { aberto: 0, vencido: 0, percentualVencido: 0, diasMediosAtraso: 0 };
      const vendaPorDia = f.diasAbertos > 0 ? f.faturamento / f.diasAbertos : 0;
      const pontoEquilibrioDia = Number(ref.pontoEquilibrioDia) || 0;

      return {
        loja,
        faturamentoMes: f.faturamento,
        diasAbertos: f.diasAbertos,
        vendaPorDia,
        pontoEquilibrioDia,
        pontoEquilibrioMes: Number(ref.pontoEquilibrioMes) || 0,
        cobertura: pontoEquilibrioDia > 0 ? vendaPorDia / pontoEquilibrioDia : null,
        titulosAberto: b.aberto,
        titulosVencido: b.vencido,
        percentualVencido: b.percentualVencido,
        diasMediosAtraso: b.diasMediosAtraso,
        saldoOperacao: m.saldoOperacao ?? null,
        saldoImposto: m.saldoImposto ?? null,
        saldoReserva: m.saldoReserva ?? null,
        retiradaSocios: m.retiradaSocios ?? null,
        observacoes: m.observacoes || ''
      };
    });

    const rede = lojas.reduce((acc, l) => ({
      faturamentoMes: acc.faturamentoMes + l.faturamentoMes,
      titulosAberto: acc.titulosAberto + l.titulosAberto,
      titulosVencido: acc.titulosVencido + l.titulosVencido,
      saldoOperacao: acc.saldoOperacao + (Number(l.saldoOperacao) || 0),
      saldoImposto: acc.saldoImposto + (Number(l.saldoImposto) || 0),
      saldoReserva: acc.saldoReserva + (Number(l.saldoReserva) || 0),
      retiradaSocios: acc.retiradaSocios + (Number(l.retiradaSocios) || 0)
    }), { faturamentoMes: 0, titulosAberto: 0, titulosVencido: 0, saldoOperacao: 0, saldoImposto: 0, saldoReserva: 0, retiradaSocios: 0 });

    res.json({ mes, lojas, rede });
  } catch (err) {
    console.error('[Fluxo de Caixa] Erro no painel:', err);
    res.status(500).json({ error: err.message });
  }
});

router.put('/painel', async (req, res) => {
  const { mesReferencia, loja, saldoOperacao, saldoImposto, saldoReserva, retiradaSocios, observacoes } = req.body || {};
  if (!validarMes(mesReferencia) || !loja) {
    return res.status(400).json({ error: 'mesReferencia (YYYY-MM) e loja são obrigatórios.' });
  }

  try {
    const existente = await dbGetAsync('SELECT id FROM fluxo_caixa_mensal WHERE mesReferencia = ? AND loja = ?', [mesReferencia, loja]);
    const agora = new Date().toISOString();
    if (existente) {
      await dbRunAsync(
        `UPDATE fluxo_caixa_mensal SET saldoOperacao = ?, saldoImposto = ?, saldoReserva = ?, retiradaSocios = ?, observacoes = ?, atualizadoEm = ?
         WHERE mesReferencia = ? AND loja = ?`,
        [saldoOperacao ?? null, saldoImposto ?? null, saldoReserva ?? null, retiradaSocios ?? null, observacoes || null, agora, mesReferencia, loja]
      );
    } else {
      await dbRunAsync(
        `INSERT INTO fluxo_caixa_mensal (id, mesReferencia, loja, saldoOperacao, saldoImposto, saldoReserva, retiradaSocios, observacoes, criadoEm, atualizadoEm)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [crypto.randomUUID(), mesReferencia, loja, saldoOperacao ?? null, saldoImposto ?? null, saldoReserva ?? null, retiradaSocios ?? null, observacoes || null, agora, agora]
      );
    }
    res.json({ ok: true });
  } catch (err) {
    console.error('[Fluxo de Caixa] Erro ao salvar painel:', err);
    res.status(500).json({ error: err.message });
  }
});

// --------------------------------------------------------------------------
// DIÁRIO DO CAIXA — série diária por loja, calculada a partir de `registros`
// --------------------------------------------------------------------------
router.get('/diario', async (req, res) => {
  const mes = req.query.mes;
  if (!validarMes(mes)) {
    return res.status(400).json({ error: 'Parâmetro "mes" deve estar no formato YYYY-MM.' });
  }

  try {
    const [dias, referencia, observacoes] = await Promise.all([
      vendaDiariaPorLoja(mes),
      dbAllAsync('SELECT loja, aliquotaImposto FROM fluxo_caixa_referencia_loja').then(rows => rows.map(normalizeRow)),
      dbAllAsync('SELECT * FROM fluxo_caixa_observacao_diaria WHERE data LIKE ?', [`${mes}%`]).then(rows => rows.map(normalizeRow))
    ]);

    const aliquotaPorLoja = {};
    referencia.forEach(r => { aliquotaPorLoja[r.loja] = Number(r.aliquotaImposto) || 0.082; });
    const obsPorChave = {};
    observacoes.forEach(o => { obsPorChave[`${o.data}|${o.loja}`] = o.observacao; });

    const linhas = dias.map(d => ({
      ...d,
      transferirImposto: d.valor * (aliquotaPorLoja[d.loja] ?? 0.082),
      observacao: obsPorChave[`${d.data}|${d.loja}`] || ''
    }));

    res.json({ mes, linhas });
  } catch (err) {
    console.error('[Fluxo de Caixa] Erro no diário:', err);
    res.status(500).json({ error: err.message });
  }
});

router.put('/diario/observacao', async (req, res) => {
  const { data, loja, observacao } = req.body || {};
  if (!data || !loja) {
    return res.status(400).json({ error: 'data e loja são obrigatórios.' });
  }

  try {
    const existente = await dbGetAsync('SELECT id FROM fluxo_caixa_observacao_diaria WHERE data = ? AND loja = ?', [data, loja]);
    if (existente) {
      await dbRunAsync('UPDATE fluxo_caixa_observacao_diaria SET observacao = ? WHERE data = ? AND loja = ?', [observacao || null, data, loja]);
    } else {
      await dbRunAsync(
        'INSERT INTO fluxo_caixa_observacao_diaria (id, data, loja, observacao, criadoEm) VALUES (?, ?, ?, ?, ?)',
        [crypto.randomUUID(), data, loja, observacao || null, new Date().toISOString()]
      );
    }
    res.json({ ok: true });
  } catch (err) {
    console.error('[Fluxo de Caixa] Erro ao salvar observação diária:', err);
    res.status(500).json({ error: err.message });
  }
});

// --------------------------------------------------------------------------
// TETO DE CAMPANHA
// --------------------------------------------------------------------------
function calcularCampanha(c) {
  const tetoCalculado = (Number(c.faturamentoAnoAnterior) || 0) * (Number(c.fatorTeto) || 0.4);
  const temPedido = c.pedidoOferecido !== null && c.pedidoOferecido !== undefined && c.pedidoOferecido !== '';
  const boletoEstimado = temPedido ? Number(c.pedidoOferecido) * (Number(c.multiplicadorRoyalties) || 1.48) : null;

  let veredito = 'preencha o pedido oferecido';
  if (temPedido && tetoCalculado > 0) {
    const razao = Number(c.pedidoOferecido) / tetoCalculado;
    veredito = razao <= 1
      ? `dentro do teto (${(razao * 100).toFixed(0)}%)`
      : `${((razao - 1) * 100).toFixed(0)}% acima do teto`;
  }

  // Cronograma fixo medido na Páscoa 2026 (contexto_cacau_show.md): D+2 53,4%
  // (mercadoria) / D+8 3,8% (royalties) / D+22 29,9% (royalties) / D+24 11,4%
  // (mercadoria), contados da data comemorativa — não da emissão da NF.
  let cronograma = [];
  if (boletoEstimado !== null && c.dataComemorativa) {
    const base = new Date(`${c.dataComemorativa}T12:00:00Z`);
    const parcelas = [
      { dias: 2, percentual: 0.534, descricao: '1ª parcela — mercadoria' },
      { dias: 8, percentual: 0.038, descricao: 'Royalties' },
      { dias: 22, percentual: 0.299, descricao: 'Royalties' },
      { dias: 24, percentual: 0.114, descricao: '2ª parcela — mercadoria' }
    ];
    cronograma = parcelas.map(p => {
      const d = new Date(base);
      d.setUTCDate(d.getUTCDate() + p.dias);
      return { ...p, data: d.toISOString().slice(0, 10), valor: boletoEstimado * p.percentual };
    });
  }

  return { ...c, tetoCalculado, boletoEstimado, veredito, cronograma };
}

router.get('/campanhas', async (req, res) => {
  try {
    const filtroNome = req.query.nome;
    const rows = filtroNome
      ? await dbAllAsync('SELECT * FROM fluxo_caixa_campanha WHERE nome = ? ORDER BY loja', [filtroNome])
      : await dbAllAsync('SELECT * FROM fluxo_caixa_campanha ORDER BY nome DESC, loja');
    res.json(rows.map(normalizeRow).map(calcularCampanha));
  } catch (err) {
    console.error('[Fluxo de Caixa] Erro ao listar campanhas:', err);
    res.status(500).json({ error: err.message });
  }
});

// Cria ou atualiza a linha de uma loja numa campanha (upsert por nome+loja).
// Se faturamentoAnoAnterior não vier no corpo, calcula automaticamente a
// partir de `registros` para o mês informado em mesReferenciaFaturamento —
// mesma fonte usada no Diário do Caixa.
router.post('/campanhas', async (req, res) => {
  const {
    nome, dataComemorativa, mesReferenciaFaturamento, loja,
    pedidoOferecido, observacoes, fatorTeto, multiplicadorRoyalties
  } = req.body || {};

  if (!nome || !loja) {
    return res.status(400).json({ error: 'nome e loja são obrigatórios.' });
  }

  try {
    let faturamentoAnoAnterior = req.body.faturamentoAnoAnterior;
    if ((faturamentoAnoAnterior === undefined || faturamentoAnoAnterior === null || faturamentoAnoAnterior === '') && validarMes(mesReferenciaFaturamento)) {
      const agregado = await faturamentoMensalPorLoja(mesReferenciaFaturamento);
      faturamentoAnoAnterior = agregado[loja]?.faturamento ?? 0;
    }

    const agora = new Date().toISOString();
    const existente = await dbGetAsync('SELECT id FROM fluxo_caixa_campanha WHERE nome = ? AND loja = ?', [nome, loja]);

    if (existente) {
      await dbRunAsync(
        `UPDATE fluxo_caixa_campanha SET dataComemorativa = ?, mesReferenciaFaturamento = ?, faturamentoAnoAnterior = ?,
           pedidoOferecido = ?, observacoes = ?, fatorTeto = ?, multiplicadorRoyalties = ?, atualizadoEm = ?
         WHERE nome = ? AND loja = ?`,
        [dataComemorativa || null, mesReferenciaFaturamento || null, faturamentoAnoAnterior ?? null,
          pedidoOferecido ?? null, observacoes || null, fatorTeto || 0.4, multiplicadorRoyalties || 1.48, agora,
          nome, loja]
      );
    } else {
      await dbRunAsync(
        `INSERT INTO fluxo_caixa_campanha
          (id, nome, dataComemorativa, mesReferenciaFaturamento, loja, faturamentoAnoAnterior, pedidoOferecido, observacoes, fatorTeto, multiplicadorRoyalties, criadoEm, atualizadoEm)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [crypto.randomUUID(), nome, dataComemorativa || null, mesReferenciaFaturamento || null, loja,
          faturamentoAnoAnterior ?? null, pedidoOferecido ?? null, observacoes || null, fatorTeto || 0.4, multiplicadorRoyalties || 1.48, agora, agora]
      );
    }

    const row = normalizeRow(await dbGetAsync('SELECT * FROM fluxo_caixa_campanha WHERE nome = ? AND loja = ?', [nome, loja]));
    res.json(calcularCampanha(row));
  } catch (err) {
    console.error('[Fluxo de Caixa] Erro ao salvar campanha:', err);
    res.status(500).json({ error: err.message });
  }
});

router.delete('/campanhas/:id', async (req, res) => {
  try {
    await dbRunAsync('DELETE FROM fluxo_caixa_campanha WHERE id = ?', [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    console.error('[Fluxo de Caixa] Erro ao excluir campanha:', err);
    res.status(500).json({ error: err.message });
  }
});

// --------------------------------------------------------------------------
// REFERÊNCIA — números da análise financeira + índice de sazonalidade
// --------------------------------------------------------------------------
router.get('/referencia', async (req, res) => {
  try {
    const [lojas, sazonal] = await Promise.all([
      dbAllAsync('SELECT * FROM fluxo_caixa_referencia_loja ORDER BY loja').then(rows => rows.map(normalizeRow)),
      dbAllAsync('SELECT * FROM fluxo_caixa_indice_sazonal ORDER BY loja, mes').then(rows => rows.map(normalizeRow))
    ]);
    res.json({ lojas, sazonal });
  } catch (err) {
    console.error('[Fluxo de Caixa] Erro ao buscar referência:', err);
    res.status(500).json({ error: err.message });
  }
});

router.put('/referencia/:loja', async (req, res) => {
  const loja = req.params.loja;
  const { faturamentoMes, despesaFixaMes, pontoEquilibrioMes, pontoEquilibrioDia, resultado10Meses, aliquotaImposto } = req.body || {};

  try {
    const agora = new Date().toISOString();
    const existente = await dbGetAsync('SELECT loja FROM fluxo_caixa_referencia_loja WHERE loja = ?', [loja]);
    if (existente) {
      await dbRunAsync(
        `UPDATE fluxo_caixa_referencia_loja SET faturamentoMes = ?, despesaFixaMes = ?, pontoEquilibrioMes = ?, pontoEquilibrioDia = ?, resultado10Meses = ?, aliquotaImposto = ?, atualizadoEm = ?
         WHERE loja = ?`,
        [faturamentoMes ?? null, despesaFixaMes ?? null, pontoEquilibrioMes ?? null, pontoEquilibrioDia ?? null, resultado10Meses ?? null, aliquotaImposto ?? 0.082, agora, loja]
      );
    } else {
      await dbRunAsync(
        `INSERT INTO fluxo_caixa_referencia_loja (loja, faturamentoMes, despesaFixaMes, pontoEquilibrioMes, pontoEquilibrioDia, resultado10Meses, aliquotaImposto, atualizadoEm)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [loja, faturamentoMes ?? null, despesaFixaMes ?? null, pontoEquilibrioMes ?? null, pontoEquilibrioDia ?? null, resultado10Meses ?? null, aliquotaImposto ?? 0.082, agora]
      );
    }
    res.json({ ok: true });
  } catch (err) {
    console.error('[Fluxo de Caixa] Erro ao salvar referência:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
