#!/usr/bin/env node
// Importa os registros históricos da v1 (export em registros.json, na raiz do
// repositório) para o banco em uso — Postgres se DATABASE_URL estiver
// definida, senão o SQLite local (./database.db).
//
// É seguro rodar mais de uma vez: cada registro é inserido por "id" com
// ON CONFLICT/INSERT OR IGNORE, então registros já existentes não são
// duplicados nem sobrescritos.
//
// Uso:
//   DATABASE_URL=postgres://usuario:senha@host/banco node scripts/importar-registros-v1.js
//   node scripts/importar-registros-v1.js                     (usa ./database.db)

const fs = require('fs');
const path = require('path');

const ARQUIVO_ORIGEM = path.join(__dirname, '..', 'registros.json');

const COLUNAS = [
  'id', 'consultor', 'loja', 'tipoOperacao', 'dataOperacao', 'fundoCaixa', 'valorEnvelope',
  'valorFaturado', 'sangria', 'observacoes', 'fotoEnvelope', 'status', 'dataRetirada',
  'retiradoPor', 'confirmadoPorApp', 'autorizadoPor', 'mensagemGerada', 'criadoEm', 'deletadoEm',
];

function valoresDe(r) {
  return COLUNAS.map((c) => {
    if (c === 'mensagemGerada') return r.mensagemGerada ? 1 : 0;
    const v = r[c];
    return v === undefined ? null : v;
  });
}

async function importarPostgres(registros) {
  const { Pool } = require('pg');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

  const placeholders = COLUNAS.map((_, i) => `$${i + 1}`).join(', ');
  const sql = `INSERT INTO registros (${COLUNAS.join(', ')}) VALUES (${placeholders}) ON CONFLICT (id) DO NOTHING`;

  let inseridos = 0;
  let ignorados = 0;
  for (const r of registros) {
    const res = await pool.query(sql, valoresDe(r));
    if (res.rowCount > 0) inseridos++;
    else ignorados++;
  }
  await pool.end();
  return { inseridos, ignorados };
}

function importarSqlite(registros) {
  const sqlite3 = require('sqlite3').verbose();
  const db = new sqlite3.Database(path.join(__dirname, '..', 'database.db'));
  const placeholders = COLUNAS.map(() => '?').join(', ');
  const sql = `INSERT OR IGNORE INTO registros (${COLUNAS.join(', ')}) VALUES (${placeholders})`;

  let inseridos = 0;
  let ignorados = 0;
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      const stmt = db.prepare(sql);
      registros.forEach((r) => {
        stmt.run(valoresDe(r), function (err) {
          if (err) return reject(err);
          if (this.changes > 0) inseridos++;
          else ignorados++;
        });
      });
      stmt.finalize((err) => {
        db.close();
        if (err) return reject(err);
        resolve({ inseridos, ignorados });
      });
    });
  });
}

async function main() {
  if (!fs.existsSync(ARQUIVO_ORIGEM)) {
    console.error(`Arquivo não encontrado: ${ARQUIVO_ORIGEM}`);
    process.exit(1);
  }

  const registros = JSON.parse(fs.readFileSync(ARQUIVO_ORIGEM, 'utf8'));
  console.log(`Lidos ${registros.length} registro(s) de registros.json.`);

  const isPostgres = !!process.env.DATABASE_URL;
  console.log(`Destino: ${isPostgres ? 'PostgreSQL (DATABASE_URL)' : 'SQLite local (./database.db)'}`);

  const { inseridos, ignorados } = isPostgres ? await importarPostgres(registros) : await importarSqlite(registros);

  console.log(`Concluído: ${inseridos} registro(s) inserido(s), ${ignorados} já existiam (ignorados).`);
}

main().catch((err) => {
  console.error('Erro na importação:', err);
  process.exit(1);
});
