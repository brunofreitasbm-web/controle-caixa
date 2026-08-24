const { TENANT_ZERO_ID } = require('../../config/database');

// Pequeno helper repetido em toda rota que já foi rewireada para tenant —
// evita reescrever "(req.tenant && req.tenant.organizationId) || TENANT_ZERO_ID"
// em cada arquivo. Ver routes/middleware/resolveTenantSession.js para como
// req.tenant é resolvido (token de sessão, com fallback pro tenant zero).
function organizationIdDe(req) {
  return (req.tenant && req.tenant.organizationId) || TENANT_ZERO_ID;
}

module.exports = { organizationIdDe };
