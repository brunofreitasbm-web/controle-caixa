// ==========================================================================
// ITEM 2 — BRIEFING DIÁRIO DO GESTOR (Owner e Líder de Operação)
// ==========================================================================
// Consolida numa única leitura o que hoje exige abrir cinco telas: quanto
// cada loja vendeu contra a meta, envelopes parados, boletos vencendo ou
// vencidos, e a conversão do FaçaAmigos. A IA recebe tudo apurado e escreve
// o resumo executivo — a apuração é toda em JS.
// ==========================================================================

const { dbAllAsync } = require('../config/database');
const { gerarJSON, comCache, iaHabilitada, IAIndisponivelError } = require('./ia');

// 9175/4304/9201 são os códigos usados na tabela `boletos`; o restante do
// sistema (registros, metas, metas_vendas) identifica a loja pelo nome. Sem
// esse mapa o briefing reportaria boletos de "9175" e vendas de "Marambaia"
// como se fossem operações diferentes.
const CODIGO_PARA_LOJA = { '9175': 'Marambaia', '4304': 'Icoaraci', '9201': 'Mário Covas' };

const LOJAS_CACAU = ['Marambaia', 'Icoaraci', 'Mário Covas'];

function hojeBrasil() {
  const p = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(new Date());
  const o = {};
  p.forEach(x => { o[x.type] = x.value; });
  return `${o.year}-${o.month}-${o.day}`;
}

