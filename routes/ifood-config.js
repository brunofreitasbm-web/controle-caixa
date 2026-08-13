const express = require('express');
const router = express.Router();
const { dbGetAsync, dbRunAsync } = require('../config/database');

// GET: Retorna as configurações do iFood para uma loja (oculta o clientSecret por segurança)
router.get('/ifood-config', async (req, res) => {
  const { loja } = req.query;
  if (!loja) return res.status(400).json({ error: 'Loja é obrigatória' });
  
  try {
    const config = await dbGetAsync("SELECT loja, merchantId, clientId FROM ifood_config WHERE loja = ?", [loja]);
    // Postgres dobra identificadores não-citados para minúsculo (merchantid,
    // clientid) — o Node pg devolve as chaves como o banco as armazenou, então
    // sem essa normalização o front-end (que lê merchantId/clientId) recebia
    // sempre undefined e os campos do formulário voltavam vazios.
    const data = config
      ? {
          loja: config.loja,
          merchantId: config.merchantId ?? config.merchantid,
          clientId: config.clientId ?? config.clientid
        }
      : null;
    res.json({ success: true, data });
  } catch (err) {
    console.error('[iFood] Erro GET config:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST: Atualiza as configurações do iFood
router.post('/ifood-config', async (req, res) => {
  const { loja, merchantId, clientId, clientSecret } = req.body;
  if (!loja || !merchantId || !clientId) {
    return res.status(400).json({ error: 'Parâmetros obrigatórios ausentes.' });
  }

  try {
    let finalSecret = clientSecret;
    // Permite atualizar sem re-enviar o Client Secret (se já estiver cadastrado)
    if (!finalSecret || finalSecret.trim() === '') {
       const existing = await dbGetAsync("SELECT clientSecret FROM ifood_config WHERE loja = ?", [loja]);
       const existingSecret = existing ? (existing.clientSecret ?? existing.clientsecret) : null;
       if (existingSecret) {
         finalSecret = existingSecret;
       } else {
         return res.status(400).json({ error: 'Client Secret é obrigatório no primeiro cadastro.' });
       }
    }

    // Invalida o token anterior para forçar um novo na próxima requisição
    await dbRunAsync(`
      INSERT INTO ifood_config (loja, merchantId, clientId, clientSecret, token, tokenExpiraEm)
      VALUES (?, ?, ?, ?, NULL, NULL)
      ON CONFLICT(loja) DO UPDATE SET 
        merchantId = excluded.merchantId,
        clientId = excluded.clientId,
        clientSecret = excluded.clientSecret,
        token = NULL,
        tokenExpiraEm = NULL
    `, [loja, merchantId, clientId, finalSecret]);
    
    res.json({ success: true });
  } catch (err) {
    console.error('[iFood] Erro POST config:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
