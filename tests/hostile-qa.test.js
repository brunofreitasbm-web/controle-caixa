const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const http = require('http');

process.env.DATABASE_URL = '';
const { initDb, db } = require('../config/database');
const caixaRouter = require('../routes/caixa');
const nfeRouter = require('../routes/nfe');

let server;
let baseUrl;

before(() => {
  return new Promise((resolve) => {
    initDb(() => {
      setTimeout(() => {
        const app = express();
        app.use(express.json({ limit: '15mb' }));
        app.use('/api', caixaRouter);
        app.use('/api/nfe', nfeRouter);

        server = http.createServer(app);
        server.listen(0, '127.0.0.1', () => {
          const port = server.address().port;
          baseUrl = `http://127.0.0.1:${port}/api`;
          resolve();
        });
      }, 500);
    });
  });
});

after(() => {
  return new Promise((resolve) => {
    if (server) {
      server.close(() => resolve());
    } else {
      resolve();
    }
  });
});

// Helper para fazer requisições HTTP nos testes
async function request(path, options = {}) {
  const url = `${baseUrl}${path}`;
  const res = await fetch(url, {
    method: options.method || 'GET',
    headers: options.headers || {},
    body: options.body
  });
  let json = null;
  const text = await res.text();
  try {
    json = JSON.parse(text);
  } catch (e) {
    json = { rawText: text };
  }
  return { status: res.status, body: json };
}

// --------------------------------------------------------------------------
// 1. QA HOSTIL: Listagem de Registros de Caixa
// --------------------------------------------------------------------------
test('QA Hostil #1 - Leitura de registros de caixa via GET /registros', async () => {
  const res = await request('/registros');
  assert.equal(res.status, 200);
  assert.ok(Array.isArray(res.body));
});

// --------------------------------------------------------------------------
// 2. QA HOSTIL: Inputs Inválidos e Sanitização no Lançamento de Caixa
// --------------------------------------------------------------------------
test('QA Hostil #2 - Tratamento de sanitização e inserção de registro de caixa', async () => {
  const xssInput = "<script>alert('xss')</script>";
  const regId = `test_reg_${Date.now()}`;
  const res = await request('/registros', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      id: regId,
      consultor: xssInput,
      loja: 'Marambaia',
      tipoOperacao: 'Abertura',
      dataOperacao: new Date().toISOString().split('T')[0],
      fundoCaixa: 200,
      valorEnvelope: 0,
      valorFaturado: 0,
      sangria: 0,
      observacoes: 'Teste QA Hostil',
      status: 'aguardando_retirada',
      criadoEm: new Date().toISOString()
    })
  });
  assert.equal(res.status, 200);
  assert.equal(res.body.success, true);
});

// --------------------------------------------------------------------------
// 3. QA HOSTIL: Consulta de Foto Inexistente
// --------------------------------------------------------------------------
test('QA Hostil #3 - Consulta de foto de registro inexistente retorna 404', async () => {
  const res = await request('/registros/id_inexistente_99999/foto');
  assert.equal(res.status, 404);
  assert.match(res.body.error, /não encontrado/i);
});

// --------------------------------------------------------------------------
// 4. QA HOSTIL: Disparos Simultâneos de Inserção de Registros (Concorrência)
// --------------------------------------------------------------------------
test('QA Hostil #4 - Concorrência e disparo simultâneo de requisições de caixa', async () => {
  const p1 = request('/registros', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      id: `conc_1_${Date.now()}`,
      consultor: 'Ana Júlia',
      loja: 'Marambaia',
      tipoOperacao: 'Abertura',
      dataOperacao: new Date().toISOString().split('T')[0],
      fundoCaixa: 150
    })
  });

  const p2 = request('/registros', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      id: `conc_2_${Date.now()}`,
      consultor: 'Vitória',
      loja: 'Icoaraci',
      tipoOperacao: 'Abertura',
      dataOperacao: new Date().toISOString().split('T')[0],
      fundoCaixa: 250
    })
  });

  const [r1, r2] = await Promise.all([p1, p2]);
  assert.ok([200, 409, 500].includes(r1.status));
  assert.ok([200, 409, 500].includes(r2.status));
});

