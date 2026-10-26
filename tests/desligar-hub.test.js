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

let server;
let baseUrl;
const NOMES = ['TDOwner', 'TDCons', 'TDOutro'];

const run = (sql, params = []) => new Promise((resolve, reject) => db.run(sql, params, (e) => (e ? reject(e) : resolve())));
const get = (sql, params = []) => new Promise((resolve, reject) => db.get(sql, params, (e, r) => (e ? reject(e) : resolve(r))));
const all = (sql, params = []) => new Promise((resolve, reject) => db.all(sql, params, (e, r) => (e ? reject(e) : resolve(r))));

async function api(method, path, body, token) {
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}
const b64u = (buf) => Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
function ticket(over = {}) {
  const p = b64u(JSON.stringify({ u: 'TDCons', a: 'desligar', aud: 'hub-operacoes-acesso', exp: Math.floor(Date.now() / 1000) + 60, jti: crypto.randomUUID(), ...over }));
  return `${p}.${b64u(crypto.createHmac('sha256', process.env.GESTAO_SSO_SECRET_CACAU).update(p).digest())}`;
}
const acesso = (over) => api('POST', '/auth/hub/acesso', { ticket: ticket(over) });
const verify = (usuario, pin) => api('POST', '/auth/verify', { usuario, pin });

