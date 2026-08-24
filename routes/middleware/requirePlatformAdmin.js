const { TENANT_ZERO_ID } = require('../../config/database');

// Autorização de PLATAFORMA — acima de qualquer organização/tenant. Não
// existe (ainda) um conceito de "operador da SaaS" separado: quem administra
// a plataforma é, na prática, o owner da organização "tenant zero" (o dono
// real do Huboperações). Reaproveitar essa identidade evita inventar um
// segundo sistema de login só para isto — se um dia a plataforma precisar de
// mais de um operador, esse é o lugar certo pra trocar a regra.
//
// Exige sessão de verdade (token) — diferente de requireOwner, aqui NÃO há
// fallback para actorUsuario no corpo: gerenciar quais organizações existem
// no SaaS é sensível demais para aceitar "o cliente disse que é o dono".
function requirePlatformAdmin(req, res, next) {
  const tenant = req.tenant;
  if (!tenant || !tenant.viaSessao) {
    return res.status(401).json({ error: 'Sessão de plataforma necessária.' });
  }
  if (tenant.organizationId !== TENANT_ZERO_ID || tenant.role !== 'owner') {
    return res.status(403).json({ error: 'Acesso negado. Apenas o administrador da plataforma.' });
  }
  next();
}

module.exports = requirePlatformAdmin;
