const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { db, normalizeRow } = require('../config/database');
const { enviarNotificacaoPush, notificacoesEventosAtivas } = require('../config/notifications');
const requireOwner = require('./middleware/requireOwner');
const { criarSessao, lerSessao, exigirSessao, exigirSessaoTransicao } = require('./middleware/sessao');
const { publish } = require('../config/realtime');

const BCRYPT_ROUNDS = 10;

// 0. Obter logs (apenas Owners e Alexandra)
router.get('/logs', exigirSessaoTransicao(), (req, res) => {
  // Com sessão, quem pede é quem o servidor diz que é, não o nome que veio na URL.
  const { usuario } = req.query;
  const userLower = (req.sessao ? req.sessao.usuario : (usuario || '')).trim().toLowerCase();
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
router.post('/config', exigirSessaoTransicao(), (req, res) => {
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
  db.all('SELECT usuario FROM pins', [], (err, rows) => {
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

// PIN certo: devolve também o token de sessão do servidor (campo novo; quem não
// o conhece só lê valid/hasPin, como antes). O PIN em si não é tocado aqui.
function responderVerify(res, usuario, match) {
  if (!match) return res.json({ valid: false, hasPin: true });
  // Desligado pelo Hub: o PIN continua guardado, só o acesso fica bloqueado. A resposta só
  // diz "inativo" a quem acertou o PIN, para não revelar quem está desligado a quem chuta.
  db.get('SELECT ativo FROM colaboradores WHERE nome = ?', [String(usuario).trim()], (errAtivo, colab) => {
    if (!errAtivo && colab && colab.ativo !== null && colab.ativo !== undefined && Number(colab.ativo) === 0) {
      return res.json({ valid: false, hasPin: true, inativo: true });
    }
    criarSessao(String(usuario).trim(), (err, token) => {
      // Falha ao gravar a sessão não pode impedir o login por PIN.
      if (err) console.error('Erro ao criar sessão:', err.message);
      res.json({ valid: true, hasPin: true, token: token || null });
    });
  });
}

// Verificar PIN (autenticação segura — compara hash)
router.post('/auth/verify', (req, res) => {
  const { usuario, pin } = req.body;
  if (!usuario || !pin) return res.status(400).json({ valid: false, error: 'Usuário e PIN são obrigatórios.' });

  const clientKey = `${req.ip}_${String(usuario).trim().toLowerCase()}`;
  if (!checkVerifyRateLimit(clientKey)) {
    return res.status(429).json({ valid: false, error: 'Muitas tentativas de login. Aguarde 1 minuto.' });
  }

  db.get('SELECT pin FROM pins WHERE usuario = ?', [usuario], (err, row) => {
    if (err) return res.status(500).json({ valid: false, error: err.message });
    if (!row) return res.json({ valid: false, hasPin: false });

    // Suporte a PINs antigos (texto puro) e novos (hash bcrypt)
    if (row.pin.startsWith('$2a$') || row.pin.startsWith('$2b$')) {
      // PIN já é hash bcrypt
      bcrypt.compare(pin, row.pin, (err2, match) => {
        if (err2) return res.status(500).json({ valid: false, error: err2.message });
        responderVerify(res, usuario, match);
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
      responderVerify(res, usuario, match);
    }
  });
});

// Entrada pelo Hub de Gestão (gestao.institutofacaamigos.com.br).
// O hub (Edge Function gestao-hub) assina com HMAC-SHA256 um ticket
// base64url(payload).base64url(assinatura), payload = { u, aud, exp, jti },
// válido por 60s e de uso único. O segredo compartilhado fica em
// GESTAO_SSO_SECRET_CACAU (Vercel daqui + secrets do Supabase). Só usuários
// com papel owner no banco entram por aqui.
function base64urlDecode(s) {
  return Buffer.from(String(s).replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}

router.post('/auth/sso', (req, res) => {
  const secret = process.env.GESTAO_SSO_SECRET_CACAU;
  if (!secret) return res.status(503).json({ error: 'Entrada pelo Hub de Gestão não configurada.' });

  const ticket = typeof req.body?.ticket === 'string' ? req.body.ticket : '';
  const [payloadB64, sigB64] = ticket.split('.');
  if (!payloadB64 || !sigB64) return res.status(400).json({ error: 'Ticket inválido.' });

  const esperado = crypto.createHmac('sha256', secret).update(payloadB64).digest();
  const recebido = base64urlDecode(sigB64);
  if (recebido.length !== esperado.length || !crypto.timingSafeEqual(recebido, esperado)) {
    return res.status(401).json({ error: 'Ticket inválido.' });
  }

  let payload;
  try {
    payload = JSON.parse(base64urlDecode(payloadB64).toString('utf8'));
  } catch {
    return res.status(400).json({ error: 'Ticket inválido.' });
  }
  const agora = Math.floor(Date.now() / 1000);
  if (payload.aud !== 'hub-operacoes' || typeof payload.u !== 'string' || typeof payload.jti !== 'string'
      || typeof payload.exp !== 'number' || payload.exp < agora) {
    return res.status(401).json({ error: 'Ticket expirado ou inválido.' });
  }

  db.get('SELECT nome, role, ativo FROM colaboradores WHERE LOWER(nome) = LOWER(?)', [payload.u.trim()], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!row) return res.status(403).json({ error: 'Acesso negado: usuário não cadastrado no Cacau Show.' });
    if (row.ativo !== null && row.ativo !== undefined && Number(row.ativo) === 0) {
      return res.status(403).json({ error: 'Acesso negado: este usuário está desativado no Cacau Show.' });
    }

    // O nível vem do Hub (n). O papel dentro do Cacau continua sendo o do cadastro em
    // colaboradores: o ticket só decide se a pessoa pode entrar, nunca a eleva.
    //   owner  -> exige nível admin (ticket sem n é de um Hub antigo, que só emitia p/ owner);
    //   outros -> exigem operar ou admin; "ver" ainda não existe no Cacau, então não entra.
    const nivel = typeof payload.n === 'string' ? payload.n : null;
    if (row.role === 'owner') {
      if (nivel && nivel !== 'admin') {
        return res.status(403).json({ error: 'Acesso negado: o Cacau Show exige nível admin para este usuário.' });
      }
    } else if (nivel !== 'operar' && nivel !== 'admin') {
      return res.status(403).json({ error: 'Acesso negado: o Cacau Show ainda não tem acesso só de leitura. Use o nível operar.' });
    }

    // Queima o jti: se a linha já existia, o ticket já foi usado.
    db.all(
      'INSERT INTO sso_tickets_usados (jti, usuario, usadoEm) VALUES (?, ?, ?) ON CONFLICT (jti) DO NOTHING RETURNING jti',
      [payload.jti, row.nome, new Date().toISOString()],
      (err2, rows) => {
        if (err2) return res.status(500).json({ error: err2.message });
        if (!rows || rows.length === 0) return res.status(401).json({ error: 'Ticket já usado.' });
        db.run(
          'INSERT INTO logs_auditoria (data, usuario, acao, descricao) VALUES (?, ?, ?, ?)',
          [new Date().toISOString(), row.nome, 'LOGIN_HUB_GESTAO', 'Entrada pelo Hub de Gestão'],
          () => {},
        );
        criarSessao(row.nome, (errSessao, token) => {
          if (errSessao) return res.status(500).json({ error: errSessao.message });
          res.json({ usuario: row.nome, token });
        });
      }
    );
  });
});

// Desligar / religar / consultar pelo Hub de Gestão (POST /api/auth/hub/acesso).
// Ticket HMAC-SHA256 como o do /auth/sso, mas com outro `aud` ("hub-operacoes-acesso") e uma
// ação em `a` ("desligar" | "religar" | "consultar"), para um ticket de entrada não servir de ordem
// de bloqueio. Só mexe em colaboradores.ativo e nas sessões do servidor. NÃO toca em PIN, em
// biometria, em ponto nem em nenhum registro: reativar devolve exatamente o que havia.
router.post('/auth/hub/acesso', (req, res) => {
  const secret = process.env.GESTAO_SSO_SECRET_CACAU;
  if (!secret) return res.status(503).json({ error: 'Integração com o Hub de Gestão não configurada.' });

  const ticket = typeof req.body?.ticket === 'string' ? req.body.ticket : '';
  const [payloadB64, sigB64] = ticket.split('.');
  if (!payloadB64 || !sigB64) return res.status(400).json({ error: 'Ticket inválido.' });
  const esperado = crypto.createHmac('sha256', secret).update(payloadB64).digest();
  const recebido = base64urlDecode(sigB64);
  if (recebido.length !== esperado.length || !crypto.timingSafeEqual(recebido, esperado)) {
    return res.status(401).json({ error: 'Ticket inválido.' });
  }
  let payload;
  try {
    payload = JSON.parse(base64urlDecode(payloadB64).toString('utf8'));
  } catch {
    return res.status(400).json({ error: 'Ticket inválido.' });
  }
  const agora = Math.floor(Date.now() / 1000);
  if (payload.aud !== 'hub-operacoes-acesso' || typeof payload.u !== 'string' || typeof payload.jti !== 'string'
      || typeof payload.exp !== 'number' || payload.exp < agora
      || (payload.a !== 'desligar' && payload.a !== 'religar' && payload.a !== 'consultar')) {
    return res.status(401).json({ error: 'Ticket expirado ou inválido.' });
  }

  db.get('SELECT nome, role, ativo FROM colaboradores WHERE LOWER(nome) = LOWER(?)', [payload.u.trim()], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    // Quem não existe no Cacau não tem o que bloquear: não é erro.
    if (!row) return res.json({ ok: true, encontrado: false, mudou: false });

    const ativoAgora = !(row.ativo !== null && row.ativo !== undefined && Number(row.ativo) === 0);

    // "consultar": só leitura. O Hub confere, ao cadastrar a pessoa, se o usuário existe no Cacau e
    // está ativo (o Hub NÃO cria colaborador do Cacau). Não muda nada; o jti é queimado como nas outras.
    if (payload.a === 'consultar') {
      return db.all(
        'INSERT INTO sso_tickets_usados (jti, usuario, usadoEm) VALUES (?, ?, ?) ON CONFLICT (jti) DO NOTHING RETURNING jti',
        [payload.jti, row.nome, new Date().toISOString()],
        (errC, rowsC) => {
          if (errC) return res.status(500).json({ error: errC.message });
          if (!rowsC || rowsC.length === 0) return res.status(401).json({ error: 'Ticket já usado.' });
          res.json({ ok: true, encontrado: true, mudou: false, ativo: ativoAgora, role: row.role });
        }
      );
    }
    const desligar = payload.a === 'desligar';
    if (desligar === !ativoAgora) return res.json({ ok: true, encontrado: true, mudou: false });

    const aplicar = () => {
      // Queima o jti antes de agir: o mesmo ticket não vale duas vezes.
      db.all(
        'INSERT INTO sso_tickets_usados (jti, usuario, usadoEm) VALUES (?, ?, ?) ON CONFLICT (jti) DO NOTHING RETURNING jti',
        [payload.jti, row.nome, new Date().toISOString()],
        (err2, rows) => {
          if (err2) return res.status(500).json({ error: err2.message });
          if (!rows || rows.length === 0) return res.status(401).json({ error: 'Ticket já usado.' });
          db.run('UPDATE colaboradores SET ativo = ? WHERE nome = ?', [desligar ? 0 : 1, row.nome], (err3) => {
            if (err3) return res.status(500).json({ error: err3.message });
            const concluir = () => {
              db.run(
                'INSERT INTO logs_auditoria (data, usuario, acao, descricao) VALUES (?, ?, ?, ?)',
                [new Date().toISOString(), row.nome, desligar ? 'ACESSO_DESLIGADO_HUB' : 'ACESSO_RELIGADO_HUB', 'Alterado pelo Hub de Gestão'],
                () => {},
              );
              res.json({ ok: true, encontrado: true, mudou: true });
            };
            // Só as SESSÕES do servidor caem; a tabela `pins` não é tocada.
            if (desligar) db.run('DELETE FROM sessoes_auth WHERE usuario = ?', [row.nome], () => concluir());
            else concluir();
          });
        }
      );
    };

    if (!(desligar && row.role === 'owner')) return aplicar();
    // Nunca deixa o sistema sem nenhum owner ativo.
    db.get(
      "SELECT COUNT(*) AS n FROM colaboradores WHERE role = 'owner' AND COALESCE(ativo, 1) <> 0 AND nome <> ?",
      [row.nome],
      (errN, outros) => {
        if (errN) return res.status(500).json({ error: errN.message });
        if (!outros || Number(outros.n) === 0) {
          return res.status(409).json({ error: 'Este é o último owner ativo do Cacau Show; não dá para desligar.' });
        }
        aplicar();
      }
    );
  });
});

// Criar/atualizar PIN (salva com hash bcrypt).
//  - Usuário ainda sem PIN: qualquer um cria (é o primeiro acesso, como sempre foi).
//  - Usuário com PIN: só troca com sessão do próprio usuário ou de um owner. Antes, esta
//    rota era aberta e sobrescrevia o PIN de qualquer pessoa, inclusive owner.
router.post('/pins', (req, res) => {
  const { usuario, pin } = req.body || {};
  if (typeof usuario !== 'string' || !usuario.trim() || !/^\d{4}$/.test(String(pin || ''))) {
    return res.status(400).json({ error: 'Usuário e PIN de 4 dígitos são obrigatórios.' });
  }

  const gravar = async () => {
    try {
      const hash = await bcrypt.hash(String(pin), BCRYPT_ROUNDS);
      db.run(
        'INSERT INTO pins (usuario, pin) VALUES (?, ?) ON CONFLICT(usuario) DO UPDATE SET pin = ?',
        [usuario, hash, hash],
        function(err) {
          if (err) return res.status(500).json({ error: err.message });
          publish('pin.salvo', { usuario }, { origem: req.query.clientId, usuario: req.query.usuario });
          res.json({ success: true });
        }
      );
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  };

  db.get('SELECT usuario FROM pins WHERE usuario = ?', [usuario], (err, existente) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!existente) return gravar();
    lerSessao(req, (errSessao, sessao) => {
      if (errSessao) return res.status(500).json({ error: errSessao.message });
      if (!sessao) return res.status(401).json({ error: 'Sessão expirada. Entre novamente para trocar o PIN.' });
      const proprio = sessao.usuario.trim().toLowerCase() === usuario.trim().toLowerCase();
      if (!proprio && sessao.role !== 'owner') {
        return res.status(403).json({ error: 'Acesso negado. Só o próprio usuário ou um owner troca este PIN.' });
      }
      gravar();
    });
  });
});

// Deletar / Resetar PIN de usuário
router.delete('/pins/:usuario', exigirSessao(['owner']), (req, res) => {
  const { usuario } = req.params;
  db.run('DELETE FROM pins WHERE usuario = ?', [usuario], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    publish('pin.excluido', { usuario }, { origem: req.query.clientId, usuario: req.query.usuario });
    res.json({ success: true });
  });
});

// --- Endpoints de Colaboradores ---
// A lista (nome, papel, unidade) alimenta a tela de login, então segue aberta. CPF, telefone,
// nascimento e admissão só saem para sessão de owner: antes iam para qualquer um (e para o
// cache local de todos os aparelhos).
const CAMPOS_PESSOAIS = ['cpf', 'dataNascimento', 'telefone', 'dataAdmissao'];
router.get('/colaboradores', (req, res) => {
  lerSessao(req, (errSessao, sessao) => {
    if (errSessao) return res.status(500).json({ error: errSessao.message });
    const completo = !!sessao && sessao.role === 'owner';
    db.all('SELECT * FROM colaboradores ORDER BY nome ASC', [], (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json((rows || []).map(normalizeRow).map(c => {
        if (completo) return c;
        const publico = { ...c };
        CAMPOS_PESSOAIS.forEach(k => delete publico[k]);
        return publico;
      }));
    });
  });
});

// Cadastro/edição de colaborador (inclui o papel). Antes era aberto: bastava um POST
// { nome: "Alexandra", role: "owner" } para promover qualquer pessoa. Agora exige
// sessão de owner ou consultora_dashboard (quem importa o DISC), e mexer em owner —
// criar um ou alterar o papel de um existente — é só de owner.
router.post('/colaboradores', exigirSessao(['owner', 'consultora_dashboard']), (req, res) => {
  const { nome, role, unidade, cpf, dataNascimento, telefone, dataAdmissao } = req.body;
  if (!nome || !role) {
    return res.status(400).json({ error: 'Nome e Perfil (role) são obrigatórios.' });
  }
  const nomeTrim = nome.trim();
  const criadoEm = new Date().toISOString();

  db.get('SELECT role FROM colaboradores WHERE nome = ?', [nomeTrim], (errAtual, atual) => {
    if (errAtual) return res.status(500).json({ error: errAtual.message });
    if ((role === 'owner' || (atual && atual.role === 'owner')) && req.sessao.role !== 'owner') {
      return res.status(403).json({ error: 'Acesso negado. Só um owner cria ou altera owners.' });
    }
    salvarColaborador();
  });

  function salvarColaborador() {
    db.run(
      `INSERT INTO colaboradores (nome, role, unidade, cpf, dataNascimento, telefone, dataAdmissao, criadoEm)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(nome) DO UPDATE SET
         role = excluded.role,
         unidade = COALESCE(excluded.unidade, colaboradores.unidade),
         cpf = COALESCE(excluded.cpf, colaboradores.cpf),
         dataNascimento = COALESCE(excluded.dataNascimento, colaboradores.dataNascimento),
         telefone = COALESCE(excluded.telefone, colaboradores.telefone),
         dataAdmissao = COALESCE(excluded.dataAdmissao, colaboradores.dataAdmissao)`,
      [nomeTrim, role, unidade || null, cpf || null, dataNascimento || null, telefone || null, dataAdmissao || null, criadoEm],
      function(err) {
        if (err) return res.status(500).json({ error: err.message });
        publish('colaborador.salvo', { nome: nomeTrim, role, unidade }, { origem: req.query.clientId, usuario: req.query.usuario });
        res.json({ success: true, nome: nomeTrim, role });
      }
    );
  }
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
        publish('biometria.reset', { nome }, { origem: req.query.clientId, usuario: req.query.usuario });
        res.json({ success: true });
      });
    });
  });
});

