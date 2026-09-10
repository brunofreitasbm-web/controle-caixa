require('dotenv').config();
process.env.DATABASE_URL = '';

const { initDb, db } = require('../config/database');
const { normalizarNomeLoja, enviarEmailGenerico, enviarNotificacaoAbertura } = require('../config/notifications');

async function run() {
  await new Promise(r => initDb(r));
  await new Promise(r => setTimeout(r, 500));

  console.log('1. Normalizar:', normalizarNomeLoja('Marumbáia'));

  const res = await enviarEmailGenerico(
    ['brunofreitasbm@gmail.com'],
    'Teste de Fila - Marambaia',
    'Texto de teste',
    '<p>HTML de teste</p>'
  );
  console.log('2. enviarEmailGenerico res:', res);

  const rows = await new Promise((resolve, reject) => {
    db.all(`SELECT * FROM email_queue`, [], (err, res) => {
      if (err) reject(err); else resolve(res);
    });
  });

  console.log('3. Rows count:', rows.length);
  if (rows.length > 0) {
    console.log('Row 0:', rows[0].id, rows[0].subject, rows[0].status, rows[0].sent_at);
  }
}

run().then(() => {
  console.log('SUCESSO!');
  process.exit(0);
}).catch(err => {
  console.error('ERRO:', err);
  process.exit(1);
});
