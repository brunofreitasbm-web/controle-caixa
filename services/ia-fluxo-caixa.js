// ==========================================================================
// DIAGNÓSTICO DE FLUXO DE CAIXA (exclusivo Owner)
// ==========================================================================
// Mesmo padrão de services/ia-briefing.js: apura os números primeiro (JS +
// SQL), a IA só escreve o texto em cima do que já foi calculado — nunca
// inventa ou projeta valor. Cobre a mesma leitura do "Coach Financeiro" do
// contexto (contexto_cacau_show.md): situação por loja, teto de campanha,
// estação do ano e retirada dos sócios contra o sustentável.
// ==========================================================================

const { dbAllAsync } = require('../config/database');
const { gerarJSON, comCache, iaHabilitada, IAIndisponivelError } = require('./ia');
const {
  LOJAS_CACAU, reais, hojeBrasil,
  faturamentoMensalPorLoja, boletosPorLoja
} = require('./fluxo-caixa-dados');

// Valor de referência tirado da análise (contexto_cacau_show.md): lucro
// operacional de rede ~R$23.534/mês, guardando 40% para reserva, sobram
// R$14.120/mês para os 2 sócios (R$7.060 cada). Não é recalculado
// automaticamente aqui — depende de CMV por loja, que este módulo não
// armazena — só serve de teto de comparação para a retirada informada.
const TETO_SUSTENTAVEL_RETIRADA_REDE = 14120;

const SITUACAO_POR_MES = { 1: 'PREPARAR', 2: 'PREPARAR', 3: 'COLHER', 4: 'COLHER', 5: 'ATRAVESSAR', 6: 'ATRAVESSAR', 7: 'ATRAVESSAR', 8: 'ATRAVESSAR', 9: 'ATRAVESSAR', 10: 'ATRAVESSAR', 11: 'ATRAVESSAR', 12: 'COLHER' };
const DESCRICAO_ESTACAO = {
  PREPARAR: 'Preparação (jan/fev) — fechar pedido de Páscoa pela regra dos 40% e pagar as últimas parcelas do Natal com a reserva.',
  COLHER: 'Colheita (mar/abr/dez) — não aumentar retirada nem gastar em reforma/equipamento; o dinheiro do mês é da reserva.',
  ATRAVESSAR: 'Travessia (mai a nov) — não aceitar campanha opcional (Namorados, Pais, Crianças).'
};

function situacaoLoja(cobertura, percentualVencido) {
  if ((cobertura !== null && cobertura < 0.9) || percentualVencido > 0.3) return 'crítico';
  if ((cobertura !== null && cobertura < 1.0) || percentualVencido > 0.1) return 'atenção';
  return 'saudável';
}

async function apurar(mesRef) {
  const mesAtual = Number(mesRef.slice(5, 7));
  const estacao = SITUACAO_POR_MES[mesAtual] || 'ATRAVESSAR';

  const [faturamento, boletos, referencia, manual, campanhasRows] = await Promise.all([
    faturamentoMensalPorLoja(mesRef),
    boletosPorLoja(),
    dbAllAsync('SELECT * FROM fluxo_caixa_referencia_loja').then(rows => rows.map(r => ({
      loja: r.loja, pontoEquilibrioDia: Number(r.pontoequilibriodia ?? r.pontoEquilibrioDia) || 0,
      pontoEquilibrioMes: Number(r.pontoequilibriomes ?? r.pontoEquilibrioMes) || 0
    }))),
    dbAllAsync('SELECT loja, retiradaSocios FROM fluxo_caixa_mensal WHERE mesReferencia = ?', [mesRef]).then(rows => rows.map(r => ({
      loja: r.loja, retiradaSocios: Number(r.retiradasocios ?? r.retiradaSocios) || 0
    }))),
    dbAllAsync('SELECT * FROM fluxo_caixa_campanha ORDER BY nome DESC')
  ]);

  const referenciaPorLoja = {};
  referencia.forEach(r => { referenciaPorLoja[r.loja] = r; });
  const retiradaPorLoja = {};
  manual.forEach(m => { retiradaPorLoja[m.loja] = m.retiradaSocios; });

  const lojas = LOJAS_CACAU.map(loja => {
    const f = faturamento[loja] || { faturamento: 0, diasAbertos: 0 };
    const ref = referenciaPorLoja[loja] || { pontoEquilibrioDia: 0 };
    const b = boletos[loja] || { aberto: 0, vencido: 0, percentualVencido: 0, diasMediosAtraso: 0 };
    const vendaPorDia = f.diasAbertos > 0 ? f.faturamento / f.diasAbertos : 0;
    const cobertura = ref.pontoEquilibrioDia > 0 ? vendaPorDia / ref.pontoEquilibrioDia : null;

    return {
      loja,
      faturamentoMes: f.faturamento,
      diasAbertos: f.diasAbertos,
      vendaPorDia,
      pontoEquilibrioDia: ref.pontoEquilibrioDia,
      cobertura,
      titulosAberto: b.aberto,
      titulosVencido: b.vencido,
      percentualVencido: b.percentualVencido,
      diasMediosAtraso: b.diasMediosAtraso,
      retiradaSocios: retiradaPorLoja[loja] ?? null,
      situacao: situacaoLoja(cobertura, b.percentualVencido)
    };
  });

  const campanhas = (campanhasRows || []).map(c => {
    const teto = (Number(c.faturamentoAnoAnterior ?? c.faturamentoanoanterior) || 0) * (Number(c.fatorTeto ?? c.fatorteto) || 0.4);
    const pedido = c.pedidoOferecido ?? c.pedidooferecido;
    const temPedido = pedido !== null && pedido !== undefined;
    let veredito = 'sem pedido informado ainda';
    if (temPedido && teto > 0) {
      const razao = Number(pedido) / teto;
      veredito = razao <= 1 ? `dentro do teto (${(razao * 100).toFixed(0)}%)` : `${((razao - 1) * 100).toFixed(0)}% acima do teto`;
    }
    return { nome: c.nome, loja: c.loja, teto, pedido: temPedido ? Number(pedido) : null, veredito };
  });

  const retiradaTotalRede = lojas.reduce((s, l) => s + (Number(l.retiradaSocios) || 0), 0);

  return {
    mesRef, hoje: hojeBrasil(), estacao, descricaoEstacao: DESCRICAO_ESTACAO[estacao],
    lojas, campanhas,
    retiradaTotalRede, tetoSustentavelRede: TETO_SUSTENTAVEL_RETIRADA_REDE
  };
}

