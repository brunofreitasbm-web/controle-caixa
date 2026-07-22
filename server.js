require('dotenv').config();
const dns = require('node:dns');
dns.setDefaultResultOrder('ipv4first');

const express = require('express');
const cors = require('cors');
const path = require('path');
const nodemailer = require('nodemailer');
const bcrypt = require('bcryptjs');
const webPush = require('web-push');
const BCRYPT_ROUNDS = 10;

function obterEmailsDestinatarios(notificationType, callback) {
  db.get('SELECT valor FROM configuracoes WHERE chave = ?', ['notificacoes_config'], (errConfig, rowConfig) => {
    let rules = {
      envelopes: { colab: false, lider: true, owner: true },
      inventario_inicio: { colab: false, lider: true, owner: true },
      inventario_conclusao: { colab: false, lider: true, owner: true },
      conferencia_nfe: { colab: false, lider: true, owner: true },
      divergencia_caixa: { colab: false, lider: true, owner: true }
    };
    if (!errConfig && rowConfig && rowConfig.valor) {
      try {
        rules = JSON.parse(rowConfig.valor);
      } catch (e) {}
    }

    const typeRules = rules[notificationType] || { colab: false, lider: true, owner: true };
    const enabledRoles = [];
    if (typeRules.colab) enabledRoles.push('consultora', 'consultora_fa');
    if (typeRules.lider) enabledRoles.push('consultora_dashboard');
    if (typeRules.owner) enabledRoles.push('owner');

    db.all('SELECT nome, role FROM colaboradores', [], (errColab, colabs) => {
      if (errColab || !colabs) {
        return callback([]);
      }

      const EMAIL_MAP = {
        'bruno': 'brunofreitasbm@gmail.com',
        'isabella': 'isabella.vgoncalves@gmail.com',
        'alexandra': 'alexandracabral733@gmail.com',
        'liderop': 'alexandracabral733@gmail.com'
      };

      const recipientNames = colabs
        .filter(c => enabledRoles.includes(c.role))
        .map(c => c.nome.toLowerCase());

      const targetEmails = recipientNames
        .map(name => EMAIL_MAP[name])
        .filter(Boolean);

      callback(targetEmails);
    });
  });
}

function enviarEmailNotificacao(loja, novoValor, totalPendente, consultor) {
  const host = process.env.SMTP_HOST;
  const port = parseInt(process.env.SMTP_PORT) || 465;
  const secure = process.env.SMTP_SECURE === 'true';
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    console.warn('Configuração de SMTP incompleta no arquivo .env. Notificação por e-mail não enviada.');
    return;
  }

  obterEmailsDestinatarios('envelopes', (targetEmails) => {
    if (targetEmails.length === 0) {
      console.log('Notificação de envelopes acumulados por e-mail ignorada (nenhum destinatário configurado).');
      return;
    }

    const transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: { user, pass }
    });

    const mailOptions = {
      from: `"Controle de Caixa Cacau Show" <${user}>`,
      to: targetEmails.join(', '),
      subject: `⚠️ Alerta de Envelopes Acumulados - Loja ${loja}`,
      text: `Olá,\n\nO limite de R$ 1.000,00 em envelopes em trânsito/pendentes foi atingido ou ultrapassado na loja: ${loja}.\n\nDetalhes:\n- Novo envelope registrado por: ${consultor}\n- Valor do novo envelope: R$ ${novoValor.toFixed(2)}\n- Valor total acumulado pendente de retirada nesta loja: R$ ${totalPendente.toFixed(2)}\n\nPor favor, providencie a retirada.\n\nAtenciosamente,\nSistema de Controle de Caixa`,
      html: `<p>Olá,</p>
<p>O limite de <strong>R$ 1.000,00</strong> em envelopes em trânsito/pendentes foi atingido ou ultrapassado na loja: <strong>${loja}</strong>.</p>
<h3>Detalhes:</h3>
<ul>
  <li><strong>Novo envelope registrado por:</strong> ${consultor}</li>
  <li><strong>Valor do novo envelope:</strong> R$ ${novoValor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</li>
  <li><strong>Valor total acumulado pendente de retirada nesta loja:</strong> R$ ${totalPendente.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</li>
</ul>
<p>Por favor, providencie a retirada.</p>
<br>
<p><em>Atenciosamente,<br>Sistema de Controle de Caixa</em></p>`
    };

    transporter.sendMail(mailOptions, (error, info) => {
      if (error) {
        console.error('Erro ao enviar e-mail de notificação:', error);
      } else {
        console.log('E-mail de notificação enviado com sucesso:', info.response);
      }
    });
  });
}

