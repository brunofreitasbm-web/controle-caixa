require('dotenv').config();
const dns = require('node:dns');
dns.setDefaultResultOrder('ipv4first');

const express = require('express');
const cors = require('cors');
const path = require('path');
const nodemailer = require('nodemailer');

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

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: {
      user,
      pass
    }
  });

  const mailOptions = {
    from: `"Controle de Caixa Cacau Show" <${user}>`,
    to: 'brunofreitasbm@gmail.com, isabella.vgoncalves@gmail.com',
    subject: `⚠️ Alerta de Envelopes Acumulados - Loja ${loja}`,
    text: `Olá Bruno e Isabella,\n\nO limite de R$ 1.000,00 em envelopes em trânsito/pendentes foi atingido ou ultrapassado na loja: ${loja}.\n\nDetalhes:\n- Novo envelope registrado por: ${consultor}\n- Valor do novo envelope: R$ ${novoValor.toFixed(2)}\n- Valor total acumulado pendente de retirada nesta loja: R$ ${totalPendente.toFixed(2)}\n\nPor favor, providencie a retirada.\n\nAtenciosamente,\nSistema de Controle de Caixa`,
    html: `<p>Olá Bruno e Isabella,</p>
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
    `CREATE TABLE IF NOT EXISTS logs_auditoria (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      registroId TEXT,
      acao TEXT,
      descricao TEXT,
      usuario TEXT,
      data TEXT
    )`
  ];

  let promise = Promise.resolve();
  initQueries.forEach(query => {
    // Para logs_auditoria AUTOINCREMENT funciona no SQLite, mas no Postgres seria SERIAL.
    // Como a tabela logs_auditoria terá insert automático, vamos adaptar para não usar id explícito nas queries se possível.
    let finalQuery = query;
    if (isPostgres && query.includes('AUTOINCREMENT')) {
      finalQuery = query.replace('INTEGER PRIMARY KEY AUTOINCREMENT', 'SERIAL PRIMARY KEY');
    }
    
    promise = promise.then(() => {
      return new Promise((resolve, reject) => {
        db.run(finalQuery, [], (err) => {
          if (err) {
            console.error('Erro ao inicializar tabela:', err.message);
            reject(err);
          } else {
            resolve();
          }
        });
      });
    });
  });

  // Tenta adicionar a coluna deletadoEm se ela não existir
  promise = promise.then(() => {
    return new Promise(resolve => {
      db.run('ALTER TABLE registros ADD COLUMN deletadoEm TEXT', [], () => resolve());
    });
  });

  promise.then(() => {
    console.log('Banco de dados inicializado com sucesso.');
    if (process.env.NODE_ENV !== 'production' || require.main === module) {
      app.listen(PORT, () => {
        console.log(`Servidor rodando na porta ${PORT}`);
      });
    }
  }).catch((err) => {
    console.error('Erro na inicialização do banco de dados:', err);
  });
}

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

// 0. Obter logs (apenas Owners)
app.get('/api/logs', (req, res) => {
  const { usuario } = req.query;
  if (usuario !== 'Bruno' && usuario !== 'Isabella') {
    return res.status(403).json({ error: 'Acesso negado. Apenas owners podem ver os logs.' });
  }
  db.all('SELECT * FROM logs_auditoria ORDER BY data DESC LIMIT 100', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows || []);
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

// 2. Obter PINs
app.get('/api/pins', (req, res) => {
  db.all('SELECT * FROM pins', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    const pins = {};
    rows.forEach(r => pins[r.usuario] = r.pin);
    res.json(pins);
  });
});

// Criar/atualizar PIN
app.post('/api/pins', (req, res) => {
  const { usuario, pin } = req.body;
  db.run(
    'INSERT INTO pins (usuario, pin) VALUES (?, ?) ON CONFLICT(usuario) DO UPDATE SET pin = ?',
    [usuario, pin, pin],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true });
    }
  );
});

// 3. Obter todos os registros
app.get('/api/registros', (req, res) => {
  db.all('SELECT * FROM registros WHERE deletadoEm IS NULL ORDER BY dataOperacao DESC', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    // Converter boolean/integer para boolean
    const result = rows.map(r => ({
      ...r,
      mensagemGerada: !!r.mensagemGerada
    }));
    res.json(result);
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

module.exports = app;

