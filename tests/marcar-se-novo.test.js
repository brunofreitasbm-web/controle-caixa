const { test, before } = require('node:test');
const assert = require('node:assert/strict');

process.env.DATABASE_URL = '';

const { initDb, db } = require('../config/database');
const { marcarSeNovo } = require('../services/ia');

before(() => new Promise((resolve) => initDb(() => setTimeout(resolve, 300))));

const unica = (prefixo) => `teste:${prefixo}:${Date.now()}:${Math.random().toString(36).slice(2)}`;

test('marcarSeNovo: chamadas simultâneas — só uma ganha', async () => {
  const chave = unica('concorrente');
  const resultados = await Promise.all(Array.from({ length: 10 }, () => marcarSeNovo(chave, 60)));
  assert.equal(resultados.filter(Boolean).length, 1);
});

test('marcarSeNovo: segunda chamada dentro do TTL é recusada', async () => {
  const chave = unica('ttl');
  assert.equal(await marcarSeNovo(chave, 60), true);
  assert.equal(await marcarSeNovo(chave, 60), false);
});

test('marcarSeNovo: chave expirada pode ser assumida de novo', async () => {
  const chave = unica('expirada');
  assert.equal(await marcarSeNovo(chave, 60), true);
  await new Promise((resolve, reject) =>
    db.run('UPDATE ia_cache SET expiraEm = ? WHERE chave = ?', [Date.now() - 1000, chave], (e) => (e ? reject(e) : resolve()))
  );
  assert.equal(await marcarSeNovo(chave, 60), true);
  assert.equal(await marcarSeNovo(chave, 60), false);
});

test('marcarSeNovo: chaves diferentes não interferem', async () => {
  assert.equal(await marcarSeNovo(unica('a'), 60), true);
  assert.equal(await marcarSeNovo(unica('b'), 60), true);
});
