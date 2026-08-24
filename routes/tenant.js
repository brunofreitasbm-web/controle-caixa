// ==========================================================================
// ROTAS DE TENANT (Fase 2/3 do plano de arquitetura SaaS)
// ==========================================================================
// Substitui os dados hoje hardcoded em webapp/app.js (USERS, LOJAS,
// OPERACOES_INFO, OPERACOES_ALIASES, WHATSAPP_GRUPOS, LOJAS_GEOLOC) por dado
// vindo do banco, escopado por organização. O frontend chama
// GET /tenant/bootstrap antes/depois do login e usa a resposta pra
// popular esses mesmos objetos — se a chamada falhar, o app cai de volta
// para os valores hardcoded (ver aplicarBootstrapTenant em webapp/app.js),
// então este endpoint nunca é um ponto único de falha do login.
//
// Faça Amigos fica de fora de propósito: é um módulo em descontinuação para
// o produto SaaS (decisão do dono), então `unidades` só devolve as do
// negócio "cacau-show" — o app continua servindo Faça Amigos normalmente
// para a operação atual, só que por cima dos dados hardcoded de sempre,
// sem passar por este endpoint.
// ==========================================================================

const express = require('express');
const router = express.Router();
const { db, normalizeRow, TENANT_ZERO_ID } = require('../config/database');
const { organizationIdDe } = require('./middleware/tenantContext');
const requireOwner = require('./middleware/requireOwner');

router.get('/bootstrap', async (req, res) => {
  const organizationId = organizationIdDe(req);

  try {
    const [org, unidades, modulos, colaboradores] = await Promise.all([
      new Promise((resolve, reject) => {
        db.get('SELECT id, slug, nome FROM organizations WHERE id = ?', [organizationId], (err, row) => err ? reject(err) : resolve(row));
      }),
      new Promise((resolve, reject) => {
        db.all(
          `SELECT nome, codigoExterno, lat, lng, abertura, fechamento, whatsappGrupoUrl, corEmoji
           FROM unidades WHERE organizationId = ? AND negocioChave = 'cacau-show' AND ativo = 1 ORDER BY nome`,
          [organizationId],
          (err, rows) => err ? reject(err) : resolve(rows || [])
        );
      }),
      new Promise((resolve, reject) => {
        db.all('SELECT moduloChave, habilitado FROM tenant_modules WHERE organizationId = ?', [organizationId], (err, rows) => err ? reject(err) : resolve(rows || []));
      }),
      new Promise((resolve, reject) => {
        db.all('SELECT nome, role FROM colaboradores WHERE organizationId = ? ORDER BY nome', [organizationId], (err, rows) => err ? reject(err) : resolve(rows || []));
      })
    ]);

    const modulosMap = {};
    modulos.map(normalizeRow).forEach(m => { modulosMap[m.moduloChave] = !!m.habilitado; });

    res.json({
      organizationId,
      organizacao: org ? { nome: org.nome, slug: org.slug } : null,
      unidades: unidades.map(normalizeRow),
      modulos: modulosMap,
      colaboradoresLogin: colaboradores.map(normalizeRow)
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Liga/desliga um módulo para a organização do request — só o owner altera.
// A UI de Configurações (Fase 3) chama isto para os toggles de feature flag;
// o efeito imediato é a barra lateral esconder o grupo de abas do módulo
// (ver aplicarModulosTenant em webapp/app.js).
router.put('/modules/:chave', requireOwner, (req, res) => {
  const organizationId = organizationIdDe(req);
  const { chave } = req.params;
  const habilitado = req.body.habilitado ? 1 : 0;
  const agora = new Date().toISOString();

  db.run(
    `INSERT INTO tenant_modules (id, organizationId, moduloChave, habilitado, criadoEm)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(organizationId, moduloChave) DO UPDATE SET habilitado = excluded.habilitado`,
    [`tm-${organizationId}-${chave}`, organizationId, chave, habilitado, agora],
    (err) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true, chave, habilitado: !!habilitado });
    }
  );
});

module.exports = router;
