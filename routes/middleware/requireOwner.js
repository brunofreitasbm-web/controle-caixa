const { db, TENANT_ZERO_ID } = require('../../config/database');

// Primeira checagem de papel feita no servidor. Com sessão real
// (req.tenant.viaSessao, ver resolveTenantSession), o papel já veio do
// banco no momento do login e está no token — usa direto, sem exigir
// actorUsuario no corpo (essencial pra rotas GET, que não têm corpo).
// Sem sessão (frontend anterior à Fase 2, ou chamada legada), cai no
// comportamento de sempre: exige actorUsuario e relê o papel no banco a
// cada chamada — nunca aceita o papel como alegação do cliente.
function requireOwner(req, res, next) {
  if (req.tenant && req.tenant.viaSessao) {
    if (req.tenant.role !== 'owner') {
      return res.status(403).json({ error: 'Acesso negado. Apenas administradores (owner).' });
    }
    return next();
  }

  const actor = ((req.body && req.body.actorUsuario) || (req.query && req.query.actorUsuario) || '').trim();
  if (!actor) {
    return res.status(400).json({ error: 'actorUsuario é obrigatório.' });
  }
  const organizationId = (req.tenant && req.tenant.organizationId) || TENANT_ZERO_ID;

  db.get('SELECT role FROM colaboradores WHERE organizationId = ? AND nome = ?', [organizationId, actor], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!row || row.role !== 'owner') {
      return res.status(403).json({ error: 'Acesso negado. Apenas administradores (owner).' });
    }
    next();
  });
}

module.exports = requireOwner;
