const path = require('path');
const webPush = require('web-push');

const isPostgres = !!process.env.DATABASE_URL;

const camelCaseMap = {
  tipooperacao: 'tipoOperacao',
  dataoperacao: 'dataOperacao',
  fundocaixa: 'fundoCaixa',
  valorenvelope: 'valorEnvelope',
  fotoenvelope: 'fotoEnvelope',
  dataretirada: 'dataRetirada',
  retiradopor: 'retiradoPor',
  confirmadoporapp: 'confirmadoPorApp',
  autorizadopor: 'autorizadoPor',
  mensagemgerada: 'mensagemGerada',
  criadoem: 'criadoEm',
  deletadoem: 'deletadoEm',
  registroid: 'registroId'
};

function normalizeRow(row) {
  if (!row) return row;
  const newRow = {};
  for (const key of Object.keys(row)) {
    const camelKey = camelCaseMap[key] || key;
    newRow[camelKey] = row[key];
  }
  if (newRow.fundoCaixa !== undefined && newRow.fundoCaixa !== null) {
    newRow.fundoCaixa = Number(newRow.fundoCaixa);
  }
  if (newRow.valorEnvelope !== undefined && newRow.valorEnvelope !== null) {
    newRow.valorEnvelope = Number(newRow.valorEnvelope);
  }
  return newRow;
}

function convertPlaceholder(sql) {
  let index = 1;
  return sql.replace(/\?/g, () => `$${index++}`);
}

function normalizeArgs(params, cb) {
  if (typeof params === 'function') {
    return { actualParams: [], actualCb: params };
  }
  return { actualParams: params || [], actualCb: cb };
}

let db;

if (isPostgres) {
  console.log('Iniciando conexão com banco de dados PostgreSQL (Supabase)...');
  const { Pool } = require('pg');
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
      rejectUnauthorized: false
    }
  });

  db = {
    all: (sql, params, cb) => {
      const { actualParams, actualCb } = normalizeArgs(params, cb);
      const pgSql = convertPlaceholder(sql);
      pool.query(pgSql, actualParams, (err, res) => {
        if (actualCb) actualCb(err, res ? res.rows : null);
      });
    },
    run: (sql, params, cb) => {
      const { actualParams, actualCb } = normalizeArgs(params, cb);
      const pgSql = convertPlaceholder(sql);
      pool.query(pgSql, actualParams, (err, res) => {
        if (actualCb) actualCb(err);
      });
    },
    get: (sql, params, cb) => {
      const { actualParams, actualCb } = normalizeArgs(params, cb);
      const pgSql = convertPlaceholder(sql);
      pool.query(pgSql, actualParams, (err, res) => {
        if (actualCb) actualCb(err, res && res.rows ? res.rows[0] : null);
      });
    }
  };
} else {
  console.log('Iniciando conexão com banco de dados SQLite...');
  const sqlite3 = require('sqlite3').verbose();
  const dbPath = path.join(__dirname, '..', 'database.db');
  const sqliteDb = new sqlite3.Database(dbPath, (err) => {
    if (err) {
      console.error('Erro ao conectar ao banco de dados SQLite:', err.message);
    } else {
      console.log('Conectado ao banco de dados SQLite.');
    }
  });

  db = {
    all: (sql, params, cb) => {
      const { actualParams, actualCb } = normalizeArgs(params, cb);
      sqliteDb.all(sql, actualParams, actualCb);
    },
    run: (sql, params, cb) => {
      const { actualParams, actualCb } = normalizeArgs(params, cb);
      sqliteDb.run(sql, actualParams, actualCb);
    },
    get: (sql, params, cb) => {
      const { actualParams, actualCb } = normalizeArgs(params, cb);
      sqliteDb.get(sql, actualParams, actualCb);
    }
  };
}

function dbAllAsync(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err); else resolve(rows || []);
    });
  });
}

function dbGetAsync(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err); else resolve(row);
    });
  });
}

function dbRunAsync(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, (err) => {
      if (err) reject(err); else resolve();
    });
  });
}

