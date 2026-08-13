const express = require('express');
const router = express.Router();
const { dbAllAsync } = require('../config/database');
const { syncIfoodInventory } = require('../services/ifood-sync');

// POST /api/ifood/sync-force - Sincronização manual por loja
router.post('/ifood/sync-force', async (req, res) => {
  try {
    const loja = req.body.loja || req.query.loja;
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
router.get('/ifood/sync-status', async (req, res) => {
  try {
    const loja = req.query.loja;
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

// GET /api/ifood/overview - Status resumido (config + última sincronização) de todas as lojas
router.get('/ifood/overview', async (req, res) => {
  try {
    const configs = await dbAllAsync("SELECT loja, merchantId, clientId FROM ifood_config");
    const configPorLoja = new Map(configs.map(c => [c.loja, c]));

    const resumoSync = await dbAllAsync(`
      SELECT loja,
        COUNT(*) AS total,
        SUM(CASE WHEN status_enviado = 'AVAILABLE' THEN 1 ELSE 0 END) AS ativos,
        MAX(data_sincronizacao) AS ultimaSincronizacao
      FROM ifood_sync_history
      GROUP BY loja
    `);
    const syncPorLoja = new Map(resumoSync.map(s => [s.loja, s]));

    const lojas = new Set([...configPorLoja.keys(), ...syncPorLoja.keys()]);

    const overview = Array.from(lojas).map(loja => {
      const config = configPorLoja.get(loja);
      const sync = syncPorLoja.get(loja);
      return {
        loja,
        configurado: Boolean(config),
        merchantId: config ? config.merchantId : null,
        totalItens: sync ? sync.total : 0,
        itensAtivos: sync ? sync.ativos : 0,
        ultimaSincronizacao: sync ? sync.ultimaSincronizacao : null
      };
    });

    res.json({ success: true, data: overview });
  } catch (err) {
    console.error('[Route] Erro no overview:', err);
    res.status(500).json({ error: 'Erro interno no servidor' });
  }
});

module.exports = router;
