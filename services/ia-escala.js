// ==========================================================================
// ITEM 4 — ESCALA INTELIGENTE
// ==========================================================================
// Cruza a demanda real por hora (metas_vendas, que guarda a venda de cada
// intervalo) com a presença registrada no ponto (ponto_registros) para
// apontar horários com gente sobrando e picos descobertos.
//
// TRAVA DE DADOS MÍNIMOS: recomendação de escala mexe com a jornada de
// pessoas. Com poucos dias de histórico, o "pico das 20h" pode ser um sábado
// atípico, e a sugestão de cortar um horário viraria perda de venda. Por isso
// o serviço se recusa a recomendar abaixo de MIN_DIAS_HISTORICO e informa o
// que falta, em vez de produzir um número bonito e sem lastro.
// ==========================================================================

const { dbAllAsync } = require('../config/database');
const { gerarJSON, comCache, iaHabilitada, IAIndisponivelError } = require('./ia');
const { hojeBrasil } = require('./ia-briefing');

// Duas semanas cobrem cada dia da semana ao menos duas vezes — o mínimo para
// separar padrão de acaso. Configurável para permitir testar o caminho
// completo antes de o histórico acumular; baixar isso em produção devolve
// recomendações sem lastro.
const MIN_DIAS_HISTORICO = parseInt(process.env.IA_ESCALA_MIN_DIAS) || 14;
// Um dia da semana só entra na análise com pelo menos 2 ocorrências.
const MIN_OCORRENCIAS_DIA = 2;

const DIAS_SEMANA = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];

const reais = n => `R$ ${Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function nomeDiaSemana(dataISO) {
  return DIAS_SEMANA[new Date(`${String(dataISO).slice(0, 10)}T12:00:00Z`).getUTCDay()];
}

function somarDias(dataISO, dias) {
  const d = new Date(`${dataISO}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

// --------------------------------------------------------------------------
// Perfil de demanda: quanto cada hora vende, por dia da semana.
// --------------------------------------------------------------------------
async function perfilDemanda(loja, desde, ate) {
  const linhas = await dbAllAsync(
    'SELECT data, horaslot AS "horaSlot", valor FROM metas_vendas WHERE operacao = ? AND data >= ? AND data <= ?',
    [loja, desde, ate]
  );

  const dias = new Set();
  const porHora = {};
  const porDiaSemanaHora = {};

  (linhas || []).forEach(l => {
    const data = String(l.data).slice(0, 10);
    const hora = l.horaSlot;
    const valor = Number(l.valor) || 0;
    if (!hora) return;

    dias.add(data);
    const ds = nomeDiaSemana(data);

    if (!porHora[hora]) porHora[hora] = { soma: 0, ocorrencias: 0 };
    porHora[hora].soma += valor;
    porHora[hora].ocorrencias += 1;

    const chave = `${ds}|${hora}`;
    if (!porDiaSemanaHora[chave]) porDiaSemanaHora[chave] = { diaSemana: ds, hora, soma: 0, ocorrencias: 0 };
    porDiaSemanaHora[chave].soma += valor;
    porDiaSemanaHora[chave].ocorrencias += 1;
  });

  const horas = Object.entries(porHora)
    .map(([hora, d]) => ({
      hora,
      media: d.ocorrencias > 0 ? d.soma / d.ocorrencias : 0,
      total: d.soma,
      ocorrencias: d.ocorrencias
    }))
    .sort((a, b) => a.hora.localeCompare(b.hora));

  const totalGeral = horas.reduce((s, h) => s + h.total, 0);
  horas.forEach(h => { h.participacao = totalGeral > 0 ? h.total / totalGeral : 0; });

  const combinacoes = Object.values(porDiaSemanaHora)
    .filter(c => c.ocorrencias >= MIN_OCORRENCIAS_DIA)
    .map(c => ({ ...c, media: c.soma / c.ocorrencias }))
    .sort((a, b) => b.media - a.media);

  return { loja, dias: dias.size, horas, totalGeral, combinacoes };
}

