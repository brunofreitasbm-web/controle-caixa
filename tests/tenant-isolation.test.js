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
const caixaRoutes = require('../routes/caixa');
const retiradasRoutes = require('../routes/retiradas');
const tenantRoutes = require('../routes/tenant');
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
  // por uso manual local — limpa as chaves/ids fixos que este arquivo usa,
  // para uma segunda rodada (sem apagar o banco) não colidir com PK/UNIQUE
  // de uma rodada anterior nem herdar um HIT de cache indevido.
  await dbRunAsync('DELETE FROM ia_cache WHERE chave IN (?, ?)', [
    `${TENANT_ZERO_ID}:briefing:hoje`,
    `${ORG_DEMO_ID}:briefing:hoje`
  ]);
  await dbRunAsync('DELETE FROM colaboradores WHERE nome IN (?, ?)', ['SoDoTenantZero', 'SoDoTenantDemo']);
  await dbRunAsync('DELETE FROM solicitacoes_retirada WHERE id = ?', ['sol-zero-1']);
  await dbRunAsync('DELETE FROM registros WHERE id IN (?, ?, ?, ?)', ['reg-zero-1', 'reg-demo-1', 'reg-zero-2', 'reg-zero-3']);
  await dbRunAsync('DELETE FROM registros_fa WHERE id IN (?, ?)', ['reg-zero-1', 'reg-demo-1']);

  const app = express();
  app.use(express.json());
  app.use('/api', resolveTenantSession);
  app.use('/api', authRoutes);
  app.use('/api', caixaRoutes);
  app.use('/api', retiradasRoutes);
  app.use('/api/tenant', tenantRoutes);

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
  // Teste de Upsert (ON CONFLICT): atualiza o colaborador existente sem erro de constraint
  const resUpsert = await request('/colaboradores', {
    method: 'POST',
    headers: { Authorization: `Bearer ${tokenZero}` },
    body: JSON.stringify({ nome: 'SoDoTenantZero', role: 'consultora_dashboard', email: 'atualizado@teste.com' })
  });
  assert.strictEqual(resUpsert.status, 200, 'POST /colaboradores upsert deve retornar 200 OK');
  assert.strictEqual(resUpsert.body.success, true);
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

test('isolamento: registros de caixa (Cacau Show) não vazam entre organizações', async () => {
  const tokenZero = await login(TENANT_ZERO_ID);
  const tokenDemo = await login(ORG_DEMO_ID);

  const regZero = { id: 'reg-zero-1', consultor: 'X', loja: 'Marambaia', tipoOperacao: 'Abertura', dataOperacao: '2026-01-01', fundoCaixa: 100, criadoEm: new Date().toISOString() };
  const regDemo = { id: 'reg-demo-1', consultor: 'Y', loja: 'Marambaia', tipoOperacao: 'Abertura', dataOperacao: '2026-01-01', fundoCaixa: 200, criadoEm: new Date().toISOString() };

  await request('/registros', { method: 'POST', headers: { Authorization: `Bearer ${tokenZero}` }, body: JSON.stringify(regZero) });
  await request('/registros', { method: 'POST', headers: { Authorization: `Bearer ${tokenDemo}` }, body: JSON.stringify(regDemo) });

  const listaZero = await request('/registros', { headers: { Authorization: `Bearer ${tokenZero}` } });
  const idsZero = listaZero.body.map(r => r.id);
  assert.ok(idsZero.includes('reg-zero-1'), 'tenant zero não vê o próprio registro de caixa');
  assert.ok(!idsZero.includes('reg-demo-1'), 'VAZAMENTO: tenant zero vê registro de caixa da org demo');

  const listaDemo = await request('/registros', { headers: { Authorization: `Bearer ${tokenDemo}` } });
  const idsDemo = listaDemo.body.map(r => r.id);
  assert.ok(idsDemo.includes('reg-demo-1'), 'org demo não vê o próprio registro de caixa');
  assert.ok(!idsDemo.includes('reg-zero-1'), 'VAZAMENTO: org demo vê registro de caixa do tenant zero');

  // Tentativa direta: usar o token da org demo pra alterar um registro cujo
  // id pertence à org zero (id adivinhado/conhecido) não pode ter efeito.
  await request('/registros/reg-zero-1', {
    method: 'PUT',
    headers: { Authorization: `Bearer ${tokenDemo}` },
    body: JSON.stringify({ observacoes: 'tentativa de escrita cross-tenant' })
  });
  const registroZeroAposTentativa = (await request('/registros', { headers: { Authorization: `Bearer ${tokenZero}` } }))
    .body.find(r => r.id === 'reg-zero-1');
  assert.notEqual(
    registroZeroAposTentativa.observacoes, 'tentativa de escrita cross-tenant',
    'VAZAMENTO GRAVE: token da org demo conseguiu alterar registro de caixa da org zero'
  );
});

