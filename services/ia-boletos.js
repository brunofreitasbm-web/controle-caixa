// ==========================================================================
// ITEM 3 — AUDITORIA DE DIVERGÊNCIA DE BOLETOS
// ==========================================================================
// Varre a tabela `boletos` procurando o que custa dinheiro: duplicidade
// (risco de pagar duas vezes), atraso (juros), parcela faltando e valor fora
// do padrão da série.
//
// A DETECÇÃO é 100% determinística, em JS — é ela que decide o que é
// divergência. A IA entra só depois, para classificar a severidade e
// escrever a ação recomendada em linguagem de gestor. Nenhum achado é
// inventado pelo modelo, e nada aqui altera a tabela: a auditoria sugere,
// quem baixa ou exclui boleto é o usuário, na tela que já existe.
// ==========================================================================

const { dbAllAsync } = require('../config/database');
const { gerarJSON, comCache, iaHabilitada, IAIndisponivelError } = require('./ia');
const { vencimentoParaISO, hojeBrasil, CODIGO_PARA_LOJA } = require('./ia-briefing');

const reais = n => `R$ ${Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function diasEntre(isoA, isoB) {
  const a = new Date(`${isoA}T12:00:00Z`);
  const b = new Date(`${isoB}T12:00:00Z`);
  return Math.round((a - b) / 86400000);
}

function mediana(nums) {
  if (nums.length === 0) return 0;
  const s = [...nums].sort((x, y) => x - y);
  const meio = Math.floor(s.length / 2);
  return s.length % 2 ? s[meio] : (s[meio - 1] + s[meio]) / 2;
}

// --------------------------------------------------------------------------
// Detectores
// --------------------------------------------------------------------------

// 1. Duplicidade provável. A deduplicação da importação (routes/financeiro.js)
// compara loja + documento + valor; quando o mesmo título é reemitido com
// outro número de documento, ele passa direto. Aqui a comparação ignora o
// documento justamente para pegar esse caso — é o achado que evita pagar
// duas vezes o mesmo boleto.
function detectarDuplicidade(boletos) {
  const grupos = {};
  boletos.forEach(b => {
    if (b.status === 'Pago') return;
    const chave = [b.loja, b.descricao, b.valor, b.vencimentoISO].join('|');
    (grupos[chave] = grupos[chave] || []).push(b);
  });

  return Object.values(grupos)
    .filter(g => g.length > 1)
    .map(g => ({
      tipo: 'duplicidade',
      loja: g[0].loja,
      valor: g[0].valor,
      valorEmRisco: g[0].valor * (g.length - 1),
      vencimento: g[0].vencimentoISO,
      descricao: g[0].descricao,
      quantidade: g.length,
      documentos: g.map(b => b.documento).filter(Boolean),
      ids: g.map(b => b.id)
    }))
    .sort((a, b) => b.valorEmRisco - a.valorEmRisco);
}

// 2. Vencidos e ainda em aberto.
function detectarVencidos(boletos, hoje) {
  return boletos
    .filter(b => b.status !== 'Pago' && b.vencimentoISO && b.vencimentoISO < hoje)
    .map(b => ({
      tipo: 'vencido',
      loja: b.loja,
      valor: b.valor,
      vencimento: b.vencimentoISO,
      descricao: b.descricao,
      diasAtraso: diasEntre(hoje, b.vencimentoISO),
      ids: [b.id]
    }))
    .sort((a, b) => b.diasAtraso - a.diasAtraso);
}

// 3. Parcela faltando: existe a parcela "1/2" mas a "2/2" nunca foi
// importada. Some do fluxo de caixa e reaparece como surpresa no vencimento.
function detectarParcelasFaltando(boletos) {
  const series = {};
  boletos.forEach(b => {
    const m = String(b.parcela || '').match(/^(\d+)\s*\/\s*(\d+)$/);
    if (!m) return;
    const total = parseInt(m[2]);
    if (total <= 1) return;
    // O documento base ("0091818227-001" -> "0091818227") liga as parcelas
    // da mesma série.
    const base = String(b.documento || '').split('-')[0];
    if (!base) return;
    const chave = `${b.loja}|${base}|${total}`;
    (series[chave] = series[chave] || { total, itens: [], loja: b.loja, descricao: b.descricao }).itens.push(parseInt(m[1]));
  });

  return Object.entries(series)
    .map(([chave, s]) => {
      const presentes = new Set(s.itens);
      const faltando = [];
      for (let i = 1; i <= s.total; i++) if (!presentes.has(i)) faltando.push(i);
      return { chave, ...s, faltando };
    })
    .filter(s => s.faltando.length > 0)
    .map(s => ({
      tipo: 'parcela_faltando',
      loja: s.loja,
      descricao: s.descricao,
      documentoBase: s.chave.split('|')[1],
      totalParcelas: s.total,
      parcelasFaltando: s.faltando,
      ids: []
    }));
}

// 4. Valor atípico dentro da mesma descrição. Só faz sentido com amostra
// suficiente — com 2 ou 3 títulos qualquer variação viraria "anomalia".
function detectarValorAtipico(boletos) {
  const porDescricao = {};
  boletos.forEach(b => {
    if (b.status === 'Pago' || !(b.valor > 0)) return;
    (porDescricao[b.descricao] = porDescricao[b.descricao] || []).push(b);
  });

  const achados = [];
  Object.entries(porDescricao).forEach(([descricao, itens]) => {
    if (itens.length < 5) return;
    const med = mediana(itens.map(i => i.valor));
    if (med <= 0) return;
    itens.forEach(b => {
      const razao = b.valor / med;
      if (razao >= 3 || razao <= 1 / 3) {
        achados.push({
          tipo: 'valor_atipico',
          loja: b.loja,
          valor: b.valor,
          medianaSerie: Number(med.toFixed(2)),
          razao: Number(razao.toFixed(2)),
          vencimento: b.vencimentoISO,
          descricao,
          ids: [b.id]
        });
      }
    });
  });
  return achados.sort((a, b) => b.valor - a.valor);
}

// 5. Concentração de vencimento: dias que sozinhos respondem por uma fatia
// grande do total a pagar — risco de aperto de caixa numa data específica.
function detectarConcentracao(boletos, hoje) {
  const abertos = boletos.filter(b => b.status !== 'Pago' && b.vencimentoISO && b.vencimentoISO >= hoje);
  const total = abertos.reduce((s, b) => s + b.valor, 0);
  if (total <= 0) return [];

  const porDia = {};
  abertos.forEach(b => { porDia[b.vencimentoISO] = (porDia[b.vencimentoISO] || 0) + b.valor; });

  return Object.entries(porDia)
    .map(([dia, valor]) => ({ tipo: 'concentracao', vencimento: dia, valor, percentualDoTotal: valor / total, ids: [] }))
    .filter(d => d.percentualDoTotal >= 0.2)
    .sort((a, b) => b.valor - a.valor);
}

// --------------------------------------------------------------------------
async function auditar(hoje) {
  const brutos = await dbAllAsync('SELECT id, documento, docFaturamento, parcela, loja, descricao, vencimento, valor, status FROM boletos');

  const boletos = (brutos || []).map(b => ({
    id: b.id,
    documento: b.documento,
    docFaturamento: b.docfaturamento ?? b.docFaturamento,
    parcela: b.parcela,
    loja: CODIGO_PARA_LOJA[String(b.loja)] || String(b.loja),
    descricao: (b.descricao || '').trim(),
    vencimentoISO: vencimentoParaISO(b.vencimento),
    valor: Number(b.valor) || 0,
    status: b.status
  }));

  const duplicidade = detectarDuplicidade(boletos);
  const vencidos = detectarVencidos(boletos, hoje);
  const parcelas = detectarParcelasFaltando(boletos);
  const atipicos = detectarValorAtipico(boletos);
  const concentracao = detectarConcentracao(boletos, hoje);

  return {
    hoje,
    totalBoletos: boletos.length,
    totalAbertos: boletos.filter(b => b.status !== 'Pago').length,
    duplicidade,
    vencidos,
    parcelas,
    atipicos,
    concentracao,
    valorEmRiscoDuplicidade: duplicidade.reduce((s, d) => s + d.valorEmRisco, 0),
    valorVencido: vencidos.reduce((s, v) => s + v.valor, 0),
    totalAchados: duplicidade.length + vencidos.length + parcelas.length + atipicos.length + concentracao.length
  };
}

const SISTEMA_AUDITORIA = `Você é o auditor financeiro de uma rede de 3 lojas Cacau Show em Belém/PA.
Recebe divergências JÁ DETECTADAS em boletos a pagar e as traduz para o gestor.

