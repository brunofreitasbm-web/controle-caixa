const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const http = require('http');

process.env.DATABASE_URL = '';
const { initDb, dbRunAsync, dbGetAsync } = require('../config/database');
const { limparFotosEnvelopesRecolhidosAntigos } = require('../services/limpeza-envelopes');

let server;
let baseUrl;

before(async () => {
  await new Promise((resolve) => {
    initDb(() => {
      const app = express();
      app.use(express.json());

      app.get('/api/cron/limpar-fotos-envelopes', async (req, res) => {
        try {
          const resultado = await limparFotosEnvelopesRecolhidosAntigos({ dias: 5 });
          res.json(resultado);
        } catch (err) {
          res.status(500).json({ error: err.message });
        }
      });

      server = http.createServer(app);
      server.listen(0, '127.0.0.1', () => {
        const port = server.address().port;
        baseUrl = `http://127.0.0.1:${port}/api`;
        resolve();
      });
    });
  });
});

after(async () => {
  if (server) {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('Limpeza de Envelopes #1 - Exclui foto de envelope recolhido há mais de 5 dias em registros (Cacau Show)', async () => {
  const agora = new Date();
  const seisDiasAtras = new Date(agora.getTime() - 6 * 24 * 60 * 60 * 1000).toISOString();
  const id = `test_env_expirado_${Date.now()}`;
  const fotoBase64 = 'data:image/jpeg;base64,samplephoto123';

  await dbRunAsync(
    `INSERT INTO registros (id, loja, consultor, tipoOperacao, dataOperacao, fundoCaixa, valorEnvelope, status, dataRetirada, fotoEnvelope, criadoEm)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, 'Marambaia', 'Consultor Teste', 'Fechamento', '2026-10-01', 200, 500, 'retirado', seisDiasAtras, fotoBase64, seisDiasAtras]
  );

  const res = await limparFotosEnvelopesRecolhidosAntigos({ dias: 5, agora });
  assert.equal(res.sucesso, true);
  assert.ok(res.cacauShow.limpos >= 1);
  assert.ok(res.cacauShow.ids.includes(id));

  const row = await dbGetAsync('SELECT fotoEnvelope, status FROM registros WHERE id = ?', [id]);
  assert.equal(row.fotoEnvelope, null);
  assert.equal(row.status, 'retirado');

  const log = await dbGetAsync('SELECT * FROM logs_auditoria WHERE registroId = ? AND acao = ?', [id, 'CLEANUP_FOTO']);
  assert.ok(log);
  assert.ok(log.descricao.includes('5 dias'));
});

test('Limpeza de Envelopes #2 - Mantém foto de envelope recolhido há MENOS de 5 dias', async () => {
  const agora = new Date();
  const doisDiasAtras = new Date(agora.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString();
  const id = `test_env_recente_${Date.now()}`;
  const fotoBase64 = 'data:image/jpeg;base64,keepthisphoto';

  await dbRunAsync(
    `INSERT INTO registros (id, loja, consultor, tipoOperacao, dataOperacao, fundoCaixa, valorEnvelope, status, dataRetirada, fotoEnvelope, criadoEm)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, 'Icoaraci', 'Consultor Recente', 'Fechamento', '2026-10-10', 200, 800, 'retirado', doisDiasAtras, fotoBase64, doisDiasAtras]
  );

  const res = await limparFotosEnvelopesRecolhidosAntigos({ dias: 5, agora });
  assert.equal(res.sucesso, true);
  assert.ok(!res.cacauShow.ids.includes(id));

  const row = await dbGetAsync('SELECT fotoEnvelope, status FROM registros WHERE id = ?', [id]);
  assert.equal(row.fotoEnvelope, fotoBase64);
});

test('Limpeza de Envelopes #3 - Mantém foto de envelope pendente (aguardando_retirada) mesmo antigo', async () => {
  const agora = new Date();
  const dezDiasAtras = new Date(agora.getTime() - 10 * 24 * 60 * 60 * 1000).toISOString();
  const id = `test_env_pendente_${Date.now()}`;
  const fotoBase64 = 'data:image/jpeg;base64,pendingphoto';

  await dbRunAsync(
    `INSERT INTO registros (id, loja, consultor, tipoOperacao, dataOperacao, fundoCaixa, valorEnvelope, status, dataRetirada, fotoEnvelope, criadoEm)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, 'Mário Covas', 'Consultor Pendente', 'Fechamento', '2026-09-25', 200, 1200, 'aguardando_retirada', null, fotoBase64, dezDiasAtras]
  );

  const res = await limparFotosEnvelopesRecolhidosAntigos({ dias: 5, agora });
  assert.equal(res.sucesso, true);
  assert.ok(!res.cacauShow.ids.includes(id));

  const row = await dbGetAsync('SELECT fotoEnvelope, status FROM registros WHERE id = ?', [id]);
  assert.equal(row.fotoEnvelope, fotoBase64);
});

test('Limpeza de Envelopes #4 - Exclui foto de envelope recolhido em registros_fa (Faça Amigos)', async () => {
  const agora = new Date();
  const seteDiasAtras = new Date(agora.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const id = `test_fa_expirado_${Date.now()}`;
  const fotoBase64 = 'data:image/jpeg;base64,faphoto123';

  await dbRunAsync(
    `INSERT INTO registros_fa (id, loja, consultor, tipoOperacao, dataOperacao, fundoCaixa, valorEnvelope, status, dataRetirada, fotoEnvelope, criadoEm)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, 'ParqueShopping', 'Operador FA', 'Fechamento', '2026-10-01', 100, 350, 'retirado', seteDiasAtras, fotoBase64, seteDiasAtras]
  );

  const res = await limparFotosEnvelopesRecolhidosAntigos({ dias: 5, agora });
  assert.equal(res.sucesso, true);
  assert.ok(res.facaAmigos.ids.includes(id));

  const row = await dbGetAsync('SELECT fotoEnvelope, status FROM registros_fa WHERE id = ?', [id]);
  assert.equal(row.fotoEnvelope, null);

  const log = await dbGetAsync('SELECT * FROM logs_auditoria WHERE registroId = ? AND acao = ?', [id, 'CLEANUP_FOTO_FA']);
  assert.ok(log);
});

test('Limpeza de Envelopes #5 - Endpoint HTTP /api/cron/limpar-fotos-envelopes responde com sucesso', async () => {
  const res = await fetch(`${baseUrl}/cron/limpar-fotos-envelopes`);
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.sucesso, true);
  assert.equal(data.diasLimite, 5);
  assert.ok(data.dataCorte);
  assert.ok(data.cacauShow);
  assert.ok(data.facaAmigos);
});