test('isolamento: autorizar retirada com token da outra organização não encontra nem move dinheiro', async () => {
  const tokenZero = await login(TENANT_ZERO_ID);
  const tokenDemo = await login(ORG_DEMO_ID);

  // reg-zero-1 foi criado no teste anterior, na org zero.
  const criacao = await request('/solicitacoes-retirada', {
    method: 'POST',
    headers: { Authorization: `Bearer ${tokenZero}` },
    body: JSON.stringify({
      id: 'sol-zero-1', tipo: 'cacau', registroIds: ['reg-zero-1'], loja: 'Marambaia',
      valorTotal: 100, responsavel: 'Fulano', dataRetirada: '2026-01-02', actorUsuario: 'TesteIsolamento'
    })
  });
  assert.equal(criacao.status, 200);

  // Token da org demo (também "owner" lá, passa em requireOwner) tentando
  // autorizar uma solicitação que só existe na org zero.
  const tentativaCross = await request('/solicitacoes-retirada/sol-zero-1/autorizar', {
    method: 'POST',
    headers: { Authorization: `Bearer ${tokenDemo}` },
    body: JSON.stringify({ actorUsuario: 'TesteIsolamento', pin: '9999' })
  });
  assert.equal(tentativaCross.status, 404, 'VAZAMENTO GRAVE: token de outra organização encontrou/autorizou uma retirada que não é dela');

  const registroAindaAguardando = (await request('/registros', { headers: { Authorization: `Bearer ${tokenZero}` } }))
    .body.find(r => r.id === 'reg-zero-1');
  assert.notEqual(registroAindaAguardando.status, 'retirado', 'VAZAMENTO GRAVE: autorização cross-tenant moveu o registro para retirado');

  // Com o token certo (mesma organização), a autorização funciona normalmente.
  const autorizacaoCorreta = await request('/solicitacoes-retirada/sol-zero-1/autorizar', {
    method: 'POST',
    headers: { Authorization: `Bearer ${tokenZero}` },
    body: JSON.stringify({ actorUsuario: 'TesteIsolamento', pin: '9999' })
  });
  assert.equal(autorizacaoCorreta.status, 200, JSON.stringify(autorizacaoCorreta.body));
  assert.equal(autorizacaoCorreta.body.success, true);
});

test('bootstrap: só devolve unidades do negócio cacau-show, nunca Faça Amigos', async () => {
  const res = await request('/tenant/bootstrap');
  assert.equal(res.status, 200);
  const nomes = res.body.unidades.map(u => u.nome);
  assert.ok(nomes.includes('Marambaia'), 'bootstrap não devolveu as unidades reais do Cacau Show');
  assert.ok(
    !nomes.some(n => ['Grão Pará', 'ParqueShopping', 'Parque Circuito'].includes(n)),
    'bootstrap vazou unidade do Faça Amigos — deveria ficar de fora (módulo em descontinuação para o SaaS)'
  );
  assert.equal(res.body.organizationId, TENANT_ZERO_ID);
  assert.ok(res.body.colaboradoresLogin.some(c => c.nome === 'Bruno'), 'bootstrap não devolveu a lista de colaboradores para o seletor de login');
});

