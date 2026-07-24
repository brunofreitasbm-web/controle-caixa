const express = require('express');
const router = express.Router();
const { addClient, removeClient, replay, stats } = require('../config/realtime');

/**
 * GET /api/events — canal SSE que o app mantém aberto enquanto está em uso.
 * Query: usuario, clientId (uuid da aba, para ignorar o eco dos próprios
 * eventos), loja. Reconexão é automática no navegador (EventSource) e traz o
 * header Last-Event-ID, que usamos para reenviar o que foi perdido.
 */
router.get('/events', (req, res) => {
  const { usuario, clientId, loja } = req.query;

  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no'   // impede buffering em proxies tipo nginx
  });
  if (typeof res.flushHeaders === 'function') res.flushHeaders();

  const client = addClient(res, { usuario, clientId, loja });

  // Sugere ao navegador reconectar em 3s se a conexão cair
  res.write('retry: 3000\n\n');

  const lastEventId = req.headers['last-event-id'] || req.query.lastEventId;
  const reenviados = replay(client, lastEventId);

  // Sem `id:` neste frame para não mexer no Last-Event-ID do cliente.
  res.write(`data: ${JSON.stringify({ tipo: 'conectado', payload: { ok: true, reenviados } })}\n\n`);

  req.on('close', () => removeClient(client));
  req.on('error', () => removeClient(client));
});

// Diagnóstico: quantos clientes estão conectados agora
router.get('/events/status', (req, res) => {
  res.json(stats());
});

module.exports = router;