function initDb(onSuccess) {
  const checkSql = isPostgres 
    ? "SELECT column_name FROM information_schema.columns WHERE table_name = 'nfs' AND column_name = 'id'"
    : "PRAGMA table_info(nfs)";

  db.all(checkSql, [], (err, rows) => {
    let hasId = false;
    if (isPostgres) {
      hasId = rows && rows.length > 0;
    } else {
      hasId = rows && rows.some(r => r.name === 'id');
    }

    const startInitialization = () => {
      const initQueries = [
        `CREATE TABLE IF NOT EXISTS configuracoes (
          chave TEXT PRIMARY KEY,
          valor TEXT
        )`,
        `CREATE TABLE IF NOT EXISTS pins (
          usuario TEXT PRIMARY KEY,
          pin TEXT
        )`,
        `CREATE TABLE IF NOT EXISTS registros (
          id TEXT PRIMARY KEY,
          consultor TEXT,
          loja TEXT,
          tipoOperacao TEXT,
          dataOperacao TEXT,
          fundoCaixa REAL,
          valorEnvelope REAL,
          observacoes TEXT,
          fotoEnvelope TEXT,
          status TEXT,
          dataRetirada TEXT,
          retiradoPor TEXT,
          confirmadoPorApp TEXT,
          autorizadoPor TEXT,
          mensagemGerada INTEGER DEFAULT 0,
          criadoEm TEXT,
          deletadoEm TEXT
        )`,
        `CREATE TABLE IF NOT EXISTS registros_fa (
          id TEXT PRIMARY KEY,
          consultor TEXT,
          loja TEXT,
          tipoOperacao TEXT,
          dataOperacao TEXT,
          fundoCaixa REAL,
          valorEnvelope REAL,
          observacoes TEXT,
          fotoEnvelope TEXT,
          status TEXT,
          dataRetirada TEXT,
          retiradoPor TEXT,
          confirmadoPorApp TEXT,
          autorizadoPor TEXT,
          mensagemGerada INTEGER DEFAULT 0,
          criadoEm TEXT,
          deletadoEm TEXT
        )`,
        `CREATE TABLE IF NOT EXISTS logs_auditoria (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          registroId TEXT,
          acao TEXT,
          descricao TEXT,
          usuario TEXT,
          data TEXT
        )`,
        `CREATE TABLE IF NOT EXISTS push_subscriptions (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          endpoint TEXT NOT NULL,
          keys_p256dh TEXT NOT NULL,
          keys_auth TEXT NOT NULL,
          usuario TEXT,
          criadoEm TEXT
        )`,
        `CREATE TABLE IF NOT EXISTS colaboradores (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          nome TEXT UNIQUE NOT NULL,
          role TEXT NOT NULL,
          criadoEm TEXT
        )`,
        `CREATE TABLE IF NOT EXISTS nfs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          numero TEXT,
          info TEXT,
          products TEXT,
          criadoEm TEXT
        )`,
        `CREATE TABLE IF NOT EXISTS boletos (
          id TEXT PRIMARY KEY,
          documento TEXT,
          docFaturamento TEXT,
          parcela TEXT,
          loja TEXT,
          descricao TEXT,
          vencimento TEXT,
          valor REAL,
          status TEXT,
          pagoEm TEXT,
          criadoEm TEXT
        )`,
        `CREATE TABLE IF NOT EXISTS ponto_registros (
          id TEXT PRIMARY KEY,
          usuario TEXT NOT NULL,
          timestamp TEXT NOT NULL,
          tipo TEXT NOT NULL,
          gps TEXT,
          accuracy REAL,
          photo TEXT,
          hash TEXT,
          audit_deviation REAL,
          criadoEm TEXT
        )`,
        `CREATE TABLE IF NOT EXISTS ponto_ajustes (
          id TEXT PRIMARY KEY,
          usuario TEXT NOT NULL,
          data TEXT NOT NULL,
          tipo TEXT NOT NULL,
          motivo TEXT,
          comprovante TEXT,
          status TEXT,
          criadoEm TEXT
        )`,
        // DOUBLE PRECISION (não REAL): no Postgres, REAL é float4 e arredonda
        // valores monetários acima de ~7 dígitos (264634,67 viraria 264635).
        // No SQLite o nome mapeia para afinidade REAL (double de 8 bytes).
        `CREATE TABLE IF NOT EXISTS metas_vendas (
          id TEXT PRIMARY KEY,
          operacao TEXT NOT NULL,
          usuario TEXT NOT NULL,
          valor DOUBLE PRECISION NOT NULL,
          timestamp TEXT NOT NULL,
          criadoEm TEXT
        )`,
        `CREATE TABLE IF NOT EXISTS fa_bonificacao_diaria (
          id TEXT PRIMARY KEY,
          usuario TEXT NOT NULL,
          unidade TEXT,
          data TEXT NOT NULL,
          vendas30 INTEGER NOT NULL DEFAULT 0,
          vendas1h INTEGER NOT NULL DEFAULT 0,
          vendas2h INTEGER NOT NULL DEFAULT 0,
          locacoes INTEGER NOT NULL DEFAULT 0,
          criadoEm TEXT,
          UNIQUE(usuario, unidade, data)
        )`,
        `CREATE TABLE IF NOT EXISTS fa_bonificacao_regras (
          competencia TEXT PRIMARY KEY,
          ouroPercentMin DOUBLE PRECISION NOT NULL,
          ouroValor DOUBLE PRECISION NOT NULL,
          diamantePercentMin DOUBLE PRECISION NOT NULL,
          diamanteValor DOUBLE PRECISION NOT NULL,
          pixMinVendas2h INTEGER NOT NULL,
          pixValor DOUBLE PRECISION NOT NULL,
          pixDiasSemana TEXT NOT NULL,
          criadoEm TEXT
        )`,
        `CREATE TABLE IF NOT EXISTS metas_diarias_lojas (
          id TEXT PRIMARY KEY,
          loja TEXT NOT NULL,
          data TEXT NOT NULL,
          valor DOUBLE PRECISION NOT NULL,
          origem TEXT NOT NULL,
          criadoEm TEXT,
          UNIQUE(loja, data)
        )`,
        // Parque Circuito (quiosque de carrinhos) usa uma metodologia própria:
        // a meta é contagem de LOCAÇÕES por dia da semana, não % de conversão.
        // Por isso vive numa tabela separada de fa_bonificacao_regras, que
        // atende ParqueShopping e Grão Pará.
        `CREATE TABLE IF NOT EXISTS fa_regras_locacoes (
          competencia TEXT PRIMARY KEY,
          metaSegQui INTEGER NOT NULL,
          metaSexta INTEGER NOT NULL,
          metaSabado INTEGER NOT NULL,
          metaDomingo INTEGER NOT NULL,
          ticketMedio DOUBLE PRECISION NOT NULL,
          pisoMes INTEGER NOT NULL,
          metaMes INTEGER NOT NULL,
          superMetaMes INTEGER NOT NULL,
          farolVerde DOUBLE PRECISION NOT NULL,
          farolAmarelo DOUBLE PRECISION NOT NULL,
          criadoEm TEXT
        )`
      ];

      let promise = Promise.resolve();
      initQueries.forEach(query => {
        let finalQuery = query;
        if (isPostgres && query.includes('AUTOINCREMENT')) {
          finalQuery = query.replace('INTEGER PRIMARY KEY AUTOINCREMENT', 'SERIAL PRIMARY KEY');
        }
        
        promise = promise.then(() => {
          return new Promise((resolve, reject) => {
            db.run(finalQuery, [], (err2) => {
              if (err2) {
                console.error('Erro ao inicializar tabela:', err2.message);
                reject(err2);
              } else {
                resolve();
              }
            });
          });
        });
      });

      // Tenta adicionar colunas faltantes de migrações anteriores
      promise = promise.then(() => {
        return new Promise(resolve => {
          db.run('ALTER TABLE registros ADD COLUMN deletadoEm TEXT', [], () => resolve());
        });
      });

      promise = promise.then(() => {
        return new Promise(resolve => {
          db.run('ALTER TABLE registros_fa ADD COLUMN deletadoEm TEXT', [], () => resolve());
        });
      });

      promise = promise.then(() => {
        return new Promise(resolve => {
          db.run('ALTER TABLE boletos ADD COLUMN docFaturamento TEXT', [], () => resolve());
        });
      });

      promise = promise.then(() => {
        return new Promise(resolve => {
          db.run('ALTER TABLE boletos ADD COLUMN parcela TEXT', [], () => resolve());
        });
      });

      promise = promise.then(() => {
        return new Promise(resolve => {
          db.run('ALTER TABLE ponto_registros ADD COLUMN operacao TEXT', [], () => resolve());
        });
      });

      // metas_vendas: passa de "lista de vendas soltas" para "um valor
      // confirmado por intervalo de hora" (check-in com trava de 30min).
      promise = promise.then(() => {
        return new Promise(resolve => {
          db.run('ALTER TABLE metas_vendas ADD COLUMN data TEXT', [], () => resolve());
        });
      });

      promise = promise.then(() => {
        return new Promise(resolve => {
          db.run('ALTER TABLE metas_vendas ADD COLUMN horaSlot TEXT', [], () => resolve());
        });
      });

      promise = promise.then(() => {
        return new Promise(resolve => {
          db.run('CREATE UNIQUE INDEX IF NOT EXISTS idx_metas_vendas_slot ON metas_vendas(operacao, data, horaSlot)', [], (err) => {
            if (err) console.error('Erro ao criar índice único metas_vendas:', err.message);
            resolve();
          });
        });
      });

      // fa_bonificacao_diaria: passa a registrar por (colaboradora, unidade,
      // dia) e a suportar contagem de locações (metodologia do Parque Circuito).
      promise = promise.then(() => {
        return new Promise(resolve => {
          db.run('ALTER TABLE fa_bonificacao_diaria ADD COLUMN unidade TEXT', [], () => resolve());
        });
      });

      promise = promise.then(() => {
        return new Promise(resolve => {
          db.run('ALTER TABLE fa_bonificacao_diaria ADD COLUMN locacoes INTEGER DEFAULT 0', [], () => resolve());
        });
      });

      // O UNIQUE(usuario, data) antigo impediria a mesma colaboradora de lançar
      // em duas unidades no mesmo dia — troca pela chave que inclui a unidade.
      // A tabela está vazia em produção, então dropar a constraint é seguro.
      if (isPostgres) {
        promise = promise.then(() => {
          return new Promise(resolve => {
            db.run('ALTER TABLE fa_bonificacao_diaria DROP CONSTRAINT IF EXISTS fa_bonificacao_diaria_usuario_data_key', [], () => resolve());
          });
        });
      }

      promise = promise.then(() => {
        return new Promise(resolve => {
          db.run('CREATE UNIQUE INDEX IF NOT EXISTS idx_fa_bonif_diaria ON fa_bonificacao_diaria(usuario, unidade, data)', [], () => resolve());
        });
      });

      // Corrige colunas monetárias criadas como REAL (float4) no Postgres, que
      // arredondam centavos em valores grandes. No SQLite REAL já é double de
      // 8 bytes e ALTER COLUMN TYPE não existe, então só roda no Postgres.
      if (isPostgres) {
        const colunasParaDouble = [
          ['metas_diarias_lojas', 'valor'],
          ['metas_vendas', 'valor'],
          ['fa_bonificacao_regras', 'ouropercentmin'],
          ['fa_bonificacao_regras', 'ourovalor'],
          ['fa_bonificacao_regras', 'diamantepercentmin'],
          ['fa_bonificacao_regras', 'diamantevalor'],
          ['fa_bonificacao_regras', 'pixvalor']
        ];
        colunasParaDouble.forEach(([tabela, coluna]) => {
          promise = promise.then(() => {
            return new Promise(resolve => {
              db.run(`ALTER TABLE ${tabela} ALTER COLUMN ${coluna} TYPE DOUBLE PRECISION`, [], () => resolve());
            });
          });
        });
      }

      promise = promise.then(() => {
        return new Promise(resolve => {
          db.get('SELECT COUNT(*) as count FROM colaboradores', [], (err3, row) => {
            const defaultUsers = [
              { nome: "Ana Júlia", role: "consultora" },
              { nome: "Vitória", role: "consultora" },
              { nome: "Débora", role: "consultora" },
              { nome: "Alexandra", role: "consultora_dashboard" },
              { nome: "LiderOP", role: "consultora_dashboard" },
              { nome: "Janine", role: "consultora" },
              { nome: "Estheffany", role: "consultora" },
              { nome: "Sabrina", role: "consultora" },
              { nome: "Alice", role: "consultora_fa" },
              { nome: "Alessandra", role: "consultora_fa" },
              { nome: "Isabella", role: "owner" },
              { nome: "Bruno", role: "owner" }
            ];
            const agora = new Date().toISOString();
            let inserts = defaultUsers.map(u => {
              return new Promise(res => {
                db.run(
                  'INSERT INTO colaboradores (nome, role, criadoEm) VALUES (?, ?, ?) ON CONFLICT(nome) DO NOTHING',
                  [u.nome, u.role, agora],
                  () => res()
                );
              });
            });
            Promise.all(inserts).then(() => resolve());
          });
        });
      });

      promise.then(() => {
        console.log('Banco de dados inicializado com sucesso.');
        
        // Inicializar VAPID keys para Web Push
        db.get('SELECT valor FROM configuracoes WHERE chave = ?', ['vapid_keys'], (err3, row) => {
          let vapidKeys;
          if (!err3 && row && row.valor) {
            vapidKeys = JSON.parse(row.valor);
          } else {
            vapidKeys = webPush.generateVAPIDKeys();
            db.run('INSERT INTO configuracoes (chave, valor) VALUES (?, ?) ON CONFLICT(chave) DO UPDATE SET valor = ?', ['vapid_keys', JSON.stringify(vapidKeys), JSON.stringify(vapidKeys)]);
          }
          webPush.setVapidDetails('mailto:brunofreitasbm@gmail.com', vapidKeys.publicKey, vapidKeys.privateKey);
          global.vapidPublicKey = vapidKeys.publicKey;
          console.log('Web Push VAPID keys configuradas.');
          if (onSuccess) onSuccess();
        });
      }).catch((err3) => {
        console.error('Erro na inicialização do banco de dados:', err3);
      });
    };

    if (!hasId && rows && rows.length > 0) {
      console.log("Migrando tabela nfs para suportar múltiplos registros com o mesmo número...");
      db.all("SELECT * FROM nfs", [], (err2, data) => {
        if (err2) return startInitialization();
        db.run("DROP TABLE nfs", [], (err3) => {
          if (err3) return startInitialization();
          const createSql = isPostgres
            ? `CREATE TABLE nfs (
                id SERIAL PRIMARY KEY,
                numero TEXT,
                info TEXT,
                products TEXT,
                criadoEm TEXT
              )`
            : `CREATE TABLE nfs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                numero TEXT,
                info TEXT,
                products TEXT,
                criadoEm TEXT
              )`;
          db.run(createSql, [], (err4) => {
            if (err4) return startInitialization();
            let insPromise = Promise.resolve();
            (data || []).forEach(row => {
              insPromise = insPromise.then(() => {
                return new Promise((resolve) => {
                  db.run(
                     "INSERT INTO nfs (numero, info, products, criadoEm) VALUES (?, ?, ?, ?)",
                     [row.numero, row.info, row.products, row.criadoEm],
                     () => resolve()
                  );
                });
              });
            });
            insPromise.then(() => {
              console.log("Migração da tabela nfs concluída com sucesso!");
              startInitialization();
            });
          });
        });
      });
    } else {
      startInitialization();
    }
  });
}

module.exports = {
  db,
  isPostgres,
  normalizeRow,
  dbAllAsync,
  dbGetAsync,
  dbRunAsync,
  initDb
};
