const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function main() {
  try {
    console.log("Connecting to PostgreSQL...");
    
    // Get all tables
    const resTables = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
    `);
    
    console.log("Tables in public schema:");
    for (const row of resTables.rows) {
      const table = row.table_name;
      
      // Get column names
      const resCols = await pool.query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = $1
      `, [table]);
      const cols = resCols.rows.map(c => c.column_name);
      
      // Check rows count
      const resCount = await pool.query(`SELECT count(*) FROM "${table}"`);
      const count = resCount.rows[0].count;
      
      console.log(`Table: ${table} | Rows: ${count} | Columns: [${cols.join(', ')}]`);
      
      // If table contains 'loja', let's see if 9175 is there
      if (cols.includes('loja')) {
        const resLoja = await pool.query(`SELECT count(*) FROM "${table}" WHERE loja = '9175'`);
        console.log(`  -> Rows for loja 9175 in ${table}: ${resLoja.rows[0].count}`);
        if (parseInt(resLoja.rows[0].count) > 0) {
          const sample = await pool.query(`SELECT * FROM "${table}" WHERE loja = '9175' LIMIT 5`);
          console.log(`  -> Sample:`, sample.rows);
        }
      }
    }
  } catch (err) {
    console.error("Error:", err);
  } finally {
    await pool.end();
  }
}

main();