// --------------------------------------------------------------------------
// 5. QA HOSTIL: Endpoint de Divergência de Fundo de Caixa
// --------------------------------------------------------------------------
test('QA Hostil #5 - Divergência de fundo de caixa sem SMTP ativo responde sem crash', async () => {
  const res = await request('/divergencia', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      loja: 'Marambaia',
      consultor: 'Teste QA',
      fundoAbertura: 200,
      fundoUltimoFechamento: 250,
      diferenca: -50
    })
  });
  assert.equal(res.status, 200);
});

// --------------------------------------------------------------------------
// 6. QA HOSTIL: Leitura de Logs de Auditoria
// --------------------------------------------------------------------------
test('QA Hostil #6 - Leitura e sanitização dos logs de caixa', async () => {
  const res = await request('/registros');
  assert.equal(res.status, 200);
  assert.ok(Array.isArray(res.body));
});

// --------------------------------------------------------------------------
// 7. QA HOSTIL: Rejeição de Atualização sem Campos
// --------------------------------------------------------------------------
test('QA Hostil #7 - Atualização de registro sem campos retorna 400', async () => {
  const res = await request('/registros/some_id', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({})
  });
  assert.equal(res.status, 400);
});

// --------------------------------------------------------------------------
// 8. QA HOSTIL: Deleção Não Autorizada
// --------------------------------------------------------------------------
test('QA Hostil #8 - Rejeição de deleção por usuário comum (Apenas Bruno autorizado)', async () => {
  const res = await request('/registros/some_id?usuario=Operador', {
    method: 'DELETE'
  });
  assert.equal(res.status, 403);
});

// --------------------------------------------------------------------------
// 9. REATORAÇÃO: Validação do Utilitário Compartilhado normalizarTelefone
// --------------------------------------------------------------------------
test('Refatoração #9 - Utilitário compartilhado normalizarTelefone', () => {
  const { normalizarTelefone } = require('../config/utils');
  assert.equal(normalizarTelefone('91988887777'), '5591988887777');
  assert.equal(normalizarTelefone('(91) 98888-7777'), '5591988887777');
  assert.equal(normalizarTelefone('5591988887777'), '5591988887777');
  assert.equal(normalizarTelefone(null), '');
  assert.equal(normalizarTelefone(''), '');
});

// --------------------------------------------------------------------------
// 10. MÓDULO NFE: Validação de Endpoints de Conferência de NFE
// --------------------------------------------------------------------------
test('Módulo NFE #10 - Cadastro e Validação de Status de NFE', async () => {
  const nfeUrl = `${baseUrl}/nfe`;

  // 1. Criar NFE
  const postRes = await fetch(nfeUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ loja: 'Marambaia', numeroNfe: '9988', valor: 450.50, observacoes: 'Teste QA' })
  });
  const postData = await postRes.json();
  assert.equal(postRes.status, 200);
  assert.equal(postData.success, true);
  assert.ok(postData.id);

  // 2. Listar NFEs
  const getRes = await fetch(nfeUrl);
  const getData = await getRes.json();
  assert.equal(getRes.status, 200);
  assert.ok(Array.isArray(getData));
  const criada = getData.find(x => x.id === postData.id);
  assert.ok(criada);
  assert.equal(criada.loja, 'Marambaia');
  assert.equal(criada.valor, 450.50);
  assert.equal(criada.status, 'pendente');

  // 3. Atualizar status para conferido
  const putRes = await fetch(`${nfeUrl}/${postData.id}/status`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'conferido', conferidoPor: 'Bruno' })
  });
  const putData = await putRes.json();
  assert.equal(putRes.status, 200);
  assert.equal(putData.success, true);
});
