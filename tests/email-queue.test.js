const { test, before } = require('node:test');
const assert = require('node:assert/strict');

process.env.DATABASE_URL = '';
process.env.SMTP_HOST = 'smtp.test.com';
process.env.SMTP_USER = 'test@test.com';
process.env.SMTP_PASS = 'secret';

const { initDb, db } = require('../config/database');
const { normalizarNomeLoja, enviarEmailGenerico, enviarNotificacaoAbertura } = require('../config/notifications');

before(() => {
  return new Promise((resolve) => {
    initDb(() => {
      db.run(
        `INSERT INTO colaboradores (id, nome, role, email, criadoEm)
         VALUES ('c1', 'Bruno', 'owner', 'brunofreitasbm@gmail.com', datetime('now'))
         ON CONFLICT DO NOTHING`,
        [],
        () => setTimeout(resolve, 300)
      );
    });
  });
});

test('Normalização de Nomes das Lojas', () => {
  assert.equal(normalizarNomeLoja('Marumbáia'), 'Marambaia');
  assert.equal(normalizarNomeLoja('Marambaia'), 'Marambaia');
  assert.equal(normalizarNomeLoja('9175'), 'Marambaia');

  assert.equal(normalizarNomeLoja('Corací'), 'Icoaraci');
  assert.equal(normalizarNomeLoja('Coraci'), 'Icoaraci');
  assert.equal(normalizarNomeLoja('Icoaraci'), 'Icoaraci');
  assert.equal(normalizarNomeLoja('4304'), 'Icoaraci');

  assert.equal(normalizarNomeLoja('Mario Covas'), 'Mário Covas');
  assert.equal(normalizarNomeLoja('Mário Covas'), 'Mário Covas');
  assert.equal(normalizarNomeLoja('9201'), 'Mário Covas');
});

test('Persistência de e-mails na tabela email_queue', async () => {
  enviarEmailGenerico(
    ['brunofreitasbm@gmail.com'],
    'Teste de Fila Unitario',
    'Texto de teste',
    '<p>HTML de teste</p>'
  );

  await new Promise(r => setTimeout(r, 600));

  const rows = await new Promise((resolve, reject) => {
    db.all(`SELECT * FROM email_queue WHERE subject = 'Teste de Fila Unitario'`, [], (err, res) => {
      if (err) reject(err); else resolve(res);
    });
  });

  assert.ok(rows.length > 0);
  assert.equal(rows[0].target_emails, 'brunofreitasbm@gmail.com');
  assert.ok(['pending', 'sent', 'queued', 'failed'].includes(rows[0].status));
});

test('Notificação de Abertura com Loja Normalizada', async () => {
  enviarNotificacaoAbertura('Marumbáia', 'Testador', 150, 'Cacau Show');

  await new Promise(r => setTimeout(r, 600));

  const rows = await new Promise((resolve, reject) => {
    db.all(`SELECT * FROM email_queue WHERE subject LIKE '%Abertura de Caixa - Marambaia%'`, [], (err, res) => {
      if (err) reject(err); else resolve(res);
    });
  });

  assert.ok(rows.length > 0);
});
