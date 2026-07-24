const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function main() {
  try {
    const resTables = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
    `);
    
    for (const row of resTables.rows) {
      const table = row.table_name;
      
      const resCols = await pool.query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = $1
      `, [table]);
      const cols = resCols.rows.map(c => c.column_name);
      
      // We will search each text/varchar/integer column for '9175' or 'Marambaia'
      for (const col of cols) {
        try {
          const queryStr = `SELECT count(*) FROM "${table}" WHERE CAST("${col}" AS TEXT) = '9175' OR CAST("${col}" AS TEXT) ILIKE '%Marambaia%'`;
          const resSearch = await pool.query(queryStr);
          const count = parseInt(resSearch.rows[0].count);
          if (count > 0) {
            console.log(`Found ${count} matching rows in table: "${table}", column: "${col}"`);
            const sample = await pool.query(`SELECT * FROM "${table}" WHERE CAST("${col}" AS TEXT) = '9175' OR CAST("${col}" AS TEXT) ILIKE '%Marambaia%' LIMIT 3`);
            console.log(`  -> Sample:`, sample.rows);
          }
        } catch (e) {
          // ignore column types that can't be cast/queried easily
        }
      }
    }
  } catch (err) {
    console.error(err);
  } finally {
    await pool.end();
  }
}

main();
