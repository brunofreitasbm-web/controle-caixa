// Travas da auditoria de segurança (onda 1): o que NÃO pode voltar a acontecer.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const http = require('http');

process.env.DATABASE_URL = '';
delete process.env.CACAU_EXIGIR_SESSAO;
const { initDb, db } = require('../config/database');
const authRouter = require('../routes/auth');
const caixaRouter = require('../routes/caixa');
const retiradasRouter = require('../routes/retiradas');

let server;
let baseUrl;
let vapidOriginal;
const run = (sql, params = []) => new Promise((resolve, reject) => db.run(sql, params, (e) => (e ? reject(e) : resolve())));
const get = (sql, params = []) => new Promise((resolve, reject) => db.get(sql, params, (e, r) => (e ? reject(e) : resolve(r))));

async function api(method, path, body) {
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

before(() => new Promise((resolve) => {
  initDb(() => {
    setTimeout(async () => {
      await run("INSERT OR REPLACE INTO colaboradores (nome, role, criadoEm) VALUES ('SegOwner', 'owner', 'x')");
      vapidOriginal = await get("SELECT valor FROM configuracoes WHERE chave = 'vapid_keys'");
      await run("INSERT INTO configuracoes (chave, valor) VALUES ('vapid_keys', '{\"publicKey\":\"pub\",\"privateKey\":\"SEGREDO\"}') ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor");
      await run("INSERT INTO configuracoes (chave, valor) VALUES ('seg_teste_publica', 'ok') ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor");
      const app = express();
      app.use(express.json());
      app.use('/api', authRouter);
      app.use('/api', caixaRouter);
      app.use('/api', retiradasRouter);
      server = http.createServer(app);
      server.listen(0, '127.0.0.1', async () => {
        baseUrl = `http://127.0.0.1:${server.address().port}/api`;
        await api('POST', '/pins', { usuario: 'SegOwner', pin: '4321' });
        resolve();
      });
    }, 300);
  });
}));

after(async () => {
  await run("DELETE FROM colaboradores WHERE nome = 'SegOwner'");
  await run("DELETE FROM pins WHERE usuario = 'SegOwner'");
  await run("DELETE FROM configuracoes WHERE chave = 'seg_teste_publica'");
  // Devolve o par VAPID que o banco local tinha antes do teste.
  if (vapidOriginal) await run("UPDATE configuracoes SET valor = ? WHERE chave = 'vapid_keys'", [vapidOriginal.valor]);
  else await run("DELETE FROM configuracoes WHERE chave = 'vapid_keys'");
  await run("DELETE FROM registros WHERE id = 'seg-onda1-reg'");
  server.close();
});

test('GET /config não devolve a chave privada VAPID nem outras chaves internas', async () => {
  const r = await api('GET', '/config');
  assert.equal(r.status, 200);
  assert.equal(r.body.seg_teste_publica, 'ok');
  assert.equal('vapid_keys' in r.body, false);
  assert.equal('schema_version' in r.body, false);
  assert.equal(JSON.stringify(r.body).includes('SEGREDO'), false);
});

test('POST /config recusa sobrescrever chaves internas e segue aceitando as demais', async () => {
  assert.equal((await api('POST', '/config', { chave: 'vapid_keys', valor: '{}' })).status, 403);
  assert.equal((await api('POST', '/config', { chave: 'schema_version', valor: '0' })).status, 403);
  assert.equal((await api('POST', '/config', { chave: 'seg_teste_publica', valor: 'ok' })).status, 200);
  const row = await get("SELECT valor FROM configuracoes WHERE chave = 'vapid_keys'");
  assert.equal(row.valor.includes('SEGREDO'), true);
});

test('PUT /registros/:id não apaga logicamente um registro (deletadoEm é ignorado)', async () => {
  await run(
    "INSERT OR REPLACE INTO registros (id, consultor, loja, tipoOperacao, dataOperacao, fundoCaixa, status, criadoEm) VALUES ('seg-onda1-reg', 'X', 'Marambaia', 'abertura', '2026-01-01', 0, 'pendente', '2026-01-01')"
  );
  const r = await api('PUT', '/registros/seg-onda1-reg', { deletadoEm: '2026-01-02T00:00:00Z', observacoes: 'edição legítima' });
  assert.equal(r.status, 200);
  const row = await get("SELECT * FROM registros WHERE id = 'seg-onda1-reg'");
  assert.equal(row.observacoes, 'edição legítima');
  assert.equal(row.deletadoEm ?? row.deletadoem ?? null, null);
  // Só deletadoEm no corpo = nada a atualizar.
  assert.equal((await api('PUT', '/registros/seg-onda1-reg', { deletadoEm: 'x' })).status, 400);
});

test('PIN de autorização de retirada bloqueia após 5 erros seguidos', async () => {
  const tentar = (pin) => api('POST', '/solicitacoes-retirada/qualquer/autorizar', { actorUsuario: 'SegOwner', pin });
  for (let i = 0; i < 5; i++) assert.equal((await tentar('0000')).status, 401);
  assert.equal((await tentar('0000')).status, 429);
  // Bloqueado mesmo com o PIN certo: é isso que impede a força bruta de 10 mil combinações.
  assert.equal((await tentar('4321')).status, 429);
});