// Liga/desliga o ACESSO de um colaborador (colaboradores.ativo). Nunca apaga a pessoa, o PIN, a
// biometria nem o histórico: desligar só impede entrar (login por PIN, sessão e ponto) e ligar
// devolve tudo como estava. Owner não se desliga por aqui (isso é decisão do Hub).
function definirAtivo(req, res, nome, ativo) {
  if (!nome) return res.status(400).json({ error: 'Nome é obrigatório.' });
  db.get('SELECT nome, role FROM colaboradores WHERE nome = ?', [nome], (err, colab) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!colab) return res.status(404).json({ error: 'Colaborador não encontrado.' });
    if (!ativo && colab.role === 'owner') {
      return res.status(409).json({ error: 'Owner não é desativado por aqui. Use o Hub de Gestão.' });
    }
    db.run('UPDATE colaboradores SET ativo = ? WHERE nome = ?', [ativo ? 1 : 0, nome], function(errUp) {
      if (errUp) return res.status(500).json({ error: errUp.message });
      publish(ativo ? 'colaborador.salvo' : 'colaborador.excluido', { nome, role: colab.role },
        { origem: req.query.clientId, usuario: req.query.usuario });
      res.json({ success: true, ativo });
    });
  });
}

// Antes isto era aberto e apagava o colaborador E o PIN dele. Agora exige owner e só desativa.
router.delete('/colaboradores/:nome', requireOwner, (req, res) => {
  definirAtivo(req, res, req.params.nome, false);
});

router.post('/colaboradores/:nome/ativo', requireOwner, (req, res) => {
  definirAtivo(req, res, req.params.nome, !!(req.body && req.body.ativo === true));
});


// Notificação para a Gestão (Push + Email)
router.post('/notificar-gestao', exigirSessaoTransicao(), (req, res) => {
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