before(() => new Promise((resolve) => {
  initDb(() => {
    setTimeout(async () => {
      await run("INSERT OR REPLACE INTO colaboradores (nome, role, criadoEm) VALUES ('TDOwner', 'owner', 'x')");
      await run("INSERT OR REPLACE INTO colaboradores (nome, role, criadoEm) VALUES ('TDCons', 'consultora', 'x')");
      await run("INSERT OR REPLACE INTO colaboradores (nome, role, criadoEm) VALUES ('TDOutro', 'consultora', 'x')");
      const app = express();
      app.use(express.json());
      app.use('/api', authRouter);
      server = http.createServer(app);
      server.listen(0, '127.0.0.1', async () => {
        baseUrl = `http://127.0.0.1:${server.address().port}/api`;
        for (const [u, p] of [['TDOwner', '1111'], ['TDCons', '2222'], ['TDOutro', '3333']]) {
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

test('desligar bloqueia o acesso, derruba a sessão e NÃO toca no PIN nem na biometria', async () => {
  await run("UPDATE colaboradores SET hasBiometricEnrolled = 1 WHERE nome = 'TDCons'");
  const pinAntes = (await get("SELECT pin FROM pins WHERE usuario = 'TDCons'")).pin;
  const token = (await verify('TDCons', '2222')).body.token;
  assert.match(token, /^[a-f0-9]{64}$/);

  const r = await acesso({});
  assert.equal(r.status, 200);
  assert.deepEqual({ ok: r.body.ok, mudou: r.body.mudou }, { ok: true, mudou: true });

  // PIN certo, mas desligado: não entra e não recebe token.
  const v = await verify('TDCons', '2222');
  assert.equal(v.body.valid, false);
  assert.equal(v.body.inativo, true);
  assert.equal(v.body.token, undefined);
  // PIN errado não revela que a conta está desligada.
  assert.equal((await verify('TDCons', '9999')).body.inativo, undefined);
  // A sessão que existia deixa de valer.
  assert.equal((await api('POST', '/pins', { usuario: 'TDCons', pin: '4444' }, token)).status, 401);

  // O que NÃO pode mudar.
  assert.equal((await get("SELECT pin FROM pins WHERE usuario = 'TDCons'")).pin, pinAntes);
  assert.equal(Number((await get("SELECT hasBiometricEnrolled AS b FROM colaboradores WHERE nome = 'TDCons'")).b), 1);
});

test('religar devolve o acesso com o mesmo PIN', async () => {
  const r = await acesso({ a: 'religar' });
  assert.equal(r.body.mudou, true);
  const v = await verify('TDCons', '2222');
  assert.equal(v.body.valid, true);
  assert.match(v.body.token, /^[a-f0-9]{64}$/);
});

test('repetir a ordem não muda nada; quem não existe no Cacau não é erro', async () => {
  assert.equal((await acesso({ a: 'religar' })).body.mudou, false);
  await acesso({ u: 'TDOutro' });
  assert.equal((await acesso({ u: 'TDOutro' })).body.mudou, false);
  const nada = await acesso({ u: 'NinguemAssim' });
  assert.deepEqual({ ok: nada.body.ok, encontrado: nada.body.encontrado, mudou: nada.body.mudou }, { ok: true, encontrado: false, mudou: false });
  await acesso({ u: 'TDOutro', a: 'religar' });
});

test('ticket de entrada, ação inválida, assinatura errada, expirado e reuso são recusados', async () => {
  assert.equal((await acesso({ aud: 'hub-operacoes' })).status, 401);
  assert.equal((await acesso({ a: 'apagar' })).status, 401);
  assert.equal((await acesso({ exp: Math.floor(Date.now() / 1000) - 5 })).status, 401);
  const forjado = ticket().replace(/\.[^.]+$/, '.AAAA');
  assert.equal((await api('POST', '/auth/hub/acesso', { ticket: forjado })).status, 401);
  assert.equal((await api('POST', '/auth/hub/acesso', { ticket: 'lixo' })).status, 400);

  const jti = crypto.randomUUID();
  assert.equal((await acesso({ u: 'TDOutro', jti })).status, 200);
  assert.equal((await acesso({ u: 'TDOutro', a: 'religar', jti })).status, 401); // mesmo jti
  assert.equal((await acesso({ u: 'TDOutro', a: 'religar' })).status, 200);
  assert.equal((await verify('TDOutro', '3333')).body.valid, true);
});

test('desligado não entra pelo Hub (SSO), mesmo com ticket válido', async () => {
  await acesso({});
  const sso = await api('POST', '/auth/sso', { ticket: ticket({ aud: 'hub-operacoes', u: 'TDCons', n: 'operar', a: undefined }) });
  assert.equal(sso.status, 403);
  await acesso({ a: 'religar' });
  const ok = await api('POST', '/auth/sso', { ticket: ticket({ aud: 'hub-operacoes', u: 'TDCons', n: 'operar', a: undefined }) });
  assert.equal(ok.status, 200);
});

test('nunca desliga o último owner ativo', async () => {
  const outros = await all("SELECT nome, ativo FROM colaboradores WHERE role = 'owner' AND nome <> 'TDOwner'");
  for (const o of outros) await run('UPDATE colaboradores SET ativo = 0 WHERE nome = ?', [o.nome]);
  try {
    const r = await acesso({ u: 'TDOwner' });
    assert.equal(r.status, 409);
    assert.equal(Number((await get("SELECT ativo AS a FROM colaboradores WHERE nome = 'TDOwner'")).a), 1);
  } finally {
    for (const o of outros) await run('UPDATE colaboradores SET ativo = ? WHERE nome = ?', [o.ativo === null ? 1 : o.ativo, o.nome]);
  }
  // Com outro owner ativo, o desligamento passa (e volta).
  await run("INSERT OR REPLACE INTO colaboradores (nome, role, criadoEm) VALUES ('TDOutro', 'owner', 'x')");
  assert.equal((await acesso({ u: 'TDOwner' })).body.mudou, true);
  assert.equal((await acesso({ u: 'TDOwner', a: 'religar' })).body.mudou, true);
});

test('consultar só lê: devolve papel e estado, não muda nada e queima o ticket', async () => {
  const jti = crypto.randomUUID();
  const r = await acesso({ a: 'consultar', u: 'TDCons', jti });
  assert.equal(r.status, 200);
  assert.deepEqual(
    { encontrado: r.body.encontrado, mudou: r.body.mudou, ativo: r.body.ativo, role: r.body.role },
    { encontrado: true, mudou: false, ativo: true, role: 'consultora' },
  );
  assert.equal((await acesso({ a: 'consultar', u: 'TDCons', jti })).status, 401); // mesmo jti

  // Não muda o estado: continua entrando com o mesmo PIN.
  assert.equal((await verify('TDCons', '2222')).body.valid, true);
  assert.equal((await acesso({ a: 'consultar', u: 'NinguemAssim' })).body.encontrado, false);

  // Desligado aparece como inativo.
  await acesso({ u: 'TDOutro' });
  assert.equal((await acesso({ a: 'consultar', u: 'TDOutro' })).body.ativo, false);
  await acesso({ u: 'TDOutro', a: 'religar' });
});
