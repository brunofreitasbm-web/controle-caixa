const crypto = require('crypto');
const { db } = require('../../config/database');

// Sessão do servidor para as rotas sensíveis. O app nunca teve sessão: as rotas
// confiavam no nome enviado pelo navegador (actorUsuario / ?usuario=). Aqui o
// servidor passa a emitir um token (PIN certo ou ticket do Hub de Gestão) e a
// descobrir sozinho quem está chamando e com qual papel — o papel sempre vem do
// banco (colaboradores), nunca do cliente. Nada aqui lê, grava ou apaga PIN.
const SESSAO_TTL_MS = 24 * 60 * 60 * 1000;

const hashToken = (token) => crypto.createHash('sha256').update(String(token)).digest('hex');

function criarSessao(usuario, cb) {
  const token = crypto.randomBytes(32).toString('hex');
  const agora = Date.now();
  db.run('DELETE FROM sessoes_auth WHERE expira_em < ?', [new Date(agora).toISOString()], () => {
    db.run(
      'INSERT INTO sessoes_auth (token_hash, usuario, criado_em, expira_em) VALUES (?, ?, ?, ?)',
      [hashToken(token), usuario, new Date(agora).toISOString(), new Date(agora + SESSAO_TTL_MS).toISOString()],
      (err) => cb(err, err ? null : token),
    );
  });
}

// cb(err, { usuario, role } | null). null = sem token, token desconhecido ou expirado.
function lerSessao(req, cb) {
  const m = /^Bearer\s+([a-f0-9]{64})$/i.exec(String(req.headers.authorization || ''));
  if (!m) return cb(null, null);
  db.get(
    `SELECT s.usuario AS usuario, s.expira_em AS expira_em, c.role AS role
       FROM sessoes_auth s LEFT JOIN colaboradores c ON c.nome = s.usuario
      WHERE s.token_hash = ?`,
    [hashToken(m[1])],
    (err, row) => {
      if (err) return cb(err);
      if (!row || new Date(row.expira_em).getTime() < Date.now()) return cb(null, null);
      cb(null, { usuario: row.usuario, role: row.role || null });
    },
  );
}

// Exige sessão válida com um dos papéis. Sem modo de transição: é para as rotas
// que eram abertas a qualquer pessoa na internet.
function exigirSessao(roles) {
  return (req, res, next) => {
    lerSessao(req, (err, sessao) => {
      if (err) return res.status(500).json({ error: err.message });
      if (!sessao) return res.status(401).json({ error: 'Sessão expirada. Entre novamente.' });
      if (!roles.includes(sessao.role)) return res.status(403).json({ error: 'Acesso negado.' });
      req.sessao = sessao;
      next();
    });
  };
}

module.exports = { criarSessao, lerSessao, exigirSessao };
