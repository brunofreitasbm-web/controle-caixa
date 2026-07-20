require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function testUpdate() {
  const cutoffs = {
    'Icoaraci': '2026-06-05T23:59:59.999Z',
    'Marambaia': '2026-06-06T23:59:59.999Z',
    'Havan': '2026-06-06T23:59:59.999Z',
    'Desligado': '2026-06-06T23:59:59.999Z',
    'Mário Covas': '2026-06-06T23:59:59.999Z',
    'Venda Direta': '2026-06-06T23:59:59.999Z'
  };

  const res = await pool.query('SELECT id, consultor, loja, tipooperacao, dataoperacao, valorenvelope, status FROM registros WHERE deletadoem IS NULL');
  const rows = res.rows;

  let fechamentosRetirados = 0;
  let pendingRemaining = 0;
  let totalPendingValue = 0;

  const pendingByStore = {};

  rows.forEach(r => {
    const cutoff = cutoffs[r.loja] || '2026-06-06T23:59:59.999Z';
    const isPast = r.dataoperacao <= cutoff;

    if (r.tipooperacao === 'Fechamento') {
      if (isPast) {
        fechamentosRetirados++;
      } else {
        pendingRemaining++;
        const val = parseFloat(r.valorenvelope || 0);
        totalPendingValue += val;
        if (!pendingByStore[r.loja]) pendingByStore[r.loja] = { count: 0, total: 0 };
        pendingByStore[r.loja].count++;
        pendingByStore[r.loja].total += val;
      }
    }
  });

  console.log(`Fechamentos marcados como RETIRADOS (<= 05/06 Icoaraci, <= 06/06 outros): ${fechamentosRetirados}`);
  console.log(`Fechamentos PENDENTES RESTANTES (> 05/06 Icoaraci, > 06/06 outros): ${pendingRemaining}`);
  console.log(`Valor Total Pendente em Trânsito RESTANTE: R$ ${totalPendingValue.toFixed(2)}`);
  console.log('\n--- Pendentes por Loja ---');
  console.log(pendingByStore);

  await pool.end();
}

testUpdate();
