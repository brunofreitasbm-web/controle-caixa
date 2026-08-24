const { dbGetAsync, normalizeRow, TENANT_ZERO_ID } = require('../../config/database');

// Resolve req.tenant = { organizationId, colaboradorNome, role, viaSessao } a
// partir do token de sessão (Authorization: Bearer <token>) emitido por
// POST /auth/verify (ver routes/auth.js).
//
// Modo "soft" — intencional nesta fase: sem token, cai para TENANT_ZERO_ID em
// vez de rejeitar a requisição. O frontend atual (webapp/app.js) ainda não
// sabe enviar o token — isso só muda na Fase 2 do plano de arquitetura, que
// reescreve o cliente para usar sessão real. Forçar 401 aqui, antes disso,
// quebraria o app em produção hoje. O mecanismo de isolamento por tenant já
// funciona de ponta a ponta para quem manda o token (ver
// tests/tenant-isolation.test.js); só ainda não é obrigatório.
async function resolveTenantSession(req, res, next) {
  const auth = req.headers['authorization'] || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : null;

  if (!token) {
    req.tenant = { organizationId: TENANT_ZERO_ID, colaboradorNome: null, role: null, capacidades: [], viaSessao: false };
    return next();
  }

  try {
    const row = normalizeRow(await dbGetAsync('SELECT * FROM sessions WHERE token = ?', [token]));
    const expirada = row && row.expiraEm && new Date(row.expiraEm).getTime() < Date.now();
    if (!row || expirada) {
      req.tenant = { organizationId: TENANT_ZERO_ID, colaboradorNome: null, role: null, capacidades: [], viaSessao: false };
      return next();
    }
    let capacidades = [];
    try { capacidades = JSON.parse(row.capacidades || '[]'); } catch (e) { capacidades = []; }
    req.tenant = {
      organizationId: row.organizationId,
      colaboradorNome: row.colaboradorNome,
      role: row.role,
      capacidades,
      viaSessao: true
    };
    next();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

module.exports = resolveTenantSession;
