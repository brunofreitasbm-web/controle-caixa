const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const http = require('http');

process.env.DATABASE_URL = '';
delete process.env.CACAU_EXIGIR_SESSAO;
const { initDb, db } = require('../config/database');
const authRouter = require('../routes/auth');
const pontoRouter = require('../routes/ponto');
const pontoBiometriaRouter = require('../routes/ponto-biometria');

let server;
let baseUrl;
const NOMES = ['UFOwner', 'UFCons', 'UFOutro'];

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
const entrar = async (usuario, pin) => (await api('POST', '/auth/verify', { usuario, pin })).body.token;

let tokOwner;
let tokCons;
let tokOutro;

before(() => new Promise((resolve) => {
  initDb(() => {
    setTimeout(async () => {
      await run("INSERT OR REPLACE INTO colaboradores (nome, role, criadoEm) VALUES ('UFOwner', 'owner', 'x')");
      await run("INSERT OR REPLACE INTO colaboradores (nome, role, cpf, telefone, unidade, criadoEm) VALUES ('UFCons', 'consultora', '123.456.789-00', '91999990000', '9175', 'x')");
      await run("INSERT OR REPLACE INTO colaboradores (nome, role, criadoEm) VALUES ('UFOutro', 'consultora', 'x')");
      const app = express();
      app.use(express.json());
      app.use('/api', authRouter);
      app.use('/api/ponto', pontoRouter);
      app.use('/api/ponto', pontoBiometriaRouter);
      server = http.createServer(app);
      server.listen(0, '127.0.0.1', async () => {
        baseUrl = `http://127.0.0.1:${server.address().port}/api`;
        for (const [u, p] of [['UFOwner', '1111'], ['UFCons', '2222'], ['UFOutro', '3333']]) {
          assert.equal((await api('POST', '/pins', { usuario: u, pin: p })).status, 200);
        }
        tokOwner = await entrar('UFOwner', '1111');
        tokCons = await entrar('UFCons', '2222');
        tokOutro = await entrar('UFOutro', '3333');
        await run("INSERT OR REPLACE INTO ponto_biometria (usuario, embedding, criadoEm, atualizadoEm) VALUES ('UFCons', '[0.1,0.2]', 'x', 'x')");
        await run("UPDATE colaboradores SET hasBiometricEnrolled = 1 WHERE nome = 'UFCons'");
        resolve();
      });
    }, 500);
  });
}));

after(async () => {
  const lista = NOMES.map((n) => `'${n}'`).join(',');
  await run(`DELETE FROM pins WHERE usuario IN (${lista})`);
  await run(`DELETE FROM ponto_biometria WHERE usuario IN (${lista})`);
  await run(`DELETE FROM ponto_registros WHERE usuario IN (${lista})`);
  await run(`DELETE FROM ponto_ajustes WHERE usuario IN (${lista})`);
  await run(`DELETE FROM colaboradores WHERE nome IN (${lista})`);
  await run(`DELETE FROM sessoes_auth WHERE usuario IN (${lista})`);
  delete process.env.CACAU_EXIGIR_SESSAO;
  await new Promise((r) => (server ? server.close(() => r()) : r()));
});

test('DELETE /colaboradores só desativa: exige owner e mantém PIN, biometria e a pessoa', async () => {
  // Sem sessão e sem owner informado: recusa. Com sessão de não-owner: recusa.
  assert.equal((await api('DELETE', '/colaboradores/UFCons')).status, 400);
  assert.equal((await api('DELETE', '/colaboradores/UFCons', undefined, tokOutro)).status, 403);
  assert.equal((await get("SELECT ativo FROM colaboradores WHERE nome = 'UFCons'")).ativo === 0, false);

  const pinAntes = (await get("SELECT pin FROM pins WHERE usuario = 'UFCons'")).pin;
  const r = await api('DELETE', '/colaboradores/UFCons', undefined, tokOwner);
  assert.equal(r.status, 200);
  const colab = await get("SELECT nome, ativo, hasBiometricEnrolled FROM colaboradores WHERE nome = 'UFCons'");
  assert.equal(colab.ativo, 0, 'desativado');
  assert.equal(colab.hasBiometricEnrolled, 1, 'biometria intacta');
  assert.equal((await get("SELECT pin FROM pins WHERE usuario = 'UFCons'")).pin, pinAntes, 'PIN intacto');
  assert.ok(await get("SELECT embedding FROM ponto_biometria WHERE usuario = 'UFCons'"), 'vetor facial intacto');
  assert.equal((await api('POST', '/auth/verify', { usuario: 'UFCons', pin: '2222' })).body.inativo, true);

  // Reativar devolve o acesso com o mesmo PIN.
  assert.equal((await api('POST', '/colaboradores/UFCons/ativo', { ativo: true }, tokOwner)).status, 200);
  assert.equal((await api('POST', '/auth/verify', { usuario: 'UFCons', pin: '2222' })).body.valid, true);
  tokCons = await entrar('UFCons', '2222');
});

test('owner não é desativado pelas rotas de colaborador', async () => {
  const r = await api('DELETE', '/colaboradores/UFOwner', undefined, tokOwner);
  assert.equal(r.status, 409);
  assert.notEqual((await get("SELECT ativo FROM colaboradores WHERE nome = 'UFOwner'")).ativo, 0);
});

