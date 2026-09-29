const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const express = require('express');
const http = require('http');

process.env.DATABASE_URL = '';
process.env.GESTAO_SSO_SECRET_CACAU = 'segredo-de-teste';
const { initDb, db } = require('../config/database');
const authRouter = require('../routes/auth');

let server;
let baseUrl;

const b64u = (buf) => Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
function ticket(over = {}, secret = process.env.GESTAO_SSO_SECRET_CACAU) {
  const payload = {
    u: 'Bruno', aud: 'hub-operacoes', exp: Math.floor(Date.now() / 1000) + 60, jti: crypto.randomUUID(), ...over,
  };
  const p = b64u(JSON.stringify(payload));
  return `${p}.${b64u(crypto.createHmac('sha256', secret).update(p).digest())}`;
}
async function sso(t) {
  const res = await fetch(`${baseUrl}/auth/sso`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ticket: t }),
  });
  return { status: res.status, body: await res.json() };
}

before(() => new Promise((resolve) => {
  initDb(() => {
    setTimeout(() => {
      db.run("INSERT OR REPLACE INTO colaboradores (nome, role, criadoEm) VALUES ('Bruno', 'owner', 'x')", [], () => {
        db.run("INSERT OR REPLACE INTO colaboradores (nome, role, criadoEm) VALUES ('Vitória', 'consultora', 'x')", [], () => {
          const app = express();
          app.use(express.json());
          app.use('/api', authRouter);
          server = http.createServer(app);
          server.listen(0, '127.0.0.1', () => {
            baseUrl = `http://127.0.0.1:${server.address().port}/api`;
            resolve();
          });
        });
      });
    }, 500);
  });
}));

after(() => new Promise((resolve) => {
  db.run("DELETE FROM colaboradores WHERE nome IN ('Bruno','Vitória') AND criadoEm = 'x'", [], () => {
    db.run("DELETE FROM sso_tickets_usados", [], () => (server ? server.close(() => resolve()) : resolve()));
  });
}));

test('ticket válido de owner entra uma vez só', async () => {
  const t = ticket();
  const a = await sso(t);
  assert.equal(a.status, 200);
  assert.equal(a.body.usuario, 'Bruno');
  const b = await sso(t);
  assert.equal(b.status, 401);
});

test('assinatura errada, expirado, outro aud e não-owner são recusados', async () => {
  assert.equal((await sso(ticket({}, 'outro-segredo'))).status, 401);
  assert.equal((await sso(ticket({ exp: Math.floor(Date.now() / 1000) - 5 }))).status, 401);
  assert.equal((await sso(ticket({ aud: 'outro' }))).status, 401);
  assert.equal((await sso(ticket({ u: 'Vitória' }))).status, 403);
  assert.equal((await sso('lixo')).status, 400);
});
