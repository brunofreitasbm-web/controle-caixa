const { Pool } = require('pg');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
require('dotenv').config();

async function cleanPostgres() {
  console.log("Cleaning PostgreSQL...");
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });
  
  try {
    const res = await pool.query(
      `DELETE FROM vendas_horarias WHERE loja = '9175' OR loja = 'Marambaia'`
    );
    console.log(`PostgreSQL: Deleted ${res.rowCount} rows from vendas_horarias.`);
  } catch (err) {
    console.error("Error cleaning PostgreSQL:", err.message);
  } finally {
    await pool.end();
  }
}

function cleanSQLite() {
  console.log("Cleaning SQLite...");
  const dbPath = path.join(__dirname, '..', 'database.db');
  const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
      console.error("Error opening SQLite database:", err.message);
      return;
    }
    
    db.run(
      `DELETE FROM vendas_horarias WHERE loja = '9175' OR loja = 'Marambaia'`,
      function(err) {
        if (err) {
          console.error("Error deleting rows from SQLite:", err.message);
        } else {
          console.log(`SQLite: Deleted ${this.changes} rows from vendas_horarias.`);
        }
        db.close();
      }
    );
  });
}

async function run() {
  if (process.env.DATABASE_URL) {
    await cleanPostgres();
  }
  cleanSQLite();
}

run();