test('GET /colaboradores: CPF e telefone só para owner; salvar sem eles não apaga', async () => {
  const publico = (await api('GET', '/colaboradores')).body.find((c) => c.nome === 'UFCons');
  assert.ok(publico && publico.role, 'lista pública mantém nome e papel');
  for (const k of ['cpf', 'telefone', 'dataNascimento', 'dataAdmissao']) assert.equal(k in publico, false, k);
  assert.equal('cpf' in (await api('GET', '/colaboradores', undefined, tokOutro)).body.find((c) => c.nome === 'UFCons'), false);
  assert.equal((await api('GET', '/colaboradores', undefined, tokOwner)).body.find((c) => c.nome === 'UFCons').cpf, '123.456.789-00');

  // Importação de DISC manda só { nome, role }: não pode zerar os dados da pessoa.
  assert.equal((await api('POST', '/colaboradores', { nome: 'UFCons', role: 'consultora' }, tokOwner)).status, 200);
  const c = await get("SELECT cpf, telefone, unidade FROM colaboradores WHERE nome = 'UFCons'");
  assert.deepEqual([c.cpf, c.telefone, c.unidade], ['123.456.789-00', '91999990000', '9175']);
});

test('reset de biometria em massa não existe mais', async () => {
  const r = await api('POST', '/colaboradores/reset-biometria-todos', {}, tokOwner);
  assert.equal(r.status, 404);
  assert.ok(await get("SELECT embedding FROM ponto_biometria WHERE usuario = 'UFCons'"), 'vetor facial intacto');
});

test('GET /ponto/biometria/:usuario: só o próprio ou owner; sem sessão cai no modo de transição', async () => {
  assert.equal((await api('GET', '/ponto/biometria/UFCons', undefined, tokOutro)).status, 403);
  const proprio = await api('GET', '/ponto/biometria/UFCons', undefined, tokCons);
  assert.equal(proprio.status, 200);
  assert.deepEqual(proprio.body.embedding, [0.1, 0.2]);
  assert.equal((await api('GET', '/ponto/biometria/UFCons', undefined, tokOwner)).status, 200);

  process.env.CACAU_EXIGIR_SESSAO = '1';
  try {
    assert.equal((await api('GET', '/ponto/biometria/UFCons')).status, 401);
  } finally {
    delete process.env.CACAU_EXIGIR_SESSAO;
  }
});

test('com CACAU_EXIGIR_SESSAO=1, /config, /notificar-gestao e /logs pedem sessão', async () => {
  process.env.CACAU_EXIGIR_SESSAO = '1';
  try {
    assert.equal((await api('POST', '/config', { chave: 'x', valor: 'y' })).status, 401);
    assert.equal((await api('POST', '/notificar-gestao', { destinatarios: [] })).status, 401);
    assert.equal((await api('GET', '/logs?usuario=Bruno')).status, 401);
    // Sessão de não-owner não lê logs fingindo ser Bruno pela URL.
    assert.equal((await api('GET', '/logs?usuario=Bruno', undefined, tokOutro)).status, 403);
    // A lista de quem lê logs (Bruno, Isabella, Alexandra) segue valendo, agora pelo nome da sessão.
    assert.equal((await api('GET', '/logs?usuario=Bruno', undefined, tokOwner)).status, 403);
    assert.equal((await api('POST', '/config', { chave: 'uf_teste', valor: '1' }, tokOutro)).status, 200);
  } finally {
    delete process.env.CACAU_EXIGIR_SESSAO;
    await run("DELETE FROM configuracoes WHERE chave = 'uf_teste'");
  }
});

test('colaborador desativado não registra ponto, ajuste nem biometria; os demais seguem', async () => {
  await api('DELETE', '/colaboradores/UFCons', undefined, tokOwner);
  const agora = new Date().toISOString();
  const reg = (id, usuario) => ({ id, usuario, timestamp: agora, tipo: 'ENTRADA', gps: '0,0', accuracy: 10, photo: null, hash: 'h' });

  const soDesligado = await api('POST', '/ponto/sync', { records: [reg('uf_r1', 'UFCons')] });
  assert.equal(soDesligado.status, 403);
  assert.equal(await get("SELECT id FROM ponto_registros WHERE id = 'uf_r1'"), undefined);

  const misto = await api('POST', '/ponto/sync', { records: [reg('uf_r2', 'UFCons'), reg('uf_r3', 'UFOutro')] });
  assert.equal(misto.status, 200);
  assert.deepEqual(misto.body.bloqueados, ['uf_r2']);
  assert.equal(misto.body.count, 1);
  assert.equal(await get("SELECT id FROM ponto_registros WHERE id = 'uf_r2'"), undefined);
  assert.ok(await get("SELECT id FROM ponto_registros WHERE id = 'uf_r3'"));

  assert.equal((await api('POST', '/ponto/ajuste', { id: 'uf_a1', usuario: 'UFCons', data: '2026-10-26', tipo: 'ENTRADA', motivo: 'x' })).status, 403);
  assert.equal((await api('POST', '/ponto/biometria', { usuario: 'UFCons', embedding: [0.1], detectionScore: 0.99 })).status, 403);

  // Nada foi apagado e reativar libera de novo.
  assert.ok(await get("SELECT embedding FROM ponto_biometria WHERE usuario = 'UFCons'"));
  await api('POST', '/colaboradores/UFCons/ativo', { ativo: true }, tokOwner);
  assert.equal((await api('POST', '/ponto/sync', { records: [reg('uf_r4', 'UFCons')] })).status, 200);
});
