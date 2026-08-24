// ==========================================================================
// PROVA DE ISOLAMENTO MULTI-TENANT (Fase 1 do plano de arquitetura SaaS)
// ==========================================================================
// Cria uma segunda organização sintética ("org-demo-teste") só para este
// teste, ao lado da organização real do dono ("org-matriz-belem", seed em
// config/database.js). Prova que, usando o token de sessão de cada uma,
// nenhuma nunca lê nem escreve dado da outra — nos três pontos já
// rewireados nesta fase: identidade (colaboradores/pins), cache de IA e
// broadcast em tempo real (SSE).
//
// Não cobre ainda as rotas de negócio (caixa, financeiro, ponto, metas...)
// — essas tabelas já têm a coluna organizationId, mas as rotas que as
// servem ainda não foram reescritas para filtrar por ela (ver plano de
// arquitetura, itens deferidos da Fase 1).
// ==========================================================================

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const http = require('http');
const bcrypt = require('bcryptjs');

process.env.DATABASE_URL = '';
const { initDb, db, dbRunAsync, TENANT_ZERO_ID } = require('../config/database');
const resolveTenantSession = require('../routes/middleware/resolveTenantSession');
const authRoutes = require('../routes/auth');
const { comCache } = require('../services/ia');
const { addClient, publish } = require('../config/realtime');

const ORG_DEMO_ID = 'org-demo-teste';

let server;
let baseUrl;

before(async () => {
  await new Promise(resolve => initDb(resolve));

  await dbRunAsync(
    `INSERT INTO organizations (id, slug, nome, status, plano, criadoEm) VALUES (?, ?, ?, 'ativo', 'teste', ?)
     ON CONFLICT(id) DO NOTHING`,
    [ORG_DEMO_ID, 'demo-teste', 'Organização Demo (teste)', new Date().toISOString()]
  );

  // Um colaborador com o MESMO NOME em cada organização — o pior caso para
  // um schema que ainda dependesse de unicidade global (ver plano, Seção 1).
  for (const org of [TENANT_ZERO_ID, ORG_DEMO_ID]) {
    await dbRunAsync(
      `INSERT INTO colaboradores (nome, role, criadoEm, organizationId) VALUES (?, 'owner', ?, ?)
       ON CONFLICT(organizationId, nome) DO NOTHING`,
      ['TesteIsolamento', new Date().toISOString(), org]
    );
    const hash = await bcrypt.hash('9999', 10);
    await dbRunAsync(
      `INSERT INTO pins (usuario, pin, organizationId) VALUES (?, ?, ?)
       ON CONFLICT(organizationId, usuario) DO UPDATE SET pin = excluded.pin`,
      ['TesteIsolamento', hash, org]
    );
  }

  // Roda em cima do mesmo database.db usado por tests/hostile-qa.test.js e
  // por uso manual local — limpa só as chaves de cache que este arquivo usa,
  // para o teste de cache não herdar um HIT válido de uma rodada anterior.
  await dbRunAsync('DELETE FROM ia_cache WHERE chave IN (?, ?)', [
    `${TENANT_ZERO_ID}:briefing:hoje`,
    `${ORG_DEMO_ID}:briefing:hoje`
  ]);

  const app = express();
  app.use(express.json());
  app.use('/api', resolveTenantSession);
  app.use('/api', authRoutes);

  server = http.createServer(app);
  await new Promise(resolve => {
    server.listen(0, '127.0.0.1', () => {
      baseUrl = `http://127.0.0.1:${server.address().port}/api`;
      resolve();
    });
  });
});

after(() => new Promise(resolve => (server ? server.close(resolve) : resolve())));