// --------------------------------------------------------------------------
// Cobertura de ponto: quantas pessoas estavam marcadas em cada hora.
// ponto_registros guarda eventos (entrada/saída) com timestamp; a presença de
// uma hora é a quantidade de pessoas com turno aberto naquele momento.
// --------------------------------------------------------------------------
async function perfilPresenca(desde, ate) {
  const registros = await dbAllAsync(
    'SELECT usuario, timestamp, tipo FROM ponto_registros WHERE timestamp >= ? AND timestamp <= ? ORDER BY usuario, timestamp',
    [`${desde}T00:00:00.000Z`, `${ate}T23:59:59.999Z`]
  );

  if (!registros || registros.length === 0) {
    return { disponivel: false, totalRegistros: 0, porHora: {} };
  }

  // Pareia entrada -> saída por usuário e por dia, contando as horas cobertas.
  const porHora = {};
  const abertos = {};

  registros.forEach(r => {
    const tipo = String(r.tipo || '').toLowerCase();
    const ts = new Date(r.timestamp);
    if (Number.isNaN(ts.getTime())) return;

    if (tipo.includes('entrada')) {
      abertos[r.usuario] = ts;
    } else if (tipo.includes('saida') || tipo.includes('saída')) {
      const inicio = abertos[r.usuario];
      if (!inicio) return;
      delete abertos[r.usuario];
      for (let h = inicio.getUTCHours(); h <= ts.getUTCHours(); h++) {
        const hora = `${String(h).padStart(2, '0')}:00`;
        porHora[hora] = (porHora[hora] || 0) + 1;
      }
    }
  });

  return { disponivel: true, totalRegistros: registros.length, porHora };
}

// --------------------------------------------------------------------------
async function analisar({ loja, dataRef, janelaDias = 60 }) {
  const ate = somarDias(dataRef, -1);
  const desde = somarDias(ate, -janelaDias);

  const demanda = await perfilDemanda(loja, desde, ate);
  const presenca = await perfilPresenca(desde, ate);

  const suficiente = demanda.dias >= MIN_DIAS_HISTORICO;

  // Picos e vales só têm sentido com histórico; abaixo do mínimo eles são
  // calculados mas marcados como não confiáveis.
  const ordenadas = [...demanda.horas].sort((a, b) => b.media - a.media);
  const picos = ordenadas.slice(0, 3);
  const vales = ordenadas.filter(h => h.media > 0 || h.ocorrencias > 0).slice(-3).reverse();

  return {
    loja, desde, ate,
    diasComDados: demanda.dias,
    minimoNecessario: MIN_DIAS_HISTORICO,
    dadosSuficientes: suficiente,
    pontoDisponivel: presenca.disponivel,
    totalRegistrosPonto: presenca.totalRegistros,
    horas: demanda.horas,
    faturamentoPeriodo: demanda.totalGeral,
    picos,
    vales,
    combinacoesDiaHora: demanda.combinacoes.slice(0, 10),
    presencaPorHora: presenca.porHora
  };
}

const SISTEMA_ESCALA = `Você é o analista de operações que ajuda a dimensionar a escala das lojas Cacau Show em Belém/PA.
Recebe o perfil de venda por hora já apurado e escreve a recomendação de escala.

Tom: prático e cuidadoso. Escala mexe com a vida das pessoas.
Português do Brasil.

Regras inegociáveis:
- Use SOMENTE os números fornecidos. Nunca calcule, projete ou estime.
- Nunca recomende demissão, corte de jornada ou redução de quadro. O foco é REALOCAR: mover gente das horas fracas para as horas fortes.
- Se os dados de presença não estiverem disponíveis, diga isso explicitamente e limite-se a descrever a demanda.
- Toda recomendação precisa citar a hora e o valor que a sustenta.
- Não use nomes de campos técnicos nem termos em inglês.`;

const FORMATO_ESCALA = {
  resumo: 'uma frase sobre o padrão de movimento da loja',
  picos: 'quais horários concentram venda, com valores',
  ociosos: 'quais horários têm pouca venda, com valores',
  recomendacoes: ['ajuste de escala sugerido, sempre por realocação'],
  ressalvas: 'o que limita esta análise'
};

