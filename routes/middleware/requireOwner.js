const { db } = require('../../config/database');

// Primeira checagem de papel feita no servidor (as demais rotas confiam
// apenas no que o cliente envia). Ainda confia no nome de usuário enviado
// pelo cliente — não há sessão/token nesta aplicação — mas o papel em si
// é sempre lido do banco, nunca aceito como alegação do cliente.
function requireOwner(req, res, next) {
  const actor = ((req.body && req.body.actorUsuario) || (req.query && req.query.actorUsuario) || '').trim();
  if (!actor) {
    return res.status(400).json({ error: 'actorUsuario é obrigatório.' });
  }

  db.get('SELECT role FROM colaboradores WHERE nome = ?', [actor], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!row || row.role !== 'owner') {
      return res.status(403).json({ error: 'Acesso negado. Apenas administradores (owner).' });
    }
    next();
  });
}

module.exports = requireOwner;
