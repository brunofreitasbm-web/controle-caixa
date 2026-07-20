require('dotenv').config();
const { Pool } = require('pg');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

async function checkPostgres() {
  if (!process.env.DATABASE_URL) {
    console.log('PostgreSQL: DATABASE_URL não definido');
    return;
  }
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    const resCount = await pool.query('SELECT COUNT(*) FROM registros');
    console.log('Postgres registros count:', resCount.rows[0].count);
    const resSample = await pool.query('SELECT * FROM registros LIMIT 5');
    console.log('Postgres registros sample:', resSample.rows);
  } catch (err) {
    console.error('Postgres Error:', err.message);
  } finally {
    await pool.end();
  }
}

function checkSqlite() {
  const dbPath = path.join(__dirname, '..', 'database.db');
  const db = new sqlite3.Database(dbPath);
  db.get('SELECT COUNT(*) as count FROM registros', [], (err, row) => {
    if (err) {
      console.error('SQLite Error:', err.message);
    } else {
      console.log('SQLite registros count:', row ? row.count : 0);
    }
  });
}

async function main() {
  console.log('--- Checking PostgreSQL ---');
  await checkPostgres();
  console.log('--- Checking SQLite ---');
  checkSqlite();
}

main();