const SISTEMA_FLUXO_CAIXA = `Você é o Coach Financeiro de uma rede com 3 lojas Cacau Show (Marambaia, Icoaraci, Mário Covas) em Belém/PA.
Escreve o diagnóstico de fluxo de caixa para o Owner (franqueado leigo em contabilidade, quer entender e organizar o caixa, não só ver o DRE).

Tom: direto, de coach — sem jargão contábil. Português do Brasil.

Regras inegociáveis:
- Use SOMENTE os números fornecidos. Nunca calcule, projete ou invente valores.
- "Boleto vencido é sintoma; o erro aconteceu ~60 dias antes, na hora da compra" — sempre que houver título vencido, aponte a causa raiz (compra acima do teto), não só o efeito.
- Nunca trate as 3 lojas como caixa único: cada uma tem CNPJ e situação próprios.
- A cada estação do ano (Colheita/Travessia/Preparação) corresponde uma regra de comportamento — cite a regra da estação atual quando relevante.
- Se algo estiver saudável, diga em uma linha e siga.`;

const FORMATO_FLUXO_CAIXA = {
  manchete: 'a frase mais importante do diagnóstico, com número',
  porLoja: ['leitura de uma linha por loja: situação, cobertura do equilíbrio e títulos vencidos'],
  alertas: ['alerta financeiro que precisa de ação, com valor e loja'],
  recomendacoes: ['recomendação acionável, a mais importante primeiro', 'a segunda', 'a terceira'],
  fechamento: 'uma frase curta lembrando a regra da estação atual'
};

