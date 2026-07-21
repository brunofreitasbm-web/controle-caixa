require('dotenv').config();
const { Pool } = require('pg');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

async function checkDatabases() {
  console.log('--- Checking SQLite database.db ---');
  const sqliteDb = new sqlite3.Database(path.join(__dirname, '..', 'database.db'));
  sqliteDb.all('SELECT count(*) as count FROM registros', [], (err, rows) => {
    if (err) console.error('SQLite registros count err:', err);
    else console.log('SQLite registros count:', rows[0].count);
  });
  sqliteDb.all('SELECT count(*) as count FROM registros_fa', [], (err, rows) => {
    if (err) console.error('SQLite registros_fa count err:', err);
    else console.log('SQLite registros_fa count:', rows[0].count);
  });

  if (process.env.DATABASE_URL) {
    console.log('--- Checking PostgreSQL Supabase ---');
    const pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false }
    });
    try {
      const resReg = await pool.query('SELECT count(*) as count FROM registros');
      console.log('Postgres registros count:', resReg.rows[0].count);
      const resRegFA = await pool.query('SELECT count(*) as count FROM registros_fa');
      console.log('Postgres registros_fa count:', resRegFA.rows[0].count);
    } catch (e) {
      console.error('Postgres error:', e.message);
    }
  }
}

checkDatabases();
