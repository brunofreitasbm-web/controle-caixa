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

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json({ limit: '15mb' }));

// Servir os arquivos estáticos da webapp
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

// Meta Hora a Hora — lembrete às colaboradoras alguns minutos antes de cada
// intervalo. Roda a cada minuto; dispara só quando "agora" bate exatamente
// com "horário do slot - META_LEMBRETE_MIN_ANTES" (evita duplicar o aviso).
if (require.main === module) {
  cron.schedule('* * * * *', () => {
    try {
      const agora = agoraBrasilMeta();
      Object.keys(OPERACOES_CONFIG_META).forEach(loja => {
        if (UNIDADES_FA_META.includes(loja)) return;
        checkpointsDoDiaMeta(loja).forEach(slotMin => {
          if (agora.minutosDoDia === slotMin - META_LEMBRETE_MIN_ANTES) {
            const horaSlot = minutosParaHoraStrMeta(slotMin);

            // Copiloto (IA — item 6): troca o lembrete genérico por uma
            // instrução com o ritmo do dia. Qualquer falha cai no lembrete
            // original, que continua sendo o comportamento garantido.
            const { gerarAvisoCopiloto } = require('./services/ia-copiloto');
            gerarAvisoCopiloto({ loja, data: agora.data, horaSlot })
              .then(({ texto }) => {
                enviarNotificacaoPush(`⏰ Meta ${horaSlot} — ${loja}`, texto, null, 'meta_lembrete');
                obterEmailsDestinatarios('meta_lembrete', (emails) => {
                  if (emails && emails.length) {
                    enviarEmailGenerico(emails, `Meta Hora a Hora — ${horaSlot} — ${loja}`, texto).catch(() => {});
                  }
                });
              })
              .catch(err => {
                console.error('[Copiloto] Falha, usando lembrete padrão:', err.message);
                enviarLembreteMetaHoraHora(loja, horaSlot);
              });
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
// Roda às 7h de Brasília e entrega ao Owner e ao Líder de Operação o resumo
// do dia anterior. Reaproveita o cache de services/ia.js: como a rota
// /api/ia/briefing usa a mesma chave, abrir a tela depois do cron não gera
// uma segunda chamada ao provedor.
if (require.main === module) {
  cron.schedule('0 7 * * *', async () => {
    try {
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
    } catch (err) {
      console.error('[Briefing] Erro no job diário:', err);
    }
  }, { timezone: 'America/Sao_Paulo' });
}

// Inicializar banco de dados e iniciar servidor
initDb(() => {
  if (require.main === module) {
    app.listen(PORT, () => {
      console.log(`Servidor rodando na porta ${PORT}`);
    });
  }
});

module.exports = app;
