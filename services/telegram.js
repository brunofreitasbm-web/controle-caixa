// Canal Telegram para notificações do owner. Sem dependências: usa fetch nativo.
// Desligado (no-op) enquanto TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID não existirem.
// Nunca lança: falha de rede/API só vai para o log, sem expor o token.

const LIMITE_TEXTO = 4096;
const LIMITE_LEGENDA = 1024;
const TIMEOUT_MS = 8000;

const pendentes = new Set();

function configurado() {
  return !!(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID);
}

function escaparHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function truncar(s, max) {
  return s.length > max ? s.slice(0, max - 1) + '…' : s;
}

// --------------------------------------------------------------------------
// Formatação: categoria + título, loja, itens numerados, hashtags e horário.
//
//   🔒 <b>FECHAMENTO DE CAIXA</b>
//   💰 Caixa  #Caixa #Fechamento #Marambaia
//   📍 <b>Marambaia</b> · Cacau Show
//   ━━━━━━━━━━━━━━
//   1️⃣ 👤 Responsável: Débora
//   2️⃣ 💵 Faturado: R$ 1.100,41
//   ━━━━━━━━━━━━━━
//   🕐 10/10 · 21:05
// --------------------------------------------------------------------------
const REGUA = '━━━━━━━━━━━━━━';
const KEYCAPS = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣'];

// tipo -> { emoji, nome, cat, tags }. `cat` é a categoria (agrupa visualmente).
const TIPOS = {
  abertura_unidade:    { emoji: '🟢', nome: 'ABERTURA DE CAIXA',       cat: '💰 Caixa',      tags: ['Caixa', 'Abertura'] },
  fechamento_unidade:  { emoji: '🔒', nome: 'FECHAMENTO DE CAIXA',     cat: '💰 Caixa',      tags: ['Caixa', 'Fechamento'] },
  divergencia_caixa:   { emoji: '⚠️', nome: 'DIVERGÊNCIA DE CAIXA',    cat: '💰 Caixa',      tags: ['Caixa', 'Divergencia'] },
  envelopes_acumulados:{ emoji: '🚨', nome: 'ENVELOPES ACUMULADOS',    cat: '💰 Caixa',      tags: ['Caixa', 'Envelopes'] },
  retirada_solicitada: { emoji: '🔑', nome: 'RETIRADA SOLICITADA',     cat: '🔑 Retirada',   tags: ['Retirada'] },
  nfe_pendente:        { emoji: '🧾', nome: 'NFE PENDENTE',            cat: '🧾 NFE',        tags: ['NFE', 'Pendente'] },
  nfe_conferida:       { emoji: '✅', nome: 'NFE CONFERIDA',           cat: '🧾 NFE',        tags: ['NFE', 'Conferida'] },
  divergencia_nfe:     { emoji: '⚠️', nome: 'NFE COM DIVERGÊNCIA',     cat: '🧾 NFE',        tags: ['NFE', 'Divergencia'] },
  visao_19h:           { emoji: '📊', nome: 'VISÃO GERAL 19H',         cat: '📊 Resumos',    tags: ['Resumo', 'Visao19h'] },
  meta_atraso:         { emoji: '⛔', nome: 'INTERVALOS PERDIDOS',     cat: '🎯 Metas',      tags: ['Metas', 'Atraso'] },
  briefing_diario:     { emoji: '🌅', nome: 'BRIEFING DO DIA',         cat: '🧠 Briefing',   tags: ['Briefing'] },
  gestao:              { emoji: '📣', nome: null,                      cat: '📣 Gestão',     tags: ['Gestao'] }
};

const EMOJI_CAMPO = [
  [/respons|operador|solicitante|conferido por|por$/i, '👤'],
  [/faturad|valor|fundo|total|acumulad|previst|contad|diferen/i, '💵'],
  [/envelope/i, '✉️'],
  [/sess|venda|loca/i, '🎟️'],
  [/meta|convers/i, '🎯'],
  [/status|situa/i, '📌'],
  [/obs|justific/i, '📝'],
  [/nfe|nota/i, '🧾'],
  [/sistema|unidade/i, '🏬']
];

const RE_LOJA = /^(marambaia|icoaraci|m[aá]rio covas|havan|gr[aã]o par[aá]|parque ?shopping|parque circuito)$/i;

function emojiCampo(label) {
  if (RE_LOJA.test(String(label).trim())) return '📍';
  for (const [re, em] of EMOJI_CAMPO) if (re.test(label)) return em;
  return '▫️';
}

function numerar(i) {
  return KEYCAPS[i] || `${i + 1}.`;
}

function tagLoja(loja) {
  return String(loja || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]/g, '');
}

function rodapeHorario(data = new Date()) {
  const p = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false
  }).formatToParts(data).reduce((a, x) => (a[x.type] = x.value, a), {});
  return `🕐 ${p.day}/${p.month} · ${p.hour}:${p.minute}`;
}

