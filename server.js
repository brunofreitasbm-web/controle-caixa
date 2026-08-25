require('dotenv').config();
const dns = require('node:dns');
dns.setDefaultResultOrder('ipv4first');

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const nodemailer = require('nodemailer');
const cron = require('node-cron');

const { initDb, dbAllAsync, dbGetAsync, dbRunAsync, TENANT_ZERO_ID } = require('./config/database');
const {
  OPERACOES_CONFIG_META,
  UNIDADES_FA_META,
  META_JANELA_FECHAMENTO_DEPOIS_MIN,
  META_LEMBRETE_MIN_ANTES,
  agoraBrasilMeta,
  minutosParaHoraStrMeta,
  checkpointsDoDiaMeta,
  enviarLembreteMetaHoraHora,
  enviarResumoAtrasoMeta,
  obterEmailsDestinatarios,
  enviarEmailGenerico,
  enviarNotificacaoPush,
  enviarNotificacaoVisao19h
} = require('./config/notifications');

const resolveTenantSession = require('./routes/middleware/resolveTenantSession');
const authRoutes = require('./routes/auth');
const tenantRoutes = require('./routes/tenant');
const caixaRoutes = require('./routes/caixa');
const financeiroRoutes = require('./routes/financeiro');
const pontoRoutes = require('./routes/ponto');
const pontoBiometriaRoutes = require('./routes/ponto-biometria');
const vendasRoutes = require('./routes/vendas');
const faBonificacaoRoutes = require('./routes/fa-bonificacao');
const posVisitaRoutes = require('./routes/pos-visita');
const aniversariosRoutes = require('./routes/aniversarios');
const metasLojasRoutes = require('./routes/metas-lojas');
const metasRoutes = require('./routes/metas');
const realtimeRoutes = require('./routes/realtime');
const inventarioRoutes = require('./routes/inventario');
const iaRoutes = require('./routes/ia');
const auditoriaDocsRoutes = require('./routes/auditoria-docs');
const retiradasRoutes = require('./routes/retiradas');
const nfeRoutes = require('./routes/nfe');

const app = express();
const PORT = process.env.PORT || 5000;

// CORS_ALLOWED_ORIGINS (opcional, lista separada por vírgula): sem essa
// variável, mantém o comportamento de sempre (cors() sem restrição), para
// não quebrar quem hoje depende de cross-origin (ex.: abrir webapp/index.html
// como arquivo local, Origin "null"). Definir a variável liga a allowlist —
// pré-requisito de segurança antes de expor a API a um domínio de um
// segundo tenant.
const corsOrigensPermitidas = (process.env.CORS_ALLOWED_ORIGINS || '')
  .split(',')
  .map(o => o.trim())
  .filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || corsOrigensPermitidas.length === 0 || corsOrigensPermitidas.includes(origin)) {
      return callback(null, true);
    }
    callback(new Error('Origem não permitida por CORS.'));
  }
}));
app.use(express.json({ limit: '15mb' }));

// Resolve req.tenant (organização) a partir do token de sessão, quando
// presente — ver routes/middleware/resolveTenantSession.js. Fica antes de
// TODAS as rotas /api para que qualquer rota já rewireada para tenant possa
// simplesmente ler req.tenant.organizationId.
app.use('/api', resolveTenantSession);

// Auditoria de performance: não havia nenhuma instrumentação de tempo de
// resposta antes disso — só dava pra inferir custo olhando o lado do banco
// (pg_stat_statements). Loga qualquer request que passe do limiar, pra dar
// visibilidade real de qual tela pesa mais no dia a dia.
const LIMIAR_REQUEST_LENTA_MS = 500;
app.use((req, res, next) => {
  const inicio = Date.now();
  res.on('finish', () => {
    const duracaoMs = Date.now() - inicio;
    if (duracaoMs >= LIMIAR_REQUEST_LENTA_MS) {
      console.warn(`[perf] ${req.method} ${req.originalUrl} — ${duracaoMs}ms (status ${res.statusCode})`);
    }
  });
  next();
});

// Servir os arquivos estáticos da webapp
app.use(express.static(path.join(__dirname, 'webapp')));

