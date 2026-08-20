const nodemailer = require('nodemailer');
const webPush = require('web-push');
const { db } = require('./database');

function escapeHtml(str) {
  if (typeof str !== 'string') return String(str || '');
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

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

const REGRAS_PADRAO_NOTIFICACAO = {
  envelopes: { colab: false, lider: true, owner: true },
  inventario_inicio: { colab: false, lider: true, owner: true },
  inventario_conclusao: { colab: false, lider: true, owner: true },
  conferencia_nfe: { colab: false, lider: true, owner: true },
  divergencia_caixa: { colab: false, lider: true, owner: true },
  meta_lembrete: { colab: true, lider: false, owner: false, colab_ch: 'push' },
  meta_atraso: { colab: false, lider: true, owner: true },
  retirada_solicitada: { colab: false, lider: false, owner: true },
  fechamento_caixa: { colab: false, lider: true, owner: true }
};

// A tela de Configurações (webapp/app.js) grava as chaves com hífen
// ("meta-lembrete", "nfe", "inv-fim"), enquanto o servidor dispara os avisos
// com os nomes internos ("meta_lembrete", "conferencia_nfe"...). Sem essa
// tradução, rules[tipo] vinha undefined e TODO tipo caía no fallback
// "líder + owner" — era por isso que o lembrete de lançamento de meta, marcado
// na tela como exclusivo da operadora, chegava assim mesmo para o Líder de
// Operações e para o Owner.
const ALIASES_TIPO_NOTIFICACAO = {
  envelopes: ['envelopes'],
  inventario_inicio: ['inventario_inicio', 'inv-inicio'],
  inventario_conclusao: ['inventario_conclusao', 'inv-fim'],
  conferencia_nfe: ['conferencia_nfe', 'nfe'],
  divergencia_caixa: ['divergencia_caixa', 'divergencia'],
  meta_lembrete: ['meta_lembrete', 'meta-lembrete'],
  meta_atraso: ['meta_atraso', 'meta-atraso'],
  retirada_solicitada: ['retirada_solicitada'],
  fechamento_caixa: ['fechamento_caixa', 'fechamento']
};

function tipoCanonicoNotificacao(notificationType) {
  if (!notificationType) return null;
  return Object.keys(ALIASES_TIPO_NOTIFICACAO)
    .find(canonico => ALIASES_TIPO_NOTIFICACAO[canonico].includes(notificationType)) || null;
}

// Resolve as regras de um tipo considerando as duas grafias e caindo nos
// padrões do servidor quando a configuração ainda não foi salva.
function regrasDoTipoNotificacao(rulesBrutas, notificationType) {
  const canonico = tipoCanonicoNotificacao(notificationType);
  const rules = rulesBrutas && typeof rulesBrutas === 'object' ? rulesBrutas : {};

  let typeRules = null;
  if (canonico) {
    const chaveSalva = ALIASES_TIPO_NOTIFICACAO[canonico].find(alias => rules[alias]);
    typeRules = (chaveSalva && rules[chaveSalva]) || REGRAS_PADRAO_NOTIFICACAO[canonico];
  } else {
    typeRules = rules[notificationType] || { colab: false, lider: true, owner: true };
  }

  // Lançamento da Meta Hora a Hora é aviso de execução: quem lança é a
  // operadora da loja. Líder de Operações e Owner acompanham pelo resumo de
  // atraso (meta_atraso) e pelo briefing — nunca por este aviso, mesmo que uma
  // configuração antiga no banco diga o contrário.
  if (canonico === 'meta_lembrete') {
    return Object.assign({}, typeRules, { colab: true, lider: false, owner: false });
  }
  return typeRules;
}

function obterEmailsDestinatarios(notificationType, callback) {
  db.get('SELECT valor FROM configuracoes WHERE chave = ?', ['notificacoes_config'], (errConfig, rowConfig) => {
    let rulesBrutas = null;
    if (!errConfig && rowConfig && rowConfig.valor) {
      try {
        rulesBrutas = JSON.parse(rowConfig.valor);
      } catch (e) {}
    }

    const typeRules = regrasDoTipoNotificacao(rulesBrutas, notificationType);
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
        'alexandra': 'alexandracabral733@gmail.com'
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

    const lojaSafe = escapeHtml(loja);
    const consultorSafe = escapeHtml(consultor);
    const novoValorNum = Number(novoValor) || 0;
    const totalPendenteNum = Number(totalPendente) || 0;

    const mailOptions = {
      from: `"Controle de Caixa Cacau Show" <${user}>`,
      to: targetEmails.join(', '),
      subject: `⚠️ Alerta de Envelopes Acumulados - Loja ${lojaSafe}`,
      text: `Olá,\n\nO limite de R$ 1.000,00 em envelopes em trânsito/pendentes foi atingido ou ultrapassado na loja: ${loja}.\n\nDetalhes:\n- Novo envelope registrado por: ${consultor}\n- Valor do novo envelope: R$ ${novoValorNum.toFixed(2)}\n- Valor total acumulado pendente de retirada nesta loja: R$ ${totalPendenteNum.toFixed(2)}\n\nPor favor, providencie a retirada.\n\nAtenciosamente,\nSistema de Controle de Caixa`,
      html: `<p>Olá,</p>
<p>O limite de <strong>R$ 1.000,00</strong> em envelopes em trânsito/pendentes foi atingido ou ultrapassado na loja: <strong>${lojaSafe}</strong>.</p>
<h3>Detalhes:</h3>
<ul>
  <li><strong>Novo envelope registrado por:</strong> ${consultorSafe}</li>
  <li><strong>Valor do novo envelope:</strong> R$ ${novoValorNum.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</li>
  <li><strong>Valor total acumulado pendente de retirada nesta loja:</strong> R$ ${totalPendenteNum.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</li>
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

// `attachments` segue o formato do nodemailer ([{ filename, content, encoding }]).
// Retorna Promise para quem precisa saber se o envio deu certo (ex.: a rota de
// folha de ponto responde ao Owner com sucesso/erro); os chamadores antigos que
// ignoram o retorno continuam funcionando igual.
function enviarEmailGenerico(targetEmails, subject, bodyText, bodyHtml, attachments) {
  if (!targetEmails || targetEmails.length === 0) {
    return Promise.reject(new Error('Nenhum destinatário informado.'));
  }

  const host = process.env.SMTP_HOST;
  const port = parseInt(process.env.SMTP_PORT) || 465;
  const secure = process.env.SMTP_SECURE === 'true';
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    console.warn('Configuração de SMTP incompleta no arquivo .env. Notificação por e-mail não enviada.');
    return Promise.reject(new Error('SMTP não configurado no servidor.'));
  }

  const transporter = nodemailer.createTransport({ host, port, secure, auth: { user, pass } });
  const mailOptions = {
    from: `"Controle de Caixa Cacau Show" <${user}>`,
    to: targetEmails.join(', '),
    subject,
    text: bodyText,
    html: bodyHtml || `<p>${bodyText.replace(/\n/g, '<br>')}</p>`
  };
  if (attachments && attachments.length) mailOptions.attachments = attachments;

  return new Promise((resolve, reject) => {
    transporter.sendMail(mailOptions, (error, info) => {
      if (error) {
        console.error('Erro ao enviar e-mail de notificação:', error);
        return reject(error);
      }
      console.log('E-mail de notificação enviado com sucesso:', info.response);
      resolve(info);
    });
  });
}

// ==========================================================================
// Meta Hora a Hora — lembrete às colaboradoras e resumo de atraso ao Líder.
// Horários por loja duplicados aqui (mesma fonte que OPERACOES_CONFIG no
// client, webapp/app.js) pois este módulo roda no servidor, fora do
// navegador onde a config original vive.
// ==========================================================================
const OPERACOES_CONFIG_META = {
  'Marambaia': { abertura: '09:00', fechamento: '22:00' },
  'Icoaraci': { abertura: '09:00', fechamento: '22:00' },
  'Mário Covas': { abertura: '09:00', fechamento: '22:00' },
  'Grão Pará': { abertura: '10:00', fechamento: '22:00' },
  'ParqueShopping': { abertura: '10:00', fechamento: '22:00' },
  'Parque Circuito': { abertura: '10:00', fechamento: '22:00' }
};
// Unidades do Faça Amigos não usam Meta Hora a Hora.
const UNIDADES_FA_META = ['Grão Pará', 'ParqueShopping', 'Parque Circuito'];
const META_JANELA_FECHAMENTO_DEPOIS_MIN = 20;
const META_LEMBRETE_MIN_ANTES = 10;

function agoraBrasilMeta() {
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
  }).formatToParts(new Date());
  const obj = {};
  partes.forEach(p => { obj[p.type] = p.value; });
  return {
    data: `${obj.year}-${obj.month}-${obj.day}`,
    minutosDoDia: parseInt(obj.hour) * 60 + parseInt(obj.minute)
  };
}

function minutosParaHoraStrMeta(min) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

// Checkpoints do dia para uma loja: 1h depois da abertura, de hora em hora
// até o fechamento — mesma fórmula usada no client (webapp/app.js, módulo
// Meta Hora a Hora).
function checkpointsDoDiaMeta(loja) {
  const cfg = OPERACOES_CONFIG_META[loja];
  if (!cfg) return [];
  const [ah, am] = cfg.abertura.split(':').map(Number);
  const [fh, fm] = cfg.fechamento.split(':').map(Number);
  const aberturaMin = ah * 60 + am;
  const fechamentoMin = fh * 60 + fm;
  const checkpoints = [];
  for (let slot = aberturaMin + 60; slot <= fechamentoMin; slot += 60) {
    checkpoints.push(slot);
  }
  return checkpoints;
}

function enviarLembreteMetaHoraHora(loja, horaSlot) {
  notificacoesEventosAtivas((ativas) => {
    if (!ativas) return;
    const title = '⏰ Meta Hora a Hora';
    const body = `Faltam ${META_LEMBRETE_MIN_ANTES} minutos para confirmar o intervalo das ${horaSlot} na loja ${loja}.`;
    enviarNotificacaoPushInterno(title, body, null, 'meta_lembrete');
    obterEmailsDestinatarios('meta_lembrete', (targetEmails) => {
      enviarEmailGenerico(targetEmails, title, body);
    });
  });
}

function enviarResumoAtrasoMeta(resumoPorLoja) {
  const lojas = Object.keys(resumoPorLoja).filter(loja => resumoPorLoja[loja].length > 0);
  if (lojas.length === 0) return;

  notificacoesEventosAtivas((ativas) => {
    if (!ativas) return;
    const title = '⛔ Meta Hora a Hora — Intervalos perdidos hoje';
    const linhasTexto = lojas.map(loja => `- ${loja}: ${resumoPorLoja[loja].join(', ')}`);
    const body = `Os intervalos abaixo ficaram sem confirmação de Meta Hora a Hora hoje:\n\n${linhasTexto.join('\n')}`;
    enviarNotificacaoPushInterno(title, body, null, 'meta_atraso');
    obterEmailsDestinatarios('meta_atraso', (targetEmails) => {
      const linhasHtml = lojas.map(loja => `<li><strong>${loja}:</strong> ${resumoPorLoja[loja].join(', ')}</li>`).join('');
      enviarEmailGenerico(targetEmails, title, body, `<p>Os intervalos abaixo ficaram sem confirmação de Meta Hora a Hora hoje:</p><ul>${linhasHtml}</ul>`);
    });
  });
}

// Autorização de retirada pendente: ao contrário dos demais avisos, este não
// respeita a chave mestra "notificacoesEventosAtivas" — sem o push, Bruno/
// Isabella podem nunca saber que existe uma retirada esperando o PIN deles,
// e a chave é pensada para silenciar avisos informativos, não uma ação que a
// Líder de Operações está bloqueada até alguém autorizar.
function enviarNotificacaoRetiradaSolicitada(loja, valorTotal, quantidade, solicitadoPor) {
  const valorFmt = Number(valorTotal || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
  const title = '🔑 Retirada aguardando sua autorização';
  const qtdTexto = quantidade > 1 ? `${quantidade} envelopes` : '1 envelope';
  const body = `${solicitadoPor} pediu para retirar ${qtdTexto} (R$ ${valorFmt}) da loja ${loja}. Abra o app para autorizar com seu PIN.`;
  enviarNotificacaoPushInterno(title, body, null, 'retirada_solicitada');
}

// Fechamento de caixa: avisa Líder de Operações e Owner a cada fechamento
// registrado (Cacau Show ou Faça Amigos), independente do valor do envelope —
// diferente do alerta de acúmulo (função `enviarEmailNotificacao` acima), que
// só dispara ao atingir o limite de R$ 1.000 pendentes de retirada.
function enviarNotificacaoFechamentoCaixa(loja, marca, dados) {
  notificacoesEventosAtivas((ativas) => {
    if (!ativas) return;

    const consultor = (dados && dados.consultor) || 'Colaboradora';
    const fundoCaixa = Number(dados && dados.fundoCaixa) || 0;
    const valorFaturado = Number(dados && dados.valorFaturado) || 0;
    const lojaSafe = escapeHtml(loja);
    const marcaLabel = marca === 'fa' ? ' (Faça Amigos)' : '';

    const title = `🔒 Fechamento de Caixa - Loja ${loja}${marcaLabel}`;
    const body = `${consultor} registrou o fechamento de caixa na loja ${loja}${marcaLabel}. Fundo de caixa: R$ ${fundoCaixa.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}. Valor faturado: R$ ${valorFaturado.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}.`;

    enviarNotificacaoPushInterno(title, body, null, 'fechamento_caixa');
    obterEmailsDestinatarios('fechamento_caixa', (targetEmails) => {
      const bodyHtml = `<p><strong>${escapeHtml(consultor)}</strong> registrou o fechamento de caixa na loja <strong>${lojaSafe}${marcaLabel}</strong>.</p>
<ul>
  <li><strong>Fundo de caixa:</strong> R$ ${fundoCaixa.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</li>
  <li><strong>Valor faturado:</strong> R$ ${valorFaturado.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</li>
</ul>`;
      enviarEmailGenerico(targetEmails, title, body, bodyHtml);
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
    let rulesBrutas = null;
    if (!errConfig && rowConfig && rowConfig.valor) {
      try {
        rulesBrutas = JSON.parse(rowConfig.valor);
      } catch (e) {}
    }

    db.all('SELECT nome, role FROM colaboradores', [], (errColab, colabs) => {
      if (errColab || !colabs) return;

      let finalTargetUsers = null;
      if (Array.isArray(targetUsers) && targetUsers.length > 0) {
        finalTargetUsers = targetUsers.map(u => u.trim().toLowerCase());
      }

      // Antes o filtro por perfil só rodava quando havia configuração salva no
      // banco (`rules`): sem ela, o SELECT abaixo pegava TODAS as inscrições e
      // o push ia para todo mundo inscrito — Líder e Owner incluídos. Agora as
      // regras padrão valem sempre.
      if (notificationType) {
        const enabledRoles = [];
        const typeRules = regrasDoTipoNotificacao(rulesBrutas, notificationType);
        // Operadoras só passaram a ter push agora, por causa do lembrete de
        // meta. Respeitar o canal escolhido para elas evita transformar em push
        // tudo que a tela de Configurações marca como e-mail.
        if (typeRules.colab && (typeRules.colab_ch || 'email') === 'push') {
          enabledRoles.push('consultora', 'consultora_fa');
        }
        if (typeRules.lider) enabledRoles.push('consultora_dashboard');
        if (typeRules.owner) enabledRoles.push('owner');

        const filteredColabs = colabs.filter(c => enabledRoles.includes(c.role));
        if (finalTargetUsers) {
          finalTargetUsers = finalTargetUsers.filter(u => filteredColabs.some(c => c.nome.toLowerCase() === u));
        } else {
          finalTargetUsers = filteredColabs.map(c => c.nome.toLowerCase());
        }
      }

      // Lista vazia significa "ninguém habilitado para este tipo" e não "manda
      // para todo mundo": sem esta guarda, um tipo restrito a um perfil que não
      // tem ninguém inscrito caía no SELECT sem WHERE e notificava a base toda.
      if (Array.isArray(finalTargetUsers) && finalTargetUsers.length === 0) {
        console.log(`Push notification (${title}) ignorada: nenhum perfil habilitado para o tipo ${notificationType}.`);
        return;
      }

      // finalTargetUsers já vem em minúsculas (ver .toLowerCase() acima) e
      // POST /subscribe agora grava `usuario` normalizado do mesmo jeito —
      // comparação direta, sem LOWER(usuario) no WHERE (que forçava scan
      // completo mesmo com poucas linhas, por invalidar qualquer índice).
      const sql = finalTargetUsers && finalTargetUsers.length > 0
        ? `SELECT * FROM push_subscriptions WHERE usuario IN (${finalTargetUsers.map(() => '?').join(',')})`
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
  enviarEmailGenerico,
  enviarNotificacaoPush,
  enviarNotificacaoRetiradaSolicitada,
  enviarNotificacaoFechamentoCaixa,
  OPERACOES_CONFIG_META,
  UNIDADES_FA_META,
  META_JANELA_FECHAMENTO_DEPOIS_MIN,
  META_LEMBRETE_MIN_ANTES,
  agoraBrasilMeta,
  minutosParaHoraStrMeta,
  checkpointsDoDiaMeta,
  enviarLembreteMetaHoraHora,
  enviarResumoAtrasoMeta
};
