require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function analyze() {
  const res = await pool.query('SELECT id, consultor, loja, tipooperacao, dataoperacao, valorenvelope, status FROM registros WHERE deletadoem IS NULL ORDER BY dataoperacao ASC');
  const rows = res.rows;
  console.log(`Total active records in DB: ${rows.length}`);

  const stores = {};
  rows.forEach(r => {
    const s = r.loja;
    if (!stores[s]) stores[s] = { total: 0, fechamentos: 0, fechamentosPending: 0, minDate: null, maxDate: null };
    stores[s].total++;
    if (r.tipooperacao === 'Fechamento') {
      stores[s].fechamentos++;
      if (r.status === 'aguardando_retirada') stores[s].fechamentosPending++;
    }
    if (!stores[s].minDate || r.dataoperacao < stores[s].minDate) stores[s].minDate = r.dataoperacao;
    if (!stores[s].maxDate || r.dataoperacao > stores[s].maxDate) stores[s].maxDate = r.dataoperacao;
  });

  console.log('\n--- Stores Summary ---');
  console.log(stores);

  // Let's check breakdown by withdrawal cutoff dates
  // Cutoffs:
  // Icoaraci: <= 2026-06-05T23:59:59.999Z
  // Marambaia: <= 2026-06-06T23:59:59.999Z
  // Desligado / Havan: <= 2026-06-06T23:59:59.999Z
  // Mário Covas / Venda Direta / others (Contenier): <= 2026-06-06T23:59:59.999Z

  const cutoffs = {
    'Icoaraci': '2026-06-05T23:59:59.999Z',
    'Marambaia': '2026-06-06T23:59:59.999Z',
    'Desligado': '2026-06-06T23:59:59.999Z',
    'Mário Covas': '2026-06-06T23:59:59.999Z',
    'Venda Direta': '2026-06-06T23:59:59.999Z',
  };

  const toArchive = [];
  const toKeep = [];

  rows.forEach(r => {
    const cutoff = cutoffs[r.loja] || '2026-06-06T23:59:59.999Z';
    if (r.dataoperacao <= cutoff) {
      toArchive.push(r);
    } else {
      toKeep.push(r);
    }
  });

  console.log(`\nRecords <= Cutoff (to archive): ${toArchive.length}`);
  console.log(`Records > Cutoff (to keep active in dashboard/history): ${toKeep.length}`);

  // Let's check dates of remaining records (to keep)
  console.log('\n--- Sample of Records TO KEEP (> Cutoff) ---');
  console.log(toKeep.slice(0, 15).map(r => ({ id: r.id, loja: r.loja, date: r.dataoperacao, tipo: r.tipooperacao, val: r.valorenvelope })));

  await pool.end();
}

analyze();
