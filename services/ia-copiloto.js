// ==========================================================================
// ITEM 6 — COPILOTO META HORA A HORA
// ==========================================================================
// Hoje o cron de config/notifications.js dispara sempre o mesmo texto:
// "Faltam 10 minutos para confirmar o intervalo das 15:00". É um despertador.
//
// Aqui ele vira uma instrução: quanto já foi vendido, quanto falta, quanto
// tempo resta e o que fazer com essa informação. O ritmo necessário e a
// projeção são calculados em JS; a IA só transforma isso em uma frase curta
// que cabe numa notificação push.
//
// FALLBACK: sem IA (ou sem meta cadastrada), devolve o texto determinístico
// com os mesmos números. O lembrete nunca deixa de sair.
// ==========================================================================

const { dbAllAsync, dbGetAsync } = require('../config/database');
const { gerarTexto, comCache, iaHabilitada, IAIndisponivelError } = require('./ia');
const { OPERACOES_CONFIG_META, checkpointsDoDiaMeta } = require('../config/notifications');

// Diferente do briefing/coach (cache de 12h), o copiloto não tinha NENHUM
// cache — cada chamada (tela do dashboard + o pingador externo a cada ~10min,
// ver server.js TOLERANCIA_PING_MIN) pagava 3 round-trips de banco e uma
// chamada de IA do zero. O aviso vale para uma janela de ~20min ao redor do
// intervalo, então um TTL curto cobre isso sem gerar texto repetido à toa.
const TTL_CACHE_COPILOTO_SEGUNDOS = 15 * 60;

const reais = n => `R$ ${Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function minutosDoHoraSlot(horaSlot) {
  const [h, m] = String(horaSlot || '').split(':').map(Number);
  if (Number.isNaN(h)) return null;
  return h * 60 + (m || 0);
}

const DIAS_SEMANA = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];
const nomeDiaSemana = d => DIAS_SEMANA[new Date(`${String(d).slice(0, 10)}T12:00:00Z`).getUTCDay()];

// --------------------------------------------------------------------------
// Apura o ritmo do dia até o intervalo que está por vir.
// --------------------------------------------------------------------------
async function apurarRitmo({ loja, data, horaSlot }) {
  const cfg = OPERACOES_CONFIG_META[loja];
  if (!cfg) throw new Error(`Loja "${loja}" não tem configuração de Meta Hora a Hora.`);

  const slotMin = minutosDoHoraSlot(horaSlot);
  const [fh, fm] = cfg.fechamento.split(':').map(Number);
  const fechamentoMin = fh * 60 + fm;

  const vendasHoje = await dbAllAsync(
    'SELECT horaslot AS "horaSlot", valor FROM metas_vendas WHERE operacao = ? AND data = ? ORDER BY horaslot ASC',
    [loja, data]
  );
  const vendido = (vendasHoje && vendasHoje.length > 0)
    ? Number(vendasHoje[vendasHoje.length - 1].valor) || 0
    : 0;

  const metaRow = await dbGetAsync(
    "SELECT valor FROM metas_diarias_lojas WHERE loja = ? AND data = ? AND origem IN ('diaria', 'manual')",
    [loja, data]
  );
  const meta = metaRow ? Number(metaRow.valor) || 0 : 0;

  const checkpoints = checkpointsDoDiaMeta(loja);
  const restantes = checkpoints.filter(c => c >= slotMin);
  const horasRestantes = restantes.length;

  const falta = meta > 0 ? Math.max(0, meta - vendido) : 0;
  const ritmoNecessario = (meta > 0 && horasRestantes > 0) ? falta / horasRestantes : 0;

  // Projeção pelo ritmo praticado até agora: quanto o dia fecharia se o
  // restante mantivesse a média das horas já registradas.
  const horasDecorridas = checkpoints.filter(c => c < slotMin).length;
  const mediaAtual = horasDecorridas > 0 ? vendido / horasDecorridas : 0;
  const projecao = vendido + mediaAtual * horasRestantes;

  // Melhor hora histórica: se as 20h costumam ser o pico desta loja neste dia
  // da semana, vale mencionar. Só entra com repetição suficiente.
  const diaSemana = nomeDiaSemana(data);
  const historico = await dbAllAsync(
    'SELECT horaslot AS "horaSlot", valor, data FROM metas_vendas WHERE operacao = ? AND data < ?',
    [loja, data]
  );
  const porHora = {};
  (historico || []).forEach(h => {
    if (nomeDiaSemana(h.data) !== diaSemana) return;
    const k = h.horaSlot;
    if (!porHora[k]) porHora[k] = { soma: 0, n: 0 };
    porHora[k].soma += Number(h.valor) || 0;
    porHora[k].n += 1;
  });
  const melhoresHoras = Object.entries(porHora)
    .filter(([, v]) => v.n >= 2)
    .map(([hora, v]) => ({ hora, media: v.soma / v.n }))
    .filter(h => restantes.includes(minutosDoHoraSlot(h.hora)))
    .sort((a, b) => b.media - a.media)
    .slice(0, 2);

  return {
    loja, data, horaSlot, diaSemana,
    vendido, meta, falta,
    temMeta: meta > 0,
    atingimento: meta > 0 ? vendido / meta : null,
    horasRestantes, horasDecorridas,
    ritmoNecessario, mediaAtual, projecao,
    projecaoBateMeta: meta > 0 ? projecao >= meta : null,
    melhoresHoras,
    fechamento: cfg.fechamento
  };
}

const SISTEMA_COPILOTO = `Você escreve o aviso de Meta Hora a Hora que aparece como notificação no celular da consultora de uma loja Cacau Show em Belém/PA.