// Registrar Rotas Modularizadas
// O canal SSE vem primeiro: é uma conexão longa e não deve passar por nenhum
// middleware de parsing/roteamento mais pesado.
app.use('/api', realtimeRoutes);
app.use('/api', inventarioRoutes);
app.use('/api', iaRoutes);
app.use('/api', authRoutes);
app.use('/api/tenant', tenantRoutes);
app.use('/api', caixaRoutes);
app.use('/api', retiradasRoutes);
app.use('/api', financeiroRoutes);
app.use('/api', metasRoutes);
app.use('/api/ponto', pontoRoutes);
app.use('/api/ponto', pontoBiometriaRoutes);
app.use('/api/vendas', vendasRoutes);
app.use('/api/fa-bonificacao', faBonificacaoRoutes);
app.use('/api/pos-visita', posVisitaRoutes);
app.use('/api/aniversarios', aniversariosRoutes);
app.use('/api/metas-lojas', metasLojasRoutes);
app.use('/api/auditoria-docs', auditoriaDocsRoutes);
app.use('/api/nfe', nfeRoutes);
app.use('/api/saas', require('./routes/saas-signup'));

// ==========================================================================
// BACKUP MENSAL AUTOMÁTICO (silencioso, por e-mail)
// ==========================================================================
const BACKUP_EMAIL_DESTINO = 'brunofreitasbm@gmail.com';
const BACKUP_TABELAS = ['registros', 'registros_fa', 'nfs', 'boletos', 'colaboradores', 'logs_auditoria'];
// registros/registros_fa guardam a foto do envelope em base64 (pode passar de
// 1MB por linha) — o backup por e-mail nunca manda a foto mesmo, então nem
// vale a pena trazer a coluna do banco: exclui direto na query em vez de
// buscar tudo e descartar depois em memória.
const COLUNAS_REGISTRO_BACKUP = `id, consultor, loja, tipoOperacao, dataOperacao, fundoCaixa, valorEnvelope,
  valorFaturado, sangria, sangriaMotivo, observacoes, status, dataRetirada, retiradoPor,
  confirmadoPorApp, autorizadoPor, mensagemGerada, criadoEm, deletadoEm`;

async function gerarBackupCompleto() {
  const backup = {};
  for (const tabela of BACKUP_TABELAS) {
    const isRegistros = tabela === 'registros' || tabela === 'registros_fa';
    const rows = await dbAllAsync(isRegistros ? `SELECT ${COLUNAS_REGISTRO_BACKUP} FROM ${tabela}` : `SELECT * FROM ${tabela}`);
    backup[tabela] = isRegistros
      ? rows.map(r => ({ ...r, fotoEnvelope: '[foto omitida do backup por e-mail — disponível no app]' }))
      : rows;
  }
  return backup;
}

async function enviarBackupMensalSilencioso() {
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!host || !user || !pass) {
    console.warn('[Backup Mensal] SMTP não configurado — backup não enviado.');
    return { enviado: false, motivo: 'smtp_nao_configurado' };
  }

  const agora = new Date();
  const referencia = `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, '0')}`;

  // Backup é da instância inteira (todas as tabelas, ver BACKUP_TABELAS),
  // não de uma organização — TENANT_ZERO_ID aqui é só onde a linha de
  // controle mora fisicamente no schema (mesmo padrão de 'vapid_keys').
  const jaEnviado = await dbGetAsync('SELECT valor FROM configuracoes WHERE organizationId = ? AND chave = ?', [TENANT_ZERO_ID, 'ultimoBackupMensalEnviado']);
  if (jaEnviado && jaEnviado.valor === referencia) {
    return { enviado: false, motivo: 'ja_enviado_este_mes', referencia };
  }

  const backup = await gerarBackupCompleto();
  const resumo = Object.entries(backup).map(([tabela, rows]) => `${tabela}: ${rows.length}`).join('\n');

  const transporter = nodemailer.createTransport({
    host,
    port: parseInt(process.env.SMTP_PORT) || 465,
    secure: process.env.SMTP_SECURE === 'true',
    auth: { user, pass }
  });

  const mesNome = agora.toLocaleString('pt-BR', { month: 'long', year: 'numeric' });

  await transporter.sendMail({
    from: `"Controle de Caixa Cacau Show" <${user}>`,
    to: BACKUP_EMAIL_DESTINO,
    subject: `📦 Backup Mensal Automático — Controle de Caixa (${mesNome})`,
    text: `Backup automático mensal gerado em ${agora.toLocaleString('pt-BR')}.\n\nRegistros incluídos:\n${resumo}\n\nO arquivo em anexo contém todos os dados em formato JSON.`,
    attachments: [
      {
        filename: `backup-controle-caixa-${referencia}.json`,
        content: JSON.stringify(backup, null, 2),
        contentType: 'application/json'
      }
    ]
  });

  await dbRunAsync(
    "INSERT INTO configuracoes (chave, valor, organizationId) VALUES (?, ?, ?) ON CONFLICT(organizationId, chave) DO UPDATE SET valor = ?",
    ['ultimoBackupMensalEnviado', referencia, TENANT_ZERO_ID, referencia]
  );

  console.log(`[Backup Mensal] Enviado com sucesso para ${BACKUP_EMAIL_DESTINO} (referência ${referencia}).`);
  return { enviado: true, referencia };
}

