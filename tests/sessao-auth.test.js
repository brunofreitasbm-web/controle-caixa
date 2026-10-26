const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const express = require('express');
const http = require('http');

process.env.DATABASE_URL = '';
process.env.GESTAO_SSO_SECRET_CACAU = 'segredo-de-teste';
delete process.env.CACAU_EXIGIR_SESSAO;
const { initDb, db } = require('../config/database');
const authRouter = require('../routes/auth');
const requireOwner = require('../routes/middleware/requireOwner');

let server;
let baseUrl;
const NOMES = ['TOwner', 'TCons', 'TDash', 'TNovo', 'TSemPin'];

const run = (sql, params = []) => new Promise((resolve, reject) => db.run(sql, params, (e) => (e ? reject(e) : resolve())));
const get = (sql, params = []) => new Promise((resolve, reject) => db.get(sql, params, (e, r) => (e ? reject(e) : resolve(r))));

async function api(method, path, body, token) {
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}
const verify = (usuario, pin) => api('POST', '/auth/verify', { usuario, pin });
// Um token por usuário: /auth/verify limita 10 tentativas por minuto e o teste faria quase isso.
const tokens = new Map();
const login = async (usuario, pin) => {
  if (!tokens.has(usuario)) tokens.set(usuario, (await verify(usuario, pin)).body.token);
  return tokens.get(usuario);
};

const b64u = (buf) => Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
function ticket(over = {}) {
  const p = b64u(JSON.stringify({ u: 'TOwner', n: 'admin', aud: 'hub-operacoes', exp: Math.floor(Date.now() / 1000) + 60, jti: crypto.randomUUID(), ...over }));
  return `${p}.${b64u(crypto.createHmac('sha256', process.env.GESTAO_SSO_SECRET_CACAU).update(p).digest())}`;
}
const sso = (over) => api('POST', '/auth/sso', { ticket: ticket(over) });

before(() => new Promise((resolve) => {
  initDb(() => {
    setTimeout(async () => {
      await run("INSERT OR REPLACE INTO colaboradores (nome, role, criadoEm) VALUES ('TOwner', 'owner', 'x')");
      await run("INSERT OR REPLACE INTO colaboradores (nome, role, criadoEm) VALUES ('TCons', 'consultora', 'x')");
      await run("INSERT OR REPLACE INTO colaboradores (nome, role, criadoEm) VALUES ('TDash', 'consultora_dashboard', 'x')");
      await run("INSERT OR REPLACE INTO colaboradores (nome, role, criadoEm) VALUES ('TSemPin', 'consultora', 'x')");
      const app = express();
      app.use(express.json());
      app.use('/api', authRouter);
      app.get('/api/_so-owner', requireOwner, (req, res) => res.json({ ok: true, ator: req.query.actorUsuario }));
      server = http.createServer(app);
      server.listen(0, '127.0.0.1', async () => {
        baseUrl = `http://127.0.0.1:${server.address().port}/api`;
        // Primeiro acesso: criar PIN de quem ainda não tem continua livre.
        for (const [u, p] of [['TOwner', '1111'], ['TCons', '2222'], ['TDash', '3333']]) {
          assert.equal((await api('POST', '/pins', { usuario: u, pin: p })).status, 200);
        }
        resolve();
      });
    }, 500);
  });
}));

after(async () => {
  const lista = NOMES.map((n) => `'${n}'`).join(',');
  await run(`DELETE FROM pins WHERE usuario IN (${lista})`);
  await run(`DELETE FROM colaboradores WHERE nome IN (${lista})`);
  await run(`DELETE FROM sessoes_auth WHERE usuario IN (${lista})`);
  await run('DELETE FROM sso_tickets_usados');
  await new Promise((r) => (server ? server.close(() => r()) : r()));
});

test('PIN certo devolve token; PIN errado não', async () => {
  const ok = await verify('TCons', '2222');
  assert.equal(ok.body.valid, true);
  assert.match(ok.body.token, /^[a-f0-9]{64}$/);
  const ruim = await verify('TCons', '9999');
  assert.equal(ruim.body.valid, false);
  assert.equal(ruim.body.token, undefined);
});

test('sobrescrever PIN de quem já tem PIN exige sessão; o PIN antigo segue valendo', async () => {
  const semToken = await api('POST', '/pins', { usuario: 'TOwner', pin: '0000' });
  assert.equal(semToken.status, 401);
  const tokenCons = await login('TCons', '2222');
  const outroUsuario = await api('POST', '/pins', { usuario: 'TOwner', pin: '0000' }, tokenCons);
  assert.equal(outroUsuario.status, 403);
  assert.equal((await verify('TOwner', '1111')).body.valid, true);
  assert.equal((await verify('TOwner', '0000')).body.valid, false);
});

