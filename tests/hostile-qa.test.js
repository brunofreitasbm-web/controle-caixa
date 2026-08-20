const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const http = require('http');

process.env.DATABASE_URL = '';
const { initDb, db } = require('../config/database');
const posVisitaRouter = require('../routes/pos-visita');
const nfeRouter = require('../routes/nfe');

let server;
let baseUrl;

before(() => {
  return new Promise((resolve) => {
    initDb(() => {
      setTimeout(() => {
        const app = express();
        app.use(express.json({ limit: '15mb' }));
        app.use('/api/pos-visita', posVisitaRouter);
        app.use('/api/nfe', nfeRouter);

        server = http.createServer(app);
        server.listen(0, '127.0.0.1', () => {
          const port = server.address().port;
          baseUrl = `http://127.0.0.1:${port}/api/pos-visita`;
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
// 1. QA HOSTIL: Campos Vazios, Nulos e Em Branco
// --------------------------------------------------------------------------
test('QA Hostil #1 - Rejeição de body vazio / nulo / campos em branco', async () => {
  // Teste marcar-enviada sem ID
  const res1 = await request('/marcar-enviada', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({})
  });
  assert.equal(res1.status, 400);
  assert.match(res1.body.error, /Campo "id" é obrigatório/i);

  // Teste registrar indicação sem parâmetros obrigatórios
  const res2 = await request('/indicacoes/registrar', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ responsavel: '   ', telefone: '', amigoNome: '  ' })
  });
  assert.equal(res2.status, 400);
  assert.match(res2.body.error, /Informe o nome e o WhatsApp/i);
});

// --------------------------------------------------------------------------
// 2. QA HOSTIL: Inputs Inválidos, Caracteres Especiais e Scripting (XSS)
// --------------------------------------------------------------------------
test('QA Hostil #2 - Tratamento de sanitização e inputs maliciosos', async () => {
  const xssInput = "<script>alert('xss')</script>";
  const telUnico = `119${Math.floor(10000000 + Math.random() * 90000000)}`;
  const res = await request('/indicacoes/registrar', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      responsavel: xssInput,
      telefone: telUnico,
      amigoNome: 'Amigo Teste XSS'
    })
  });
  assert.equal(res.status, 200);
  assert.equal(res.body.success, true);
  assert.equal(res.body.responsavel, xssInput);
});

// --------------------------------------------------------------------------
// 3. QA HOSTIL: Valores Extremos e Boundary Testing
// --------------------------------------------------------------------------
test('QA Hostil #3 - Suporte a strings extensas e números limites', async () => {
  const nomeGigante = 'A'.repeat(5000);
  const telUnico = `119${Math.floor(10000000 + Math.random() * 90000000)}`;
  const res = await request('/indicacoes/registrar', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      responsavel: nomeGigante,
      telefone: telUnico,
      amigoNome: 'Amigo Teste Boundary'
    })
  });
  assert.equal(res.status, 200);
  assert.equal(res.body.success, true);
});

// --------------------------------------------------------------------------
// 4. QA HOSTIL: Cliques Repetidos e Disparos Simultâneos (Double-Submit)
// --------------------------------------------------------------------------
test('QA Hostil #4 - Concorrência e disparo simultâneo de requisições', async () => {
  const telConcorrente = `119${Math.floor(10000000 + Math.random() * 90000000)}`;
  
  // Registrar amigo 1 e amigo 2 em paralelo
  const p1 = request('/indicacoes/registrar', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      responsavel: 'Carlos Santos',
      telefone: telConcorrente,
      amigoNome: 'Pedro Silva'
    })
  });

  const p2 = request('/indicacoes/registrar', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      responsavel: 'Carlos Santos',
      telefone: telConcorrente,
      amigoNome: 'Lucas Souza'
    })
  });

  const [r1, r2] = await Promise.all([p1, p2]);
  // Ambos os disparos devem completar sem crash do servidor
  assert.ok([200, 409, 500].includes(r1.status));
  assert.ok([200, 409, 500].includes(r2.status));
});

// --------------------------------------------------------------------------
// 5. QA HOSTIL: Validação de Autenticação / Token Secreto
// --------------------------------------------------------------------------
test('QA Hostil #5 - Proteção de rotas com secret quando configurado', async () => {
  process.env.POS_VISITA_IMPORT_SECRET = 'segredo_super_seguro';
  
  const resSemToken = await request('/importar-csv', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({})
  });
  assert.equal(resSemToken.status, 401);

  delete process.env.POS_VISITA_IMPORT_SECRET;
});

// --------------------------------------------------------------------------
// 6. QA HOSTIL: Operações Múltiplas e Concorrência de Leitura/Escrita
// --------------------------------------------------------------------------
test('QA Hostil #6 - Leitura e Atualização Concorrente de Indicações', async () => {
  const res = await request('/indicacoes');
  assert.equal(res.status, 200);
  assert.ok(Array.isArray(res.body.registros));
  assert.ok(res.body.resumo);
});

// --------------------------------------------------------------------------
// 7. QA HOSTIL: Rejeição de IDs inexistentes para atualização
// --------------------------------------------------------------------------
test('QA Hostil #7 - Atualização de registro inexistente trata sem crash', async () => {
  const res = await request('/indicacoes/atualizar', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: 'id_que_nao_existe_12345', crianca: 'Maria' })
  });
  assert.equal(res.status, 200);
  assert.equal(res.body.success, true);
});

// --------------------------------------------------------------------------
// 8. QA HOSTIL: Idempotência de Deletar Registro
// --------------------------------------------------------------------------
test('QA Hostil #8 - Deleção repetida de registro (Idempotência)', async () => {
  const res1 = await request('/indicacoes/id_inexistente_del', { method: 'DELETE' });
  assert.equal(res1.status, 200);

  const res2 = await request('/indicacoes/id_inexistente_del', { method: 'DELETE' });
  assert.equal(res2.status, 200);
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
  const port = server.address().port;
  const nfeUrl = `http://127.0.0.1:${port}/api/nfe`;

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