function somarDias(dataISO, dias) {
  const d = new Date(`${dataISO}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

// A coluna `vencimento` da tabela boletos é texto no formato DD/MM/YYYY —
// ordenar ou comparar direto no SQL daria resultado errado ('01/09' < '02/08').
// Converte para ISO para poder comparar de verdade.
function vencimentoParaISO(v) {
  if (!v) return null;
  const s = String(v).trim();
  const br = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (br) return `${br[3]}-${br[2]}-${br[1]}`;
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return iso[0];
  return null;
}

const reais = n => `R$ ${Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// --------------------------------------------------------------------------
// Apuração
// --------------------------------------------------------------------------
async function apurar(dataRef) {
  const ontem = somarDias(dataRef, -1);

  // Faturamento por loja: metas_vendas armazena a venda acumulada do dia até aquele horário.
  // Por operação, adotamos o valor faturado no último horário registrado (loja aberta), não a soma dos lançamentos.
  const vendas = await dbAllAsync(
    'SELECT operacao, valor, horaslot FROM metas_vendas WHERE data = ? ORDER BY horaslot ASC',
    [ontem]
  );
  const vendasPorLoja = {};
  (vendas || []).forEach(v => {
    if (!vendasPorLoja[v.operacao]) {
      vendasPorLoja[v.operacao] = { total: 0, checkins: 0 };
    }
    // O valor do último horário lançado da loja é a venda acumulada do dia
    vendasPorLoja[v.operacao].total = Number(v.valor) || 0;
    vendasPorLoja[v.operacao].checkins += 1;
  });

  // Meta do dia: só 'diaria' e 'manual' valem como meta do dia. 'mensal'
  // guarda o total do mês na linha do dia 1 e infla o comparativo se entrar.
  const metas = await dbAllAsync(
    "SELECT loja, valor FROM metas_diarias_lojas WHERE data = ? AND origem IN ('diaria', 'manual')",
    [ontem]
  );
  const metaPorLoja = {};
  (metas || []).forEach(m => { metaPorLoja[m.loja] = Number(m.valor) || 0; });

  const lojas = LOJAS_CACAU.map(loja => {
    const v = vendasPorLoja[loja] || { total: 0, checkins: 0 };
    const meta = metaPorLoja[loja] || 0;
    return {
      loja,
      faturamento: v.total,
      checkins: v.checkins,
      meta,
      atingimento: meta > 0 ? v.total / meta : null,
      diferenca: meta > 0 ? v.total - meta : null
    };
  });

  // Envelopes aguardando retirada há mais de um dia — dinheiro parado na loja.
  const envelopes = await dbAllAsync(
    `SELECT loja, dataOperacao, valorEnvelope FROM registros
     WHERE deletadoEm IS NULL AND status = 'aguardando_retirada'`
  );
  const envelopesPendentes = (envelopes || []).map(e => ({
    loja: e.loja,
    data: String(e.dataOperacao ?? e.dataoperacao ?? '').slice(0, 10),
    valor: Number(e.valorEnvelope ?? e.valorenvelope) || 0
  })).filter(e => e.data && e.data < dataRef);

  // Boletos: vencidos e a vencer nos próximos 7 dias.
  const boletos = await dbAllAsync("SELECT loja, vencimento, valor, descricao FROM boletos WHERE status <> 'Pago'");
  const limite = somarDias(dataRef, 7);
  const vencidos = [];
  const aVencer = [];
  (boletos || []).forEach(b => {
    const venc = vencimentoParaISO(b.vencimento);
    if (!venc) return;
    const item = {
      loja: CODIGO_PARA_LOJA[String(b.loja)] || String(b.loja),
      vencimento: venc,
      valor: Number(b.valor) || 0,
      descricao: b.descricao || ''
    };
    if (venc < dataRef) vencidos.push(item);
    else if (venc <= limite) aVencer.push(item);
  });

  // FaçaAmigos: conversão da competência corrente.
  const competencia = dataRef.slice(0, 7);
  const fa = await dbAllAsync(
    'SELECT usuario, SUM(vendas30) AS v30, SUM(vendas1h) AS v1h, SUM(vendas2h) AS v2h FROM fa_bonificacao_diaria WHERE data LIKE ? GROUP BY usuario',
    [`${competencia}%`]
  );
  const faResumo = (fa || []).map(f => {
    const v30 = Number(f.v30) || 0, v1h = Number(f.v1h) || 0, v2h = Number(f.v2h) || 0;
    const total = v30 + v1h + v2h;
    return { usuario: f.usuario, atendimentos: total, conversao: total > 0 ? (v1h + v2h) / total : 0 };
  }).sort((a, b) => b.conversao - a.conversao);

  const totalFaturado = lojas.reduce((s, l) => s + l.faturamento, 0);
  const totalMeta = lojas.reduce((s, l) => s + l.meta, 0);

  return {
    dataRef, ontem, competencia,
    lojas, totalFaturado, totalMeta,
    atingimentoGeral: totalMeta > 0 ? totalFaturado / totalMeta : null,
    envelopesPendentes,
    valorEnvelopesPendentes: envelopesPendentes.reduce((s, e) => s + e.valor, 0),
    boletosVencidos: vencidos.sort((a, b) => a.vencimento.localeCompare(b.vencimento)),
    valorBoletosVencidos: vencidos.reduce((s, b) => s + b.valor, 0),
    boletosAVencer: aVencer.sort((a, b) => a.vencimento.localeCompare(b.vencimento)),
    valorBoletosAVencer: aVencer.reduce((s, b) => s + b.valor, 0),
    faResumo
  };
}

const SISTEMA_BRIEFING = `Você é o analista de operações de uma rede com 3 lojas Cacau Show (Marambaia, Icoaraci, Mário Covas) em Belém/PA e o playground FaçaAmigos.
Escreve o briefing matinal para o Owner e o Líder de Operação.

Tom: objetivo e executivo. Quem lê tem 60 segundos e precisa saber o que fazer hoje.
Português do Brasil.

Regras inegociáveis:
- Use SOMENTE os números fornecidos. Nunca calcule, projete ou invente valores.
- Priorize por impacto financeiro: o que custa mais dinheiro vem primeiro.
- Toda recomendação precisa ser acionável hoje e citar um número.
- Não use nomes de campos técnicos, chaves de banco nem termos em inglês.
- Se algo estiver bom, diga em uma linha e siga — o briefing existe para o que precisa de ação.`;

const FORMATO_BRIEFING = {
  manchete: 'a frase mais importante do dia, com número',
  vendas: 'leitura do desempenho das lojas contra a meta',
  alertas: ['alerta financeiro ou operacional que precisa de ação, com valor'],
  prioridades: ['a coisa mais importante a fazer hoje', 'a segunda', 'a terceira'],
  fechamento: 'uma frase curta de contexto'
};

function briefingFallback(d) {
  const alertas = [];
  if (d.valorBoletosVencidos > 0) {
    alertas.push(`${d.boletosVencidos.length} boleto(s) vencido(s), somando ${reais(d.valorBoletosVencidos)}.`);
  }
  if (d.valorBoletosAVencer > 0) {
    alertas.push(`${d.boletosAVencer.length} boleto(s) vencem nos próximos 7 dias: ${reais(d.valorBoletosAVencer)}.`);
  }
  if (d.envelopesPendentes.length > 0) {
    alertas.push(`${d.envelopesPendentes.length} envelope(s) aguardando retirada, somando ${reais(d.valorEnvelopesPendentes)}.`);
  }
  if (alertas.length === 0) alertas.push('Nenhum alerta financeiro em aberto.');

  const abaixo = d.lojas.filter(l => l.atingimento !== null && l.atingimento < 1);

  return {
    manchete: d.totalMeta > 0
      ? `Ontem as lojas faturaram ${reais(d.totalFaturado)} de uma meta de ${reais(d.totalMeta)} (${(d.atingimentoGeral * 100).toFixed(1)}%).`
      : `Ontem as lojas faturaram ${reais(d.totalFaturado)}. Não havia meta diária cadastrada.`,
    vendas: d.lojas.map(l =>
      `${l.loja}: ${reais(l.faturamento)}${l.meta > 0 ? ` de ${reais(l.meta)} (${(l.atingimento * 100).toFixed(1)}%)` : ' (sem meta cadastrada)'}`
    ).join(' | '),
    alertas,
    prioridades: [
      abaixo.length > 0
        ? `Acompanhar de perto ${abaixo.map(l => l.loja).join(', ')} — ficaram abaixo da meta ontem.`
        : 'Manter o ritmo das lojas, todas dentro da meta.',
      d.valorBoletosVencidos > 0 ? `Regularizar os boletos vencidos (${reais(d.valorBoletosVencidos)}).` : 'Conferir os boletos da semana.',
      d.envelopesPendentes.length > 0 ? 'Providenciar a retirada dos envelopes pendentes.' : 'Sem envelopes pendentes.'
    ],
    fechamento: d.faResumo.length > 0
      ? `FaçaAmigos: conversão de ${(d.faResumo[0].conversao * 100).toFixed(1)}% no melhor desempenho da competência.`
      : '',
    _fonte: 'fallback'
  };
}

async function gerarBriefing({ dataRef = null, forcar = false } = {}) {
  const data = dataRef || hojeBrasil();
  const dados = await apurar(data);

  if (!iaHabilitada()) {
    return { dados, briefing: briefingFallback(dados) };
  }

  const produtor = async () => {
    const linhasLojas = dados.lojas.map(l =>
      l.meta > 0
        ? `  - ${l.loja}: vendeu ${reais(l.faturamento)} de uma meta de ${reais(l.meta)} (${(l.atingimento * 100).toFixed(1)}% da meta, diferença de ${reais(l.diferenca)}), com ${l.checkins} intervalos registrados.`
        : `  - ${l.loja}: vendeu ${reais(l.faturamento)} em ${l.checkins} intervalos registrados. Não havia meta diária cadastrada.`
    ).join('\n');

    // As listas vão truncadas em 10 itens para não inflar o prompt, mas os
    // TOTAIS acima são do conjunto inteiro. O corte precisa ser declarado:
    // sem isso o modelo descreve as 10 primeiras linhas como se fossem todas.
    const listar = (itens, verbo) => {
      if (itens.length === 0) return '  - nenhum';
      const linhas = itens.slice(0, 10)
        .map(b => `  - ${b.loja}: ${reais(b.valor)}, ${verbo} em ${b.vencimento} (${b.descricao})`)
        .join('\n');
      return itens.length > 10
        ? `${linhas}\n  - (mostrando os 10 mais antigos de ${itens.length}; o total acima já considera todos)`
        : linhas;
    };

    const linhasVencidos = listar(dados.boletosVencidos, 'venceu');
    const linhasAVencer = listar(dados.boletosAVencer, 'vence');

    const linhasFa = dados.faResumo.length > 0
      ? dados.faResumo.map(f => `  - ${f.usuario}: ${(f.conversao * 100).toFixed(1)}% de conversão em ${f.atendimentos} atendimentos`).join('\n')
      : '  - sem lançamentos na competência';

    const prompt = `Escreva o briefing matinal de ${data}, cobrindo o desempenho do dia anterior (${dados.ontem}).

VENDAS DE ONTEM POR LOJA:
${linhasLojas}
  Total: ${reais(dados.totalFaturado)} de uma meta somada de ${reais(dados.totalMeta)}${dados.atingimentoGeral !== null ? ` (${(dados.atingimentoGeral * 100).toFixed(1)}%)` : ''}.

ENVELOPES AGUARDANDO RETIRADA: ${dados.envelopesPendentes.length}, somando ${reais(dados.valorEnvelopesPendentes)}.

BOLETOS VENCIDOS (${dados.boletosVencidos.length}, total ${reais(dados.valorBoletosVencidos)}):
${linhasVencidos}

BOLETOS A VENCER EM ATÉ 7 DIAS (${dados.boletosAVencer.length}, total ${reais(dados.valorBoletosAVencer)}):
${linhasAVencer}

FAÇAAMIGOS — CONVERSÃO DA COMPETÊNCIA ${dados.competencia}:
${linhasFa}

Liste de 2 a 4 alertas e exatamente 3 prioridades para hoje.`;

    const r = await gerarJSON(prompt, {
      sistema: SISTEMA_BRIEFING,
      formato: FORMATO_BRIEFING,
      temperatura: 0.4,
      maxTokens: 2000
    });
    return { ...r, _fonte: 'ia' };
  };

  try {
    // Cache até o fim do dia: o briefing é do dia e só muda se os dados
    // mudarem — `forcar` regenera sob demanda pelo botão da tela.
    const briefing = forcar
      ? await produtor()
      : await comCache(`briefing:${data}`, 12 * 3600, produtor);
    return { dados, briefing };
  } catch (err) {
    if (err instanceof IAIndisponivelError) {
      console.warn('[IA Briefing] Caindo no fallback:', err.message);
      return { dados, briefing: briefingFallback(dados) };
    }
    throw err;
  }
}

module.exports = { gerarBriefing, apurar, vencimentoParaISO, hojeBrasil, CODIGO_PARA_LOJA };
