require('dotenv').config();
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Pool } = require('pg');
const sqlite3 = require('sqlite3').verbose();

const csvPath = path.join(__dirname, '..', 'Cópia de Controle de Caixa (respostas) - Dados Extraídos BD.csv');
const content = fs.readFileSync(csvPath, 'utf8');

function parseCSV(text) {
  const lines = text.split(/\r?\n/).filter(line => line.trim() !== '');
  if (lines.length === 0) return { headers: [], rows: [] };

  function parseLine(line) {
    const fields = [];
    let curField = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          curField += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        fields.push(curField.trim());
        curField = '';
      } else {
        curField += char;
      }
    }
    fields.push(curField.trim());
    return fields;
  }

  const headers = parseLine(lines[0]);
  const rows = lines.slice(1).map((line, idx) => ({ lineNum: idx + 2, fields: parseLine(line), raw: line }));
  return { headers, rows };
}

const validConsultores = ["Ana Júlia", "Vitória", "Débora", "Alexandra", "Janine", "Estheffany", "Sabrina", "Isabella", "Bruno"];
const validLojas = ["Marambaia", "Icoaraci", "Mário Covas", "Venda Direta"];

function parseMoney(val) {
  if (!val || val.trim() === '') return 0;
  const cleaned = val.replace(/R\$\s*/g, '').replace(/\./g, '').replace(',', '.').trim();
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}

function parseDate(dataStr, fallbackIso = null) {
  if (!dataStr || dataStr.trim() === '') return fallbackIso;
  const parts = dataStr.trim().split('/');
  if (parts.length !== 3) return fallbackIso;
  const [day, month, year] = parts;
  return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T12:00:00.000Z`;
}

const { rows } = parseCSV(content);
const recordsToInsert = [];

rows.forEach(r => {
  let [consultor, loja, tipoOperacao, dataStr, fundoStr, envelopeStr] = r.fields;

  let finalConsultor = consultor;
  if (!validConsultores.includes(consultor)) {
    finalConsultor = "Desligado";
  }

  let finalLoja = loja;
  if (!validLojas.includes(loja)) {
    finalLoja = "Desligado";
  }

  let dataOperacao = null;
  let fundoCaixa = null;
  let valorEnvelope = (tipoOperacao === 'Fechamento') ? parseMoney(envelopeStr) : null;

  // Anomalous lines handling approved by user context
  if (r.lineNum === 1023) {
    dataOperacao = parseDate('12/02/2026');
    fundoCaixa = parseMoney(fundoStr);
  } else if (r.lineNum === 1091) {
    dataOperacao = parseDate('23/02/2026');
    fundoCaixa = parseMoney(fundoStr);
  } else if (r.lineNum === 619) {
    dataOperacao = parseDate(dataStr);
    fundoCaixa = 160.05;
  } else if (r.lineNum === 811) {
    dataOperacao = parseDate(dataStr);
    fundoCaixa = 0.00;
  } else {
    dataOperacao = parseDate(dataStr);
    fundoCaixa = parseMoney(fundoStr);
  }

  const hash = crypto.createHash('md5').update(`csv_${r.lineNum}_${r.raw}`).digest('hex').slice(0, 12);
  const id = `csv_${r.lineNum}_${hash}`;

  const status = (tipoOperacao === 'Fechamento') ? 'aguardando_retirada' : 'aberto';
  const criadoEm = new Date().toISOString();

  recordsToInsert.push({
    id,
    consultor: finalConsultor,
    loja: finalLoja,
    tipoOperacao,
    dataOperacao,
    fundoCaixa,
    valorEnvelope,
    observacoes: `Importado do BD anterior (Linha CSV #${r.lineNum})`,
    fotoEnvelope: null,
    status,
    dataRetirada: null,
    retiradoPor: null,
    confirmadoPorApp: null,
    autorizadoPor: null,
    mensagemGerada: 0,
    criadoEm,
    deletadoEm: null
  });
});

console.log(`Preparo de ${recordsToInsert.length} registros concluído.`);

