const { db } = require('../../config/database');
const { lerSessao } = require('./sessao');

// Com sessão do servidor (Bearer emitido em /auth/verify ou /auth/sso), quem
// chama e o papel vêm do servidor e actorUsuario é sobrescrito — não dá para
// agir "como Bruno" só mandando o nome dele.
//
// Sem token, cai no comportamento antigo (confia no actorUsuario, lendo só o
// papel do banco) para não derrubar quem já estava logado no navegador quando
// isto foi publicado. Definir CACAU_EXIGIR_SESSAO=1 na Vercel desliga esse
// caminho legado e passa a exigir sessão em todas as rotas de owner.
function requireOwner(req, res, next) {
  lerSessao(req, (errSessao, sessao) => {
    if (errSessao) return res.status(500).json({ error: errSessao.message });

    if (sessao) {
      if (sessao.role !== 'owner') {
        return res.status(403).json({ error: 'Acesso negado. Apenas administradores (owner).' });
      }
      if (req.body && typeof req.body === 'object') req.body.actorUsuario = sessao.usuario;
      if (req.query) req.query.actorUsuario = sessao.usuario;
      req.sessao = sessao;
      return next();
    }

    if (process.env.CACAU_EXIGIR_SESSAO === '1') {
      return res.status(401).json({ error: 'Sessão expirada. Entre novamente.' });
    }

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
  });
}

module.exports = requireOwner;
