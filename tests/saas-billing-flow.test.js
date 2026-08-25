const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { initDb, dbGetAsync, dbAllAsync, TENANT_ZERO_ID } = require('../config/database');
const saasSignupRouter = require('../routes/saas-signup');
const { conciliarEVerificarDivergencia } = require('../services/fluxo-caixa-dados');

// App express para teste de integração de rotas SaaS
const app = express();
app.use(express.json());
app.use('/api/saas', saasSignupRouter);

test('SaaS & Financeiro - Fluxo de Teste Grátis (Trial Signup)', async () => {
  await initDb();

  const emailTeste = `teste_saas_${Date.now()}@lojacacau.com.br`;
  const nomeLoja = `Cacau Show Shopping Teste ${Date.now().toString().slice(-4)}`;

  // Simular requisição HTTP POST para trial-signup
  const reqBody = {
    nome: 'Gerente Teste',
    email: emailTeste,
    telefone: '91999998888',
    nomeLoja
  };

  let resData;
  let resStatus = 200;

  const mockRes = {
    status(code) {
      resStatus = code;
      return this;
    },
    json(data) {
      resData = data;
      return this;
    }
  };

  const req = { body: reqBody };

  // Executar rota diretamente via router handler ou dispatch
  const stackLayer = saasSignupRouter.stack.find(s => s.route && s.route.path === '/trial-signup');
  assert.ok(stackLayer, 'Rota /trial-signup deve existir');

  await stackLayer.route.stack[0].handle(req, mockRes, () => {});

  assert.equal(resStatus, 200);
  assert.equal(resData.ok, true);
  assert.ok(resData.orgId);
  assert.ok(resData.pinSimulado);

  // Verificar se a organização foi criada no banco de dados
  const org = await dbGetAsync('SELECT * FROM organizations WHERE id = ?', [resData.orgId]);
  assert.ok(org, 'Organização deve ser salva no banco');
  assert.equal(org.nome, nomeLoja);

  // Verificar se o colaborador owner foi criado
  const owner = await dbGetAsync('SELECT * FROM colaboradores WHERE organizationId = ? AND email = ?', [resData.orgId, emailTeste]);
  assert.ok(owner, 'Colaborador owner deve existir');
  assert.equal(owner.role, 'owner');
});

test('SaaS & Financeiro - Conciliação e Detecção de Divergência no Caixa', async () => {
  // Teste 1: Caixa Perfeito (sem falta nem sobra)
  const resExato = conciliarEVerificarDivergencia({
    fundoAbertura: 200.00,
    faturadoDinheiro: 500.00,
    sangriaTotal: 100.00,
    envelopeDeclarado: 600.00
  });
  assert.equal(resExato.esperadoNoCaixa, 600.00);
  assert.equal(resExato.diferenca, 0.00);
  assert.equal(resExato.status, 'ok');

  // Teste 2: Sobra no Caixa (Consultor declarou R$ 650 quando o esperado era R$ 600)
  const resSobra = conciliarEVerificarDivergencia({
    fundoAbertura: 200.00,
    faturadoDinheiro: 500.00,
    sangriaTotal: 100.00,
    envelopeDeclarado: 650.00
  });
  assert.equal(resSobra.esperadoNoCaixa, 600.00);
  assert.equal(resSobra.diferenca, 50.00);
  assert.equal(resSobra.status, 'sobra');

  // Teste 3: Falta no Caixa (Consultor declarou R$ 550 quando o esperado era R$ 600)
  const resFalta = conciliarEVerificarDivergencia({
    fundoAbertura: 200.00,
    faturadoDinheiro: 500.00,
    sangriaTotal: 100.00,
    envelopeDeclarado: 550.00
  });
  assert.equal(resFalta.esperadoNoCaixa, 600.00);
  assert.equal(resFalta.diferenca, -50.00);
  assert.equal(resFalta.status, 'falta');
});

test('Landing Page - Validação de Integridade do HTML e Form Modal', async () => {
  const fs = require('fs');
  const path = require('path');

  const rootIndexPath = path.join(__dirname, '..', 'index.html');
  assert.ok(fs.existsSync(rootIndexPath), 'Arquivo index.html da landing page deve existir');

  const htmlContent = fs.readFileSync(rootIndexPath, 'utf-8');
  assert.ok(htmlContent.includes('Hub de Operações'), 'Landing page deve conter o título oficial');
  assert.ok(htmlContent.includes('/api/saas/trial-signup'), 'Landing page deve ter conexão com a rota de cadastro trial');
  assert.ok(htmlContent.includes('saasTrialModal'), 'Modal de cadastro de 7 dias grátis deve estar injetado no HTML');
  assert.ok(htmlContent.includes('trialSubmitBtn'), 'Botão de submissão do formulário trial deve existir');
});