async function runImportPostgres() {
  if (!process.env.DATABASE_URL) {
    console.log('Postgres: DATABASE_URL ausente');
    return;
  }
  console.log('--- Iniciando Importação no PostgreSQL (Supabase) ---');
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Limpar registros e PINs do João
    await client.query("DELETE FROM pins WHERE usuario = 'João'");
    await client.query("DELETE FROM registros WHERE consultor = 'João'");

    // 2. Inserção em lotes de 100
    const queryText = `
      INSERT INTO registros (
        id, consultor, loja, tipoOperacao, dataOperacao, fundoCaixa, valorEnvelope, 
        observacoes, fotoEnvelope, status, dataRetirada, retiradoPor, confirmadoPorApp, 
        autorizadoPor, mensagemGerada, criadoEm, deletadoEm
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
      ON CONFLICT (id) DO UPDATE SET
        consultor = EXCLUDED.consultor,
        loja = EXCLUDED.loja,
        tipoOperacao = EXCLUDED.tipoOperacao,
        dataOperacao = EXCLUDED.dataOperacao,
        fundoCaixa = EXCLUDED.fundoCaixa,
        valorEnvelope = EXCLUDED.valorEnvelope,
        observacoes = EXCLUDED.observacoes,
        status = EXCLUDED.status;
    `;

    for (let i = 0; i < recordsToInsert.length; i++) {
      const r = recordsToInsert[i];
      await client.query(queryText, [
        r.id, r.consultor, r.loja, r.tipoOperacao, r.dataOperacao, r.fundoCaixa, r.valorEnvelope,
        r.observacoes, r.fotoEnvelope, r.status, r.dataRetirada, r.retiradoPor, r.confirmadoPorApp,
        r.autorizadoPor, r.mensagemGerada, r.criadoEm, r.deletadoEm
      ]);
    }

    await client.query('COMMIT');
    const resCount = await client.query('SELECT COUNT(*) FROM registros WHERE deletadoEm IS NULL');
    console.log(`PostgreSQL: Importação finalizada com sucesso. Total de registros ativos: ${resCount.rows[0].count}`);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Erro no PostgreSQL:', err);
  } finally {
    client.release();
    await pool.end();
  }
}

function runImportSqlite() {
  return new Promise((resolve, reject) => {
    console.log('--- Iniciando Importação no SQLite Local ---');
    const dbPath = path.join(__dirname, '..', 'database.db');
    const db = new sqlite3.Database(dbPath);

    db.serialize(() => {
      db.run('ALTER TABLE registros ADD COLUMN deletadoEm TEXT', [], () => {});
      db.run("DELETE FROM pins WHERE usuario = 'João'");
      db.run("DELETE FROM registros WHERE consultor = 'João'");

      const stmt = db.prepare(`
        INSERT INTO registros (
          id, consultor, loja, tipoOperacao, dataOperacao, fundoCaixa, valorEnvelope, 
          observacoes, fotoEnvelope, status, dataRetirada, retiradoPor, confirmadoPorApp, 
          autorizadoPor, mensagemGerada, criadoEm, deletadoEm
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          consultor = excluded.consultor,
          loja = excluded.loja,
          tipoOperacao = excluded.tipoOperacao,
          dataOperacao = excluded.dataOperacao,
          fundoCaixa = excluded.fundoCaixa,
          valorEnvelope = excluded.valorEnvelope,
          observacoes = excluded.observacoes,
          status = excluded.status;
      `);

      for (let i = 0; i < recordsToInsert.length; i++) {
        const r = recordsToInsert[i];
        stmt.run([
          r.id, r.consultor, r.loja, r.tipoOperacao, r.dataOperacao, r.fundoCaixa, r.valorEnvelope,
          r.observacoes, r.fotoEnvelope, r.status, r.dataRetirada, r.retiradoPor, r.confirmadoPorApp,
          r.autorizadoPor, r.mensagemGerada, r.criadoEm, r.deletadoEm
        ]);
      }

      stmt.finalize((err) => {
        if (err) {
          console.error('SQLite Error:', err);
          db.close();
          return reject(err);
        }
        db.get('SELECT COUNT(*) as count FROM registros WHERE deletadoEm IS NULL', [], (err2, row) => {
          if (!err2) {
            console.log(`SQLite: Importação finalizada com sucesso. Total de registros ativos: ${row.count}`);
          }
          db.close();
          resolve();
        });
      });
    });
  });
}

async function main() {
  await runImportPostgres();
  await runImportSqlite();
  console.log('=== PROCESSAMENTO COMPLETO E FINALIZADO ===');
}

main();