test('o próprio usuário troca o seu PIN, e o owner troca o de outro', async () => {
  const tokenCons = await login('TCons', '2222');
  assert.equal((await api('POST', '/pins', { usuario: 'TCons', pin: '4444' }, tokenCons)).status, 200);
  assert.equal((await verify('TCons', '4444')).body.valid, true);
  const tokenOwner = await login('TOwner', '1111');
  assert.equal((await api('POST', '/pins', { usuario: 'TCons', pin: '2222' }, tokenOwner)).status, 200);
  assert.equal((await verify('TCons', '2222')).body.valid, true);
});

test('criar PIN de quem ainda não tem continua livre; PIN inválido é recusado', async () => {
  assert.equal((await api('POST', '/pins', { usuario: 'TSemPin', pin: '5555' })).status, 200);
  assert.equal((await verify('TSemPin', '5555')).body.valid, true);
  assert.equal((await api('POST', '/pins', { usuario: 'TSemPin', pin: 'abc' })).status, 400);
  assert.equal((await api('POST', '/pins', { usuario: 'TNovo' })).status, 400);
});

test('DELETE /pins só com sessão de owner e não é chamado por nada sem ela', async () => {
  assert.equal((await api('DELETE', '/pins/TSemPin')).status, 401);
  assert.equal((await api('DELETE', '/pins/TSemPin', undefined, await login('TCons', '2222'))).status, 403);
  assert.equal((await verify('TSemPin', '5555')).body.valid, true);
  assert.equal((await api('DELETE', '/pins/TSemPin', undefined, await login('TOwner', '1111'))).status, 200);
});

test('POST /colaboradores: sem sessão 401; consultora 403; dashboard não mexe em owner', async () => {
  const corpo = { nome: 'TNovo', role: 'consultora' };
  assert.equal((await api('POST', '/colaboradores', corpo)).status, 401);
  assert.equal((await api('POST', '/colaboradores', corpo, await login('TCons', '2222'))).status, 403);

  const tokenDash = await login('TDash', '3333');
  assert.equal((await api('POST', '/colaboradores', corpo, tokenDash)).status, 200);
  assert.equal((await api('POST', '/colaboradores', { nome: 'TNovo', role: 'owner' }, tokenDash)).status, 403);
  assert.equal((await api('POST', '/colaboradores', { nome: 'TOwner', role: 'consultora' }, tokenDash)).status, 403);
  assert.equal((await get("SELECT role FROM colaboradores WHERE nome = 'TOwner'")).role, 'owner');
  assert.equal((await get("SELECT role FROM colaboradores WHERE nome = 'TNovo'")).role, 'consultora');

  assert.equal((await api('POST', '/colaboradores', { nome: 'TNovo', role: 'owner' }, await login('TOwner', '1111'))).status, 200);
});

test('requireOwner: com token o nome do corpo não vale; sem token segue o modo legado', async () => {
  const tokenCons = await login('TCons', '2222');
  const falso = await api('GET', '/_so-owner?actorUsuario=TOwner', undefined, tokenCons);
  assert.equal(falso.status, 403);
  const real = await api('GET', '/_so-owner?actorUsuario=TCons', undefined, await login('TOwner', '1111'));
  assert.equal(real.status, 200);
  assert.equal(real.body.ator, 'TOwner');
  assert.equal((await api('GET', '/_so-owner?actorUsuario=TOwner')).status, 200);

  process.env.CACAU_EXIGIR_SESSAO = '1';
  try {
    assert.equal((await api('GET', '/_so-owner?actorUsuario=TOwner')).status, 401);
  } finally {
    delete process.env.CACAU_EXIGIR_SESSAO;
  }
});

test('SSO: owner entra com admin e recebe token; não-owner só com operar/admin; ver é recusado', async () => {
  const dono = await sso({});
  assert.equal(dono.status, 200);
  assert.match(dono.body.token, /^[a-f0-9]{64}$/);

  assert.equal((await sso({ n: 'operar' })).status, 403); // owner exige admin
  assert.equal((await sso({ u: 'TCons', n: 'ver' })).status, 403);
  assert.equal((await sso({ u: 'TCons', n: undefined })).status, 403);
  const gerente = await sso({ u: 'TCons', n: 'operar' });
  assert.equal(gerente.status, 200);
  // O ticket nunca eleva: a sessão continua sendo de consultora.
  assert.equal((await api('GET', '/_so-owner', undefined, gerente.body.token)).status, 403);
  assert.equal((await sso({ u: 'NaoExiste', n: 'admin' })).status, 403);
});