function enviarNotificacaoPush(title, body, targetUsers = null, notificationType = null) {
  const payload = JSON.stringify({ title, body, icon: '/icons/icon-192.png' });
  
  db.get('SELECT valor FROM configuracoes WHERE chave = ?', ['notificacoes_config'], (errConfig, rowConfig) => {
    let rules = null;
    if (!errConfig && rowConfig && rowConfig.valor) {
      try {
        rules = JSON.parse(rowConfig.valor);
      } catch (e) {}
    }

    db.all('SELECT nome, role FROM colaboradores', [], (errColab, colabs) => {
      if (errColab || !colabs) return;

      let finalTargetUsers = null;
      if (Array.isArray(targetUsers) && targetUsers.length > 0) {
        finalTargetUsers = targetUsers.map(u => u.trim().toLowerCase());
      }

      if (notificationType && rules) {
        const enabledRoles = [];
        if (rules[notificationType]?.colab) enabledRoles.push('consultora', 'consultora_fa');
        if (rules[notificationType]?.lider) enabledRoles.push('consultora_dashboard');
        if (rules[notificationType]?.owner) enabledRoles.push('owner');

        const allowedNames = colabs
          .filter(c => enabledRoles.includes(c.role))
          .map(c => c.nome.toLowerCase());

        if (finalTargetUsers) {
          finalTargetUsers = finalTargetUsers.filter(u => allowedNames.includes(u));
        } else {
          finalTargetUsers = allowedNames;
        }
      }

      let query = 'SELECT * FROM push_subscriptions';
      let params = [];
      
      if (finalTargetUsers && finalTargetUsers.length > 0) {
        const placeholders = finalTargetUsers.map(() => '?').join(',');
        query += ` WHERE LOWER(usuario) IN (${placeholders})`;
        params = finalTargetUsers;
      } else if (finalTargetUsers && finalTargetUsers.length === 0) {
        console.log(`Push notification (${title}) cancelada porque nenhum perfil tem permissão ativa.`);
        return;
      }

      db.all(query, params, (err, rows) => {
        if (err) {
          console.error('Erro ao buscar subscriptions:', err.message);
          return;
        }
        
        const promises = (rows || []).map(row => {
          const sub = {
            endpoint: row.endpoint,
            keys: {
              p256dh: row.keys_p256dh,
              auth: row.keys_auth
            }
          };
          return webPush.sendNotification(sub, payload).catch(error => {
            console.error('Erro ao enviar push para endpoint:', row.endpoint, error);
            if (error.statusCode === 404 || error.statusCode === 410) {
              console.log('Subscription expirada. Removendo do banco.');
              db.run('DELETE FROM push_subscriptions WHERE endpoint = ?', [row.endpoint]);
            }
          });
        });
        
        Promise.all(promises).then(() => {
          console.log(`Push notifications (${title}) enviadas para ${rows.length} dispositivos.`);
        });
      });
    });
  });
}

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

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json({ limit: '15mb' }));

// Servir os arquivos estáticos da webapp
app.use(express.static(path.join(__dirname, 'webapp')));