async function request(path, options = {}) {
  const res = await fetch(`${baseUrl}${path}`, {
    method: options.method || 'GET',
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    body: options.body
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { rawText: text }; }
  return { status: res.status, body: json };
}

async function login(organizationId) {
  const res = await request('/auth/verify', {
    method: 'POST',
    body: JSON.stringify({ usuario: 'TesteIsolamento', pin: '9999', organizationId })
  });
  assert.equal(res.status, 200, `login falhou para ${organizationId}: ${JSON.stringify(res.body)}`);
  assert.equal(res.body.valid, true);
  assert.equal(res.body.organizationId, organizationId, 'sessão emitida para a organização errada');
  return res.body.token;
}

test('login: mesmo nome de usuário em duas organizações não colide', async () => {
  const tokenZero = await login(TENANT_ZERO_ID);
  const tokenDemo = await login(ORG_DEMO_ID);
  assert.notEqual(tokenZero, tokenDemo);
});

test('isolamento: colaboradores de uma organização são invisíveis para a outra', async () => {
  const tokenZero = await login(TENANT_ZERO_ID);
  const tokenDemo = await login(ORG_DEMO_ID);

  // Cadastra um colaborador exclusivo em cada organização, usando o token
  // de sessão de cada uma (não um parâmetro no corpo — é isso que se prova).
  await request('/colaboradores', {
    method: 'POST',
    headers: { Authorization: `Bearer ${tokenZero}` },
    body: JSON.stringify({ nome: 'SoDoTenantZero', role: 'consultora' })
  });
  await request('/colaboradores', {
    method: 'POST',
    headers: { Authorization: `Bearer ${tokenDemo}` },
    body: JSON.stringify({ nome: 'SoDoTenantDemo', role: 'consultora' })
  });

  const listaZero = await request('/colaboradores', { headers: { Authorization: `Bearer ${tokenZero}` } });
  const nomesZero = listaZero.body.map(c => c.nome);
  assert.ok(nomesZero.includes('SoDoTenantZero'), 'tenant zero não vê o próprio colaborador');
  assert.ok(!nomesZero.includes('SoDoTenantDemo'), 'VAZAMENTO: tenant zero vê colaborador da org demo');

  const listaDemo = await request('/colaboradores', { headers: { Authorization: `Bearer ${tokenDemo}` } });
  const nomesDemo = listaDemo.body.map(c => c.nome);
  assert.ok(nomesDemo.includes('SoDoTenantDemo'), 'org demo não vê o próprio colaborador');
  assert.ok(!nomesDemo.includes('SoDoTenantZero'), 'VAZAMENTO: org demo vê colaborador do tenant zero');
});

test('isolamento: excluir colaborador em uma organização não afeta o xará na outra', async () => {
  const tokenZero = await login(TENANT_ZERO_ID);
  const tokenDemo = await login(ORG_DEMO_ID);

  await request('/colaboradores/SoDoTenantZero', { method: 'DELETE', headers: { Authorization: `Bearer ${tokenZero}` } });

  const listaDemo = await request('/colaboradores', { headers: { Authorization: `Bearer ${tokenDemo}` } });
  assert.ok(
    listaDemo.body.map(c => c.nome).includes('SoDoTenantDemo'),
    'VAZAMENTO/REGRESSÃO: excluir na org zero apagou (ou afetou) o registro da org demo'
  );
});

test('isolamento: cache de IA não vaza entre organizações com a mesma chave lógica', async () => {
  let chamadasZero = 0;
  let chamadasDemo = 0;

  const zero1 = await comCache('briefing:hoje', 60, async () => { chamadasZero++; return { texto: 'briefing da matriz' }; }, { organizationId: TENANT_ZERO_ID });
  const demo1 = await comCache('briefing:hoje', 60, async () => { chamadasDemo++; return { texto: 'briefing da demo' }; }, { organizationId: ORG_DEMO_ID });

  assert.equal(zero1.texto, 'briefing da matriz');
  assert.equal(demo1.texto, 'briefing da demo');
  assert.equal(chamadasZero, 1);
  assert.equal(chamadasDemo, 1);

  // Segunda chamada de cada uma: deve vir do cache (produtor não roda de
  // novo) e continuar com o conteúdo certo — não o da outra organização.
  const zero2 = await comCache('briefing:hoje', 60, async () => { chamadasZero++; return { texto: 'NUNCA deveria rodar de novo' }; }, { organizationId: TENANT_ZERO_ID });
  const demo2 = await comCache('briefing:hoje', 60, async () => { chamadasDemo++; return { texto: 'NUNCA deveria rodar de novo' }; }, { organizationId: ORG_DEMO_ID });

  assert.equal(zero2.texto, 'briefing da matriz', 'VAZAMENTO: cache da org zero devolveu conteúdo de outra origem');
  assert.equal(demo2.texto, 'briefing da demo', 'VAZAMENTO: cache da org demo devolveu conteúdo de outra origem');
  assert.equal(chamadasZero, 1, 'produtor rodou de novo em vez de usar o cache — chave física não está estável');
  assert.equal(chamadasDemo, 1, 'produtor rodou de novo em vez de usar o cache — chave física não está estável');
});

test('isolamento: broadcast SSE não entrega evento de uma organização para clientes da outra', async () => {
  const eventosZero = [];
  const eventosDemo = [];

  const resFalsoZero = { write: (texto) => eventosZero.push(texto) };
  const resFalsoDemo = { write: (texto) => eventosDemo.push(texto) };

  addClient(resFalsoZero, { usuario: 'ClienteZero', organizationId: TENANT_ZERO_ID });
  addClient(resFalsoDemo, { usuario: 'ClienteDemo', organizationId: ORG_DEMO_ID });

  publish('registro.criado', { loja: 'Marambaia' }, { organizationId: TENANT_ZERO_ID });

  assert.equal(eventosZero.length, 1, 'cliente da org zero deveria ter recebido o evento da própria org');
  assert.equal(eventosDemo.length, 0, 'VAZAMENTO: cliente da org demo recebeu evento da org zero');
});
