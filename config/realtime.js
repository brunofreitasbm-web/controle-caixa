/**
 * CANAL DE EVENTOS EM TEMPO REAL (SSE)
 * ==========================================================================
 * Mantém as conexões abertas dos usuários logados e distribui os eventos de
 * escrita (inventário, conferência de NF-e, registros, boletos, metas, ponto)
 * para todo mundo que está com o app aberto — sem precisar recarregar a página.
 *
 * LIMITAÇÃO IMPORTANTE: a lista de clientes vive na MEMÓRIA DESTE PROCESSO.
 * Funciona com uma única instância do servidor (Render/Railway/VPS com 1 réplica),
 * que é o cenário atual. Se um dia houver mais de uma instância, os eventos
 * publicados na instância A não chegam aos clientes conectados na B — nesse caso
 * será preciso trocar o `publish` local por Postgres LISTEN/NOTIFY (o banco já é
 * Postgres via DATABASE_URL) ou um Redis pub/sub.
 */

const HEARTBEAT_MS = 25000;   // proxies costumam derrubar conexão ociosa por volta de 60s
const MAX_BUFFER = 200;       // eventos guardados para reenviar após reconexão (Last-Event-ID)

const clients = new Set();
const buffer = [];
let nextEventId = 1;
let heartbeatTimer = null;

// O tipo vai DENTRO do data (e não como `event:`) de propósito: assim o cliente
// usa um único onmessage e despacha por `tipo`. Com `event:` nomeado, cada tipo
// novo exigiria um addEventListener correspondente no navegador — e um tipo
// esquecido sumiria silenciosamente.
function formatFrame(evento) {
  return `id: ${evento.id}\ndata: ${JSON.stringify(evento)}\n\n`;
}

function escrever(client, texto) {
  try {
    client.res.write(texto);
  } catch (e) {
    removeClient(client);
  }
}

function iniciarHeartbeat() {
  if (heartbeatTimer) return;
  heartbeatTimer = setInterval(() => {
    if (clients.size === 0) {
      clearInterval(heartbeatTimer);
      heartbeatTimer = null;
      return;
    }
    for (const client of clients) {
      escrever(client, ': ping\n\n');
    }
  }, HEARTBEAT_MS);
  if (heartbeatTimer.unref) heartbeatTimer.unref();
}

/**
 * Registra uma conexão SSE. `meta` = { usuario, clientId, loja }.
 * Retorna o objeto do cliente (usado para remover no close).
 */
function addClient(res, meta = {}) {
  const client = { res, ...meta, conectadoEm: new Date().toISOString() };
  clients.add(client);
  iniciarHeartbeat();
  return client;
}

function removeClient(client) {
  clients.delete(client);
}

/**
 * Reenvia os eventos que o cliente perdeu enquanto estava desconectado.
 * O navegador manda o header Last-Event-ID automaticamente na reconexão.
 */
function replay(client, lastEventId) {
  const desde = Number(lastEventId);
  if (!desde || Number.isNaN(desde)) return 0;
  const perdidos = buffer.filter(ev => ev.id > desde);
  for (const ev of perdidos) {
    escrever(client, formatFrame(ev));
  }
  return perdidos.length;
}

/**
 * Publica um evento para todos os clientes conectados.
 *
 * @param {string} tipo    ex.: 'inventario.item', 'nf.item', 'registro.criado'
 * @param {object} payload dados do evento — MANTENHA LEVE. Nunca inclua
 *                         fotoEnvelope (base64) nem blobs grandes: o evento
 *                         carrega só o que mudou e o cliente busca o resto se
 *                         precisar.
 * @param {object} opts    { origem: clientId de quem originou, usuario }
 */
function publish(tipo, payload, opts = {}) {
  const evento = {
    id: nextEventId++,
    tipo,
    payload,
    origem: opts.origem || null,
    usuario: opts.usuario || null,
    em: new Date().toISOString()
  };

  buffer.push(evento);
  if (buffer.length > MAX_BUFFER) buffer.shift();

  if (clients.size === 0) return evento;

  const frame = formatFrame(evento);
  for (const client of clients) {
    escrever(client, frame);
  }
  return evento;
}

function stats() {
  return {
    conectados: clients.size,
    usuarios: Array.from(clients).map(c => ({
      usuario: c.usuario || null,
      loja: c.loja || null,
      conectadoEm: c.conectadoEm
    })),
    ultimoEventoId: nextEventId - 1
  };
}

module.exports = { addClient, removeClient, replay, publish, stats };