// Conexão com o Banco de Dados (SQLite localmente ou PostgreSQL em produção)
let db;
const isPostgres = !!process.env.DATABASE_URL;

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

  initDb();
} else {
  console.log('Iniciando conexão com banco de dados SQLite...');
  const sqlite3 = require('sqlite3').verbose();
  const dbPath = path.join(__dirname, 'database.db');
  const sqliteDb = new sqlite3.Database(dbPath, (err) => {
    if (err) {
      console.error('Erro ao conectar ao banco de dados SQLite:', err.message);
    } else {
      console.log('Conectado ao banco de dados SQLite.');
      initDb();
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

function initDb() {
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
          loja TEXT,
          descricao TEXT,
          vencimento TEXT,
          valor REAL,
          status TEXT,
          pagoEm TEXT,
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

      // Tenta adicionar a coluna deletadoEm se ela não existir (tabela principal)
      promise = promise.then(() => {
        return new Promise(resolve => {
          db.run('ALTER TABLE registros ADD COLUMN deletadoEm TEXT', [], () => resolve());
        });
      });

      // Tenta adicionar a coluna deletadoEm na tabela FA se ela não existir
      promise = promise.then(() => {
        return new Promise(resolve => {
          db.run('ALTER TABLE registros_fa ADD COLUMN deletadoEm TEXT', [], () => resolve());
        });
      });

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
        });

        if (require.main === module) {
          app.listen(PORT, () => {
            console.log(`Servidor rodando na porta ${PORT}`);
          });
        }
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

function registrarLog(registroId, acao, descricao, usuario) {
  const data = new Date().toISOString();
  db.run(
    'INSERT INTO logs_auditoria (registroId, acao, descricao, usuario, data) VALUES (?, ?, ?, ?, ?)',
    [registroId, acao, descricao, usuario || 'Sistema', data],
    (err) => {
      if (err) console.error('Erro ao registrar log de auditoria:', err.message);
    }
  );
}

// --- Endpoints da API ---

// 0. Obter logs (apenas Owners e Alexandra)
app.get('/api/logs', (req, res) => {
  const { usuario } = req.query;
  const userLower = (usuario || '').trim().toLowerCase();
  if (userLower !== 'bruno' && userLower !== 'isabella' && userLower !== 'alexandra' && userLower !== 'liderop') {
    return res.status(403).json({ error: 'Acesso negado. Sem permissão para ver os logs.' });
  }
  db.all('SELECT * FROM logs_auditoria ORDER BY data DESC LIMIT 100', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    const normalized = (rows || []).map(normalizeRow);
    res.json(normalized);
  });
});

// 1. Obter todas as configurações
app.get('/api/config', (req, res) => {
  db.all('SELECT * FROM configuracoes', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    const config = {};
    rows.forEach(r => config[r.chave] = r.valor);
    res.json(config);
  });
});

// Salvar configuração
app.post('/api/config', (req, res) => {
  const { chave, valor } = req.body;
  db.run(
    'INSERT INTO configuracoes (chave, valor) VALUES (?, ?) ON CONFLICT(chave) DO UPDATE SET valor = ?',
    [chave, valor, valor],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true });
    }
  );
});

// --- Push Notifications ---
app.get('/api/vapidPublicKey', (req, res) => {
  res.send(global.vapidPublicKey);
});

app.post('/api/subscribe', (req, res) => {
  const { subscription, usuario } = req.body;
  const criadoEm = new Date().toISOString();
  
  if (!subscription || !subscription.endpoint) {
    return res.status(400).json({ error: 'Inscrição inválida' });
  }

  db.run(
    'INSERT INTO push_subscriptions (endpoint, keys_p256dh, keys_auth, usuario, criadoEm) VALUES (?, ?, ?, ?, ?)',
    [subscription.endpoint, subscription.keys.p256dh, subscription.keys.auth, usuario, criadoEm],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.status(201).json({ success: true });
    }
  );
});

// 2. Obter PINs (retorna apenas quais usuários têm PIN — NUNCA retorna os PINs reais)
app.get('/api/pins', (req, res) => {
  db.all('SELECT usuario FROM pins', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    const pins = {};
    (rows || []).forEach(r => pins[r.usuario] = '****');
    res.json(pins);
  });
});

// Verificar PIN (autenticação segura — compara hash)
app.post('/api/auth/verify', (req, res) => {
  const { usuario, pin } = req.body;
  if (!usuario || !pin) return res.status(400).json({ valid: false, error: 'Usuário e PIN são obrigatórios.' });
  
  db.get('SELECT pin FROM pins WHERE usuario = ?', [usuario], (err, row) => {
    if (err) return res.status(500).json({ valid: false, error: err.message });
    if (!row) return res.json({ valid: false, hasPin: false });
    
    // Suporte a PINs antigos (texto puro) e novos (hash bcrypt)
    if (row.pin.startsWith('$2a$') || row.pin.startsWith('$2b$')) {
      // PIN já é hash bcrypt
      bcrypt.compare(pin, row.pin, (err2, match) => {
        if (err2) return res.status(500).json({ valid: false, error: err2.message });
        res.json({ valid: match, hasPin: true });
      });
    } else {
      // PIN antigo em texto puro — verifica e migra para hash
      const match = (pin === row.pin);
      if (match) {
        bcrypt.hash(pin, BCRYPT_ROUNDS, (hashErr, hash) => {
          if (!hashErr) {
            db.run('UPDATE pins SET pin = ? WHERE usuario = ?', [hash, usuario]);
          }
        });
      }
      res.json({ valid: match, hasPin: true });
    }
  });
});

