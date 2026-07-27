// ==========================================================================
// ITEM 1 — COACH DE CONVERSÃO POR COLABORADORA (FaçaAmigos)
// ==========================================================================
// Lê fa_bonificacao_diaria + fa_bonificacao_regras e devolve um feedback
// individual com número: em quanto está a conversão, quanto falta para ouro
// ou diamante, em que dia da semana a pessoa rende melhor e o que fazer.
//
// Arquitetura: TODO cálculo acontece aqui em JS, com a mesma fórmula do
// frontend (calcularBonificacaoFa em webapp/app.js). A IA recebe os números
// já prontos e escreve apenas o texto do coaching — modelo de linguagem erra
// aritmética, e valor de bonificação não pode sair de um LLM.
// ==========================================================================

const { dbAllAsync, dbGetAsync } = require('../config/database');
const { gerarJSON, comCache, iaHabilitada, IAIndisponivelError } = require('./ia');

const DIAS_SEMANA = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];

const REGRA_PADRAO = {
  ouroPercentMin: 0.5, ouroValor: 100,
  diamantePercentMin: 0.6, diamanteValor: 150,
  pixMinVendas2h: 5, pixValor: 20,
  pixDiasSemana: ['Sexta-feira', 'Sábado', 'Domingo']
};

function nomeDiaSemana(dataISO) {
  // Meio-dia UTC evita que o fuso empurre a data para o dia anterior.
  const d = new Date(`${String(dataISO).slice(0, 10)}T12:00:00Z`);
  return DIAS_SEMANA[d.getUTCDay()];
}

async function buscarRegra(competencia) {
  const SELECT = `SELECT competencia,
    ouropercentmin AS "ouroPercentMin", ourovalor AS "ouroValor",
    diamantepercentmin AS "diamantePercentMin", diamantevalor AS "diamanteValor",
    pixminvendas2h AS "pixMinVendas2h", pixvalor AS "pixValor",
    pixdiassemana AS "pixDiasSemana"
    FROM fa_bonificacao_regras`;

  let row = await dbGetAsync(`${SELECT} WHERE competencia = ?`, [competencia]);
  if (!row) {
    row = await dbGetAsync(`${SELECT} WHERE competencia < ? ORDER BY competencia DESC LIMIT 1`, [competencia]);
  }
  if (!row) return { ...REGRA_PADRAO };

  let pixDias = row.pixDiasSemana;
  if (typeof pixDias === 'string') {
    try { pixDias = JSON.parse(pixDias); } catch { pixDias = REGRA_PADRAO.pixDiasSemana; }
  }
  return {
    ouroPercentMin: Number(row.ouroPercentMin),
    ouroValor: Number(row.ouroValor),
    diamantePercentMin: Number(row.diamantePercentMin),
    diamanteValor: Number(row.diamanteValor),
    pixMinVendas2h: Number(row.pixMinVendas2h),
    pixValor: Number(row.pixValor),
    pixDiasSemana: Array.isArray(pixDias) ? pixDias : REGRA_PADRAO.pixDiasSemana
  };
}