Formato: UMA frase, no máximo 180 caracteres, sem quebra de linha. É uma notificação de celular — texto longo é cortado pelo sistema.

Tom: direto e encorajador, de colega que quer ajudar a bater a meta. Nunca ameaçador, nunca cobrança fria.

Regras inegociáveis:
- Use SOMENTE os números fornecidos. Nunca calcule, projete ou invente valores.
- A frase precisa dizer o que fazer, não apenas informar o número.
- Não use nomes de campos técnicos, aspas nem emojis (o app já coloca o ícone).
- Não repita o nome da loja: quem recebe já sabe onde trabalha.
- NUNCA sugira um produto específico ("ofereça as trufas", "empurre os bombons"). Você não recebe o estoque da loja e recomendar o que pode estar em falta destrói a confiança no aviso. Fale de ação de venda: abordar mais clientes, oferecer a segunda unidade, sugerir complemento na hora do fechamento.`;

function copilotoFallback(r) {
  if (!r.temMeta) {
    return `Confirme o intervalo das ${r.horaSlot}. Vendido até agora: ${reais(r.vendido)}.`;
  }
  if (r.falta <= 0) {
    return `Meta batida! ${reais(r.vendido)} de ${reais(r.meta)}. Confirme o intervalo das ${r.horaSlot} e siga somando.`;
  }
  if (r.horasRestantes <= 0) {
    return `Último intervalo do dia: ${r.horaSlot}. Faltam ${reais(r.falta)} para a meta de ${reais(r.meta)}.`;
  }
  return `Faltam ${reais(r.falta)} para a meta em ${r.horasRestantes}h. Precisa de ${reais(r.ritmoNecessario)} por hora. Confirme o intervalo das ${r.horaSlot}.`;
}

// --------------------------------------------------------------------------
async function gerarAvisoCopiloto({ loja, data, horaSlot }) {
  const chave = `copiloto:${loja}:${data}:${horaSlot}`;
  return comCache(chave, TTL_CACHE_COPILOTO_SEGUNDOS, () => produzirAvisoCopiloto({ loja, data, horaSlot }));
}

async function produzirAvisoCopiloto({ loja, data, horaSlot }) {
  let r;
  try {
    r = await apurarRitmo({ loja, data, horaSlot });
  } catch (err) {
    console.warn('[IA Copiloto] Falha ao apurar ritmo:', err.message);
    return { texto: `Faltam poucos minutos para confirmar o intervalo das ${horaSlot}.`, fonte: 'fallback', ritmo: null };
  }

  if (!iaHabilitada()) {
    return { texto: copilotoFallback(r), fonte: 'fallback', ritmo: r };
  }

  try {
    const linhas = [
      `- Horário a confirmar: ${r.horaSlot} (a loja fecha às ${r.fechamento}).`,
      `- Vendido hoje até agora: ${reais(r.vendido)}.`
    ];

    if (r.temMeta) {
      linhas.push(`- Meta do dia: ${reais(r.meta)}. Já foram ${(r.atingimento * 100).toFixed(0)}% dela.`);
      if (r.falta > 0) {
        linhas.push(`- Falta vender: ${reais(r.falta)}, com ${r.horasRestantes} intervalo(s) pela frente.`);
        linhas.push(`- Ritmo necessário: ${reais(r.ritmoNecessario)} por hora até o fechamento.`);
        linhas.push(`- No ritmo atual (${reais(r.mediaAtual)} por hora), o dia fecharia em ${reais(r.projecao)}, ou seja, ${r.projecaoBateMeta ? 'a meta seria batida' : 'a meta NÃO seria batida'}.`);
      } else {
        linhas.push('- A meta do dia JÁ FOI BATIDA. O aviso deve comemorar e incentivar a seguir somando.');
      }
    } else {
      linhas.push('- Não há meta cadastrada para hoje: não invente meta nem percentual, apenas incentive o registro e a venda.');
    }

    if (r.melhoresHoras.length > 0) {
      linhas.push(`- Historicamente, ${r.diaSemana} costuma render mais às ${r.melhoresHoras.map(h => `${h.hora} (${reais(h.media)})`).join(' e às ')} — esses horários ainda estão por vir hoje.`);
    }

    const texto = await gerarTexto(
      `Escreva o aviso do intervalo das ${r.horaSlot}.\n\n${linhas.join('\n')}`,
      { sistema: SISTEMA_COPILOTO, temperatura: 0.7, maxTokens: 2000 }
    );

    let limpo = String(texto || '').trim().replace(/^["']|["']$/g, '').replace(/\s+/g, ' ');

    // Notificação push corta texto longo. Se o modelo se estendeu, o aviso
    // determinístico é melhor do que uma frase truncada no meio.
    if (!limpo || limpo.length > 200) {
      console.warn(`[IA Copiloto] Texto descartado (${limpo.length} caracteres).`);
      return { texto: copilotoFallback(r), fonte: 'fallback', ritmo: r };
    }

    return { texto: limpo, fonte: 'ia', ritmo: r };
  } catch (err) {
    if (err instanceof IAIndisponivelError) {
      console.warn('[IA Copiloto] Caindo no fallback:', err.message);
      return { texto: copilotoFallback(r), fonte: 'fallback', ritmo: r };
    }
    throw err;
  }
}

module.exports = { gerarAvisoCopiloto, apurarRitmo };