// Criar/atualizar PIN (salva com hash bcrypt)
app.post('/api/pins', async (req, res) => {
  const { usuario, pin } = req.body;
  try {
    const hash = await bcrypt.hash(pin, BCRYPT_ROUNDS);
    db.run(
      'INSERT INTO pins (usuario, pin) VALUES (?, ?) ON CONFLICT(usuario) DO UPDATE SET pin = ?',
      [usuario, hash, hash],
      function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
      }
    );
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Deletar / Resetar PIN de usuário
app.delete('/api/pins/:usuario', (req, res) => {
  const { usuario } = req.params;
  db.run('DELETE FROM pins WHERE usuario = ?', [usuario], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true });
  });
});

// --- Endpoints de Colaboradores ---
app.get('/api/colaboradores', (req, res) => {
  db.all('SELECT * FROM colaboradores ORDER BY nome ASC', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows || []);
  });
});

app.post('/api/colaboradores', (req, res) => {
  const { nome, role } = req.body;
  if (!nome || !role) {
    return res.status(400).json({ error: 'Nome e Perfil (role) são obrigatórios.' });
  }
  const nomeTrim = nome.trim();
  const criadoEm = new Date().toISOString();

  db.run(
    'INSERT INTO colaboradores (nome, role, criadoEm) VALUES (?, ?, ?) ON CONFLICT(nome) DO UPDATE SET role = ?',
    [nomeTrim, role, criadoEm, role],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true, nome: nomeTrim, role });
    }
  );
});

app.delete('/api/colaboradores/:nome', (req, res) => {
  const { nome } = req.params;
  if (!nome) return res.status(400).json({ error: 'Nome é obrigatório.' });

  db.run('DELETE FROM colaboradores WHERE nome = ?', [nome], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    // Deleta também o PIN do colaborador
    db.run('DELETE FROM pins WHERE usuario = ?', [nome], (errPin) => {
      if (errPin) console.error('Erro ao deletar PIN do colaborador:', errPin.message);
      res.json({ success: true });
    });
  });
});


// Notificação de divergência de fundo de caixa (#8 Reconciliação)
app.post('/api/divergencia', (req, res) => {
  const { loja, consultor, fundoAbertura, fundoUltimoFechamento, diferenca } = req.body;
  
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!host || !user || !pass) {
    return res.json({ sent: false, reason: 'SMTP não configurado' });
  }

  obterEmailsDestinatarios('divergencia_caixa', (targetEmails) => {
    if (targetEmails.length === 0) {
      console.log('Notificação de divergência por e-mail ignorada (nenhum destinatário configurado).');
      return res.json({ sent: false, reason: 'Nenhum destinatário configurado' });
    }
    
    const transporter = nodemailer.createTransport({
      host,
      port: parseInt(process.env.SMTP_PORT) || 465,
      secure: process.env.SMTP_SECURE === 'true',
      auth: { user, pass }
    });
    
    transporter.sendMail({
      from: `"Controle de Caixa Cacau Show" <${user}>`,
      to: targetEmails.join(', '),
      subject: `⚠️ Divergência de Fundo de Caixa - Loja ${loja}`,
      html: `<p>Olá,</p>
<p>Foi detectada uma <strong>divergência no fundo de caixa</strong> na loja <strong>${loja}</strong>.</p>
<h3>Detalhes:</h3>
<ul>
  <li><strong>Consultor(a):</strong> ${consultor}</li>
  <li><strong>Fundo de caixa na abertura:</strong> R$ ${fundoAbertura.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</li>
  <li><strong>Fundo no último fechamento:</strong> R$ ${fundoUltimoFechamento.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</li>
  <li><strong>Diferença:</strong> R$ ${Math.abs(diferenca).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} (${diferenca > 0 ? 'a mais' : 'a menos'})</li>
</ul>
<p>Por favor, investigue a divergência.</p>
<p><em>Atenciosamente,<br>Sistema de Controle de Caixa</em></p>`
    }, (error) => {
      if (error) {
        console.error('Erro ao enviar e-mail de divergência:', error);
        return res.json({ sent: false, reason: error.message });
      }
      res.json({ sent: true });
    });
  });
});