// --------------------------------------------------------------------------
// Mesma matemática de calcularBonificacaoFa() no frontend. Se um dia a
// fórmula mudar lá, precisa mudar aqui — senão o coach diz um número e a
// tela mostra outro, que é pior do que não ter coach nenhum.
// --------------------------------------------------------------------------
function calcularMetricas(lancamentos, regra) {
  let totalV30 = 0, totalV1h = 0, totalV2h = 0, totalPix = 0;
  const porDiaSemana = {};

  const linhas = lancamentos.map(l => {
    const v30 = Number(l.vendas30) || 0;
    const v1h = Number(l.vendas1h) || 0;
    const v2h = Number(l.vendas2h) || 0;
    totalV30 += v30; totalV1h += v1h; totalV2h += v2h;

    const total = v30 + v1h + v2h;
    const pctConversao = total > 0 ? (v1h + v2h) / total : 0;
    const diaSemana = nomeDiaSemana(l.data);
    const pixHoje = (regra.pixDiasSemana.includes(diaSemana) && v2h >= regra.pixMinVendas2h) ? regra.pixValor : 0;
    totalPix += pixHoje;

    if (!porDiaSemana[diaSemana]) porDiaSemana[diaSemana] = { atendimentos: 0, convertidos: 0, dias: 0 };
    porDiaSemana[diaSemana].atendimentos += total;
    porDiaSemana[diaSemana].convertidos += v1h + v2h;
    porDiaSemana[diaSemana].dias += 1;

    return { data: String(l.data).slice(0, 10), diaSemana, v30, v1h, v2h, total, pctConversao, pixHoje };
  });

  const totalAtend = totalV30 + totalV1h + totalV2h;
  const pctConversaoMensal = totalAtend > 0 ? (totalV1h + totalV2h) / totalAtend : 0;

  let bonusTier = 0, tierNome = null;
  if (pctConversaoMensal >= regra.diamantePercentMin) { bonusTier = regra.diamanteValor; tierNome = 'diamante'; }
  else if (pctConversaoMensal >= regra.ouroPercentMin) { bonusTier = regra.ouroValor; tierNome = 'ouro'; }

  // Quantos atendimentos de 30min ainda precisariam virar 1h/2h para bater a
  // próxima faixa, mantendo o total de atendimentos constante. Resolvendo
  // (convertidos + x) / total >= alvo  =>  x >= alvo*total - convertidos.
  function faltaParaAlvo(alvo) {
    if (totalAtend === 0) return null;
    if (pctConversaoMensal >= alvo) return 0;
    return Math.max(0, Math.ceil(alvo * totalAtend - (totalV1h + totalV2h)));
  }

  const proximaFaixa = pctConversaoMensal >= regra.diamantePercentMin
    ? null
    : (pctConversaoMensal >= regra.ouroPercentMin
        ? { nome: 'diamante', alvo: regra.diamantePercentMin, valor: regra.diamanteValor }
        : { nome: 'ouro', alvo: regra.ouroPercentMin, valor: regra.ouroValor });

  const ranking = Object.entries(porDiaSemana)
    .map(([dia, d]) => ({
      dia,
      dias: d.dias,
      atendimentos: d.atendimentos,
      pctConversao: d.atendimentos > 0 ? d.convertidos / d.atendimentos : 0
    }))
    .sort((a, b) => b.pctConversao - a.pctConversao);

  // Oportunidade de PIX perdida: dias elegíveis em que faltou pouco para o
  // mínimo de vendas de 2h. É dinheiro que estava ao alcance da mão.
  const pixPerdidos = linhas.filter(l =>
    regra.pixDiasSemana.includes(l.diaSemana) && l.v2h < regra.pixMinVendas2h
  ).map(l => ({ data: l.data, diaSemana: l.diaSemana, v2h: l.v2h, faltavam: regra.pixMinVendas2h - l.v2h }));

  return {
    linhas, totalV30, totalV1h, totalV2h, totalAtend,
    pctConversaoMensal, totalPix, bonusTier, tierNome,
    totalEstimado: bonusTier + totalPix,
    proximaFaixa,
    faltamConversoes: proximaFaixa ? faltaParaAlvo(proximaFaixa.alvo) : 0,
    rankingDiaSemana: ranking,
    melhorDia: ranking[0] || null,
    piorDia: ranking.length > 1 ? ranking[ranking.length - 1] : null,
    pixPerdidos,
    pixPerdidoValor: pixPerdidos.length * regra.pixValor,
    diasLancados: linhas.length
  };
}

const SISTEMA_COACH = `Você é o coach de vendas do FaçaAmigos, um playground inclusivo em Belém/PA.
Escreve para a colaboradora que atende as famílias e oferece os pacotes de permanência (30min, 1h, 2h).
"Conversão" = a proporção de atendimentos que fecharam em 1h ou 2h em vez de 30min.

Tom: direto, respeitoso e motivador — como um líder que quer que ela ganhe o bônus, não como um sistema cobrando meta.
Trate a pessoa por "você". Português do Brasil.

Regras inegociáveis:
- Use SOMENTE os números que recebeu. Nunca calcule, arredonde ou invente valores.
- Nunca compare a colaboradora com outras pessoas nominalmente.
- Se o desempenho já está bom, reconheça primeiro e aponte o próximo degrau.
- Nada de frase motivacional vazia: toda recomendação precisa citar um número do contexto.`;

