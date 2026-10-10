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

// Mensagem padrão: título em negrito + corpo. Tudo escapado (o texto pode vir do client).
function formatarMensagem(titulo, corpo) {
  const t = titulo ? `<b>${escaparHtml(titulo)}</b>` : '';
  const c = corpo ? escaparHtml(corpo) : '';
  return [t, c].filter(Boolean).join('\n');
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

module.exports = { enviarTelegram, formatarMensagem, escaparHtml, aguardarPendentes, rastrear, configurado };