function fluxoCaixaFallback(d) {
  const alertas = [];
  d.lojas.forEach(l => {
    if (l.titulosVencido > 0) {
      alertas.push(`${l.loja}: ${reais(l.titulosVencido)} vencido(s) (${(l.percentualVencido * 100).toFixed(0)}% do em aberto), atraso médio de ${l.diasMediosAtraso} dias.`);
    }
  });
  if (d.retiradaTotalRede > d.tetoSustentavelRede) {
    alertas.push(`Retirada dos sócios informada (${reais(d.retiradaTotalRede)}) está acima do teto sustentável de referência (${reais(d.tetoSustentavelRede)}).`);
  }
  d.campanhas.filter(c => c.pedido !== null && c.pedido > c.teto).forEach(c => {
    alertas.push(`Campanha "${c.nome}" (${c.loja}): pedido ${(100 * (c.pedido / c.teto - 1)).toFixed(0)}% acima do teto de ${reais(c.teto)}.`);
  });
  if (alertas.length === 0) alertas.push('Nenhum alerta financeiro em aberto.');

  const criticas = d.lojas.filter(l => l.situacao === 'crítico');
  const atencao = d.lojas.filter(l => l.situacao === 'atenção');

  return {
    manchete: criticas.length > 0
      ? `${criticas.map(l => l.loja).join(', ')} em situação crítica de caixa este mês.`
      : `Rede sem loja em situação crítica em ${d.mesRef}.`,
    porLoja: d.lojas.map(l =>
      `${l.loja}: ${l.situacao} — venda/dia ${reais(l.vendaPorDia)}${l.pontoEquilibrioDia > 0 ? ` de um equilíbrio de ${reais(l.pontoEquilibrioDia)} (${l.cobertura !== null ? (l.cobertura * 100).toFixed(0) : '—'}%)` : ''}, ${reais(l.titulosVencido)} vencido.`
    ),
    alertas,
    recomendacoes: [
      criticas.length > 0 ? `Priorizar ${criticas.map(l => l.loja).join(', ')} — cobertura abaixo do equilíbrio ou vencido alto.` : (atencao.length > 0 ? `Acompanhar de perto ${atencao.map(l => l.loja).join(', ')}.` : 'Manter o ritmo atual das 3 lojas.'),
      d.retiradaTotalRede > d.tetoSustentavelRede ? 'Reduzir a retirada dos sócios até o teto sustentável antes de qualquer decisão de campanha nova.' : 'Retirada dentro do sustentável — sem ação aqui.',
      d.campanhas.some(c => c.pedido !== null && c.pedido > c.teto) ? 'Reperfilar ou reduzir o próximo pedido de campanha que está acima do teto de 40%.' : 'Nenhum pedido de campanha acima do teto no momento.'
    ],
    fechamento: d.descricaoEstacao,
    _fonte: 'fallback'
  };
}

async function gerarDiagnosticoFluxoCaixa({ mesRef = null, forcar = false } = {}) {
  const mes = mesRef || hojeBrasil().slice(0, 7);
  const dados = await apurar(mes);

  if (!iaHabilitada()) {
    return { dados, diagnostico: fluxoCaixaFallback(dados) };
  }

  const produtor = async () => {
    const linhasLojas = dados.lojas.map(l =>
      `  - ${l.loja} (${l.situacao}): faturou ${reais(l.faturamentoMes)} em ${l.diasAbertos} dias abertos (venda/dia ${reais(l.vendaPorDia)}${l.pontoEquilibrioDia > 0 ? `, equilíbrio ${reais(l.pontoEquilibrioDia)}/dia, cobertura ${l.cobertura !== null ? (l.cobertura * 100).toFixed(0) : '—'}%` : ''}). Títulos em aberto: ${reais(l.titulosAberto)}, dos quais ${reais(l.titulosVencido)} vencido (${(l.percentualVencido * 100).toFixed(0)}%), atraso médio ${l.diasMediosAtraso} dias. Retirada dos sócios informada: ${l.retiradaSocios !== null ? reais(l.retiradaSocios) : 'não informada'}.`
    ).join('\n');

    const linhasCampanhas = dados.campanhas.length > 0
      ? dados.campanhas.map(c => `  - ${c.nome} (${c.loja}): teto ${reais(c.teto)}, pedido ${c.pedido !== null ? reais(c.pedido) : 'não informado'} — ${c.veredito}.`).join('\n')
      : '  - nenhuma campanha cadastrada';

    const prompt = `Diagnóstico de fluxo de caixa de ${dados.mesRef} (hoje: ${dados.hoje}). Estação do ano: ${dados.estacao} — ${dados.descricaoEstacao}

SITUAÇÃO POR LOJA:
${linhasLojas}

CAMPANHAS CADASTRADAS (teto de compra):
${linhasCampanhas}

RETIRADA DOS SÓCIOS: total informado na rede ${reais(dados.retiradaTotalRede)} contra o teto sustentável de referência de ${reais(dados.tetoSustentavelRede)}.

Escreva de 2 a 5 alertas e exatamente 3 recomendações, priorizadas por impacto financeiro.`;

    const r = await gerarJSON(prompt, {
      sistema: SISTEMA_FLUXO_CAIXA,
      formato: FORMATO_FLUXO_CAIXA,
      temperatura: 0.4,
      maxTokens: 2000
    });
    return { ...r, _fonte: 'ia' };
  };

  try {
    const diagnostico = forcar
      ? await produtor()
      : await comCache(`fluxo-caixa:${mes}`, 12 * 3600, produtor);
    return { dados, diagnostico };
  } catch (err) {
    if (err instanceof IAIndisponivelError) {
      console.warn('[IA Fluxo de Caixa] Caindo no fallback:', err.message);
      return { dados, diagnostico: fluxoCaixaFallback(dados) };
    }
    throw err;
  }
}

module.exports = { gerarDiagnosticoFluxoCaixa, apurar };
