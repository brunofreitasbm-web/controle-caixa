require('dotenv').config();
const { Pool } = require('pg');

async function fixPostgresSchema() {
  let dbUrl = process.env.DATABASE_URL || '';
  if (dbUrl.includes('pooler.supabase.com:5432')) {
    dbUrl = dbUrl.replace('pooler.supabase.com:5432', 'pooler.supabase.com:6543');
  }

  const pool = new Pool({
    connectionString: dbUrl,
    ssl: { rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED === 'true' }
  });

  console.log("Conectando ao PostgreSQL para ajustar colunas da tabela colaboradores...");

  const queries = [
    'ALTER TABLE colaboradores ADD COLUMN IF NOT EXISTS email TEXT;',
    'ALTER TABLE colaboradores ADD COLUMN IF NOT EXISTS pinHash TEXT;',
    'ALTER TABLE colaboradores ADD COLUMN IF NOT EXISTS pinhash TEXT;',
    'ALTER TABLE colaboradores ADD COLUMN IF NOT EXISTS ativo INTEGER DEFAULT 1;',
    'ALTER TABLE colaboradores ADD COLUMN IF NOT EXISTS organizationId TEXT;',
    'ALTER TABLE colaboradores ADD COLUMN IF NOT EXISTS organizationid TEXT;',
    'ALTER TABLE organizations ADD COLUMN IF NOT EXISTS criadoEm TEXT;'
  ];

  for (const q of queries) {
    try {
      await pool.query(q);
      console.log("✅ Executado:", q);
    } catch (err) {
      console.log("⚠️ Aviso na query:", q, "->", err.message);
    }
  }

  await pool.end();
  console.log("Ajuste de schema no Supabase concluído!");
}

fixPostgresSchema();
