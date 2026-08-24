const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { db, normalizeRow, TENANT_ZERO_ID } = require('../config/database');
const { enviarNotificacaoPush, notificacoesEventosAtivas } = require('../config/notifications');
const requireOwner = require('./middleware/requireOwner');

const BCRYPT_ROUNDS = 10;

// Sessão emitida após PIN correto (ver POST /auth/verify). 12h cobre um
// turno de trabalho inteiro sem forçar login de novo no meio do dia — hoje
// não existe token nenhum, então qualquer TTL é uma melhoria de segurança.
const SESSAO_TTL_MS = 12 * 60 * 60 * 1000;

function organizationIdDaRequisicao(req) {
  return (req.tenant && req.tenant.organizationId) || TENANT_ZERO_ID;
}

function emitirSessao(organizationId, usuario, cb) {
  db.get('SELECT role FROM colaboradores WHERE organizationId = ? AND nome = ?', [organizationId, usuario], (err, row) => {
    if (err || !row) return cb(null);
    const token = crypto.randomUUID();
    const agora = new Date();
    const expiraEm = new Date(agora.getTime() + SESSAO_TTL_MS).toISOString();
    db.run(
      'INSERT INTO sessions (token, organizationId, colaboradorNome, role, criadoEm, expiraEm) VALUES (?, ?, ?, ?, ?, ?)',
      [token, organizationId, usuario, row.role, agora.toISOString(), expiraEm],
      (err2) => {
        if (err2) return cb(null);
        cb({ token, role: row.role, organizationId, expiraEm });
      }
    );
  });
}

// 0. Obter logs (apenas Owners e Alexandra)
router.get('/logs', (req, res) => {
  const { usuario } = req.query;
  const userLower = (usuario || '').trim().toLowerCase();
  if (userLower !== 'bruno' && userLower !== 'isabella' && userLower !== 'alexandra') {
    return res.status(403).json({ error: 'Acesso negado. Sem permissão para ver os logs.' });
  }
  db.all('SELECT * FROM logs_auditoria ORDER BY data DESC LIMIT 100', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    const normalized = (rows || []).map(normalizeRow);
    res.json(normalized);
  });
});

// 1. Obter todas as configurações
router.get('/config', (req, res) => {
  db.all('SELECT * FROM configuracoes', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    const config = {};
    rows.forEach(r => config[r.chave] = r.valor);
    res.json(config);
  });
});

// Salvar configuração
router.post('/config', (req, res) => {
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
router.get('/vapidPublicKey', (req, res) => {
  res.send(global.vapidPublicKey);
});

router.post('/subscribe', (req, res) => {
  const { subscription, usuario } = req.body;
  const criadoEm = new Date().toISOString();

  if (!subscription || !subscription.endpoint) {
    return res.status(400).json({ error: 'Inscrição inválida' });
  }

  // Grava sempre em minúsculas: o envio de push filtra por usuário
  // (config/notifications.js) comparando contra uma lista já normalizada
  // para minúsculas — gravar em outro case aqui faria essa comparação usar
  // LOWER(usuario) no SQL, o que invalida qualquer índice simples na coluna.
  const usuarioNormalizado = usuario ? String(usuario).trim().toLowerCase() : usuario;

  db.run(
    `INSERT INTO push_subscriptions (endpoint, keys_p256dh, keys_auth, usuario, criadoEm) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(endpoint) DO UPDATE SET
       keys_p256dh = excluded.keys_p256dh,
       keys_auth = excluded.keys_auth,
       usuario = excluded.usuario,
       criadoEm = excluded.criadoEm`,
    [subscription.endpoint, subscription.keys.p256dh, subscription.keys.auth, usuarioNormalizado, criadoEm],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.status(201).json({ success: true });
    }
  );
});

// 2. Obter PINs (retorna apenas quais usuários têm PIN — NUNCA retorna os PINs reais)
router.get('/pins', (req, res) => {
  const organizationId = organizationIdDaRequisicao(req);
  db.all('SELECT usuario FROM pins WHERE organizationId = ?', [organizationId], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    const pins = {};
    (rows || []).forEach(r => pins[r.usuario] = '****');
    res.json(pins);
  });
});

const verifyAttempts = new Map();

function checkVerifyRateLimit(key) {
  const now = Date.now();
  const entry = verifyAttempts.get(key);
  if (!entry || now > entry.resetAt) {
    verifyAttempts.set(key, { count: 1, resetAt: now + 60000 });
    return true;
  }
  if (entry.count >= 10) {
    return false;
  }
  entry.count += 1;
  return true;
}

