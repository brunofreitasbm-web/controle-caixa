const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { db, normalizeRow } = require('../config/database');
const { enviarNotificacaoPush } = require('../config/notifications');

const BCRYPT_ROUNDS = 10;

// 0. Obter logs (apenas Owners e Alexandra)
router.get('/logs', (req, res) => {
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
router.get('/pins', (req, res) => {
  db.all('SELECT usuario FROM pins', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    const pins = {};
    (rows || []).forEach(r => pins[r.usuario] = '****');
    res.json(pins);
  });
});

// Verificar PIN (autenticação segura — compara hash)
router.post('/auth/verify', (req, res) => {
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
router.post('/pins', async (req, res) => {
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
router.delete('/pins/:usuario', (req, res) => {
  const { usuario } = req.params;
  db.run('DELETE FROM pins WHERE usuario = ?', [usuario], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true });
  });
});

// --- Endpoints de Colaboradores ---
router.get('/colaboradores', (req, res) => {
  db.all('SELECT * FROM colaboradores ORDER BY nome ASC', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows || []);
  });
});

router.post('/colaboradores', (req, res) => {
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

router.delete('/colaboradores/:nome', (req, res) => {
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

  res.json({ success: true });
});

module.exports = router;