Tom: direto e prático, de quem protege o caixa da empresa.
Português do Brasil.

Regras inegociáveis:
- Os achados foram detectados por regras determinísticas. Não invente, não descarte e não crie achados novos.
- Use SOMENTE os valores fornecidos. Nunca some, calcule ou estime.
- Severidade: "alta" para risco de pagamento em duplicidade ou atraso com juros correndo; "media" para o que precisa de conferência; "baixa" para o que é só acompanhamento.
- A ação recomendada precisa ser concreta e verificável ("conferir no extrato se o documento X já foi pago"), nunca genérica ("revisar os boletos").
- Não use nomes de campos técnicos nem termos em inglês.`;

const FORMATO_AUDITORIA = {
  resumo: 'uma frase sobre a saúde geral dos boletos, com o valor total em risco',
  achados: [{
    titulo: 'título curto do problema',
    severidade: 'alta | media | baixa',
    detalhe: 'o que foi encontrado, com loja, valor e data',
    acao: 'o que fazer, de forma concreta'
  }],
  conclusao: 'uma frase de fechamento'
};

function auditoriaFallback(a) {
  const achados = [];

  a.duplicidade.slice(0, 5).forEach(d => achados.push({
    titulo: 'Possível boleto duplicado',
    severidade: 'alta',
    detalhe: `${d.quantidade} títulos idênticos em ${d.loja}: ${reais(d.valor)} cada, vencendo em ${d.vencimento} (${d.descricao}). Documentos: ${d.documentos.join(', ')}.`,
    acao: `Conferir no extrato se algum desses documentos já foi pago. Risco de pagar ${reais(d.valorEmRisco)} a mais.`
  }));

  a.vencidos.slice(0, 5).forEach(v => achados.push({
    titulo: 'Boleto vencido em aberto',
    severidade: v.diasAtraso > 15 ? 'alta' : 'media',
    detalhe: `${v.loja}: ${reais(v.valor)} vencido em ${v.vencimento}, com ${v.diasAtraso} dia(s) de atraso (${v.descricao}).`,
    acao: 'Verificar se já foi pago e não baixado no sistema; se não, negociar a segunda via antes que os juros aumentem.'
  }));

  a.parcelas.slice(0, 3).forEach(p => achados.push({
    titulo: 'Parcela faltando na série',
    severidade: 'media',
    detalhe: `${p.loja}: do documento ${p.documentoBase} (${p.totalParcelas} parcelas) faltam as parcelas ${p.parcelasFaltando.join(', ')} (${p.descricao}).`,
    acao: 'Reimportar o arquivo de boletos dessa série para não ser surpreendido no vencimento.'
  }));

  a.concentracao.slice(0, 2).forEach(c => achados.push({
    titulo: 'Concentração de vencimentos',
    severidade: 'media',
    detalhe: `${reais(c.valor)} vencem todos em ${c.vencimento}, o equivalente a ${(c.percentualDoTotal * 100).toFixed(0)}% de tudo que está em aberto.`,
    acao: 'Conferir a projeção de caixa para essa data com antecedência.'
  }));

  a.atipicos.slice(0, 3).forEach(t => achados.push({
    titulo: 'Valor fora do padrão da série',
    severidade: 'baixa',
    detalhe: `${t.loja}: ${reais(t.valor)} em "${t.descricao}", contra uma mediana de ${reais(t.medianaSerie)} nessa mesma série.`,
    acao: 'Conferir a nota de origem para confirmar se o valor está correto.'
  }));

  return {
    resumo: a.totalAchados === 0
      ? `Nenhuma divergência encontrada nos ${a.totalAbertos} boletos em aberto.`
      : `${a.totalAchados} divergência(s) em ${a.totalAbertos} boletos abertos. Risco de duplicidade: ${reais(a.valorEmRiscoDuplicidade)}. Vencido em aberto: ${reais(a.valorVencido)}.`,
    achados,
    conclusao: a.valorEmRiscoDuplicidade > 0
      ? 'Priorize a conferência das duplicidades — é o achado que evita perda direta de dinheiro.'
      : 'Acompanhe os vencimentos da semana.',
    _fonte: 'fallback'
  };
}

async function gerarAuditoriaBoletos({ dataRef = null, forcar = false } = {}) {
  const hoje = dataRef || hojeBrasil();
  const a = await auditar(hoje);

  if (a.totalAchados === 0) {
    return {
      auditoria: a,
      relatorio: {
        resumo: `Nenhuma divergência encontrada nos ${a.totalAbertos} boletos em aberto.`,
        achados: [],
        conclusao: 'Nada a tratar hoje.',
        _fonte: 'sem-achados'
      }
    };
  }

  if (!iaHabilitada()) {
    return { auditoria: a, relatorio: auditoriaFallback(a) };
  }

  const produtor = async () => {
    const bloco = [];

    if (a.duplicidade.length) {
      bloco.push(`DUPLICIDADE PROVÁVEL (${a.duplicidade.length} grupos, ${reais(a.valorEmRiscoDuplicidade)} em risco de pagamento a mais):`);
      a.duplicidade.slice(0, 8).forEach(d => bloco.push(
        `  - ${d.loja}: ${d.quantidade} títulos idênticos de ${reais(d.valor)}, vencimento ${d.vencimento}, descrição "${d.descricao}". Documentos diferentes: ${d.documentos.join(', ')}. Se todos forem pagos, ${reais(d.valorEmRisco)} são pagos a mais.`
      ));
    }
    if (a.vencidos.length) {
      bloco.push(`\nVENCIDOS EM ABERTO (${a.vencidos.length}, total ${reais(a.valorVencido)}):`);
      a.vencidos.slice(0, 8).forEach(v => bloco.push(
        `  - ${v.loja}: ${reais(v.valor)}, venceu em ${v.vencimento}, ${v.diasAtraso} dias de atraso, "${v.descricao}".`
      ));
      if (a.vencidos.length > 8) bloco.push(`  - (mostrando os 8 mais atrasados de ${a.vencidos.length}; o total acima considera todos)`);
    }
    if (a.parcelas.length) {
      bloco.push(`\nPARCELAS FALTANDO (${a.parcelas.length}):`);
      a.parcelas.slice(0, 6).forEach(p => bloco.push(
        `  - ${p.loja}: documento ${p.documentoBase} tem ${p.totalParcelas} parcelas, faltam a(s) ${p.parcelasFaltando.join(', ')}. Descrição "${p.descricao}".`
      ));
    }
    if (a.concentracao.length) {
      bloco.push(`\nCONCENTRAÇÃO DE VENCIMENTO:`);
      a.concentracao.forEach(c => bloco.push(
        `  - ${reais(c.valor)} vencem em ${c.vencimento}, ${(c.percentualDoTotal * 100).toFixed(0)}% de todo o valor em aberto.`
      ));
    }
    if (a.atipicos.length) {
      bloco.push(`\nVALOR FORA DO PADRÃO DA SÉRIE (${a.atipicos.length}):`);
      a.atipicos.slice(0, 6).forEach(t => bloco.push(
        `  - ${t.loja}: ${reais(t.valor)} em "${t.descricao}", ${t.razao}x a mediana de ${reais(t.medianaSerie)} dessa série.`
      ));
    }

    const prompt = `Auditoria de boletos em ${hoje}. Foram analisados ${a.totalBoletos} boletos, dos quais ${a.totalAbertos} estão em aberto.

Divergências detectadas pelo sistema:

${bloco.join('\n')}

Escreva o relatório. Cubra todos os tipos de divergência encontrados, do mais caro para o menos caro, em no máximo 8 achados.`;

    const r = await gerarJSON(prompt, {
      sistema: SISTEMA_AUDITORIA,
      formato: FORMATO_AUDITORIA,
      temperatura: 0.3,
      maxTokens: 3000
    });
    return { ...r, _fonte: 'ia' };
  };

  try {
    // A chave inclui a contagem de achados: importar boletos novos muda o
    // quadro e deve regenerar o relatório.
    const chave = `boletos:${hoje}:${a.totalBoletos}:${a.totalAchados}`;
    const relatorio = forcar ? await produtor() : await comCache(chave, 12 * 3600, produtor);
    return { auditoria: a, relatorio };
  } catch (err) {
    if (err instanceof IAIndisponivelError) {
      console.warn('[IA Boletos] Caindo no fallback:', err.message);
      return { auditoria: a, relatorio: auditoriaFallback(a) };
    }
    throw err;
  }
}

module.exports = { gerarAuditoriaBoletos, auditar };