// Verificar PIN (autenticação segura — compara hash) e, em caso de sucesso,
// emitir um token de sessão escopado à organização (ver emitirSessao acima).
// O token é adicional: o frontend atual ainda não o envia de volta (isso é
// Fase 2), então a resposta {valid, hasPin} de antes continua igual — só
// ganha os campos novos (token/role/organizationId) por cima.
//
// organizationId no corpo (opcional): login é o ÚNICO lugar em que o corpo
// pode dizer "qual organização" — antes de autenticar não existe sessão que
// resolva isso sozinha (ver resolveTenantSession, modo "soft"). Nenhuma
// outra rota deve aceitar organizationId do cliente; todas as demais só leem
// req.tenant.organizationId, resolvido do token validado no banco.
router.post('/auth/verify', async (req, res) => {
  const { usuario, pin } = req.body;
  let organizationId = organizationIdDaRequisicao(req);
  if (req.body.organizationId && !(req.tenant && req.tenant.viaSessao)) {
    const org = await new Promise(resolve => {
      db.get('SELECT id FROM organizations WHERE id = ?', [req.body.organizationId], (err, row) => resolve(err ? null : row));
    });
    if (org) organizationId = org.id;
  }
  if (!usuario || !pin) return res.status(400).json({ valid: false, error: 'Usuário e PIN são obrigatórios.' });

  const clientKey = `${req.ip}_${organizationId}_${String(usuario).trim().toLowerCase()}`;
  if (!checkVerifyRateLimit(clientKey)) {
    return res.status(429).json({ valid: false, error: 'Muitas tentativas de login. Aguarde 1 minuto.' });
  }

  db.get('SELECT pin FROM pins WHERE organizationId = ? AND usuario = ?', [organizationId, usuario], (err, row) => {
    if (err) return res.status(500).json({ valid: false, error: err.message });
    if (!row) return res.json({ valid: false, hasPin: false });

    const responderComSessao = (match) => {
      if (!match) return res.json({ valid: false, hasPin: true });
      emitirSessao(organizationId, usuario, (sessao) => {
        res.json({
          valid: true,
          hasPin: true,
          ...(sessao ? { token: sessao.token, role: sessao.role, organizationId: sessao.organizationId, expiraEm: sessao.expiraEm } : {})
        });
      });
    };

    // Suporte a PINs antigos (texto puro) e novos (hash bcrypt)
    if (row.pin.startsWith('$2a$') || row.pin.startsWith('$2b$')) {
      // PIN já é hash bcrypt
      bcrypt.compare(pin, row.pin, (err2, match) => {
        if (err2) return res.status(500).json({ valid: false, error: err2.message });
        responderComSessao(match);
      });
    } else {
      // PIN antigo em texto puro — verifica e migra para hash
      const match = (pin === row.pin);
      if (match) {
        bcrypt.hash(pin, BCRYPT_ROUNDS, (hashErr, hash) => {
          if (!hashErr) {
            db.run('UPDATE pins SET pin = ? WHERE organizationId = ? AND usuario = ?', [hash, organizationId, usuario]);
          }
        });
      }
      responderComSessao(match);
    }
  });
});

// Criar/atualizar PIN (salva com hash bcrypt)
router.post('/pins', async (req, res) => {
  const { usuario, pin } = req.body;
  const organizationId = organizationIdDaRequisicao(req);
  try {
    const hash = await bcrypt.hash(pin, BCRYPT_ROUNDS);
    db.run(
      'INSERT INTO pins (usuario, pin, organizationId) VALUES (?, ?, ?) ON CONFLICT(organizationId, usuario) DO UPDATE SET pin = ?',
      [usuario, hash, organizationId, hash],
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
router.delete('/pins/:usuario', (req, res) => {
  const { usuario } = req.params;
  const organizationId = organizationIdDaRequisicao(req);
  db.run('DELETE FROM pins WHERE organizationId = ? AND usuario = ?', [organizationId, usuario], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true });
  });
});

// --- Endpoints de Colaboradores ---
router.get('/colaboradores', (req, res) => {
  const organizationId = organizationIdDaRequisicao(req);
  db.all('SELECT * FROM colaboradores WHERE organizationId = ? ORDER BY nome ASC', [organizationId], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json((rows || []).map(normalizeRow));
  });
});

