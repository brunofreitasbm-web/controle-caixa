require('dotenv').config();
const express = require('express');
const saasSignupRouter = require('../routes/saas-signup');
const { initDb } = require('../config/database');

async function testApi() {
  console.log('Inicializando banco de dados...');
  await initDb();

  const app = express();
  app.use(express.json());
  app.use('/api/saas', saasSignupRouter);

  const server = app.listen(0, async () => {
    const port = server.address().port;
    console.log(`Servidor de teste rodando na porta ${port}`);

    try {
      const testEmail = process.env.SMTP_USER; // hub.operacao.lojas@gmail.com
      console.log(`Efetuando POST /api/saas/trial-signup para ${testEmail}...`);

      const res = await fetch(`http://localhost:${port}/api/saas/trial-signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: testEmail,
          nome: 'Franqueado Teste 7 Dias',
          nomeLoja: 'Cacau Show Teste 7D'
        })
      });

      const data = await res.json();
      console.log('RESPOSTA DO SERVIDOR (status ' + res.status + '):', data);
    } catch (err) {
      console.error('ERRO NO TESTE DA API:', err);
    } finally {
      server.close();
    }
  });
}

testApi();