// Heartbeat leve para o cliente checar conectividade (webapp/app.js chama a
// cada 10s). Não toca no banco de propósito — antes disso o heartbeat batia
// em GET /api/config, que virou a query mais executada do sistema inteiro
// (83 mil chamadas registradas, a imensa maioria só pra saber se o servidor
// estava de pé).
app.get('/api/ping', (req, res) => res.sendStatus(200));

// Endpoint para servir a tabela de consulta de códigos de barras (Codbarra_Consulta.csv)
// Utilizado pelo app.js para montar os mapas de lookup CodBarra<->CodProduto
// Otimizado com leitura de arquivo assíncrona (Item 3 das Melhorias de I/O)
app.get('/api/codbarra-consulta', async (req, res) => {
  const csvPath = path.join(__dirname, 'Codbarra_Consulta.csv');
  try {
    const data = await fs.promises.readFile(csvPath, 'utf8');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.send(data);
  } catch (err) {
    console.error('[Codbarra] Erro ao ler Codbarra_Consulta.csv:', err.message);
    res.status(500).json({ error: 'Arquivo de consulta não encontrado.' });
  }
});

// Endpoint manual/opcional para forçar o backup mensal fora do agendamento
app.get('/api/cron/backup-mensal', async (req, res) => {
  if (process.env.CRON_SECRET) {
    const auth = req.headers['authorization'];
    const secretQuery = req.query.secret;
    const validHeader = auth === `Bearer ${process.env.CRON_SECRET}`;
    const validQuery = secretQuery === process.env.CRON_SECRET;
    if (!validHeader && !validQuery) {
      return res.status(401).json({ error: 'Não autorizado.' });
    }
  }
  try {
    const resultado = await enviarBackupMensalSilencioso();
    res.json(resultado);
  } catch (err) {
    console.error('[Backup Mensal] Erro ao gerar/enviar backup:', err);
    res.status(500).json({ error: err.message });
  }
});

// Via principal e automática: node-cron interno conferindo todo dia às 6h
if (require.main === module) {
  cron.schedule('0 6 * * *', () => {
    enviarBackupMensalSilencioso().catch(err => {
      console.error('[Backup Mensal] Erro na verificação diária:', err);
    });
  });
}

// Dispara o aviso de um único intervalo (loja + horaSlot). Extraído para uma
// função porque é chamado de dois lugares: o cron.schedule interno (que só
// dispara com o processo acordado) e o endpoint /api/cron/ia-tick (que
// funciona mesmo com a instância dormindo, ver seção "PINGADOR EXTERNO"
// abaixo). marcarSeNovo garante que os dois caminhos não dupliquem o envio
// se ambos disparam perto um do outro no mesmo dia.
async function dispararCopilotoDoSlot(loja, data, horaSlot) {
  const { marcarSeNovo } = require('./services/ia');
  const novo = await marcarSeNovo(`enviado:copiloto:${loja}:${data}:${horaSlot}`, 24 * 3600);
  if (!novo) return { enviado: false, motivo: 'ja_enviado' };

  try {
    const { gerarAvisoCopiloto } = require('./services/ia-copiloto');
    const { texto } = await gerarAvisoCopiloto({ loja, data, horaSlot });
    enviarNotificacaoPush(`⏰ Meta ${horaSlot} — ${loja}`, texto, null, 'meta_lembrete');
    obterEmailsDestinatarios('meta_lembrete', (emails) => {
      if (emails && emails.length) {
        enviarEmailGenerico(emails, `Meta Hora a Hora — ${horaSlot} — ${loja}`, texto).catch(() => {});
      }
    });
    return { enviado: true, fonte: 'copiloto' };
  } catch (err) {
    // Copiloto (IA — item 6) falhou: cai no lembrete genérico, que é o
    // comportamento garantido de sempre.
    console.error('[Copiloto] Falha, usando lembrete padrão:', err.message);
    enviarLembreteMetaHoraHora(loja, horaSlot);
    return { enviado: true, fonte: 'lembrete_padrao' };
  }
}

