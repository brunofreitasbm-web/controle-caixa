// Constantes e helpers de cálculo do módulo FaçaAmigos.
// Espelham exatamente a lógica hoje existente em webapp/app.js (LOJAS_FA,
// UNIDADES_FA_CONVERSAO e as funções de cálculo de bonificação/locações) —
// não foram inventados campos novos, apenas replicados os já usados pelo
// app antigo contra os endpoints de routes/fa-bonificacao.js.

export const UNIDADES_FA = ['Grão Pará', 'ParqueShopping', 'Parque Circuito'];

// Unidades que usam a metodologia de conversão (bonificação por % de vendas
// longas). O Parque Circuito (carrinhos) usa a metodologia de locações.
export const UNIDADES_FA_CONVERSAO = ['ParqueShopping', 'Grão Pará'];
export const UNIDADE_LOCACOES = 'Parque Circuito';

export const DIAS_SEMANA_PT = [
  'Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado',
];

export function competenciaAtual() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

export function dataHojeStr() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

// "YYYY-MM-DD" interpretado como data local (evita o desvio de fuso do
// construtor `new Date("YYYY-MM-DD")`, que assume UTC).
export function nomeDiaSemanaPorData(dataStr) {
  const [ano, mes, dia] = dataStr.split('-').map(Number);
  return DIAS_SEMANA_PT[new Date(ano, mes - 1, dia).getDay()];
}

export function parseRegraFaBonificacao(regra) {
  if (!regra) return regra;
  return {
    ...regra,
    pixDiasSemana: typeof regra.pixDiasSemana === 'string' ? JSON.parse(regra.pixDiasSemana) : (regra.pixDiasSemana || []),
  };
}

// Deriva os campos calculados de um lançamento (total, % conversão, dia da
// semana e pix do dia) a partir das contagens brutas de vendas.
export function calcularLinhaBonificacaoFa(l, regra) {
  const total = (l.vendas30 || 0) + (l.vendas1h || 0) + (l.vendas2h || 0);
  const pctConversao = total > 0 ? ((l.vendas1h || 0) + (l.vendas2h || 0)) / total : 0;
  const diaSemana = nomeDiaSemanaPorData(l.data);
  const pixHoje = (regra.pixDiasSemana.includes(diaSemana) && (l.vendas2h || 0) >= regra.pixMinVendas2h) ? regra.pixValor : 0;
  return { ...l, diaSemana, total, pctConversao, pixHoje };
}

export function calcularBonificacaoFa(lancamentos, regra) {
  let totalV30 = 0, totalV1h = 0, totalV2h = 0, totalPix = 0;

  const linhas = lancamentos.map((l) => {
    totalV30 += l.vendas30 || 0;
    totalV1h += l.vendas1h || 0;
    totalV2h += l.vendas2h || 0;

    const linha = calcularLinhaBonificacaoFa(l, regra);
    totalPix += linha.pixHoje;
    return linha;
  });

  const totalAtend = totalV30 + totalV1h + totalV2h;
  const pctConversaoMensal = totalAtend > 0 ? (totalV1h + totalV2h) / totalAtend : 0;

  let bonusTier = 0;
  let tierNome = null;
  if (pctConversaoMensal >= regra.diamantePercentMin) {
    bonusTier = regra.diamanteValor;
    tierNome = 'diamante';
  } else if (pctConversaoMensal >= regra.ouroPercentMin) {
    bonusTier = regra.ouroValor;
    tierNome = 'ouro';
  }

  return {
    linhas, totalV30, totalV1h, totalV2h, totalAtend, pctConversaoMensal,
    totalPix, bonusTier, tierNome, totalEstimado: bonusTier + totalPix,
  };
}

// Meta de locações do dia conforme o dia da semana.
export function metaLocacoesDoDia(dataStr, regra) {
  const [ano, mes, dia] = dataStr.split('-').map(Number);
  const dow = new Date(ano, mes - 1, dia).getDay();
  if (dow === 5) return regra.metaSexta;   // Sexta
  if (dow === 6) return regra.metaSabado;  // Sábado
  if (dow === 0) return regra.metaDomingo; // Domingo
  return regra.metaSegQui;                 // Seg-Qui
}

export function farolLocacoes(realizado, meta, regra) {
  const pct = meta > 0 ? realizado / meta : 0;
  if (pct >= regra.farolVerde) return { emoji: '🟢', texto: 'Bateu a meta', badge: 'pago' };
  if (pct >= regra.farolAmarelo) return { emoji: '🟡', texto: 'Quase lá', badge: 'atencao' };
  return { emoji: '🔴', texto: 'Abaixo', badge: 'urgente' };
}

export const STATUS_LABEL_FA = {
  aberto: 'Aberto',
  aguardando_retirada: 'Aguardando retirada',
  retirado: 'Retirado',
};

export const STATUS_BADGE_FA = {
  aberto: 'info',
  aguardando_retirada: 'atencao',
  retirado: 'pago',
};
