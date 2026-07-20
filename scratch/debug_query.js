require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function debug() {
  const res1 = await pool.query('SELECT COUNT(*) FROM registros');
  console.log('Total registros in Postgres:', res1.rows[0].count);

  const res2 = await pool.query('SELECT COUNT(*) FROM registros WHERE deletadoem IS NULL');
  console.log('Active registros in Postgres (where deletadoem is null):', res2.rows[0].count);

  const res3 = await pool.query('SELECT * FROM registros WHERE deletadoem IS NULL ORDER BY dataoperacao DESC LIMIT 10');
  console.log('Top 10 active records by dataoperacao DESC:', res3.rows.map(r => ({ id: r.id, consultor: r.consultor, loja: r.loja, dataoperacao: r.dataoperacao })));

  await pool.end();
}

debug();
