const { Pool } = require('pg');
require('dotenv').config();

const sslRejectUnauthorized = process.env.DB_SSL_REJECT_UNAUTHORIZED === 'true';
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: sslRejectUnauthorized }
});

async function run() {
  try {
    console.log('--- Checking fa_kiosk_my_capabilities view ---');
    const viewRes = await pool.query(`
      SELECT table_schema, table_name, view_definition 
      FROM information_schema.views 
      WHERE table_name = 'fa_kiosk_my_capabilities';
    `);
    console.log('View def:', viewRes.rows);

    console.log('\n--- Checking view reloptions ---');
    const relOptRes = await pool.query(`
      SELECT c.relname, c.reloptions
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = 'fa_kiosk_my_capabilities';
    `);
    console.log('View reloptions:', relOptRes.rows);

    console.log('\n--- Checking RLS status on target tables ---');
    const tables = [
      'solicitacoes_retirada',
      'pos_visita_indicadores',
      'fluxo_caixa_mensal',
      'fluxo_caixa_campanha',
      'fluxo_caixa_referencia_loja',
      'fluxo_caixa_indice_sazonal',
      'fluxo_caixa_observacao_diaria',
      'fluxo_caixa_checklist'
    ];

    const rlsRes = await pool.query(`
      SELECT tablename, rowsecurity 
      FROM pg_tables 
      WHERE schemaname = 'public' AND tablename = ANY($1);
    `, [tables]);
    console.log('RLS Status:', rlsRes.rows);

    console.log('\n--- Checking sample existing policies on other tables ---');
    const polRes = await pool.query(`
      SELECT tablename, policyname, roles, cmd, qual, with_check 
      FROM pg_policies 
      WHERE schemaname = 'public' 
      LIMIT 10;
    `);
    console.log('Existing Policies:', polRes.rows);

  } catch (err) {
    console.error('Error:', err);
  } finally {
    await pool.end();
  }
}

run();