// Notificação para a Gestão (Push + Email)
app.post('/api/notificar-gestao', (req, res) => {
  const { destinatarios, assunto, mensagem } = req.body;
  if (!destinatarios || !Array.isArray(destinatarios)) {
    return res.status(400).json({ error: 'Lista de destinatários é obrigatória.' });
  }

  // 1. Enviar Notificação Push para os destinatários selecionados
  enviarNotificacaoPush(assunto, mensagem, destinatarios);

  // 2. Enviar E-mail de Notificação (se SMTP estiver configurado)
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  
  if (host && user && pass) {
    const EMAIL_MAP = {
      'bruno': 'brunofreitasbm@gmail.com',
      'isabella': 'isabella.vgoncalves@gmail.com',
      'alexandra': 'alexandracabral733@gmail.com',
      'liderop': 'alexandracabral733@gmail.com'
    };

    const targetEmails = destinatarios
      .map(d => EMAIL_MAP[d.trim().toLowerCase()])
      .filter(Boolean);

    if (targetEmails.length > 0) {
      const transporter = nodemailer.createTransport({
        host,
        port: parseInt(process.env.SMTP_PORT) || 465,
        secure: process.env.SMTP_SECURE === 'true',
        auth: { user, pass }
      });

      const mailOptions = {
        from: `"Controle de Caixa Cacau Show" <${user}>`,
        to: targetEmails.join(', '),
        subject: assunto,
        text: mensagem,
        html: `<p>${mensagem.replace(/\n/g, '<br>')}</p>`
      };

      transporter.sendMail(mailOptions, (error, info) => {
        if (error) {
          console.error('Erro ao enviar e-mail de notificação de gestão:', error);
        } else {
          console.log('E-mail de notificação de gestão enviado com sucesso:', info.response);
        }
      });
    }
  }

  res.json({ success: true });
});

// 3. Obter todos os registros
app.get('/api/registros', (req, res) => {
  db.all('SELECT * FROM registros WHERE deletadoEm IS NULL ORDER BY dataOperacao DESC', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    const normalized = (rows || []).map(normalizeRow);
    // Converter boolean/integer para boolean
    const result = normalized.map(r => ({
      ...r,
      mensagemGerada: !!r.mensagemGerada
    }));
    res.json(result);
  });
});

// ==================== FACA AMIGOS ENDPOINTS ====================

// FA-1. Obter todos os registros FaçaAmigos
app.get('/api/registros-fa', (req, res) => {
  db.all('SELECT * FROM registros_fa WHERE deletadoEm IS NULL ORDER BY dataOperacao DESC', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    const normalized = (rows || []).map(normalizeRow);
    const result = normalized.map(r => ({
      ...r,
      mensagemGerada: !!r.mensagemGerada
    }));
    res.json(result);
  });
});