const FORMATO_COACH = {
  resumo: 'uma frase sobre onde a colaboradora está na competência',
  destaque: 'o que ela está fazendo bem, citando um número',
  atencao: 'o principal ponto a melhorar, citando um número',
  acoes: ['ação prática e específica', 'segunda ação'],
  fechamento: 'uma frase curta de incentivo com o valor em jogo'
};

// --------------------------------------------------------------------------
// Fallback determinístico: texto montado por template a partir das mesmas
// métricas. Sem IA a funcionalidade fica mais seca, mas continua correta e
// útil — o que importa é que a tela nunca quebre por causa de cota.
// --------------------------------------------------------------------------
function coachFallback(m, regra) {
  const pct = (m.pctConversaoMensal * 100).toFixed(1);
  const acoes = [];

  if (m.proximaFaixa && m.faltamConversoes > 0) {
    acoes.push(`Converta mais ${m.faltamConversoes} atendimento(s) de 30min em 1h ou 2h para alcançar a faixa ${m.proximaFaixa.nome} (R$ ${m.proximaFaixa.valor.toFixed(2)}).`);
  }
  if (m.pixPerdidos.length > 0) {
    acoes.push(`Em ${m.pixPerdidos.length} dia(s) elegíveis o PIX escapou por pouco — foram R$ ${m.pixPerdidoValor.toFixed(2)} deixados na mesa. Foque nas vendas de 2h nesses dias.`);
  }
  if (m.piorDia && m.melhorDia && m.piorDia.dia !== m.melhorDia.dia) {
    acoes.push(`Seu melhor dia é ${m.melhorDia.dia} (${(m.melhorDia.pctConversao * 100).toFixed(1)}%) e o mais fraco é ${m.piorDia.dia} (${(m.piorDia.pctConversao * 100).toFixed(1)}%). Leve o que funciona no melhor dia para o mais fraco.`);
  }
  if (acoes.length === 0) acoes.push('Mantenha o ritmo e registre os lançamentos todos os dias para acompanhar a evolução.');

  return {
    resumo: `Conversão de ${pct}% em ${m.diasLancados} dia(s) lançados, com ${m.totalAtend} atendimentos.`,
    destaque: m.tierNome
      ? `Você já está na faixa ${m.tierNome}, valendo R$ ${m.bonusTier.toFixed(2)}.`
      : `Você já converteu ${m.totalV1h + m.totalV2h} atendimentos em 1h ou 2h.`,
    atencao: m.proximaFaixa
      ? `Faltam ${((m.proximaFaixa.alvo - m.pctConversaoMensal) * 100).toFixed(1)} pontos percentuais para a faixa ${m.proximaFaixa.nome}.`
      : 'Você está na faixa máxima — o foco agora é manter.',
    acoes,
    fechamento: `Estimativa atual de bonificação: R$ ${m.totalEstimado.toFixed(2)}.`,
    _fonte: 'fallback'
  };
}