router.post('/colaboradores', (req, res) => {
  const { nome, role, unidade, cpf, dataNascimento, telefone, dataAdmissao } = req.body;
  const organizationId = organizationIdDaRequisicao(req);
  if (!nome || !role) {
    return res.status(400).json({ error: 'Nome e Perfil (role) são obrigatórios.' });
  }
  const nomeTrim = nome.trim();
  const criadoEm = new Date().toISOString();

  db.run(
    `INSERT INTO colaboradores (nome, role, unidade, cpf, dataNascimento, telefone, dataAdmissao, criadoEm, organizationId)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(organizationId, nome) DO UPDATE SET
       role = excluded.role,
       unidade = excluded.unidade,
       cpf = excluded.cpf,
       dataNascimento = excluded.dataNascimento,
       telefone = excluded.telefone,
       dataAdmissao = excluded.dataAdmissao`,
    [nomeTrim, role, unidade || null, cpf || null, dataNascimento || null, telefone || null, dataAdmissao || null, criadoEm, organizationId],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true, nome: nomeTrim, role });
    }
  );
});

// Redefinição excepcional de biometria — apenas Admin/Owner. Limpa o
// embedding cadastrado e o histórico de tentativas/bloqueio, liberando o
// colaborador para um novo self-enrollment do zero.
router.post('/colaboradores/:nome/reset-biometria', requireOwner, (req, res) => {
  const { nome } = req.params;

  db.run('UPDATE colaboradores SET hasBiometricEnrolled = 0 WHERE nome = ?', [nome], (err) => {
    if (err) return res.status(500).json({ error: err.message });
    db.run('DELETE FROM ponto_biometria WHERE usuario = ?', [nome], (err2) => {
      if (err2) return res.status(500).json({ error: err2.message });
      db.run('DELETE FROM biometria_tentativas WHERE usuario = ?', [nome], (err3) => {
        if (err3) return res.status(500).json({ error: err3.message });
        res.json({ success: true });
      });
    });
  });
});

// Redefinição excepcional de biometria de TODOS os colaboradores — apenas
// Admin/Owner. Mesma limpeza do reset individual, aplicada em massa.
router.post('/colaboradores/reset-biometria-todos', requireOwner, (req, res) => {
  db.run('UPDATE colaboradores SET hasBiometricEnrolled = 0', [], (err) => {
    if (err) return res.status(500).json({ error: err.message });
    db.run('DELETE FROM ponto_biometria', [], (err2) => {
      if (err2) return res.status(500).json({ error: err2.message });
      db.run('DELETE FROM biometria_tentativas', [], (err3) => {
        if (err3) return res.status(500).json({ error: err3.message });
        res.json({ success: true });
      });
    });
  });
});

router.delete('/colaboradores/:nome', (req, res) => {
  const { nome } = req.params;
  const organizationId = organizationIdDaRequisicao(req);
  if (!nome) return res.status(400).json({ error: 'Nome é obrigatório.' });

  db.run('DELETE FROM colaboradores WHERE organizationId = ? AND nome = ?', [organizationId, nome], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    // Deleta também o PIN do colaborador
    db.run('DELETE FROM pins WHERE organizationId = ? AND usuario = ?', [organizationId, nome], (errPin) => {
      if (errPin) console.error('Erro ao deletar PIN do colaborador:', errPin.message);
      res.json({ success: true });
    });
  });
});

// Notificação para a Gestão (Push + Email)
router.post('/notificar-gestao', (req, res) => {
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
  
  // A chave mestra de notificações de eventos precisa estar ativada em Configurações
  notificacoesEventosAtivas((ativas) => {
   if (!ativas) {
     console.log(`E-mail de notificação de gestão (${assunto}) ignorado: notificações de eventos estão desativadas em Configurações.`);
     return;
   }

   if (host && user && pass) {
    const EMAIL_MAP = {
      'bruno': 'brunofreitasbm@gmail.com',
      'isabella': 'isabella.vgoncalves@gmail.com',
      'alexandra': 'alexandracabral733@gmail.com'
    };

    const targetEmails = destinatarios
      .map(d => EMAIL_MAP[d.trim().toLowerCase()])
      .filter(Boolean);

    if (targetEmails.length > 0) {
      const nodemailer = require('nodemailer');
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
  });

  res.json({ success: true });
});

module.exports = router;
