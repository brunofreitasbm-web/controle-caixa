const nodemailer = require('nodemailer');
const webPush = require('web-push');
const { db } = require('./database');

// Chave mestra de notificações de eventos (e-mail + push).
// Enquanto não estiver explicitamente ativada em Configurações, nenhum alerta é enviado.
const CHAVE_NOTIF_ATIVAS = 'notificacoes_eventos_ativas';

function notificacoesEventosAtivas(callback) {
  db.get('SELECT valor FROM configuracoes WHERE chave = ?', [CHAVE_NOTIF_ATIVAS], (err, row) => {
    if (err || !row || !row.valor) return callback(false);
    const valor = String(row.valor).trim().toLowerCase();
    callback(valor === '1' || valor === 'true');
  });
}

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

      let recipientNames = colabs
        .filter(c => enabledRoles.includes(c.role))
        .map(c => c.nome.toLowerCase());

      if (notificationType === 'divergencia_caixa') {
        recipientNames = recipientNames.filter(name => name !== 'bruno' && name !== 'isabella');
      }

      const targetEmails = recipientNames
        .map(name => EMAIL_MAP[name])
        .filter(Boolean);

      callback(targetEmails);
    });
  });
}

function enviarEmailNotificacao(loja, novoValor, totalPendente, consultor) {
  notificacoesEventosAtivas((ativas) => {
    if (!ativas) {
      console.log('Notificação de envelopes acumulados ignorada: notificações de eventos estão desativadas em Configurações.');
      return;
    }
    enviarEmailNotificacaoInterno(loja, novoValor, totalPendente, consultor);
  });
}

function enviarEmailNotificacaoInterno(loja, novoValor, totalPendente, consultor) {
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
  notificacoesEventosAtivas((ativas) => {
    if (!ativas) {
      console.log(`Push notification (${title}) ignorada: notificações de eventos estão desativadas em Configurações.`);
      return;
    }
    enviarNotificacaoPushInterno(title, body, targetUsers, notificationType);
  });
}

function enviarNotificacaoPushInterno(title, body, targetUsers = null, notificationType = null) {
  const textCheck = `${title || ''} ${body || ''}`.toLowerCase();
  if (
    notificationType === 'divergencia' ||
    notificationType === 'divergencia_caixa' ||
    textCheck.includes('divergênc') ||
    textCheck.includes('divergenc')
  ) {
    console.log(`Push notification (${title}) ignorada: notificações PUSH de divergência estão desativadas.`);
    return;
  }

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
        const typeRules = rules[notificationType] || { colab: false, lider: true, owner: true };
        if (typeRules.colab) enabledRoles.push('consultora', 'consultora_fa');
        if (typeRules.lider) enabledRoles.push('consultora_dashboard');
        if (typeRules.owner) enabledRoles.push('owner');

        const filteredColabs = colabs.filter(c => enabledRoles.includes(c.role));
        if (finalTargetUsers) {
          finalTargetUsers = finalTargetUsers.filter(u => filteredColabs.some(c => c.nome.toLowerCase() === u));
        } else {
          finalTargetUsers = filteredColabs.map(c => c.nome.toLowerCase());
        }
      }

      const sql = finalTargetUsers && finalTargetUsers.length > 0
        ? `SELECT * FROM push_subscriptions WHERE LOWER(usuario) IN (${finalTargetUsers.map(() => '?').join(',')})`
        : 'SELECT * FROM push_subscriptions';
      
      const params = finalTargetUsers && finalTargetUsers.length > 0 ? finalTargetUsers : [];

      db.all(sql, params, (errSubs, rows) => {
        if (errSubs || !rows) return;

        const promises = rows.map(row => {
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

module.exports = {
  notificacoesEventosAtivas,
  obterEmailsDestinatarios,
  enviarEmailNotificacao,
  enviarNotificacaoPush
};