// FA-2. Inserir registro FaçaAmigos
app.post('/api/registros-fa', (req, res) => {
  const r = req.body;
  db.run(
    `INSERT INTO registros_fa (
      id, consultor, loja, tipoOperacao, dataOperacao, fundoCaixa, valorEnvelope,
      observacoes, fotoEnvelope, status, dataRetirada, retiradoPor, confirmadoPorApp,
      autorizadoPor, mensagemGerada, criadoEm
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      r.id, r.consultor, r.loja, r.tipoOperacao, r.dataOperacao, r.fundoCaixa, r.valorEnvelope,
      r.observacoes, r.fotoEnvelope, r.status, r.dataRetirada, r.retiradoPor, r.confirmadoPorApp,
      r.autorizadoPor, r.mensagemGerada ? 1 : 0, r.criadoEm
    ],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });

      // Envio de e-mail silencioso se for Fechamento e o acumulado for >= 1000
      if (r.tipoOperacao === 'Fechamento' && r.valorEnvelope) {
        db.get(
          `SELECT SUM(valorEnvelope) as total FROM registros_fa WHERE loja = ? AND status = 'aguardando_retirada'`,
          [r.loja],
          (sumErr, row) => {
            if (!sumErr && row && row.total >= 1000) {
              enviarEmailNotificacao(r.loja, r.valorEnvelope, row.total, r.consultor);
              enviarNotificacaoPush(
                `🚨 ${r.loja}-FaçaAmigos`,
                `R$ ${row.total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} em dinheiro, recomendo retirar!`
              );
            }
          }
        );
      }

      const usuarioLog = req.query.usuario || r.consultor || 'Desconhecido';
      registrarLog(r.id, 'CREATE_FA', `[FaçaAmigos] Registro criado: ${r.tipoOperacao} (${r.loja}) - R$ ${r.fundoCaixa}`, usuarioLog);

      res.json({ success: true, id: r.id });
    }
  );
});

// FA-3. Atualizar registro FaçaAmigos
app.put('/api/registros-fa/:id', (req, res) => {
  const { id } = req.params;
  const r = req.body;

  const fields = [];
  const values = [];

  Object.keys(r).forEach(key => {
    if (key === 'id') return;
    fields.push(`${key} = ?`);
    if (key === 'mensagemGerada') {
      values.push(r[key] ? 1 : 0);
    } else {
      values.push(r[key]);
    }
  });

  if (fields.length === 0) {
    return res.status(400).json({ error: 'Nenhum campo para atualizar' });
  }

  values.push(id);

  const sql = `UPDATE registros_fa SET ${fields.join(', ')} WHERE id = ?`;

  db.run(sql, values, function(err) {
    if (err) return res.status(500).json({ error: err.message });

    const usuarioLog = req.query.usuario || 'Desconhecido';
    registrarLog(id, 'UPDATE_FA', `[FaçaAmigos] Registro atualizado: ${Object.keys(r).join(', ')}`, usuarioLog);

    res.json({ success: true });
  });
});

// FA-4. Excluir registro FaçaAmigos (Soft delete — somente Bruno)
app.delete('/api/registros-fa/:id', (req, res) => {
  const { id } = req.params;
  const { usuario } = req.query;

  if (usuario !== 'Bruno') {
    return res.status(403).json({ error: 'Permissão negada. Somente o Bruno pode excluir registros do FaçaAmigos.' });
  }

  const agora = new Date().toISOString();
  db.run('UPDATE registros_fa SET deletadoEm = ? WHERE id = ?', [agora, id], function(err) {
    if (err) return res.status(500).json({ error: err.message });

    registrarLog(id, 'DELETE_FA', `[FaçaAmigos] Registro removido logicamente.`, usuario);

    res.json({ success: true });
  });
});

// Inserir registro
app.post('/api/registros', (req, res) => {
  const r = req.body;
  db.run(
    `INSERT INTO registros (
      id, consultor, loja, tipoOperacao, dataOperacao, fundoCaixa, valorEnvelope, 
      observacoes, fotoEnvelope, status, dataRetirada, retiradoPor, confirmadoPorApp, 
      autorizadoPor, mensagemGerada, criadoEm
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      r.id, r.consultor, r.loja, r.tipoOperacao, r.dataOperacao, r.fundoCaixa, r.valorEnvelope,
      r.observacoes, r.fotoEnvelope, r.status, r.dataRetirada, r.retiradoPor, r.confirmadoPorApp,
      r.autorizadoPor, r.mensagemGerada ? 1 : 0, r.criadoEm
    ],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      
      // Envio de e-mail silencioso se for Fechamento e o acumulado for >= 1000
      if (r.tipoOperacao === 'Fechamento' && r.valorEnvelope) {
        db.get(
          `SELECT SUM(valorEnvelope) as total FROM registros WHERE loja = ? AND status = 'aguardando_retirada'`,
          [r.loja],
          (sumErr, row) => {
            if (!sumErr && row && row.total >= 1000) {
              enviarEmailNotificacao(r.loja, r.valorEnvelope, row.total, r.consultor);
              enviarNotificacaoPush(
                `🚨 ${r.loja}-Cacau Show`,
                `R$ ${row.total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} em dinheiro, recomendo retirar!`
              );
            }
          }
        );
      }

      const usuarioLog = req.query.usuario || r.consultor || 'Desconhecido';
      registrarLog(r.id, 'CREATE', `Registro criado: ${r.tipoOperacao} (${r.loja}) - R$ ${r.fundoCaixa}`, usuarioLog);

      res.json({ success: true, id: r.id });
    }
  );
});

