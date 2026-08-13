const express = require('express');
const router = express.Router();
const { dbGetAsync, dbRunAsync } = require('../config/database');
const { solicitarUserCode, concluirUserCodeAuthorization } = require('../services/ifood');

// GET: Retorna as configurações do iFood para uma loja (oculta o clientSecret por segurança)
router.get('/ifood-config', async (req, res) => {
  const { loja } = req.query;
  if (!loja) return res.status(400).json({ error: 'Loja é obrigatória' });
  
  try {
    const config = await dbGetAsync("SELECT loja, merchantId, clientId, redeId FROM ifood_config WHERE loja = ?", [loja]);
    const data = config
      ? {
          loja: config.loja,
          merchantId: config.merchantId ?? config.merchantid,
          clientId: config.clientId ?? config.clientid,
          redeId: config.redeId ?? config.redeid
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
  const { loja, merchantId, clientId, clientSecret, redeId } = req.body;
  if (!loja || !merchantId) {
    return res.status(400).json({ error: 'Parâmetro merchantId é obrigatório.' });
  }

  try {
    let finalSecret = clientSecret || '';
    if (!finalSecret || finalSecret.trim() === '') {
       const existing = await dbGetAsync("SELECT clientSecret FROM ifood_config WHERE loja = ?", [loja]);
       const existingSecret = existing ? (existing.clientSecret ?? existing.clientsecret) : null;
       if (existingSecret) {
         finalSecret = existingSecret;
       }
    }

    await dbRunAsync(`
      INSERT INTO ifood_config (loja, merchantId, clientId, clientSecret, redeId, token, tokenExpiraEm)
      VALUES (?, ?, ?, ?, ?, NULL, NULL)
      ON CONFLICT(loja) DO UPDATE SET 
        merchantId = excluded.merchantId,
        clientId = excluded.clientId,
        clientSecret = excluded.clientSecret,
        redeId = excluded.redeId
    `, [loja, merchantId, clientId || '', finalSecret, redeId || '']);
    
    res.json({ success: true });
  } catch (err) {
    console.error('[iFood] Erro POST config:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST: Solicita o Código de Ativação (User Code - 8 Caracteres)
router.post('/ifood/user-code', async (req, res) => {
  const { loja } = req.body;
  if (!loja) return res.status(400).json({ error: 'Loja é obrigatória' });

  try {
    const result = await solicitarUserCode(loja);
    res.json(result);
  } catch (err) {
    console.error('[iFood] Erro POST user-code:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST: Conclui a autorização do Código no Portal iFood
router.post('/ifood/complete-user-code', async (req, res) => {
  const { loja, verifier } = req.body;
  if (!loja) return res.status(400).json({ error: 'Loja é obrigatória' });

  try {
    const result = await concluirUserCodeAuthorization(loja, verifier);
    res.json(result);
  } catch (err) {
    console.error('[iFood] Erro POST complete-user-code:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