// --------------------------------------------------------------------------
// Entrada pública. `competencia` no formato YYYY-MM.
// --------------------------------------------------------------------------
async function gerarCoach({ usuario, unidade, competencia, forcar = false }) {
  if (!usuario || !competencia) {
    throw new Error('usuario e competencia são obrigatórios.');
  }

  const filtraUnidade = unidade && unidade !== 'todas';
  const lancamentos = await dbAllAsync(
    filtraUnidade
      ? 'SELECT * FROM fa_bonificacao_diaria WHERE usuario = ? AND unidade = ? AND data LIKE ? ORDER BY data ASC'
      : 'SELECT * FROM fa_bonificacao_diaria WHERE usuario = ? AND data LIKE ? ORDER BY data ASC',
    filtraUnidade ? [usuario, unidade, `${competencia}%`] : [usuario, `${competencia}%`]
  );

  const regra = await buscarRegra(competencia);
  const metricas = calcularMetricas(lancamentos || [], regra);

  if (metricas.diasLancados === 0) {
    return {
      metricas,
      coach: {
        resumo: 'Ainda não há lançamentos nesta competência.',
        destaque: '',
        atencao: 'Registre os atendimentos do dia para acompanhar sua conversão e sua bonificação.',
        acoes: ['Lance vendas de 30min, 1h e 2h ao final de cada turno.'],
        fechamento: '',
        _fonte: 'sem-dados'
      }
    };
  }

  if (!iaHabilitada()) {
    return { metricas, coach: coachFallback(metricas, regra) };
  }

  // Cache por (usuário, unidade, competência, dias lançados): enquanto ela não
  // lançar um dia novo, o coaching é o mesmo — não faz sentido gastar cota.
  const chave = `coach:${usuario}:${unidade || 'todas'}:${competencia}:${metricas.diasLancados}:${metricas.totalAtend}`;

  const produtor = async () => {
    const pct = n => `${(n * 100).toFixed(1)}%`;
    const reais = n => `R$ ${Number(n).toFixed(2)}`;

    // O contexto vai como texto rotulado em português, e não como JSON cru:
    // com JSON o modelo copiava os nomes dos campos para dentro da prosa
    // ("sua conversaoAtualPercent de 36.4"), e isso chegaria assim na
    // colaboradora.
    const linhasDia = metricas.rankingDiaSemana
      .map(d => `  - ${d.dia}: ${pct(d.pctConversao)} de conversão em ${d.atendimentos} atendimentos`)
      .join('\n');

    const blocoFaixa = metricas.proximaFaixa
      ? `- Próxima faixa a alcançar: ${metricas.proximaFaixa.nome}, que exige ${pct(metricas.proximaFaixa.alvo)} de conversão e paga ${reais(metricas.proximaFaixa.valor)}.
- Para chegar lá, faltam converter ${metricas.faltamConversoes} atendimentos de 30 minutos em 1h ou 2h.`
      : '- Ela já está na faixa máxima (diamante). O foco é manter o patamar.';

    const blocoPix = metricas.pixPerdidos.length > 0
      ? `- Em ${metricas.pixPerdidos.length} dia(s) que davam direito ao prêmio PIX, faltaram vendas de 2h para alcançá-lo — ${reais(metricas.pixPerdidoValor)} que ficaram na mesa.`
      : '- Não houve prêmio PIX perdido nesta competência.';

    // Só o primeiro nome vai ao provedor — ver regra 4 em services/ia.js.
    const prompt = `Escreva o feedback de coaching para a colaboradora ${String(usuario).trim().split(/\s+/)[0]}, referente à competência ${competencia}.

Situação apurada (números já calculados — use-os exatamente como estão):
- Dias lançados: ${metricas.diasLancados}, somando ${metricas.totalAtend} atendimentos.
- Distribuição: ${metricas.totalV30} fecharam em 30 minutos, ${metricas.totalV1h} em 1 hora e ${metricas.totalV2h} em 2 horas.
- Conversão acumulada: ${pct(metricas.pctConversaoMensal)}.
- Faixa de bonificação atual: ${metricas.tierNome || 'nenhuma ainda'}.
- A faixa ouro exige ${pct(regra.ouroPercentMin)} e paga ${reais(regra.ouroValor)}; a diamante exige ${pct(regra.diamantePercentMin)} e paga ${reais(regra.diamanteValor)}.
${blocoFaixa}
- Prêmio PIX já acumulado: ${reais(metricas.totalPix)}.
${blocoPix}
- Bonificação total estimada hoje: ${reais(metricas.totalEstimado)}.
- Conversão por dia da semana:
${linhasDia}

Escreva em linguagem natural e humana. Nunca use nomes de campos, chaves técnicas ou termos em inglês no texto.`;

    const resultado = await gerarJSON(prompt, {
      sistema: SISTEMA_COACH,
      formato: FORMATO_COACH,
      temperatura: 0.6,
      maxTokens: 900
    });
    return { ...resultado, _fonte: 'ia' };
  };

  try {
    const coach = forcar ? await produtor() : await comCache(chave, 6 * 3600, produtor);
    return { metricas, coach };
  } catch (err) {
    if (err instanceof IAIndisponivelError) {
      console.warn('[IA Coach] Caindo no fallback:', err.message);
      return { metricas, coach: coachFallback(metricas, regra) };
    }
    throw err;
  }
}

module.exports = { gerarCoach, calcularMetricas, buscarRegra };
