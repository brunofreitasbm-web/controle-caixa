require('dotenv').config();
const { Pool } = require('pg');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const cutoffs = {
  'Icoaraci': { date: '2026-06-05T23:59:59.999Z', retirada: '2026-06-05T18:00:00.000Z' },
  'Marambaia': { date: '2026-06-06T23:59:59.999Z', retirada: '2026-06-06T18:00:00.000Z' },
  'Desligado': { date: '2026-06-06T23:59:59.999Z', retirada: '2026-06-06T18:00:00.000Z' },
  'Mário Covas': { date: '2026-06-06T23:59:59.999Z', retirada: '2026-06-06T18:00:00.000Z' },
  'Venda Direta': { date: '2026-06-06T23:59:59.999Z', retirada: '2026-06-06T18:00:00.000Z' }
};

async function updatePostgres() {
  if (!process.env.DATABASE_URL) return;
  console.log('--- Atualizando PostgreSQL (Supabase) ---');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

  try {
    for (const [loja, cfg] of Object.entries(cutoffs)) {
      const query = `
        UPDATE registros
        SET status = 'retirado',
            dataRetirada = $1,
            retiradoPor = 'Bruno / Isabella',
            confirmadoPorApp = 'Bruno'
        WHERE loja = $2
          AND tipoOperacao = 'Fechamento'
          AND dataOperacao <= $3
          AND status = 'aguardando_retirada';
      `;
      const res = await pool.query(query, [cfg.retirada, loja, cfg.date]);
      console.log(`PostgreSQL [${loja}]: ${res.rowCount} fechamentos atualizados para 'retirado'`);
    }
  } catch (err) {
    console.error('PostgreSQL Error:', err);
  } finally {
    await pool.end();
  }
}

function updateSqlite() {
  return new Promise((resolve, reject) => {
    console.log('--- Atualizando SQLite Local ---');
    const dbPath = path.join(__dirname, '..', 'database.db');
    const db = new sqlite3.Database(dbPath);

    db.serialize(() => {
      let pending = Object.keys(cutoffs).length;
      for (const [loja, cfg] of Object.entries(cutoffs)) {
        const query = `
          UPDATE registros
          SET status = 'retirado',
              dataRetirada = ?,
              retiradoPor = 'Bruno / Isabella',
              confirmadoPorApp = 'Bruno'
          WHERE loja = ?
            AND tipoOperacao = 'Fechamento'
            AND dataOperacao <= ?
            AND status = 'aguardando_retirada';
        `;
        db.run(query, [cfg.retirada, loja, cfg.date], function(err) {
          if (err) console.error(`SQLite Error [${loja}]:`, err);
          else console.log(`SQLite [${loja}]: ${this.changes} fechamentos atualizados para 'retirado'`);
          pending--;
          if (pending === 0) {
            db.close();
            resolve();
          }
        });
      }
    });
  });
}

async function main() {
  await updatePostgres();
  await updateSqlite();
  console.log('=== ATUALIZAÇÃO DE RETIRADAS COMPLETA ===');
}

main();