// Meta Hora a Hora — lembrete às colaboradoras alguns minutos antes de cada
// intervalo. Roda a cada minuto; dispara só quando "agora" bate exatamente
// com "horário do slot - META_LEMBRETE_MIN_ANTES" (evita duplicar o aviso).
// Só funciona enquanto o processo estiver acordado — no plano gratuito do
// Render é o /api/cron/ia-tick (pingado de fora) que garante o disparo.
if (require.main === module) {
  cron.schedule('* * * * *', () => {
    try {
      const agora = agoraBrasilMeta();
      Object.keys(OPERACOES_CONFIG_META).forEach(loja => {
        if (UNIDADES_FA_META.includes(loja)) return;
        checkpointsDoDiaMeta(loja).forEach(slotMin => {
          if (agora.minutosDoDia === slotMin - META_LEMBRETE_MIN_ANTES) {
            dispararCopilotoDoSlot(loja, agora.data, minutosParaHoraStrMeta(slotMin))
              .catch(err => console.error('[Meta Hora a Hora] Erro no job de lembrete:', err));
          }
        });
      });
    } catch (err) {
      console.error('[Meta Hora a Hora] Erro no job de lembrete:', err);
    }
  });
}

// Meta Hora a Hora — resumo de atraso para o Líder de Operação. Roda uma vez
// por dia, logo após o fechamento mais tardio (22h), comparando os
// checkpoints esperados com o que foi de fato confirmado em metas_vendas.
if (require.main === module) {
  cron.schedule('5 22 * * *', async () => {
    try {
      const agora = agoraBrasilMeta();
      const resumoPorLoja = {};

      for (const loja of Object.keys(OPERACOES_CONFIG_META)) {
        if (UNIDADES_FA_META.includes(loja)) continue;

        const metaHoje = await dbGetAsync(
          'SELECT * FROM metas_diarias_lojas WHERE loja = ? AND data = ?',
          [loja, agora.data]
        );
        if (!metaHoje || !['diaria', 'manual'].includes(metaHoje.origem)) continue;

        const checkins = await dbAllAsync(
          'SELECT horaslot AS "horaSlot" FROM metas_vendas WHERE operacao = ? AND data = ?',
          [loja, agora.data]
        );
        const confirmados = new Set(checkins.map(c => c.horaSlot));

        const perdidos = checkpointsDoDiaMeta(loja)
          .filter(slotMin => slotMin + META_JANELA_FECHAMENTO_DEPOIS_MIN < agora.minutosDoDia)
          .map(minutosParaHoraStrMeta)
          .filter(horaSlot => !confirmados.has(horaSlot));

        if (perdidos.length > 0) resumoPorLoja[loja] = perdidos;
      }

      enviarResumoAtrasoMeta(resumoPorLoja);
    } catch (err) {
      console.error('[Meta Hora a Hora] Erro no job de resumo de atraso:', err);
    }
  });
}

// ==========================================================================
// BRIEFING DIÁRIO DO GESTOR (IA — item 2)
// ==========================================================================
// Entrega ao Owner e ao Líder de Operação o resumo do dia anterior.
// Reaproveita o cache de services/ia.js: como a rota /api/ia/briefing usa a
// mesma chave, abrir a tela depois do disparo não gera uma segunda chamada
// ao provedor. marcarSeNovo garante um único envio por dia mesmo chamada de
// dois lugares (cron interno + /api/cron/ia-tick).
async function dispararBriefingDiario() {
  const { marcarSeNovo } = require('./services/ia');
  const { hojeBrasil } = require('./services/ia-briefing');
  const hoje = hojeBrasil();

  const novo = await marcarSeNovo(`enviado:briefing:${hoje}`, 24 * 3600);
  if (!novo) return { enviado: false, motivo: 'ja_enviado_hoje' };

  const { gerarBriefing } = require('./services/ia-briefing');
  const { briefing } = await gerarBriefing();

  const linhas = [
    briefing.manchete,
    '',
    briefing.vendas,
    '',
    'ALERTAS:',
    ...briefing.alertas.map(a => `- ${a}`),
    '',
    'PRIORIDADES DE HOJE:',
    ...briefing.prioridades.map((p, i) => `${i + 1}. ${p}`),
    '',
    briefing.fechamento || ''
  ].join('\n');

  enviarNotificacaoPush('Briefing do dia', briefing.manchete, null, 'briefing_diario');

  obterEmailsDestinatarios('briefing_diario', (emails) => {
    if (!emails || emails.length === 0) return;
    enviarEmailGenerico(emails, 'Briefing diário da operação', linhas)
      .catch(err => console.error('[Briefing] Falha ao enviar e-mail:', err.message));
  });

  return { enviado: true };
}

