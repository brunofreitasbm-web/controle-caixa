require('dotenv').config();
const dns = require('node:dns');
dns.setDefaultResultOrder('ipv4first');

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const nodemailer = require('nodemailer');
const cron = require('node-cron');

const { initDb, dbAllAsync, dbGetAsync, dbRunAsync } = require('./config/database');
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
  enviarNotificacaoPush
} = require('./config/notifications');

const authRoutes = require('./routes/auth');
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

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json({ limit: '15mb' }));

// Servir os arquivos estáticos da webapp (v1). A v2 (React) foi arquivada em
// archive/frontend-v2 e não é mais servida.
app.use(express.static(path.join(__dirname, 'webapp')));

// Registrar Rotas Modularizadas
// O canal SSE vem primeiro: é uma conexão longa e não deve passar por nenhum
// middleware de parsing/roteamento mais pesado.
app.use('/api', realtimeRoutes);
app.use('/api', inventarioRoutes);
app.use('/api', iaRoutes);
app.use('/api', authRoutes);
app.use('/api', caixaRoutes);
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

// ==========================================================================
// BACKUP MENSAL AUTOMÁTICO (silencioso, por e-mail)
// ==========================================================================
const BACKUP_EMAIL_DESTINO = 'brunofreitasbm@gmail.com';
const BACKUP_TABELAS = ['registros', 'registros_fa', 'nfs', 'boletos', 'colaboradores', 'logs_auditoria'];

async function gerarBackupCompleto() {
  const backup = {};
  for (const tabela of BACKUP_TABELAS) {
    const rows = await dbAllAsync(`SELECT * FROM ${tabela}`);
    if (tabela === 'registros' || tabela === 'registros_fa') {
      backup[tabela] = rows.map(r => ({ ...r, fotoEnvelope: r.fotoEnvelope ? '[foto omitida do backup por e-mail — disponível no app]' : null }));
    } else {
      backup[tabela] = rows;
    }
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

  const jaEnviado = await dbGetAsync('SELECT valor FROM configuracoes WHERE chave = ?', ['ultimoBackupMensalEnviado']);
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
    "INSERT INTO configuracoes (chave, valor) VALUES (?, ?) ON CONFLICT(chave) DO UPDATE SET valor = ?",
    ['ultimoBackupMensalEnviado', referencia, referencia]
  );

  console.log(`[Backup Mensal] Enviado com sucesso para ${BACKUP_EMAIL_DESTINO} (referência ${referencia}).`);
  return { enviado: true, referencia };
}

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
    if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
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
    if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
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
  if (require.main === module) {
    app.listen(PORT, () => {
      console.log(`Servidor rodando na porta ${PORT}`);
    });
  }
});

module.exports = app;