// Atualizar registro (ex: marcar retirada, marcar mensagem gerada)
app.put('/api/registros/:id', (req, res) => {
  const { id } = req.params;
  const r = req.body;
  
  // Construir consulta dinamicamente para os campos fornecidos
  const fields = [];
  const values = [];
  
  Object.keys(r).forEach(key => {
    if (key === 'id') return;
    fields.push(`${key} = ?`);
    if (key === 'mensagemGerada') {
      values.push(r[key] ? 1 : 0);
    } else {
      values.push(r[key]);
    }
  });
  
  if (fields.length === 0) {
    return res.status(400).json({ error: 'Nenhum campo para atualizar' });
  }
  
  values.push(id);
  
  const sql = `UPDATE registros SET ${fields.join(', ')} WHERE id = ?`;
  
  db.run(sql, values, function(err) {
    if (err) return res.status(500).json({ error: err.message });
    
    const usuarioLog = req.query.usuario || 'Desconhecido';
    registrarLog(id, 'UPDATE', `Registro atualizado: ${Object.keys(r).join(', ')}`, usuarioLog);
    
    res.json({ success: true });
  });
});

// 4. Excluir registro (Soft delete - Somente Bruno pode)
app.delete('/api/registros/:id', (req, res) => {
  const { id } = req.params;
  const { usuario } = req.query;
  
  if (usuario !== 'Bruno') {
    return res.status(403).json({ error: 'Permissão negada. Somente o Bruno pode excluir registros.' });
  }

  const agora = new Date().toISOString();
  db.run('UPDATE registros SET deletadoEm = ? WHERE id = ?', [agora, id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    
    registrarLog(id, 'DELETE', `Registro removido logicamente.`, usuario);
    
    res.json({ success: true });
  });
});

// --- NF-e Endpoints ---
app.get('/api/nfs', (req, res) => {
  db.all('SELECT * FROM nfs ORDER BY criadoEm DESC', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    try {
      const result = (rows || []).map(r => ({
        id: r.id,
        numero: r.numero,
        info: JSON.parse(r.info || '{}'),
        products: JSON.parse(r.products || '[]'),
        criadoEm: r.criadoEm
      }));
      res.json(result);
    } catch (parseErr) {
      res.status(500).json({ error: 'Erro ao processar dados de Notas Fiscais.' });
    }
  });
});

app.post('/api/nfs', (req, res) => {
  const { numero, info, products } = req.body;
  if (!numero) return res.status(400).json({ error: 'Número da NF-e é obrigatório.' });

  db.all('SELECT * FROM nfs WHERE numero = ?', [numero], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    
    // Check if there is an exact duplicate (same store and identical products list and quantities)
    const isDuplicate = (rows || []).some(row => {
      try {
        const rowInfo = JSON.parse(row.info || '{}');
        const rowProducts = JSON.parse(row.products || '[]');
        
        // 1. Compare store
        const store1 = (rowInfo.targetStore || '').toString().trim();
        const store2 = (info.targetStore || '').toString().trim();
        if (store1 !== store2) return false;
        
        // 2. Compare products and quantities
        const p1 = rowProducts || [];
        const p2 = products || [];
        if (p1.length !== p2.length) return false;
        
        const map1 = {};
        for (const item of p1) {
          const code = (item.code || '').toString().trim();
          const qty = Number(item.nfQty || 0);
          map1[code] = (map1[code] || 0) + qty;
        }
        
        const map2 = {};
        for (const item of p2) {
          const code = (item.code || '').toString().trim();
          const qty = Number(item.nfQty || 0);
          map2[code] = (map2[code] || 0) + qty;
        }
        
        const keys1 = Object.keys(map1);
        for (const key of keys1) {
          if (map1[key] !== map2[key]) return false;
        }
        
        return true;
      } catch (e) {
        return false;
      }
    });

    if (isDuplicate) {
      return res.status(409).json({ success: false, error: 'duplicated', message: 'Esta NF-e já foi importada anteriormente.' });
    }

    const criadoEm = new Date().toISOString();
    db.run(
      'INSERT INTO nfs (numero, info, products, criadoEm) VALUES (?, ?, ?, ?)',
      [numero, JSON.stringify(info || {}), JSON.stringify(products || []), criadoEm],
      function(err2) {
        if (err2) return res.status(500).json({ error: err2.message });
        res.status(201).json({ success: true, numero });
      }
    );
  });
});