// Via principal: dispara às 7h de Brasília, mas só funciona com o processo
// acordado. Ver /api/cron/ia-tick logo abaixo para o plano gratuito do Render.
if (require.main === module) {
  cron.schedule('0 7 * * *', () => {
    dispararBriefingDiario().catch(err => console.error('[Briefing] Erro no job diário:', err));
  }, { timezone: 'America/Sao_Paulo' });
}

// ==========================================================================
// PINGADOR EXTERNO (plano gratuito do Render)
// ==========================================================================
// A instância grátis do Render hiberna após ~15 minutos sem tráfego HTTP.
// Os cron.schedule internos acima (briefing das 7h, copiloto pré-intervalo)
// simplesmente não disparam com o processo dormindo — não existe timer
// "acordando" a instância sozinho.
//
// A saída é este endpoint único, protegido por CRON_SECRET: um serviço
// externo gratuito (cron-job.org, UptimeRobot, GitHub Actions agendado...)
// bate aqui a cada ~10 minutos. Isso (a) mantém a instância acordada e
// (b) verifica o que está pendente e dispara. marcarSeNovo (em services/ia.js)
// garante que o mesmo intervalo não seja enviado duas vezes, então pingar
// com frequência maior que o necessário é inofensivo — só custa uma consulta
// ao banco por chamada quando nada está pendente.
//
// Configuração passo a passo em docs/IA.md.
app.get('/api/cron/ia-tick', async (req, res) => {
  if (process.env.CRON_SECRET) {
    const auth = req.headers['authorization'];
    const secretQuery = req.query.secret;
    const validHeader = auth === `Bearer ${process.env.CRON_SECRET}`;
    const validQuery = secretQuery === process.env.CRON_SECRET;
    if (!validHeader && !validQuery) {
      return res.status(401).json({ error: 'Não autorizado.' });
    }
  }

  const disparos = [];

  try {
    const agora = agoraBrasilMeta();

    // Briefing: qualquer ping a partir das 7h (Brasil) dispara, uma vez por
    // dia. Se o primeiro ping do dia só chegar às 7h12 (instância dormindo
    // até então), o briefing sai atrasado 12 minutos — melhor que não sair.
    if (agora.minutosDoDia >= 7 * 60) {
      const r = await dispararBriefingDiario();
      if (r.enviado) disparos.push({ tipo: 'briefing', ...r });
    }

    // Copiloto: janela de tolerância maior que o intervalo do pingador, para
    // não perder o disparo se um ping específico atrasar ou falhar. Vai até
    // um pouco depois do horário do intervalo — atrasado ainda é útil.
    const TOLERANCIA_PING_MIN = 15;
    for (const loja of Object.keys(OPERACOES_CONFIG_META)) {
      if (UNIDADES_FA_META.includes(loja)) continue;
      for (const slotMin of checkpointsDoDiaMeta(loja)) {
        const inicioJanela = slotMin - META_LEMBRETE_MIN_ANTES - TOLERANCIA_PING_MIN;
        const fimJanela = slotMin + 5;
        if (agora.minutosDoDia >= inicioJanela && agora.minutosDoDia <= fimJanela) {
          const r = await dispararCopilotoDoSlot(loja, agora.data, minutosParaHoraStrMeta(slotMin));
          if (r.enviado) disparos.push({ tipo: 'copiloto', loja, horaSlot: minutosParaHoraStrMeta(slotMin), ...r });
        }
      }
    }

    res.json({ ok: true, disparos });
  } catch (err) {
    console.error('[ia-tick] Erro:', err);
    res.status(500).json({ error: err.message });
  }
});

// Inicializar banco de dados e iniciar servidor
initDb(() => {
  // Cron Job para Visão Geral Diária às 19:00 (Fuso horário do Brasil)
  cron.schedule('0 19 * * *', () => {
    console.log('[cron] Disparando notificação de visão geral diária (19h)...');
    enviarNotificacaoVisao19h();
  }, { timezone: 'America/Sao_Paulo' });

  if (require.main === module) {
    app.listen(PORT, () => {
      console.log(`Servidor rodando na porta ${PORT}`);
    });
  }
});

module.exports = app;
