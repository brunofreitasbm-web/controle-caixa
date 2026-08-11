const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
require('dotenv').config();

const sslRejectUnauthorized = process.env.DB_SSL_REJECT_UNAUTHORIZED === 'true';
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: sslRejectUnauthorized }
});

async function applyMigration() {
  try {
    const sqlPath = path.join(__dirname, '..', 'migrations', '001_fix_supabase_linter_security.sql');
    console.log('Lendo arquivo de migração:', sqlPath);
    const sql = fs.readFileSync(sqlPath, 'utf8');

    console.log('Executando migração no Supabase PostgreSQL...');
    await pool.query(sql);
    console.log('✅ Migração executada com sucesso!');

    console.log('\n--- Verificando view fa_kiosk_my_capabilities ---');
    const viewOpt = await pool.query(`
      SELECT c.relname, c.reloptions
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = 'fa_kiosk_my_capabilities';
    `);
    console.log('Reloptions da View:', viewOpt.rows);

    console.log('\n--- Verificando status do RLS nas 8 tabelas ---');
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
    console.table(rlsRes.rows);

  } catch (err) {
    console.error('❌ Erro ao aplicar migração:', err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

applyMigration();
