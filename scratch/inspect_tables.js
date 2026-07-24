const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function main() {
  try {
    const metas_diarias_lojas = await pool.query("SELECT * FROM metas_diarias_lojas LIMIT 5");
    console.log("Sample from metas_diarias_lojas:", metas_diarias_lojas.rows);

    const distinct_lojas = await pool.query("SELECT DISTINCT loja FROM metas_diarias_lojas");
    console.log("Distinct lojas in metas_diarias_lojas:", distinct_lojas.rows);

    const distinct_operacoes = await pool.query("SELECT DISTINCT operacao FROM metas_vendas");
    console.log("Distinct operacoes in metas_vendas:", distinct_operacoes.rows);

    const distinct_vendas_horarias = await pool.query("SELECT DISTINCT loja FROM vendas_horarias");
    console.log("Distinct lojas in vendas_horarias:", distinct_vendas_horarias.rows);

    const vendas_horarias_sample = await pool.query("SELECT * FROM vendas_horarias LIMIT 5");
    console.log("Sample from vendas_horarias:", vendas_horarias_sample.rows);
  } catch (err) {
    console.error(err);
  } finally {
    await pool.end();
  }
}

main();
