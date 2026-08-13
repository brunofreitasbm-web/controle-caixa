const express = require('express');
const router = express.Router();
const { dbAllAsync } = require('../config/database');
const { syncIfoodInventory } = require('../services/ifood-sync');
const { authenticateToken } = require('../middleware/auth');

// POST /api/ifood/sync-force - Sincronização manual por loja
router.post('/ifood/sync-force', authenticateToken, async (req, res) => {
  try {
    const loja = req.user.loja || req.body.loja;
    if (!loja) {
      return res.status(400).json({ error: "Loja não especificada" });
    }

    const result = await syncIfoodInventory(loja);
    
    if (result.success) {
      res.json({ success: true, count: result.count });
    } else {
      res.status(500).json({ error: result.error });
    }
  } catch (err) {
    console.error('[Route] Erro no sync-force:', err);
    res.status(500).json({ error: 'Erro interno no servidor' });
  }
});

// GET /api/ifood/sync-status - Obtém a última lista de itens pareados
router.get('/ifood/sync-status', authenticateToken, async (req, res) => {
  try {
    const loja = req.user.loja || req.query.loja;
    if (!loja) {
      return res.status(400).json({ error: "Loja não especificada" });
    }

    const rows = await dbAllAsync(
      "SELECT * FROM ifood_sync_history WHERE loja = ? ORDER BY descricao ASC",
      [String(loja)]
    );

    res.json(rows);
  } catch (err) {
    console.error('[Route] Erro no sync-status:', err);
    res.status(500).json({ error: 'Erro interno no servidor' });
  }
});

module.exports = router;
