const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function main() {
  try {
    const resLojasMetas = await pool.query('SELECT DISTINCT loja FROM metas_diarias_lojas');
    console.log("Distinct stores in metas_diarias_lojas:", resLojasMetas.rows);
    
    const resLojasVendas = await pool.query('SELECT DISTINCT loja FROM vendas_horarias');
    console.log("Distinct stores in vendas_horarias:", resLojasVendas.rows);

    const resConfig = await pool.query('SELECT * FROM configuracoes');
    console.log("Configuracoes content:", resConfig.rows);
  } catch (err) {
    console.error(err);
  } finally {
    await pool.end();
  }
}

main();