test('capacidade: excluir registro de caixa é decidido por capacidades no banco, não por nome hardcoded', async () => {
  const criarRegistro = (id) => request('/registros', {
    method: 'POST',
    body: JSON.stringify({ id, consultor: 'X', loja: 'Marambaia', tipoOperacao: 'Abertura', dataOperacao: '2026-01-03', fundoCaixa: 50, criadoEm: new Date().toISOString() })
  });

  // Sem sessão (fluxo atual do frontend, antes da Fase 2 do cliente): a
  // capacidade ainda é conferida no banco pelo usuario da query — não é
  // mais um simples "usuario !== 'Bruno'" no código.
  await criarRegistro('reg-zero-2');
  const exclusaoComCapacidade = await request('/registros/reg-zero-2?usuario=Bruno', { method: 'DELETE' });
  assert.equal(exclusaoComCapacidade.status, 200, 'Bruno tem excluir_registro e deveria conseguir excluir');

  await criarRegistro('reg-zero-3');
  const exclusaoSemCapacidade = await request('/registros/reg-zero-3?usuario=Alexandra', { method: 'DELETE' });
  assert.equal(exclusaoSemCapacidade.status, 403, 'Alexandra não tem excluir_registro e não deveria conseguir excluir');

  // Com sessão real, a capacidade vem do TOKEN (identidade autenticada), não
  // do parâmetro usuario da query — spoofar ?usuario=Bruno estando logado
  // como outra pessoa não deve funcionar.
  const tokenZero = await login(TENANT_ZERO_ID); // TesteIsolamento, sem excluir_registro
  const tentativaSpoof = await request('/registros/reg-zero-2?usuario=Bruno', {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${tokenZero}` }
  });
  assert.equal(tentativaSpoof.status, 403, 'VAZAMENTO: com sessão real, ?usuario=Bruno na query conseguiu contornar a capacidade da própria sessão');
});

test('isolamento: CRUD de unidades é owner-only e escopado por organização', async () => {
  const tokenZero = await login(TENANT_ZERO_ID);
  const tokenDemo = await login(ORG_DEMO_ID);

  const criacao = await request('/tenant/unidades', {
    method: 'POST',
    headers: { Authorization: `Bearer ${tokenZero}` },
    body: JSON.stringify({ negocioChave: 'cacau-show', nome: 'Unidade Teste Isolamento' })
  });
  assert.equal(criacao.status, 201, JSON.stringify(criacao.body));
  const idCriado = criacao.body.id;

  const listaDemo = await request('/tenant/unidades', { headers: { Authorization: `Bearer ${tokenDemo}` } });
  assert.ok(
    !listaDemo.body.some(u => u.id === idCriado),
    'VAZAMENTO: org demo vê uma unidade criada pela org zero'
  );

  const editarCross = await request(`/tenant/unidades/${idCriado}`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${tokenDemo}` },
    body: JSON.stringify({ nome: 'Sequestrada pela org demo' })
  });
  assert.equal(editarCross.status, 200); // UPDATE roda mas o WHERE organizationId não casa nenhuma linha

  const listaZero = await request('/tenant/unidades', { headers: { Authorization: `Bearer ${tokenZero}` } });
  const unidadeAposTentativa = listaZero.body.find(u => u.id === idCriado);
  assert.equal(
    unidadeAposTentativa.nome, 'Unidade Teste Isolamento',
    'VAZAMENTO GRAVE: token da org demo conseguiu editar unidade da org zero'
  );

  await dbRunAsync('DELETE FROM unidades WHERE id = ?', [idCriado]);
});

test('isolamento: persona de IA (iaSistemaBriefing) é por organização', async () => {
  const tokenZero = await login(TENANT_ZERO_ID);
  const tokenDemo = await login(ORG_DEMO_ID);

  await request('/tenant/ia-config', {
    method: 'PUT',
    headers: { Authorization: `Bearer ${tokenZero}` },
    body: JSON.stringify({ chave: 'iaSistemaBriefing', valor: 'Persona exclusiva da org zero' })
  });

  const configDemo = await request('/tenant/ia-config', { headers: { Authorization: `Bearer ${tokenDemo}` } });
  assert.notEqual(
    configDemo.body.iaSistemaBriefing, 'Persona exclusiva da org zero',
    'VAZAMENTO: org demo herdou a persona de IA configurada pela org zero'
  );

  await dbRunAsync(`DELETE FROM configuracoes WHERE chave = 'iaSistemaBriefing' AND organizationId = ?`, [TENANT_ZERO_ID]);
});
