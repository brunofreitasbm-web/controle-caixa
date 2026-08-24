// ==========================================================================
// ROTAS DE IA
// ==========================================================================
// Todos os endpoints aqui são de LEITURA e SUGESTÃO: nenhum escreve em tabela
// de negócio. A IA analisa e propõe; quem confirma é o usuário, pela tela que
// já existe. Ver services/ia.js para as regras da camada.
// ==========================================================================

const express = require('express');
const router = express.Router();

const { iaHabilitada, PROVEDOR } = require('../services/ia');
const { gerarBriefing } = require('../services/ia-briefing');
const { mensagemAniversario, mensagemPosVisita } = require('../services/ia-mensagens');
const { gerarAvisoCopiloto } = require('../services/ia-copiloto');
const { organizationIdDe } = require('./middleware/tenantContext');

// Diagnóstico: permite conferir se a chave está configurada no ambiente sem
// expor o valor dela.
router.get('/ia/status', (req, res) => {
  res.json({
    habilitada: iaHabilitada(),
    provedor: PROVEDOR,
    modelo: process.env.GEMINI_MODEL || null
  });
});

// --------------------------------------------------------------------------
// ITEM 2 — Briefing diário do gestor (Owner e Líder de Operação)
// GET /api/ia/briefing[?data=YYYY-MM-DD][&forcar=true]
// --------------------------------------------------------------------------
router.get('/ia/briefing', async (req, res) => {
  const { data, forcar } = req.query;

  if (data && !/^\d{4}-\d{2}-\d{2}$/.test(data)) {
    return res.status(400).json({ error: 'Data deve estar no formato YYYY-MM-DD.' });
  }

  try {
    const resultado = await gerarBriefing({ dataRef: data || null, forcar: forcar === 'true', organizationId: organizationIdDe(req) });
    res.json(resultado);
  } catch (err) {
    console.error('[IA Briefing] Erro:', err);
    res.status(500).json({ error: err.message });
  }
});

// --------------------------------------------------------------------------
// ITEM 5 — Mensagem personalizada (aniversário e pós-visita)
// POST /api/ia/mensagem
//   { tipo: "aniversario", nomeResponsavel, nomeCrianca, idade }
//   { tipo: "pos-visita",  nomeResponsavel, nomeCrianca, tempoTotalMinutos, jaContactadoAntes }
//
// Devolve { mensagem: null, fonte: "fallback" } sempre que a IA não puder
// atender — é o sinal para o frontend usar gerarMensagemAniversario() /
// gerarMensagemPosVisita(), o sorteio de template que já existe. O envio em
// si continua sendo feito pelo usuário, pelo WhatsApp.
//
// O telefone NÃO é aceito neste endpoint de propósito: ele não é necessário
// para escrever a mensagem e não deve trafegar até o provedor de IA.
// --------------------------------------------------------------------------
router.post('/ia/mensagem', async (req, res) => {
  const { tipo, nomeResponsavel, nomeCrianca, idade, tempoTotalMinutos, jaContactadoAntes } = req.body || {};

  if (!tipo || !['aniversario', 'pos-visita'].includes(tipo)) {
    return res.status(400).json({ error: 'Campo "tipo" deve ser "aniversario" ou "pos-visita".' });
  }
  if (!nomeResponsavel || !nomeCrianca) {
    return res.status(400).json({ error: 'Campos "nomeResponsavel" e "nomeCrianca" são obrigatórios.' });
  }

  try {
    const mensagem = tipo === 'aniversario'
      ? await mensagemAniversario({ nomeResponsavel, nomeCrianca, idade })
      : await mensagemPosVisita({ nomeResponsavel, nomeCrianca, tempoTotalMinutos, jaContactadoAntes: !!jaContactadoAntes });

    res.json({
      mensagem,
      fonte: mensagem ? 'ia' : 'fallback'
    });
  } catch (err) {
    // Falhar aqui não pode travar o envio: devolve 200 com mensagem nula e o
    // frontend segue com o template sorteado.
    console.warn('[IA Mensagem] Caindo no fallback:', err.message);
    res.json({ mensagem: null, fonte: 'fallback', motivo: err.message });
  }
});

// --------------------------------------------------------------------------
// ITEM 6 — Copiloto Meta Hora a Hora
// GET /api/ia/copiloto?loja=Marambaia&horaSlot=15:00[&data=YYYY-MM-DD]
//
// O disparo automático acontece no cron de server.js, 10 minutos antes de
// cada intervalo. Este endpoint serve para a consultora consultar o ritmo
// sob demanda, dentro do app.
// --------------------------------------------------------------------------
router.get('/ia/copiloto', async (req, res) => {
  const { loja, horaSlot, data } = req.query;

  if (!loja || !horaSlot) {
    return res.status(400).json({ error: 'Parâmetros "loja" e "horaSlot" são obrigatórios.' });
  }
  if (!/^\d{2}:\d{2}$/.test(horaSlot)) {
    return res.status(400).json({ error: 'horaSlot deve estar no formato HH:MM.' });
  }
  if (data && !/^\d{4}-\d{2}-\d{2}$/.test(data)) {
    return res.status(400).json({ error: 'Data deve estar no formato YYYY-MM-DD.' });
  }

  try {
    const { agoraBrasilMeta } = require('../config/notifications');
    const resultado = await gerarAvisoCopiloto({
      loja,
      data: data || agoraBrasilMeta().data,
      horaSlot,
      organizationId: organizationIdDe(req)
    });
    res.json(resultado);
  } catch (err) {
    console.error('[IA Copiloto] Erro:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
