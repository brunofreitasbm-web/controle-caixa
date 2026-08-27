// ==========================================================================
// FLUXO DE CAIXA — apuração compartilhada
// ==========================================================================
// Fonte única de verdade usada por services/ia-briefing.js (briefing diário)
// para apurar faturamento, dias abertos e títulos. CODIGO_PARA_LOJA e
// vencimentoParaISO vinham duplicados só dentro de services/ia-briefing.js —
// movidos para cá e reexportados de lá, para não ter duas versões da mesma
// regra. As telas de Fluxo de Caixa e o diagnóstico por IA que também usavam
// este arquivo foram removidos.
// ==========================================================================

const { dbAllAsync, normalizeRow } = require('../config/database');

const LOJAS_CACAU = ['Marambaia', 'Icoaraci', 'Mário Covas'];

// 9175/4304/9201 são os códigos usados na tabela `boletos`; `registros` e as
// demais tabelas do Cacau Show identificam a loja pelo nome.
const CODIGO_PARA_LOJA = { '9175': 'Marambaia', '4304': 'Icoaraci', '9201': 'Mário Covas' };
const LOJA_PARA_CODIGO = Object.fromEntries(
  Object.entries(CODIGO_PARA_LOJA).map(([codigo, loja]) => [loja, codigo])
);

const reais = n => `R$ ${Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function hojeBrasil() {
  const p = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(new Date());
  const o = {};
  p.forEach(x => { o[x.type] = x.value; });
  return `${o.year}-${o.month}-${o.day}`;
}

// Converte um timestamp ISO (armazenado em UTC) para a data no fuso de
// Belém/PA. Fatiar o ISO puro erra o dia perto da virada — mesmo problema já
// documentado em webapp/app.js sobre `registro.dataOperacao`.
function dataBrasil(valor) {
  if (!valor) return null;
  const s = String(valor);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const d = new Date(s);
  if (isNaN(d.getTime())) return null;
  const p = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(d);
  const o = {};
  p.forEach(x => { o[x.type] = x.value; });
  return `${o.year}-${o.month}-${o.day}`;
}

function somarDias(dataISO, dias) {
  const d = new Date(`${dataISO}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

// A coluna `vencimento` da tabela boletos é texto em DD/MM/YYYY — comparar
// direto no SQL/string dá resultado errado ('01/09' < '02/08').
function vencimentoParaISO(v) {
  if (!v) return null;
  const s = String(v).trim();
  const br = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (br) return `${br[3]}-${br[2]}-${br[1]}`;
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return iso[0];
  return null;
}

function diasEntre(dataA, dataB) {
  return Math.round((new Date(`${dataA}T12:00:00Z`) - new Date(`${dataB}T12:00:00Z`)) / 86400000);
}

// Venda diária por loja (Diário do Caixa): soma o campo "Valor Faturado"
// preenchido pela consultora em cada Fechamento de caixa em `registros`.
// Não usa `valorEnvelope` (dinheiro físico a retirar, usado no dashboard
// "Mensal" do Cacau Show) nem `metas_vendas` (check-in hora a hora, fonte do
// Meta Hora a Hora / Briefing) — `valorFaturado` é o número equivalente ao
// que o Bruno lançava manualmente na planilha.
async function vendaDiariaPorLoja(mesRef) {
  const linhas = (await dbAllAsync(
    `SELECT loja, dataOperacao, valorFaturado FROM registros
     WHERE tipoOperacao = 'Fechamento' AND deletadoEm IS NULL AND valorFaturado IS NOT NULL`
  )).map(normalizeRow);

  const porDia = {};
  linhas.forEach(r => {
    // "Venda Direta" também aparece em `registros` (ver LOJAS em app.js), mas
    // não é uma das 3 lojas físicas que este módulo acompanha — de fora,
    // ficaria inconsistente com o Painel, que só soma as 3.
    if (!LOJAS_CACAU.includes(r.loja)) return;
    const data = dataBrasil(r.dataOperacao);
    if (!data || !data.startsWith(mesRef)) return;
    const chave = `${r.loja}|${data}`;
    porDia[chave] = (porDia[chave] || 0) + (Number(r.valorFaturado) || 0);
  });

  return Object.entries(porDia)
    .map(([chave, valor]) => {
      const [loja, data] = chave.split('|');
      return { loja, data, valor };
    })
    .sort((a, b) => a.data.localeCompare(b.data) || a.loja.localeCompare(b.loja));
}

// Faturamento do mês inteiro por loja — usado no Painel e para pré-preencher
// "faturou no mesmo mês do ano anterior" no Teto de Campanha.
async function faturamentoMensalPorLoja(mesRef) {
  const dias = await vendaDiariaPorLoja(mesRef);
  const porLoja = {};
  LOJAS_CACAU.forEach(loja => { porLoja[loja] = { faturamento: 0, diasAbertos: 0 }; });
  dias.forEach(d => {
    if (!porLoja[d.loja]) porLoja[d.loja] = { faturamento: 0, diasAbertos: 0 };
    porLoja[d.loja].faturamento += d.valor;
    porLoja[d.loja].diasAbertos += 1;
  });
  return porLoja;
}

// Boletos por loja: em aberto, vencido (não pago e já passou do vencimento),
// % vencido sobre o aberto e dias médios de atraso dos que estão vencidos
// agora — a mesma leitura "o que precisa de ação hoje" do Briefing Diário.
async function boletosPorLoja() {
  const hoje = hojeBrasil();
  const boletos = (await dbAllAsync('SELECT loja, vencimento, valor, status FROM boletos')).map(normalizeRow);

  const porLoja = {};
  LOJAS_CACAU.forEach(loja => {
    porLoja[loja] = { aberto: 0, vencido: 0, qtdAberto: 0, qtdVencido: 0, somaDiasAtraso: 0 };
  });

  boletos.forEach(b => {
    const loja = CODIGO_PARA_LOJA[String(b.loja)] || String(b.loja);
    if (!porLoja[loja]) porLoja[loja] = { aberto: 0, vencido: 0, qtdAberto: 0, qtdVencido: 0, somaDiasAtraso: 0 };
    const pago = String(b.status || '').toLowerCase() === 'pago';
    if (pago) return;

    const valor = Number(b.valor) || 0;
    porLoja[loja].aberto += valor;
    porLoja[loja].qtdAberto += 1;

    const venc = vencimentoParaISO(b.vencimento);
    if (venc && venc < hoje) {
      porLoja[loja].vencido += valor;
      porLoja[loja].qtdVencido += 1;
      porLoja[loja].somaDiasAtraso += diasEntre(hoje, venc);
    }
  });

  Object.values(porLoja).forEach(l => {
    l.percentualVencido = l.aberto > 0 ? l.vencido / l.aberto : 0;
    l.diasMediosAtraso = l.qtdVencido > 0 ? Math.round(l.somaDiasAtraso / l.qtdVencido) : 0;
  });

  return porLoja;
}

module.exports = {
  LOJAS_CACAU,
  CODIGO_PARA_LOJA,
  LOJA_PARA_CODIGO,
  reais,
  hojeBrasil,
  dataBrasil,
  somarDias,
  vencimentoParaISO,
  diasEntre,
  vendaDiariaPorLoja,
  faturamentoMensalPorLoja,
  boletosPorLoja
};