function escalaFallback(a) {
  const fmtH = h => `${h.hora} (média de ${reais(h.media)} por dia, ${(h.participacao * 100).toFixed(1)}% do faturamento)`;
  return {
    resumo: `Com ${a.diasComDados} dia(s) de histórico, ${a.loja} faturou ${reais(a.faturamentoPeriodo)} no período analisado.`,
    picos: a.picos.length ? a.picos.map(fmtH).join(' | ') : 'sem dados suficientes',
    ociosos: a.vales.length ? a.vales.map(fmtH).join(' | ') : 'sem dados suficientes',
    recomendacoes: a.dadosSuficientes
      ? [`Reforce o atendimento em ${a.picos[0]?.hora || 'nos horários de pico'} e realoque apoio dos horários mais fracos.`]
      : [`Ainda não é possível recomendar escala: são necessários ${a.minimoNecessario} dias de histórico e existem ${a.diasComDados}.`],
    ressalvas: a.pontoDisponivel
      ? 'Análise baseada na venda por hora e na presença registrada no ponto.'
      : 'Não há marcações de ponto no período, então a análise cobre apenas a demanda, sem comparar com o quadro escalado.',
    _fonte: 'fallback'
  };
}

async function gerarEscala({ loja, dataRef = null, janelaDias = 60, forcar = false }) {
  if (!loja) throw new Error('Parâmetro "loja" é obrigatório.');
  const data = dataRef || hojeBrasil();
  const a = await analisar({ loja, dataRef: data, janelaDias });

  // Trava: sem histórico mínimo, devolve o diagnóstico honesto e NÃO chama a
  // IA. Gerar um texto convincente em cima de 2 dias de dados seria pior do
  // que não ter a funcionalidade.
  if (!a.dadosSuficientes) {
    return {
      analise: a,
      escala: {
        resumo: `Dados insuficientes para recomendar escala em ${loja}.`,
        picos: '',
        ociosos: '',
        recomendacoes: [
          `Há ${a.diasComDados} dia(s) de venda por hora registrados; são necessários ao menos ${a.minimoNecessario}.`,
          'Mantenha o registro da Meta Hora a Hora em dia — é ele que alimenta esta análise.',
          ...(a.pontoDisponivel ? [] : ['Não há marcações de ponto no período: sem elas, não é possível comparar demanda com quadro escalado.'])
        ],
        ressalvas: 'Análise bloqueada de propósito: recomendação de escala com histórico curto confunde dia atípico com padrão.',
        _fonte: 'dados-insuficientes'
      }
    };
  }

  if (!iaHabilitada()) return { analise: a, escala: escalaFallback(a) };

  const produtor = async () => {
    const linhasHora = a.horas.map(h =>
      `  - ${h.hora}: média de ${reais(h.media)} por dia (${(h.participacao * 100).toFixed(1)}% do faturamento), em ${h.ocorrencias} registros${
        a.pontoDisponivel ? `, com ${a.presencaPorHora[h.hora] || 0} presença(s) de ponto no período` : ''
      }`
    ).join('\n');

    const linhasCombo = a.combinacoesDiaHora.length
      ? a.combinacoesDiaHora.map(c => `  - ${c.diaSemana} às ${c.hora}: média de ${reais(c.media)} (${c.ocorrencias} ocorrências)`).join('\n')
      : '  - sem combinações com repetição suficiente';

    const prompt = `Analise a escala da loja ${a.loja}, com base em ${a.diasComDados} dias de operação entre ${a.desde} e ${a.ate}.
Faturamento total do período: ${reais(a.faturamentoPeriodo)}.

VENDA MÉDIA POR HORA:
${linhasHora}

MELHORES COMBINAÇÕES DE DIA DA SEMANA E HORA:
${linhasCombo}

${a.pontoDisponivel
  ? `Há ${a.totalRegistrosPonto} marcações de ponto no período, já refletidas acima.`
  : 'ATENÇÃO: não há nenhuma marcação de ponto no período. Você NÃO pode afirmar quantas pessoas estavam escaladas em cada hora — limite-se à demanda e registre isso nas ressalvas.'}

Liste de 2 a 4 recomendações, sempre por realocação de pessoas entre horários.`;

    const r = await gerarJSON(prompt, {
      sistema: SISTEMA_ESCALA, formato: FORMATO_ESCALA,
      temperatura: 0.4, maxTokens: 2200
    });
    return { ...r, _fonte: 'ia' };
  };

  try {
    const chave = `escala:${loja}:${data}:${a.diasComDados}`;
    const escala = forcar ? await produtor() : await comCache(chave, 24 * 3600, produtor);
    return { analise: a, escala };
  } catch (err) {
    if (err instanceof IAIndisponivelError) {
      console.warn('[IA Escala] Caindo no fallback:', err.message);
      return { analise: a, escala: escalaFallback(a) };
    }
    throw err;
  }
}

module.exports = { gerarEscala, analisar, MIN_DIAS_HISTORICO };