// Quebra um texto livre em entradas: campos "Rótulo: valor" (numerados) e textos soltos.
// Aceita linhas, separador " | " e itens de lista "- Loja: valor".
function analisarTexto(corpo) {
  const entradas = [];
  String(corpo == null ? '' : corpo).split('\n').forEach((linha) => {
    linha.split(' | ').forEach((seg) => {
      let t = seg.trim();
      if (!t) return;
      const lista = t.startsWith('- ');
      if (lista) t = t.slice(2).trim();
      const m = t.match(/^([^:.\n]{2,32}):\s*(.+)$/);
      if (m) entradas.push({ emoji: lista ? '📍' : emojiCampo(m[1]), label: m[1].trim(), valor: m[2].trim() });
      else entradas.push({ texto: t });
    });
  });
  return entradas;
}

// opts: { tipo, titulo, loja, sistema, campos: [[label, valor, emoji?]], texto, corpo }
function formatarEvento(opts) {
  const cfg = TIPOS[opts.tipo] || TIPOS.gestao;
  const titulo = cfg.nome || String(opts.titulo || 'Aviso').replace(/^[^\p{L}\p{N}]+/u, '').toUpperCase();

  let entradas = [];
  if (Array.isArray(opts.campos)) {
    entradas = opts.campos.filter((c) => c && c[1] !== undefined && c[1] !== null && c[1] !== '')
      .map(([label, valor, emoji]) => ({ emoji: emoji || emojiCampo(label), label, valor: truncar(String(valor), 600) }));
  }
  if (opts.texto) entradas.unshift({ texto: String(opts.texto) });
  if (opts.corpo) entradas = entradas.concat(analisarTexto(opts.corpo));

  const tags = [...cfg.tags];
  if (opts.loja) tags.push(tagLoja(opts.loja));

  const linhas = [];
  linhas.push(`${cfg.emoji} <b>${escaparHtml(titulo)}</b>`);
  linhas.push(`${escaparHtml(cfg.cat)}  ${tags.map((t) => '#' + t).join(' ')}`);
  if (opts.loja) {
    linhas.push(`📍 <b>${escaparHtml(opts.loja)}</b>${opts.sistema ? ' · ' + escaparHtml(opts.sistema) : ''}`);
  }
  linhas.push(REGUA);

  let n = 0;
  for (const e of entradas) {
    if (e.texto !== undefined) {
      linhas.push(escaparHtml(truncar(e.texto, 900)));
    } else {
      linhas.push(`${numerar(n++)} ${e.emoji} ${escaparHtml(e.label)}: <b>${escaparHtml(truncar(e.valor, 600))}</b>`);
    }
  }
  if (entradas.length) linhas.push(REGUA);
  linhas.push(rodapeHorario());
  return linhas.join('\n');
}

// Compatibilidade / avisos genéricos: infere a loja do título ("... - Loja").
function formatarMensagem(titulo, corpo, tipo = 'gestao') {
  const t = String(titulo || '');
  const m = t.match(/^(.*\S)\s+-\s+([^-]+)$/);
  const loja = m ? m[2].trim().replace(/^Loja\s+/i, '') : null;
  return formatarEvento({ tipo, titulo: m ? m[1] : t, loja, corpo });
}

async function chamarApi(metodo, init, tentativa = 0) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const resp = await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/${metodo}`, { ...init, signal: ctrl.signal });
    if (resp.status === 429 && tentativa < 1) {
      const dados = await resp.json().catch(() => ({}));
      const espera = Math.min(Number(dados?.parameters?.retry_after) || 1, 5);
      await new Promise((r) => setTimeout(r, espera * 1000));
      return chamarApi(metodo, init, tentativa + 1);
    }
    if (!resp.ok) {
      const dados = await resp.json().catch(() => ({}));
      console.error(`Telegram ${metodo} falhou (${resp.status}): ${dados.description || 'sem detalhe'}`);
      return false;
    }
    return true;
  } catch (e) {
    console.error(`Telegram ${metodo} erro: ${e.name === 'AbortError' ? 'timeout' : e.message}`);
    return false;
  } finally {
    clearTimeout(timer);
  }
}

// texto: já formatado em HTML do Telegram (use formatarMensagem).
// foto: { buffer: Buffer, mimeType } opcional — vai como sendPhoto com o texto de legenda.
function enviarTelegram(texto, foto = null) {
  if (!configurado()) return Promise.resolve(false);
  const chatId = process.env.TELEGRAM_CHAT_ID;

  const p = (async () => {
    if (foto && foto.buffer) {
      const form = new FormData();
      form.append('chat_id', chatId);
      form.append('caption', truncar(texto, LIMITE_LEGENDA));
      form.append('parse_mode', 'HTML');
      form.append('photo', new Blob([foto.buffer], { type: foto.mimeType || 'image/jpeg' }), 'envelope.jpg');
      const ok = await chamarApi('sendPhoto', { method: 'POST', body: form });
      if (ok) return true;
    }
    return chamarApi('sendMessage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: truncar(texto, LIMITE_TEXTO),
        parse_mode: 'HTML',
        disable_web_page_preview: true
      })
    });
  })().catch((e) => { console.error('Telegram erro inesperado:', e.message); return false; });

  return rastrear(p);
}

function rastrear(p) {
  pendentes.add(p);
  p.finally(() => pendentes.delete(p));
  return p;
}

// Em serverless o processo pode morrer após a resposta HTTP; rotas aguardam isto.
function aguardarPendentes() {
  return Promise.allSettled([...pendentes]);
}

module.exports = { enviarTelegram, formatarMensagem, formatarEvento, escaparHtml, aguardarPendentes, rastrear, configurado };
