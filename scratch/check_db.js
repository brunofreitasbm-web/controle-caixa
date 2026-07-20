require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function run() {
  try {
    const resTables = await pool.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public'");
    console.log('Tables:', resTables.rows);

    const resLogsExist = await pool.query("SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_schema='public' AND table_name='logs_auditoria')");
    console.log('logs_auditoria table exists:', resLogsExist.rows[0].exists);

    if (resLogsExist.rows[0].exists) {
      const resLogs = await pool.query("SELECT * FROM logs_auditoria LIMIT 5");
      console.log('Logs (first 5):', resLogs.rows);
    }
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await pool.end();
  }
}
run();