app.put('/api/nfs/:numero', (req, res) => {
  const { numero } = req.params;
  const { info, products } = req.body;

  db.all('SELECT * FROM nfs WHERE numero = ?', [numero], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!rows || rows.length === 0) {
      return res.status(404).json({ error: 'Nota Fiscal não encontrada.' });
    }

    // Find the row that matches the store
    const incomingStore = info && info.targetStore ? info.targetStore.toString().trim() : '';
    let targetRow = null;
    
    for (const r of rows) {
      try {
        const rowInfo = JSON.parse(r.info || '{}');
        const rowStore = rowInfo.targetStore ? rowInfo.targetStore.toString().trim() : '';
        if (rowStore === incomingStore) {
          targetRow = r;
          break;
        }
      } catch (e) {}
    }

    if (!targetRow && rows.length === 1) {
      targetRow = rows[0];
    }

    if (!targetRow) {
      return res.status(404).json({ error: 'Nota Fiscal correspondente a esta loja não encontrada.' });
    }

    const fields = [];
    const values = [];

    if (info) {
      fields.push('info = ?');
      values.push(JSON.stringify(info));
    }
    if (products) {
      fields.push('products = ?');
      values.push(JSON.stringify(products));
    }

    if (fields.length === 0) {
      return res.status(400).json({ error: 'Nenhum campo para atualizar' });
    }

    if (targetRow.id !== undefined) {
      values.push(targetRow.id);
      const sql = `UPDATE nfs SET ${fields.join(', ')} WHERE id = ?`;
      db.run(sql, values, function(err2) {
        if (err2) return res.status(500).json({ error: err2.message });
        res.json({ success: true });
      });
    } else {
      values.push(numero);
      const sql = `UPDATE nfs SET ${fields.join(', ')} WHERE numero = ?`;
      db.run(sql, values, function(err2) {
        if (err2) return res.status(500).json({ error: err2.message });
        res.json({ success: true });
      });
    }
  });
});

// --- Endpoints de Boletos ---
app.get('/api/boletos', (req, res) => {
  db.all('SELECT * FROM boletos ORDER BY criadoEm DESC', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows || []);
  });
});

app.post('/api/boletos/import', (req, res) => {
  const { boletos } = req.body;
  if (!Array.isArray(boletos)) {
    return res.status(400).json({ error: 'Lista de boletos inválida.' });
  }
  const agora = new Date().toISOString();

  let promises = boletos.map(b => {
    return new Promise((resolve) => {
      // Verificar duplicados combinando loja, documento, descricao, vencimento e valor
      db.get(
        'SELECT id FROM boletos WHERE loja = ? AND documento = ? AND descricao = ? AND vencimento = ? AND valor = ?',
        [b.loja, b.documento, b.descricao, b.vencimento, b.valor],
        (err, row) => {
          if (err || row) {
            resolve({ status: 'ignored', boleto: b });
          } else {
            db.run(
              'INSERT INTO boletos (id, documento, loja, descricao, vencimento, valor, status, criadoEm) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
              [b.id, b.documento, b.loja, b.descricao, b.vencimento, b.valor, b.status || 'Aberto', agora],
              (err2) => {
                if (err2) {
                  resolve({ status: 'error', error: err2.message, boleto: b });
                } else {
                  resolve({ status: 'inserted', boleto: b });
                }
              }
            );
          }
        }
      );
    });
  });

  Promise.all(promises).then(results => {
    const inserted = results.filter(r => r.status === 'inserted').map(r => r.boleto);
    const ignored = results.filter(r => r.status === 'ignored').map(r => r.boleto);
    res.json({
      success: true,
      insertedCount: inserted.length,
      ignoredCount: ignored.length
    });
  }).catch(err => {
    res.status(500).json({ error: err.message });
  });
});

app.post('/api/boletos/pago', (req, res) => {
  const { id } = req.body;
  const pagoEm = new Date().toISOString();
  db.run('UPDATE boletos SET status = ?, pagoEm = ? WHERE id = ?', ['Pago', pagoEm, id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true });
  });
});

app.delete('/api/boletos/:id', (req, res) => {
  const { id } = req.params;
  db.run('DELETE FROM boletos WHERE id = ?', [id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true });
  });
});

module.exports = app;

