const path = require('path');
const webPush = require('web-push');

const isPostgres = !!process.env.DATABASE_URL;

// Fundação multi-tenant (Fase 1 do plano de SaaS): id estável da organização
// que hoje é a única existente — a operação real do dono (Cacau Show +
// Faça Amigos). Todo dado pré-existente é migrado para este id no boot;
// uma segunda organização real só passa a existir quando alguém a cadastrar
// em `organizations`. Ver routes/auth.js e routes/middleware/resolveTenantSession.js.
const TENANT_ZERO_ID = 'org-matriz-belem';

const camelCaseMap = {
  tipooperacao: 'tipoOperacao',
  dataoperacao: 'dataOperacao',
  fundocaixa: 'fundoCaixa',
  valorenvelope: 'valorEnvelope',
  valorfaturado: 'valorFaturado',
  fotoenvelope: 'fotoEnvelope',
  temfoto: 'temFoto',
  dataretirada: 'dataRetirada',
  retiradopor: 'retiradoPor',
  confirmadoporapp: 'confirmadoPorApp',
  autorizadopor: 'autorizadoPor',
  mensagemgerada: 'mensagemGerada',
  criadoem: 'criadoEm',
  deletadoem: 'deletadoEm',
  registroid: 'registroId',
  metaanual: 'metaAnual',
  metamensal: 'metaMensal',
  importadoem: 'importadoEm',
  vendaacumulada: 'vendaAcumulada',
  registradopor: 'registradoPor',
  codproduto: 'codProduto',
  dataentrada: 'dataEntrada',
  countedqty: 'countedQty',
  qtdentradaunidades: 'qtdEntradaUnidades',
  qtdentradacaixas: 'qtdEntradaCaixas',
  atualizadopor: 'atualizadoPor',
  atualizadoem: 'atualizadoEm',
  hasbiometricenrolled: 'hasBiometricEnrolled',
  tentativasfalhas: 'tentativasFalhas',
  bloqueadoate: 'bloqueadoAte',
  ultimatentativaem: 'ultimaTentativaEm',
  datanascimento: 'dataNascimento',
  dataadmissao: 'dataAdmissao',
  datasessao: 'dataSessao',
  numerocliente: 'numeroCliente',
  tempototalminutos: 'tempoTotalMinutos',
  mensagemenviada: 'mensagemEnviada',
  mensagemenviadaem: 'mensagemEnviadaEm',
  jacontactadoantes: 'jaContactadoAntes',
  amigo1nome: 'amigo1Nome',
  amigo1em: 'amigo1Em',
  amigo2nome: 'amigo2Nome',
  amigo2em: 'amigo2Em',
  voucherenviadoem: 'voucherEnviadoEm',
  voucherentregue: 'voucherEntregue',
  voucherentregueem: 'voucherEntregueEm',
  brindeescolhido: 'brindeEscolhido',
  nomecrianca: 'nomeCrianca',
  nomeresponsavel: 'nomeResponsavel',
  mensagemenviadaano: 'mensagemEnviadaAno',
  categoriaoutro: 'categoriaOutro',
  nomearquivo: 'nomeArquivo',
  mimetype: 'mimeType',
  datavencimento: 'dataVencimento',
  vencimentosugeridoia: 'vencimentoSugeridoIA',
  enviadopor: 'enviadoPor',
  mesreferencia: 'mesReferencia',
  saldooperacao: 'saldoOperacao',
  saldoimposto: 'saldoImposto',
  saldoreserva: 'saldoReserva',
  retiradasocios: 'retiradaSocios',
  datacomemorativa: 'dataComemorativa',
  mesreferenciafaturamento: 'mesReferenciaFaturamento',
  faturamentoanoanterior: 'faturamentoAnoAnterior',
  pedidooferecido: 'pedidoOferecido',
  fatorteto: 'fatorTeto',
  multiplicadorroyalties: 'multiplicadorRoyalties',
  faturamentomes: 'faturamentoMes',
  despesafixames: 'despesaFixaMes',
  pontoequilibriomes: 'pontoEquilibrioMes',
  pontoequilibriodia: 'pontoEquilibrioDia',
  resultado10meses: 'resultado10Meses',
  aliquotaimposto: 'aliquotaImposto',
  codbarras: 'codBarras',
  valortotal: 'valorTotal',
  numeronfe: 'numeroNfe',
  chaveacesso: 'chaveAcesso',
  dataemissao: 'dataEmissao',
  conferidopor: 'conferidoPor',
  // Fundação multi-tenant (Fase 1): colunas/tabelas novas de organizations,
  // tenant_negocios, unidades, tenant_modules e sessions. No Postgres, todo
  // identificador sem aspas vira minúsculo — aqui devolve pro shape camelCase
  // que o resto do app já espera.
  organizationid: 'organizationId',
  nomeexibicao: 'nomeExibicao',
  negociochave: 'negocioChave',
  codigoexterno: 'codigoExterno',
  whatsappgrupourl: 'whatsappGrupoUrl',
  coremoji: 'corEmoji',
  modulochave: 'moduloChave',
  colaboradornome: 'colaboradorNome',
  expiraem: 'expiraEm',
  pinhash: 'pinHash'
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

let db;

if (isPostgres) {
  console.log('Iniciando conexão com banco de dados PostgreSQL (Supabase)...');
  const { Pool } = require('pg');
  const sslRejectUnauthorized = process.env.DB_SSL_REJECT_UNAUTHORIZED === 'true';
  let dbUrl = process.env.DATABASE_URL || '';
  if (dbUrl.includes('pooler.supabase.com:5432')) {
    dbUrl = dbUrl.replace('pooler.supabase.com:5432', 'pooler.supabase.com:6543');
  }
  const pool = new Pool({
    connectionString: dbUrl,
    ssl: {
      rejectUnauthorized: sslRejectUnauthorized
    },
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000
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
} else {
  console.log('Iniciando conexão com banco de dados SQLite...');
  const sqlite3 = require('sqlite3').verbose();
  const dbPath = path.join(__dirname, '..', 'database.db');
  const sqliteDb = new sqlite3.Database(dbPath, (err) => {
    if (err) {
      console.error('Erro ao conectar ao banco de dados SQLite:', err.message);
    } else {
      console.log('Conectado ao banco de dados SQLite.');
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

function dbAllAsync(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err); else resolve(rows || []);
    });
  });
}

function dbGetAsync(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err); else resolve(row);
    });
  });
}

function dbRunAsync(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, (err) => {
      if (err) reject(err); else resolve();
    });
  });
}

// Reconstrói uma tabela para trocar sua PK/UNIQUE por uma versão com escopo
// de organização — SQLite não tem ALTER TABLE ... DROP CONSTRAINT/MODIFY
// COLUMN, então o caminho (também válido no Postgres) é: criar uma tabela
// nova com o schema final, copiar os dados, derrubar a antiga e renomear.
// Mesmo padrão já usado neste arquivo para a migração de pos_visita_indicadores.
// Seguro para rodar em toda inicialização (idempotente): se a tabela final já
// tem os dados, a cópia só os re-escreve sem mudar nada.
async function rebuildTableWithOrgScope(table, createSqlNewShape, colunas) {
  const tmp = `${table}__tmp_org`;
  let createTmpSql = createSqlNewShape.replace(
    new RegExp(`CREATE TABLE IF NOT EXISTS ${table}\\b`),
    `CREATE TABLE IF NOT EXISTS ${tmp}`
  );
  if (isPostgres && createTmpSql.includes('AUTOINCREMENT')) {
    createTmpSql = createTmpSql.replace('INTEGER PRIMARY KEY AUTOINCREMENT', 'SERIAL PRIMARY KEY');
  }
  const cols = colunas.join(', ');
  await dbRunAsync(`DROP TABLE IF EXISTS ${tmp}`);
  await dbRunAsync(createTmpSql);
  await dbRunAsync(`INSERT INTO ${tmp} (${cols}) SELECT ${cols} FROM ${table}`);
  await dbRunAsync(`DROP TABLE ${table}`);
  await dbRunAsync(`ALTER TABLE ${tmp} RENAME TO ${table}`);
}

function initDb(onSuccess) {
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
          valorFaturado REAL,
          sangria REAL,
          sangriaMotivo TEXT,
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
          valorFaturado REAL,
          sangria REAL,
          sangriaMotivo TEXT,
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
          nome TEXT NOT NULL,
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
          docFaturamento TEXT,
          parcela TEXT,
          loja TEXT,
          descricao TEXT,
          vencimento TEXT,
          valor REAL,
          status TEXT,
          pagoEm TEXT,
          pendenciaSafDispensada INTEGER DEFAULT 0,
          criadoEm TEXT
        )`,
        `CREATE TABLE IF NOT EXISTS ponto_registros (
          id TEXT PRIMARY KEY,
          usuario TEXT NOT NULL,
          timestamp TEXT NOT NULL,
          tipo TEXT NOT NULL,
          gps TEXT,
          accuracy REAL,
          photo TEXT,
          hash TEXT,
          audit_deviation REAL,
          criadoEm TEXT
        )`,
        `CREATE TABLE IF NOT EXISTS ponto_ajustes (
          id TEXT PRIMARY KEY,
          usuario TEXT NOT NULL,
          data TEXT NOT NULL,
          tipo TEXT NOT NULL,
          motivo TEXT,
          comprovante TEXT,
          status TEXT,
          criadoEm TEXT
        )`,
        // Embedding facial (128 floats, JSON) para reconhecimento no Registro
        // de Ponto — uma linha por usuário, reaproveitada em toda marcação
        // futura. TEXT funciona igual em SQLite/Postgres, sem precisão a perder
        // (é serializado, não somado no SQL).
        `CREATE TABLE IF NOT EXISTS ponto_biometria (
          usuario TEXT PRIMARY KEY,
          embedding TEXT NOT NULL,
          criadoEm TEXT,
          atualizadoEm TEXT
        )`,
        // Controle de tentativas de cadastro biométrico (self-enrollment).
        // Separada de ponto_biometria porque o embedding lá é NOT NULL — aqui
        // um usuário pode acumular falhas sem nunca ter tido um embedding.
        `CREATE TABLE IF NOT EXISTS biometria_tentativas (
          usuario TEXT PRIMARY KEY,
          tentativasFalhas INTEGER DEFAULT 0,
          bloqueadoAte TEXT,
          ultimaTentativaEm TEXT
        )`,
        // DOUBLE PRECISION (não REAL): no Postgres, REAL é float4 e arredonda
        // valores monetários acima de ~7 dígitos (264634,67 viraria 264635).
        // No SQLite o nome mapeia para afinidade REAL (double de 8 bytes).
        `CREATE TABLE IF NOT EXISTS metas_vendas (
          id TEXT PRIMARY KEY,
          operacao TEXT NOT NULL,
          usuario TEXT NOT NULL,
          valor DOUBLE PRECISION NOT NULL,
          timestamp TEXT NOT NULL,
          criadoEm TEXT
        )`,
        `CREATE TABLE IF NOT EXISTS fa_bonificacao_diaria (
          id TEXT PRIMARY KEY,
          usuario TEXT NOT NULL,
          unidade TEXT,
          data TEXT NOT NULL,
          vendas30 INTEGER NOT NULL DEFAULT 0,
          vendas1h INTEGER NOT NULL DEFAULT 0,
          vendas2h INTEGER NOT NULL DEFAULT 0,
          locacoes INTEGER NOT NULL DEFAULT 0,
          criadoEm TEXT,
          UNIQUE(usuario, unidade, data)
        )`,
        `CREATE TABLE IF NOT EXISTS nfe_conferencia (
          id TEXT PRIMARY KEY,
          loja TEXT NOT NULL,
          numeroNfe TEXT,
          chaveAcesso TEXT,
          dataEmissao TEXT,
          valor DOUBLE PRECISION NOT NULL,
          status TEXT DEFAULT 'pendente',
          observacoes TEXT,
          conferidoPor TEXT,
          criadoEm TEXT,
          atualizadoEm TEXT
        )`,
        `CREATE TABLE IF NOT EXISTS fa_bonificacao_regras (
          competencia TEXT PRIMARY KEY,
          ouroPercentMin DOUBLE PRECISION NOT NULL,
          ouroValor DOUBLE PRECISION NOT NULL,
          diamantePercentMin DOUBLE PRECISION NOT NULL,
          diamanteValor DOUBLE PRECISION NOT NULL,
          pixMinVendas2h INTEGER NOT NULL,
          pixValor DOUBLE PRECISION NOT NULL,
          pixDiasSemana TEXT NOT NULL,
          criadoEm TEXT
        )`,
        `CREATE TABLE IF NOT EXISTS metas_diarias_lojas (
          id TEXT PRIMARY KEY,
          loja TEXT NOT NULL,
          data TEXT NOT NULL,
          valor DOUBLE PRECISION NOT NULL,
          origem TEXT NOT NULL,
          criadoEm TEXT,
          UNIQUE(loja, data)
        )`,
        // Parque Circuito (quiosque de carrinhos) usa uma metodologia própria:
        // a meta é contagem de LOCAÇÕES por dia da semana, não % de conversão.
        // Por isso vive numa tabela separada de fa_bonificacao_regras, que
        // atende ParqueShopping e Grão Pará.
        `CREATE TABLE IF NOT EXISTS fa_regras_locacoes (
          competencia TEXT PRIMARY KEY,
          metaSegQui INTEGER NOT NULL,
          metaSexta INTEGER NOT NULL,
          metaSabado INTEGER NOT NULL,
          metaDomingo INTEGER NOT NULL,
          ticketMedio DOUBLE PRECISION NOT NULL,
          pisoMes INTEGER NOT NULL,
          metaMes INTEGER NOT NULL,
          superMetaMes INTEGER NOT NULL,
          farolVerde DOUBLE PRECISION NOT NULL,
          farolAmarelo DOUBLE PRECISION NOT NULL,
          criadoEm TEXT
        )`,
        // Meta do ano da operação (PR #1) — estrutura placeholder à espera do
        // modelo de importação. Mantida em paralelo à metas_diarias_lojas, que
        // é a importação diária concreta a partir da coluna "$ Meta Total".
        `CREATE TABLE IF NOT EXISTS metas (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          ano INTEGER NOT NULL,
          loja TEXT NOT NULL,
          metaAnual REAL,
          metaMensal TEXT,
          origem TEXT,
          criadoEm TEXT,
          importadoEm TEXT
        )`,
        // Meta Hora a Hora (PR #1) — venda acumulada por hora. Mantida em
        // paralelo à metas_vendas, que registra o check-in por intervalo.
        `CREATE TABLE IF NOT EXISTS vendas_horarias (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          loja TEXT NOT NULL,
          data TEXT NOT NULL,
          hora INTEGER NOT NULL,
          vendaAcumulada REAL,
          registradoPor TEXT,
          criadoEm TEXT,
          UNIQUE(loja, data, hora)
        )`,
        // Inventário de estoque compartilhado. Antes disso o inventário vivia
        // apenas no localStorage de cada aparelho (chaves
        // cacaushow_db_inventory_<loja>_<cod>), então duas consultoras contando
        // a mesma loja não enxergavam uma o trabalho da outra.
        // countedQty é TEXT de propósito: o app usa '' para "ainda não contado"
        // e precisa distinguir isso de 0 (contado e não tem nenhum).
        `CREATE TABLE IF NOT EXISTS inventario_itens (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          loja TEXT NOT NULL,
          codProduto TEXT NOT NULL,
          barras TEXT,
          descricao TEXT,
          validade TEXT,
          countedQty TEXT,
          dataEntrada TEXT,
          qtdEntradaUnidades INTEGER DEFAULT 0,
          qtdEntradaCaixas INTEGER DEFAULT 0,
          atualizadoPor TEXT,
          atualizadoEm TEXT,
          criadoEm TEXT,
          UNIQUE(loja, codProduto)
        )`,
        // Pós-visita 1h/2h (FaçaAmigos): fila de disparo de WhatsApp para
        // responsáveis cuja criança ficou mais de 1h no playground, importada
        // diariamente via Make.com a partir do relatório de vendas por e-mail.
        `CREATE TABLE IF NOT EXISTS pos_visita_registros (
          id TEXT PRIMARY KEY,
          dataSessao TEXT NOT NULL,
          cliente TEXT NOT NULL,
          numeroCliente TEXT NOT NULL,
          crianca TEXT NOT NULL,
          tempoTotalMinutos INTEGER NOT NULL,
          mensagemEnviada INTEGER DEFAULT 0,
          mensagemEnviadaEm TEXT,
          criadoEm TEXT,
          UNIQUE(dataSessao, numeroCliente, crianca)
        )`,
        // Ação 2 — Pós-Venda Multiplicador (ver acao_2_pos_venda.md): controle
        // das indicações prometidas na mensagem de pós-visita.
        //
        // A chave é o TELEFONE, sozinho. Quem chega ao balcão diz o nome e o
        // WhatsApp de quem indicou — é só isso que a recepção tem em mãos, e o
        // WhatsApp é o único dado que identifica a família sem ambiguidade
        // (dois "Enzo" existem; dois números iguais, não). Por isso `crianca`
        // é opcional: o nome do filho quase nunca vem nessa hora.
        `CREATE TABLE IF NOT EXISTS pos_visita_indicadores (
          id TEXT PRIMARY KEY,
          responsavel TEXT NOT NULL,
          telefone TEXT NOT NULL UNIQUE,
          crianca TEXT,
          amigo1Nome TEXT,
          amigo1Em TEXT,
          amigo2Nome TEXT,
          amigo2Em TEXT,
          voucherEnviadoEm TEXT,
          voucherEntregue INTEGER DEFAULT 0,
          voucherEntregueEm TEXT,
          brindeEscolhido TEXT,
          observacoes TEXT,
          criadoEm TEXT,
          atualizadoEm TEXT
        )`,
        // Aniversários (FaçaAmigos): cadastro de crianças importado de PDF,
        // usado para disparar parabéns no WhatsApp no dia do aniversário.
        // Chave (nomeCrianca, nomeResponsavel) permite reimportar o mesmo
        // relatório todo dia sem duplicar — só atualiza os dados.
        `CREATE TABLE IF NOT EXISTS aniversarios_registros (
          id TEXT PRIMARY KEY,
          nomeCrianca TEXT NOT NULL,
          dataNascimento TEXT NOT NULL,
          documento TEXT,
          nomeResponsavel TEXT NOT NULL,
          telefone TEXT NOT NULL,
          mensagemEnviadaAno INTEGER,
          mensagemEnviadaEm TEXT,
          criadoEm TEXT,
          atualizadoEm TEXT,
          UNIQUE(nomeCrianca, nomeResponsavel)
        )`,
        // Cache das respostas de IA (services/ia.js). Briefing do dia, coach
        // da competência e auditoria de boletos custam cota e mudam pouco
        // dentro da janela — gerar uma vez e reusar mantém o uso dentro da
        // camada gratuita. expiraEm é epoch em ms (BIGINT: um timestamp em ms
        // não cabe no INTEGER de 4 bytes do Postgres).
        `CREATE TABLE IF NOT EXISTS ia_cache (
          chave TEXT PRIMARY KEY,
          valor TEXT,
          criadoEm TEXT,
          expiraEm BIGINT
        )`,
        // Pasta de Auditoria: repositório de documentos legais/societários
        // (CNPJ, contrato social, alvará, habite-se, seguro, contratos
        // trabalhistas etc.), separado por negócio (cacau-show/faca-amigos).
        // conteudo guarda o arquivo em base64, mesmo padrão de
        // registros.fotoEnvelope.
        // Solicitação de retirada pendente de autorização: a Líder de Operações
        // (Alexandra) propõe a retirada de um ou mais envelopes, mas não
        // sabe o PIN de Bruno/Isabella — quem autoriza digita o PRÓPRIO PIN no
        // PRÓPRIO aparelho, num modal que abre sozinho (evento em tempo real +
        // push) assim que a solicitação é criada. registroIds guarda um array
        // JSON porque uma retirada em lote autoriza vários envelopes de uma vez.
        `CREATE TABLE IF NOT EXISTS solicitacoes_retirada (
          id TEXT PRIMARY KEY,
          tipo TEXT NOT NULL,
          registroIds TEXT NOT NULL,
          loja TEXT,
          valorTotal REAL,
          responsavel TEXT,
          dataRetirada TEXT,
          solicitadoPor TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'pendente',
          autorizadoPor TEXT,
          motivoRecusa TEXT,
          respondidoEm TEXT,
          criadoEm TEXT NOT NULL
        )`,
        `CREATE TABLE IF NOT EXISTS documentos_auditoria (
          id TEXT PRIMARY KEY,
          negocio TEXT NOT NULL,
          unidade TEXT,
          categoria TEXT NOT NULL,
          categoriaOutro TEXT,
          nomeArquivo TEXT,
          mimeType TEXT,
          conteudo TEXT,
          dataVencimento TEXT,
          vencimentoSugeridoIA INTEGER DEFAULT 0,
          observacoes TEXT,
          enviadoPor TEXT,
          criadoEm TEXT,
          atualizadoEm TEXT
        )`,
        // ------------------------------------------------------------------
        // Módulo Fluxo de Caixa (exclusivo Owner) — só grava o que não dá
        // para derivar de outra tabela. Faturamento/dias abertos/venda por
        // dia vêm de `registros` (mesma fonte do Dashboard/Mensal do Cacau
        // Show); títulos em aberto/vencidos vêm de `boletos`. Ver
        // services/fluxo-caixa-dados.js.
        // ------------------------------------------------------------------
        `CREATE TABLE IF NOT EXISTS fluxo_caixa_mensal (
          id TEXT PRIMARY KEY,
          mesReferencia TEXT NOT NULL,
          loja TEXT NOT NULL,
          saldoOperacao DOUBLE PRECISION,
          saldoImposto DOUBLE PRECISION,
          saldoReserva DOUBLE PRECISION,
          retiradaSocios DOUBLE PRECISION,
          observacoes TEXT,
          criadoEm TEXT,
          atualizadoEm TEXT,
          UNIQUE(mesReferencia, loja)
        )`,
        // Teto de Compra de Campanha (Páscoa, Natal etc). `pedidoOferecido` é
        // digitado pelo Bruno — não existe em nenhuma NF-e/boleto antes do
        // pedido ser fechado. `faturamentoAnoAnterior` chega pré-preenchido a
        // partir de `registros`, mas fica editável.
        `CREATE TABLE IF NOT EXISTS fluxo_caixa_campanha (
          id TEXT PRIMARY KEY,
          nome TEXT NOT NULL,
          dataComemorativa TEXT,
          mesReferenciaFaturamento TEXT,
          loja TEXT NOT NULL,
          faturamentoAnoAnterior DOUBLE PRECISION,
          pedidoOferecido DOUBLE PRECISION,
          fatorTeto DOUBLE PRECISION DEFAULT 0.40,
          multiplicadorRoyalties DOUBLE PRECISION DEFAULT 1.48,
          observacoes TEXT,
          criadoEm TEXT,
          atualizadoEm TEXT,
          UNIQUE(nome, loja)
        )`,
        // Números de referência da análise financeira (contexto_cacau_show.md)
        // — só mudam quando o Bruno reprocessa os dados, não são recalculados
        // automaticamente pelo sistema.
        `CREATE TABLE IF NOT EXISTS fluxo_caixa_referencia_loja (
          loja TEXT PRIMARY KEY,
          faturamentoMes DOUBLE PRECISION,
          despesaFixaMes DOUBLE PRECISION,
          pontoEquilibrioMes DOUBLE PRECISION,
          pontoEquilibrioDia DOUBLE PRECISION,
          resultado10Meses DOUBLE PRECISION,
          aliquotaImposto DOUBLE PRECISION DEFAULT 0.082,
          atualizadoEm TEXT
        )`,
        `CREATE TABLE IF NOT EXISTS fluxo_caixa_indice_sazonal (
          id TEXT PRIMARY KEY,
          loja TEXT NOT NULL,
          mes INTEGER NOT NULL,
          indice DOUBLE PRECISION,
          situacao TEXT,
          UNIQUE(loja, mes)
        )`,
        `CREATE TABLE IF NOT EXISTS fluxo_caixa_observacao_diaria (
          id TEXT PRIMARY KEY,
          data TEXT NOT NULL,
          loja TEXT NOT NULL,
          observacao TEXT,
          criadoEm TEXT,
          UNIQUE(data, loja)
        )`,
        `CREATE TABLE IF NOT EXISTS fluxo_caixa_checklist (
          id TEXT PRIMARY KEY,
          ordem INTEGER NOT NULL,
          quando TEXT NOT NULL,
          titulo TEXT NOT NULL,
          descricao TEXT,
          quem TEXT NOT NULL,
          concluido INTEGER DEFAULT 0,
          concluidoEm TEXT,
          notas TEXT
        )`,
        // ------------------------------------------------------------------
        // Fundação multi-tenant (Fase 1 do plano de SaaS). Ver TENANT_ZERO_ID
        // no topo deste arquivo e routes/middleware/resolveTenantSession.js.
        // A operação atual (dono) é migrada para a organização "tenant zero"
        // logo abaixo, no bloco de seed/backfill; nenhuma tabela de negócio
        // existente muda de nome ou perde dado nesta fase.
        // ------------------------------------------------------------------
        `CREATE TABLE IF NOT EXISTS organizations (
          id TEXT PRIMARY KEY,
          slug TEXT NOT NULL UNIQUE,
          nome TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'ativo',
          plano TEXT,
          criadoEm TEXT
        )`,
        // Substitui o array hardcoded NEGOCIOS_VALIDOS (routes/auditoria-docs.js):
        // cada organização cadastra 1..N negócios (um franqueado comum terá só 1).
        `CREATE TABLE IF NOT EXISTS tenant_negocios (
          id TEXT PRIMARY KEY,
          organizationId TEXT NOT NULL,
          chave TEXT NOT NULL,
          nomeExibicao TEXT,
          tipo TEXT,
          ativo INTEGER DEFAULT 1,
          criadoEm TEXT,
          UNIQUE(organizationId, chave)
        )`,
        // Substitui as constantes hardcoded LOJAS/LOJAS_FA/OPERACOES_INFO/
        // OPERACOES_ALIASES/WHATSAPP_GRUPOS(_FA)/LOJAS_GEOLOC de webapp/app.js.
        `CREATE TABLE IF NOT EXISTS unidades (
          id TEXT PRIMARY KEY,
          organizationId TEXT NOT NULL,
          negocioChave TEXT NOT NULL,
          nome TEXT NOT NULL,
          codigoExterno TEXT,
          lat REAL,
          lng REAL,
          abertura TEXT,
          fechamento TEXT,
          whatsappGrupoUrl TEXT,
          corEmoji TEXT,
          ativo INTEGER DEFAULT 1,
          criadoEm TEXT,
          UNIQUE(organizationId, negocioChave, nome)
        )`,
        // Feature flags por tenant (Fase 3 do plano usa isto para ligar/desligar
        // módulo por tenant; a tabela já nasce aqui para não precisar de outra
        // migração quando essa fase chegar).
        `CREATE TABLE IF NOT EXISTS tenant_modules (
          id TEXT PRIMARY KEY,
          organizationId TEXT NOT NULL,
          moduloChave TEXT NOT NULL,
          habilitado INTEGER DEFAULT 1,
          criadoEm TEXT,
          UNIQUE(organizationId, moduloChave)
        )`,
        // Sessão emitida por POST /auth/verify após PIN correto. Substitui o
        // padrão atual de "cliente manda o nome, servidor confia" — ver
        // routes/auth.js e routes/middleware/resolveTenantSession.js.
        `CREATE TABLE IF NOT EXISTS sessions (
          token TEXT PRIMARY KEY,
          organizationId TEXT NOT NULL,
          colaboradorNome TEXT NOT NULL,
          role TEXT NOT NULL,
          capacidades TEXT,
          criadoEm TEXT,
          expiraEm TEXT
        )`,
        // Fase 4: medição de uso de IA por organização. A chave/quota do
        // provedor (IA_PROVIDER/GEMINI_API_KEY etc, ver services/ia.js)
        // continua compartilhada da plataforma — esta tabela só CONTA quem
        // usa quanto, base para uma futura cobrança por uso ou alerta de
        // quota por tenant. Uma linha por (organização, dia).
        `CREATE TABLE IF NOT EXISTS ia_uso (
          organizationId TEXT NOT NULL,
          data TEXT NOT NULL,
          chamadas INTEGER NOT NULL DEFAULT 0,
          PRIMARY KEY (organizationId, data)
        )`,
        // Catálogo de preços do aluguel do SaaS por faixa de QUANTIDADE DE
        // UNIDADES ativas — é da PLATAFORMA (o dono definindo quanto cobra),
        // não por organização, por isso é a única tabela nova desta fase
        // sem organizationId. unidadesMax NULL = "esta faixa em diante, sem
        // teto" (a faixa mais alta cadastrada). Ver routes/tenant.js
        // (GET /tenant/plano) para o cálculo de qual faixa se aplica.
        `CREATE TABLE IF NOT EXISTS planos_precificacao (
          id TEXT PRIMARY KEY,
          unidadesMin INTEGER NOT NULL,
          unidadesMax INTEGER,
          valorMensal DOUBLE PRECISION NOT NULL,
          nome TEXT,
          criadoEm TEXT
        )`,
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

      // Indicações da Ação 2: a primeira versão da tabela era chaveada por
      // (telefone, criança) e exigia cadastrar o indicador antes das
      // indicações chegarem. Na prática quem chega ao balcão só sabe o nome e
      // o WhatsApp de quem indicou, então a chave virou o telefone sozinho —
      // o que exigiu uma tabela nova (SQLite não remove constraint). Copiamos
      // o que existia e derrubamos a antiga. Sem transação de propósito: cada
      // passo é idempotente e o erro de "tabela não existe" é esperado em
      // instalações novas.
      promise = promise.then(() => {
        return new Promise(resolve => {
          db.run(
            `INSERT INTO pos_visita_indicadores
               (id, responsavel, telefone, crianca, amigo1Nome, amigo1Em, amigo2Nome, amigo2Em,
                voucherEnviadoEm, voucherEntregue, voucherEntregueEm, brindeEscolhido, observacoes, criadoEm, atualizadoEm)
             SELECT telefone, responsavel, telefone, crianca, amigo1Nome, amigo1Em, amigo2Nome, amigo2Em,
                    voucherEnviadoEm, voucherEntregue, voucherEntregueEm, brindeEscolhido, observacoes, criadoEm, atualizadoEm
             FROM pos_visita_indicacoes
             ON CONFLICT DO NOTHING`,
            [],
            () => resolve()
          );
        });
      });

      promise = promise.then(() => {
        return new Promise(resolve => {
          db.run('DROP TABLE IF EXISTS pos_visita_indicacoes', [], () => resolve());
        });
      });

      // Tenta adicionar colunas faltantes de migrações anteriores
      promise = promise.then(() => {
        return new Promise(resolve => {
          db.run('ALTER TABLE registros ADD COLUMN deletadoEm TEXT', [], () => resolve());
        });
      });

      promise = promise.then(() => {
        return new Promise(resolve => {
          db.run('ALTER TABLE registros_fa ADD COLUMN deletadoEm TEXT', [], () => resolve());
        });
      });

      // Fechamento (#12): Valor Faturado (obrigatório) e Sangria (opcional)
      promise = promise.then(() => {
        return new Promise(resolve => {
          db.run('ALTER TABLE registros ADD COLUMN valorFaturado REAL', [], () => resolve());
        });
      });

      promise = promise.then(() => {
        return new Promise(resolve => {
          db.run('ALTER TABLE registros ADD COLUMN sangria REAL', [], () => resolve());
        });
      });

      promise = promise.then(() => {
        return new Promise(resolve => {
          db.run('ALTER TABLE registros_fa ADD COLUMN valorFaturado REAL', [], () => resolve());
        });
      });

      promise = promise.then(() => {
        return new Promise(resolve => {
          db.run('ALTER TABLE registros_fa ADD COLUMN sangria REAL', [], () => resolve());
        });
      });

      // Justificativa obrigatória para sangria > R$ 0,01
      promise = promise.then(() => {
        return new Promise(resolve => {
          db.run('ALTER TABLE registros ADD COLUMN sangriaMotivo TEXT', [], () => resolve());
        });
      });

      promise = promise.then(() => {
        return new Promise(resolve => {
          db.run('ALTER TABLE registros_fa ADD COLUMN sangriaMotivo TEXT', [], () => resolve());
        });
      });

      promise = promise.then(() => {
        return new Promise(resolve => {
          db.run('ALTER TABLE boletos ADD COLUMN docFaturamento TEXT', [], () => resolve());
        });
      });

      // Entrada (CX): quantidade bruta de caixas contada na conferência, separada
      // do total já convertido em unidades (qtdEntradaUnidades).
      promise = promise.then(() => {
        return new Promise(resolve => {
          db.run('ALTER TABLE inventario_itens ADD COLUMN qtdEntradaCaixas INTEGER DEFAULT 0', [], () => resolve());
        });
      });

      promise = promise.then(() => {
        return new Promise(resolve => {
          db.run('ALTER TABLE boletos ADD COLUMN parcela TEXT', [], () => resolve());
        });
      });

      // Decisão do owner sobre o alerta "vencido sem NF-e" da Auditoria de
      // Boletos: 0 (padrão) mantém a pendência sinalizada; 1 marca que o
      // owner já revisou e optou por dispensar o alerta para aquele boleto.
      promise = promise.then(() => {
        return new Promise(resolve => {
          db.run('ALTER TABLE boletos ADD COLUMN pendenciaSafDispensada INTEGER DEFAULT 0', [], () => resolve());
        });
      });

      promise = promise.then(() => {
        return new Promise(resolve => {
          db.run('ALTER TABLE colaboradores ADD COLUMN hasBiometricEnrolled INTEGER DEFAULT 0', [], () => resolve());
        });
      });

      // Dados pessoais do colaborador (Cadastro de Colaboradores em Configurações)
      // — usados na Folha de Ponto (nome/CPF do trabalhador) e no filtro por
      // unidade, que antes só existia "emprestado" do Módulo RH (perfis DISC).
      promise = promise.then(() => {
        return new Promise(resolve => {
          db.run('ALTER TABLE colaboradores ADD COLUMN unidade TEXT', [], () => resolve());
        });
      });
      promise = promise.then(() => {
        return new Promise(resolve => {
          db.run('ALTER TABLE colaboradores ADD COLUMN cpf TEXT', [], () => resolve());
        });
      });
      promise = promise.then(() => {
        return new Promise(resolve => {
          db.run('ALTER TABLE colaboradores ADD COLUMN dataNascimento TEXT', [], () => resolve());
        });
      });
      promise = promise.then(() => {
        return new Promise(resolve => {
          db.run('ALTER TABLE colaboradores ADD COLUMN telefone TEXT', [], () => resolve());
        });
      });
      promise = promise.then(() => {
        return new Promise(resolve => {
          db.run('ALTER TABLE colaboradores ADD COLUMN dataAdmissao TEXT', [], () => resolve());
        });
      });
      promise = promise.then(() => {
        return new Promise(resolve => {
          db.run('ALTER TABLE colaboradores ADD COLUMN email TEXT', [], () => resolve());
        });
      });
      promise = promise.then(() => {
        return new Promise(resolve => {
          db.run('ALTER TABLE colaboradores ADD COLUMN pinHash TEXT', [], () => resolve());
        });
      });
      promise = promise.then(() => {
        return new Promise(resolve => {
          db.run('ALTER TABLE colaboradores ADD COLUMN ativo INTEGER DEFAULT 1', [], () => resolve());
        });
      });

      // No PostgreSQL, se a tabela colaboradores foi criada antigamente com `nome TEXT UNIQUE`,
      // o constraint de chave única era apenas em `nome` (colaboradores_nome_key).
      // Para o ON CONFLICT(organizationId, nome) funcionar no Postgres, removemos o constraint antigo
      // e garantimos o índice único composto por (organizationId, nome).
      if (isPostgres) {
        promise = promise.then(() => {
          return new Promise(resolve => {
            db.run('ALTER TABLE colaboradores DROP CONSTRAINT IF EXISTS colaboradores_nome_key', [], () => resolve());
          });
        });
        promise = promise.then(() => {
          return new Promise(resolve => {
            db.run('ALTER TABLE colaboradores DROP CONSTRAINT IF EXISTS colaboradores_nome_unique', [], () => resolve());
          });
        });
      }

      promise = promise.then(() => {
        return new Promise(resolve => {
          db.run('CREATE UNIQUE INDEX IF NOT EXISTS idx_colaboradores_org_nome ON colaboradores(organizationId, nome)', [], () => resolve());
        });
      });

      promise = promise.then(() => {
        return new Promise(resolve => {
          db.run('ALTER TABLE ponto_registros ADD COLUMN operacao TEXT', [], () => resolve());
        });
      });

      // metas_vendas: passa de "lista de vendas soltas" para "um valor
      // confirmado por intervalo de hora" (check-in com trava de 30min).
      promise = promise.then(() => {
        return new Promise(resolve => {
          db.run('ALTER TABLE metas_vendas ADD COLUMN data TEXT', [], () => resolve());
        });
      });

      promise = promise.then(() => {
        return new Promise(resolve => {
          db.run('ALTER TABLE metas_vendas ADD COLUMN horaSlot TEXT', [], () => resolve());
        });
      });

      promise = promise.then(() => {
        return new Promise(resolve => {
          db.run('CREATE UNIQUE INDEX IF NOT EXISTS idx_metas_vendas_slot ON metas_vendas(operacao, data, horaSlot)', [], (err) => {
            if (err) console.error('Erro ao criar índice único metas_vendas:', err.message);
            resolve();
          });
        });
      });

      // fa_bonificacao_diaria: passa a registrar por (colaboradora, unidade,
      // dia) e a suportar contagem de locações (metodologia do Parque Circuito).
      promise = promise.then(() => {
        return new Promise(resolve => {
          db.run('ALTER TABLE fa_bonificacao_diaria ADD COLUMN unidade TEXT', [], () => resolve());
        });
      });

      promise = promise.then(() => {
        return new Promise(resolve => {
          db.run('ALTER TABLE fa_bonificacao_diaria ADD COLUMN locacoes INTEGER DEFAULT 0', [], () => resolve());
        });
      });

      // O UNIQUE(usuario, data) antigo impediria a mesma colaboradora de lançar
      // em duas unidades no mesmo dia — troca pela chave que inclui a unidade.
      // A tabela está vazia em produção, então dropar a constraint é seguro.
      if (isPostgres) {
        promise = promise.then(() => {
          return new Promise(resolve => {
            db.run('ALTER TABLE fa_bonificacao_diaria DROP CONSTRAINT IF EXISTS fa_bonificacao_diaria_usuario_data_key', [], () => resolve());
          });
        });
      }

      promise = promise.then(() => {
        return new Promise(resolve => {
          db.run('CREATE UNIQUE INDEX IF NOT EXISTS idx_fa_bonif_diaria ON fa_bonificacao_diaria(usuario, unidade, data)', [], () => resolve());
        });
      });

      // push_subscriptions ganhava uma linha nova a cada login (o client
      // re-envia o mesmo endpoint em /api/subscribe), então um push disparado
      // para o usuário era entregue uma vez por linha duplicada — daí a
      // enxurrada de notificações repetidas no mesmo aparelho. Remove os
      // duplicados existentes (mantendo a inscrição mais recente por endpoint)
      // antes de travar o endpoint como único.
      promise = promise.then(() => {
        return new Promise(resolve => {
          db.run(
            'DELETE FROM push_subscriptions WHERE id NOT IN (SELECT MAX(id) FROM push_subscriptions GROUP BY endpoint)',
            [],
            (err) => {
              if (err) console.error('Erro ao remover push_subscriptions duplicadas:', err.message);
              resolve();
            }
          );
        });
      });

      promise = promise.then(() => {
        return new Promise(resolve => {
          db.run('CREATE UNIQUE INDEX IF NOT EXISTS idx_push_subscriptions_endpoint ON push_subscriptions(endpoint)', [], (err) => {
            if (err) console.error('Erro ao criar índice único push_subscriptions:', err.message);
            resolve();
          });
        });
      });

      // ------------------------------------------------------------------
      // Fundação multi-tenant (Fase 1): toda tabela de negócio ganha uma
      // coluna organizationId. Segue o mesmo padrão idempotente das ALTERs
      // acima — o callback ignora erro de "coluna já existe" de propósito,
      // então rodar isto de novo em todo boot é seguro e barato.
      //
      // colaboradores/pins/fluxo_caixa_referencia_loja precisam, além da
      // coluna, de PK/UNIQUE reconstruída (Seção J do plano): hoje
      // `colaboradores.nome` e `pins.usuario` são únicos GLOBALMENTE — uma
      // segunda organização não conseguiria cadastrar ninguém com nome
      // coincidente com a operação atual. Essas 3 tabelas são pequenas
      // (dezenas de linhas), então reconstruir a cada boot é barato.
      // ------------------------------------------------------------------
      const TABELAS_ORG_SCOPE = [
        'configuracoes', 'pins', 'registros', 'registros_fa', 'logs_auditoria',
        'push_subscriptions', 'colaboradores', 'nfs', 'boletos', 'ponto_registros',
        'ponto_ajustes', 'ponto_biometria', 'biometria_tentativas', 'metas_vendas',
        'fa_bonificacao_diaria', 'nfe_conferencia', 'fa_bonificacao_regras',
        'metas_diarias_lojas', 'fa_regras_locacoes', 'metas', 'vendas_horarias',
        'inventario_itens', 'pos_visita_registros', 'pos_visita_indicadores',
        'aniversarios_registros', 'ia_cache', 'solicitacoes_retirada',
        'documentos_auditoria', 'fluxo_caixa_mensal', 'fluxo_caixa_campanha',
        'fluxo_caixa_referencia_loja', 'fluxo_caixa_indice_sazonal',
        'fluxo_caixa_observacao_diaria', 'fluxo_caixa_checklist'
      ];
      TABELAS_ORG_SCOPE.forEach(tabela => {
        promise = promise.then(() => {
          return new Promise(resolve => {
            db.run(`ALTER TABLE ${tabela} ADD COLUMN organizationId TEXT`, [], () => resolve());
          });
        });
      });

      // Seed da organização "tenant zero" (a operação atual do dono) +
      // negócios/unidades hoje hardcoded em webapp/app.js e
      // services/fluxo-caixa-dados.js. ON CONFLICT DO NOTHING: só grava na
      // primeira vez; depois disso é editável por quem administrar tenants.
      promise = promise.then(() => {
        const agora = new Date().toISOString();
        return dbRunAsync(
          `INSERT INTO organizations (id, slug, nome, status, plano, criadoEm)
           VALUES (?, ?, ?, 'ativo', 'interno', ?)
           ON CONFLICT(id) DO NOTHING`,
          [TENANT_ZERO_ID, 'matriz-belem', 'Operação Matriz (Bruno)', agora]
        );
      });

      promise = promise.then(() => {
        const agora = new Date().toISOString();
        const negocios = [
          { id: 'tn-cacau-show', chave: 'cacau-show', nomeExibicao: 'Cacau Show', tipo: 'varejo-franquia' },
          { id: 'tn-faca-amigos', chave: 'faca-amigos', nomeExibicao: 'Faça Amigos', tipo: 'entretenimento' }
        ];
        return Promise.all(negocios.map(n => dbRunAsync(
          `INSERT INTO tenant_negocios (id, organizationId, chave, nomeExibicao, tipo, ativo, criadoEm)
           VALUES (?, ?, ?, ?, ?, 1, ?)
           ON CONFLICT(organizationId, chave) DO NOTHING`,
          [n.id, TENANT_ZERO_ID, n.chave, n.nomeExibicao, n.tipo, agora]
        )));
      });

      promise = promise.then(() => {
        const agora = new Date().toISOString();
        // codigoExterno das 3 lojas Cacau Show: mesmos códigos usados hoje em
        // services/fluxo-caixa-dados.js (CODIGO_PARA_LOJA) e na tabela `boletos`.
        const unidades = [
          { id: 'un-marambaia', negocioChave: 'cacau-show', nome: 'Marambaia', codigoExterno: '9175' },
          { id: 'un-icoaraci', negocioChave: 'cacau-show', nome: 'Icoaraci', codigoExterno: '4304' },
          { id: 'un-mario-covas', negocioChave: 'cacau-show', nome: 'Mário Covas', codigoExterno: '9201' },
          { id: 'un-venda-direta', negocioChave: 'cacau-show', nome: 'Venda Direta', codigoExterno: null },
          { id: 'un-grao-para', negocioChave: 'faca-amigos', nome: 'Grão Pará', codigoExterno: null },
          { id: 'un-parqueshopping', negocioChave: 'faca-amigos', nome: 'ParqueShopping', codigoExterno: null },
          { id: 'un-parque-circuito', negocioChave: 'faca-amigos', nome: 'Parque Circuito', codigoExterno: null }
        ];
        return Promise.all(unidades.map(u => dbRunAsync(
          `INSERT INTO unidades (id, organizationId, negocioChave, nome, codigoExterno, ativo, criadoEm)
           VALUES (?, ?, ?, ?, ?, 1, ?)
           ON CONFLICT(organizationId, negocioChave, nome) DO NOTHING`,
          [u.id, TENANT_ZERO_ID, u.negocioChave, u.nome, u.codigoExterno, agora]
        )));
      });

      promise = promise.then(() => {
        const agora = new Date().toISOString();
        const modulos = [
          'cacau-show', 'faca-amigos', 'nfe', 'inventario', 'ponto',
          'metas-xlsx', 'ia', 'fa-bonificacao', 'rh-modulo'
        ];
        return Promise.all(modulos.map(m => dbRunAsync(
          `INSERT INTO tenant_modules (id, organizationId, moduloChave, habilitado, criadoEm)
           VALUES (?, ?, ?, 1, ?)
           ON CONFLICT(organizationId, moduloChave) DO NOTHING`,
          [`tm-${m}`, TENANT_ZERO_ID, m, agora]
        )));
      });

      // Backfill: toda linha pré-existente (sem organizationId) pertence à
      // operação atual do dono. Critério de aceite da Fase 1: depois disto,
      // COUNT(*) WHERE organizationId IS NULL = 0 em cada uma destas tabelas.
      TABELAS_ORG_SCOPE.forEach(tabela => {
        promise = promise.then(() => {
          return new Promise(resolve => {
            db.run(`UPDATE ${tabela} SET organizationId = ? WHERE organizationId IS NULL`, [TENANT_ZERO_ID], (err) => {
              if (err) console.error(`Erro no backfill de organizationId em ${tabela}:`, err.message);
              resolve();
            });
          });
        });
      });

      // Reconstrução de PK/UNIQUE das 3 tabelas de identidade/referência que
      // hoje são únicas globalmente — precisam ser únicas POR organização
      // antes que uma segunda organização real possa existir sem colidir
      // com a de hoje.
      promise = promise.then(() => rebuildTableWithOrgScope(
        'colaboradores',
        `CREATE TABLE IF NOT EXISTS colaboradores (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          nome TEXT NOT NULL,
          role TEXT NOT NULL,
          criadoEm TEXT,
          hasBiometricEnrolled INTEGER DEFAULT 0,
          unidade TEXT,
          cpf TEXT,
          dataNascimento TEXT,
          telefone TEXT,
          dataAdmissao TEXT,
          email TEXT,
          pinHash TEXT,
          ativo INTEGER DEFAULT 1,
          capacidades TEXT,
          organizationId TEXT NOT NULL DEFAULT '${TENANT_ZERO_ID}',
          UNIQUE(organizationId, nome)
        )`,
        ['id', 'nome', 'role', 'criadoEm', 'hasBiometricEnrolled', 'unidade', 'cpf', 'dataNascimento', 'telefone', 'dataAdmissao', 'email', 'pinHash', 'ativo', 'capacidades', 'organizationId']
      ).catch(err => console.error('Erro ao reconstruir colaboradores com escopo de organização:', err.message)));

      promise = promise.then(() => rebuildTableWithOrgScope(
        'pins',
        `CREATE TABLE IF NOT EXISTS pins (
          usuario TEXT NOT NULL,
          pin TEXT,
          organizationId TEXT NOT NULL DEFAULT '${TENANT_ZERO_ID}',
          PRIMARY KEY (organizationId, usuario)
        )`,
        ['usuario', 'pin', 'organizationId']
      ).catch(err => console.error('Erro ao reconstruir pins com escopo de organização:', err.message)));

      promise = promise.then(() => rebuildTableWithOrgScope(
        'fluxo_caixa_referencia_loja',
        `CREATE TABLE IF NOT EXISTS fluxo_caixa_referencia_loja (
          loja TEXT NOT NULL,
          faturamentoMes DOUBLE PRECISION,
          despesaFixaMes DOUBLE PRECISION,
          pontoEquilibrioMes DOUBLE PRECISION,
          pontoEquilibrioDia DOUBLE PRECISION,
          resultado10Meses DOUBLE PRECISION,
          aliquotaImposto DOUBLE PRECISION DEFAULT 0.082,
          atualizadoEm TEXT,
          organizationId TEXT NOT NULL DEFAULT '${TENANT_ZERO_ID}',
          PRIMARY KEY (organizationId, loja)
        )`,
        ['loja', 'faturamentoMes', 'despesaFixaMes', 'pontoEquilibrioMes', 'pontoEquilibrioDia', 'resultado10Meses', 'aliquotaImposto', 'atualizadoEm', 'organizationId']
      ).catch(err => console.error('Erro ao reconstruir fluxo_caixa_referencia_loja com escopo de organização:', err.message)));

      // Fase 4 do plano de arquitetura SaaS: configuracoes era uma KV GLOBAL
      // (chave TEXT PRIMARY KEY) — WhatsApp, geofencing, brand voice de IA,
      // tudo isso é dado por organização, não da plataforma inteira. Vira
      // composta (organizationId, chave); a exceção é 'vapid_keys' (par de
      // chaves do Web Push, identifica o SERVIDOR ao serviço de push, não o
      // tenant) — fica sob TENANT_ZERO_ID por conveniência, sem sentido real
      // de "pertencer" a essa organização (ver initDb mais abaixo).
      promise = promise.then(() => rebuildTableWithOrgScope(
        'configuracoes',
        `CREATE TABLE IF NOT EXISTS configuracoes (
          chave TEXT NOT NULL,
          valor TEXT,
          organizationId TEXT NOT NULL DEFAULT '${TENANT_ZERO_ID}',
          PRIMARY KEY (organizationId, chave)
        )`,
        ['chave', 'valor', 'organizationId']
      ).catch(err => console.error('Erro ao reconstruir configuracoes com escopo de organização:', err.message)));

      // Coluna criada aqui (idempotente); o backfill de valores roda mais
      // abaixo, DEPOIS do seed dos colaboradores padrão — a tabela ainda
      // está vazia neste ponto da cadeia numa instalação nova.
      promise = promise.then(() => {
        return new Promise(resolve => {
          db.run('ALTER TABLE colaboradores ADD COLUMN capacidades TEXT', [], () => resolve());
        });
      });

      // Fase 4: substitui o EMAIL_MAP hardcoded de routes/auth.js (3 Gmails
      // pessoais direto no código) por um campo editável do colaborador.
      promise = promise.then(() => {
        return new Promise(resolve => {
          db.run('ALTER TABLE colaboradores ADD COLUMN email TEXT', [], () => resolve());
        });
      });

      // Índices para as consultas mais usadas do sistema (filtro, busca e
      // ordenação). Até aqui só existiam índices de PK/UNIQUE — qualquer
      // WHERE/ORDER BY fora dessas colunas forçava varredura completa da
      // tabela. Levantamento feito em cima de todas as rotas/serviços.
      const indicesConsulta = [
        // Lista principal do Caixa (Cacau Show e Faça Amigos): toda tela
        // carrega os "não deletados" ordenados por data — índice parcial
        // pula os registros com soft delete em vez de varrê-los.
        `CREATE INDEX IF NOT EXISTS idx_registros_ativos ON registros(dataOperacao DESC) WHERE deletadoEm IS NULL`,
        `CREATE INDEX IF NOT EXISTS idx_registros_fa_ativos ON registros_fa(dataOperacao DESC) WHERE deletadoEm IS NULL`,
        // Soma de envelopes aguardando retirada por loja, a cada Fechamento.
        `CREATE INDEX IF NOT EXISTS idx_registros_loja_status ON registros(loja, status)`,
        `CREATE INDEX IF NOT EXISTS idx_registros_fa_loja_status ON registros_fa(loja, status)`,
        // GET /logs ordena por data sem filtro, e a tabela só cresce.
        `CREATE INDEX IF NOT EXISTS idx_logs_auditoria_data ON logs_auditoria(data DESC)`,
        // numero de NF não é único (a mesma NF pode repetir por loja) e é
        // filtrado em vários endpoints de escrita, incluindo um helper
        // chamado a cada item conferido na tela de conferência.
        `CREATE INDEX IF NOT EXISTS idx_nfs_numero ON nfs(numero)`,
        // Boletos: dedup na importação em lote e alerta de vencidos sem NF-e.
        `CREATE INDEX IF NOT EXISTS idx_boletos_status ON boletos(status)`,
        `CREATE INDEX IF NOT EXISTS idx_boletos_loja_doc_valor ON boletos(loja, documento, valor)`,
        `CREATE INDEX IF NOT EXISTS idx_boletos_loja_docfat_valor ON boletos(loja, docFaturamento, valor)`,
        `CREATE INDEX IF NOT EXISTS idx_boletos_criadoEm ON boletos(criadoEm DESC)`,
        // Ponto: uma linha por batida, para sempre. Três padrões de consulta
        // diferentes (por usuário, por operação, por intervalo de datas).
        `CREATE INDEX IF NOT EXISTS idx_ponto_registros_usuario_timestamp ON ponto_registros(usuario, timestamp)`,
        `CREATE INDEX IF NOT EXISTS idx_ponto_registros_operacao_timestamp ON ponto_registros(operacao, timestamp)`,
        `CREATE INDEX IF NOT EXISTS idx_ponto_ajustes_usuario_data ON ponto_ajustes(usuario, data)`,
        // Meta Hora a Hora: o briefing diário busca por data sozinha (sem
        // operacao), fora do alcance do índice único (operacao, data, horaSlot).
        `CREATE INDEX IF NOT EXISTS idx_metas_vendas_data ON metas_vendas(data)`,
        // Bonificação FA: /mes-todas e o briefing filtram por data (ou
        // unidade+data) sem usuario, fora do índice único (usuario, unidade, data).
        `CREATE INDEX IF NOT EXISTS idx_fa_bonif_diaria_data ON fa_bonificacao_diaria(data)`,
        `CREATE INDEX IF NOT EXISTS idx_fa_bonif_diaria_unidade_data ON fa_bonificacao_diaria(unidade, data)`,
        // Meta diária por loja: briefing filtra por data sozinha.
        `CREATE INDEX IF NOT EXISTS idx_metas_diarias_lojas_data ON metas_diarias_lojas(data)`,
        `CREATE INDEX IF NOT EXISTS idx_metas_ano_loja ON metas(ano, loja)`,
        // Pós-visita: a fila de pendentes filtra por mensagemEnviada e roda
        // uma subquery correlacionada por (numeroCliente, crianca) por linha.
        `CREATE INDEX IF NOT EXISTS idx_pos_visita_pendentes ON pos_visita_registros(mensagemEnviada)`,
        `CREATE INDEX IF NOT EXISTS idx_pos_visita_cliente_crianca ON pos_visita_registros(numeroCliente, crianca, mensagemEnviada)`,
        `CREATE INDEX IF NOT EXISTS idx_pos_visita_indicadores_atualizado ON pos_visita_indicadores(atualizadoEm DESC)`,
        // Pasta de Auditoria: negocio está presente em toda consulta da tela.
        `CREATE INDEX IF NOT EXISTS idx_documentos_auditoria_negocio_criado ON documentos_auditoria(negocio, criadoEm DESC)`,
        `CREATE INDEX IF NOT EXISTS idx_documentos_auditoria_vencimento ON documentos_auditoria(dataVencimento)`,
        // Retiradas pendentes de autorização.
        `CREATE INDEX IF NOT EXISTS idx_solicitacoes_retirada_status_criado ON solicitacoes_retirada(status, criadoEm DESC)`,
        // Fluxo de Caixa: painel/diário filtram por mês, campanhas por loja.
        `CREATE INDEX IF NOT EXISTS idx_fluxo_caixa_mensal_mes ON fluxo_caixa_mensal(mesReferencia)`,
        `CREATE INDEX IF NOT EXISTS idx_fluxo_caixa_campanha_loja ON fluxo_caixa_campanha(loja)`,
        `CREATE INDEX IF NOT EXISTS idx_fluxo_caixa_obs_diaria_data ON fluxo_caixa_observacao_diaria(data)`
      ];
      indicesConsulta.forEach(sqlIndice => {
        promise = promise.then(() => {
          return new Promise(resolve => {
            db.run(sqlIndice, [], (err) => {
              if (err) console.error('Erro ao criar índice:', err.message, '-', sqlIndice);
              resolve();
            });
          });
        });
      });

      // Corrige colunas monetárias criadas como REAL (float4) no Postgres, que
      // arredondam centavos em valores grandes. No SQLite REAL já é double de
      // 8 bytes e ALTER COLUMN TYPE não existe, então só roda no Postgres.
      if (isPostgres) {
        const colunasParaDouble = [
          ['metas_diarias_lojas', 'valor'],
          ['metas_vendas', 'valor'],
          ['fa_bonificacao_regras', 'ouropercentmin'],
          ['fa_bonificacao_regras', 'ourovalor'],
          ['fa_bonificacao_regras', 'diamantepercentmin'],
          ['fa_bonificacao_regras', 'diamantevalor'],
          ['fa_bonificacao_regras', 'pixvalor']
        ];
        colunasParaDouble.forEach(([tabela, coluna]) => {
          promise = promise.then(() => {
            return new Promise(resolve => {
              db.run(`ALTER TABLE ${tabela} ALTER COLUMN ${coluna} TYPE DOUBLE PRECISION`, [], () => resolve());
            });
          });
        });
      }

      promise = promise.then(() => {
        return new Promise(resolve => {
          db.get('SELECT COUNT(*) as count FROM colaboradores', [], (err3, row) => {
            const defaultUsers = [
              { nome: "Ana Júlia", role: "consultora" },
              { nome: "Vitória", role: "consultora" },
              { nome: "Débora", role: "consultora" },
              { nome: "Alexandra", role: "consultora_dashboard" },
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
                  'INSERT INTO colaboradores (nome, role, criadoEm, organizationId) VALUES (?, ?, ?, ?) ON CONFLICT(organizationId, nome) DO NOTHING',
                  [u.nome, u.role, agora, TENANT_ZERO_ID],
                  () => res()
                );
              });
            });
            Promise.all(inserts).then(() => resolve());
          });
        });
      });

      // ------------------------------------------------------------------
      // Fase 2 do plano de arquitetura: capacidades por colaborador, em vez
      // de checagem por NOME PRÓPRIO hardcoded no código (RETIRADA_PERMITIDA,
      // RESUMO_USUARIOS, "usuario !== 'Bruno'" em routes/caixa.js). JSON em
      // vez de tabela relacional porque hoje são poucas capacidades fixas —
      // vira tabela própria se algum dia precisar de granularidade por tenant.
      //
      // Backfill preserva EXATAMENTE a matriz de permissão hardcoded de hoje
      // (não é uma decisão nova de produto, é a mesma regra existente
      // migrando de "nome no código" para "dado no banco"):
      //   retirar_envelope   — quem hoje está em RETIRADA_PERMITIDA (app.js)
      //   excluir_registro   — quem hoje passa em "usuario !== 'Bruno'" nas
      //                        rotas DELETE de registros (routes/caixa.js)
      //   ver_resumo_diario  — quem hoje está em RESUMO_USUARIOS (app.js)
      // Faça Amigos fica de fora de propósito (módulo em descontinuação para
      // o SaaS) — nomesPermitidosRegrasBonificacaoFa continua hardcoded.
      // WHERE capacidades IS NULL: só define no primeiro boot depois da
      // migração — se o Owner reconfigurar pela UI (Fase 3), o boot seguinte
      // não pode sobrescrever a escolha dele.
      // ------------------------------------------------------------------
      promise = promise.then(() => {
        const capacidadesPorNome = {
          'Bruno': ['retirar_envelope', 'excluir_registro', 'ver_resumo_diario'],
          'Isabella': ['retirar_envelope', 'ver_resumo_diario'],
          'Alexandra': ['retirar_envelope', 'ver_resumo_diario']
        };
        return Promise.all(Object.entries(capacidadesPorNome).map(([nome, capacidades]) => new Promise(resolve => {
          db.run(
            `UPDATE colaboradores SET capacidades = ? WHERE nome = ? AND organizationId = ? AND (capacidades IS NULL OR capacidades = '')`,
            [JSON.stringify(capacidades), nome, TENANT_ZERO_ID],
            (err) => {
              if (err) console.error(`Erro no backfill de capacidades para ${nome}:`, err.message);
              resolve();
            }
          );
        })));
      });

      // Backfill do e-mail — mesmo mapa que existia hardcoded em
      // routes/auth.js (EMAIL_MAP), agora como dado editável em Configurações
      // > Colaboradores em vez de exigir deploy pra trocar um e-mail.
      promise = promise.then(() => {
        const emailPorNome = {
          'Bruno': 'brunofreitasbm@gmail.com',
          'Isabella': 'isabella.vgoncalves@gmail.com',
          'Alexandra': 'alexandracabral733@gmail.com'
        };
        return Promise.all(Object.entries(emailPorNome).map(([nome, email]) => new Promise(resolve => {
          db.run(
            `UPDATE colaboradores SET email = ? WHERE nome = ? AND organizationId = ? AND (email IS NULL OR email = '')`,
            [email, nome, TENANT_ZERO_ID],
            (err) => {
              if (err) console.error(`Erro no backfill de email para ${nome}:`, err.message);
              resolve();
            }
          );
        })));
      });

      // Seed dos números de referência do Fluxo de Caixa (contexto_cacau_show.md,
      // base set/2025-jun/2026). ON CONFLICT DO NOTHING: só grava se a loja
      // ainda não tiver linha — depois do primeiro boot o Owner edita pela
      // tela e o seed nunca mais sobrescreve o valor real.
      promise = promise.then(() => {
        const referenciaSeed = [
          { loja: 'Marambaia', faturamentoMes: 118566, despesaFixaMes: 33012, pontoEquilibrioMes: 83767, pontoEquilibrioDia: 2755, resultado10Meses: 137401 },
          { loja: 'Icoaraci', faturamentoMes: 71775, despesaFixaMes: 18163, pontoEquilibrioMes: 46018, pontoEquilibrioDia: 1514, resultado10Meses: 100375 },
          { loja: 'Mário Covas', faturamentoMes: 25629, despesaFixaMes: 10782, pontoEquilibrioMes: 27247, pontoEquilibrioDia: 896, resultado10Meses: -2439 }
        ];
        const agora = new Date().toISOString();
        return Promise.all(referenciaSeed.map(r => new Promise(resolve => {
          db.run(
            `INSERT INTO fluxo_caixa_referencia_loja
              (loja, faturamentoMes, despesaFixaMes, pontoEquilibrioMes, pontoEquilibrioDia, resultado10Meses, aliquotaImposto, atualizadoEm, organizationId)
             VALUES (?, ?, ?, ?, ?, ?, 0.082, ?, ?)
             ON CONFLICT(organizationId, loja) DO NOTHING`,
            [r.loja, r.faturamentoMes, r.despesaFixaMes, r.pontoEquilibrioMes, r.pontoEquilibrioDia, r.resultado10Meses, agora, TENANT_ZERO_ID],
            () => resolve()
          );
        })));
      });

      // Seed do índice de sazonalidade mensal (1,00 = dia comum daquela loja).
      promise = promise.then(() => {
        const SITUACAO_POR_MES = { 1: 'PREPARAR', 2: 'PREPARAR', 3: 'COLHER', 4: 'COLHER', 5: 'ATRAVESSAR', 6: 'ATRAVESSAR', 7: 'ATRAVESSAR', 8: 'ATRAVESSAR', 9: 'ATRAVESSAR', 10: 'ATRAVESSAR', 11: 'ATRAVESSAR', 12: 'COLHER' };
        const indicesPorLoja = {
          'Marambaia': [0.44, 0.51, 2.20, 2.46, 0.60, 0.65, 0.31, 0.41, 0.40, 0.55, 0.74, 2.44],
          'Icoaraci': [0.43, 0.53, 1.03, 3.82, 0.71, 0.88, 0.36, 0.45, 0.62, 0.64, 0.57, 1.64],
          'Mário Covas': [0.58, 1.04, 1.44, 3.21, 0.75, 0.97, 0.53, 0.61, 0.54, 0.60, 0.35, 1.13]
        };
        const linhas = [];
        Object.entries(indicesPorLoja).forEach(([loja, indices]) => {
          indices.forEach((indice, i) => {
            const mes = i + 1;
            linhas.push({ id: `sazonal-${loja}-${mes}`, loja, mes, indice, situacao: SITUACAO_POR_MES[mes] });
          });
        });
        return Promise.all(linhas.map(l => new Promise(resolve => {
          db.run(
            `INSERT INTO fluxo_caixa_indice_sazonal (id, loja, mes, indice, situacao)
             VALUES (?, ?, ?, ?, ?)
             ON CONFLICT(loja, mes) DO NOTHING`,
            [l.id, l.loja, l.mes, l.indice, l.situacao],
            () => resolve()
          );
        })));
      });

      // Seed do checklist dos 30 dias (Coach Financeiro - Parte 7)
      promise = promise.then(() => {
        const checklistSeed = [
          { id: 'chk-1', ordem: 1, quando: 'Esta semana', titulo: 'Abrir contas de Imposto e Reserva', descricao: 'Abrir a conta de imposto e a conta de reserva em cada CNPJ (3 contas por CNPJ).', quem: 'Você' },
          { id: 'chk-2', ordem: 2, quando: 'Esta semana', titulo: 'Mapear retiradas e despesas fixas reais', descricao: 'Levantar no extrato quanto sai por mês que não está mapeado — o valor real das retiradas dos sócios e soma da despesa fixa.', quem: 'Você e o sócio' },
          { id: 'chk-3', ordem: 3, quando: 'Esta semana', titulo: 'Quitar títulos vencidos (R$ 48,3 mil)', descricao: 'Quitar os R$ 48,3 mil de títulos vencidos das três lojas antes de autorizar qualquer compra nova.', quem: 'Você' },
          { id: 'chk-4', ordem: 4, quando: 'Semana 2', titulo: 'Fixar retirada sustentável dos sócios', descricao: 'Definir a retirada fixa no valor sustentável (máximo R$ 7.060 por sócio/mês na rede).', quem: 'Você e o sócio' },
          { id: 'chk-5', ordem: 5, quando: 'Semana 2', titulo: 'Iniciar transferência diária de 8,2% p/ Imposto', descricao: 'Começar a transferir 8,2% do faturamento de todo dia para a conta exclusiva de imposto.', quem: 'Equipe do caixa' },
          { id: 'chk-6', ordem: 6, quando: 'Semana 3', titulo: 'Reperfilar parcelas do acordo da franqueadora', descricao: 'Ligar para a franqueadora e reperfilar as parcelas do acordo de agosto-outubro para dezembro e janeiro.', quem: 'Você' },
          { id: 'chk-7', ordem: 7, quando: 'Semana 3', titulo: 'Travar compras de campanhas opcionais', descricao: 'Comunicar às três lojas: nenhuma compra de campanha opcional (Namorados, Pais, Crianças) até novembro.', quem: 'Você' },
          { id: 'chk-8', ordem: 8, quando: 'Semana 4', titulo: 'Montar folha de acompanhamento do Dia 1', descricao: 'Montar a folha de acompanhamento com os 4 números do dia 1 (vendas do mês anterior, saldo das 3 contas, boletos em aberto e vencidos).', quem: 'Você' },
          { id: 'chk-9', ordem: 9, quando: 'Semana 4', titulo: 'Investigar queda de vendas de julho na Marambaia', descricao: 'Investigar por que a venda de julho caiu na Marambaia (ruptura de estoque, equipe ou fluxo do ponto).', quem: 'Líder de operação' },
          { id: 'chk-10', ordem: 10, quando: 'Antes de Outubro', titulo: 'Fechar pedido de Natal dentro do teto (40%)', descricao: 'Fechar o pedido de Natal usando os tetos de compra calculados com a Regra 2 (máximo de 40% das vendas de dez/2025).', quem: 'Você' }
        ];

        return Promise.all(checklistSeed.map(item => new Promise(resolve => {
          db.run(
            `INSERT INTO fluxo_caixa_checklist (id, ordem, quando, titulo, descricao, quem)
             VALUES (?, ?, ?, ?, ?, ?)
             ON CONFLICT(id) DO NOTHING`,
            [item.id, item.ordem, item.quando, item.titulo, item.descricao, item.quem],
            () => resolve()
          );
        })));
      });

      // Remove usuários desativados (LiderOP e as contas de treinamento) que
      // possam já existir de uma inicialização anterior — o seed acima nunca
      // os recria, mas não apaga quem já foi inserido antes desta mudança.
      const usuariosRemovidos = ["LiderOP", "Treinamento Cacau Show", "Treinamento Faça Amigos"];
      promise = promise.then(() => {
        return Promise.all(usuariosRemovidos.map(nome => new Promise(resolve => {
          db.run('DELETE FROM colaboradores WHERE nome = ?', [nome], () => {
            db.run('DELETE FROM pins WHERE usuario = ?', [nome], () => resolve());
          });
        })));
      });

      promise.then(() => {
        console.log('Banco de dados inicializado com sucesso.');
        
        // Inicializar VAPID keys para Web Push. Chave de plataforma (identifica
        // o SERVIDOR ao serviço de push, não uma organização) — vive sob
        // TENANT_ZERO_ID só por conveniência de schema, ver comentário em
        // initQueries acima.
        db.get('SELECT valor FROM configuracoes WHERE organizationId = ? AND chave = ?', [TENANT_ZERO_ID, 'vapid_keys'], (err3, row) => {
          let vapidKeys;
          if (!err3 && row && row.valor) {
            vapidKeys = JSON.parse(row.valor);
          } else {
            vapidKeys = webPush.generateVAPIDKeys();
            db.run(
              'INSERT INTO configuracoes (chave, valor, organizationId) VALUES (?, ?, ?) ON CONFLICT(organizationId, chave) DO UPDATE SET valor = ?',
              ['vapid_keys', JSON.stringify(vapidKeys), TENANT_ZERO_ID, JSON.stringify(vapidKeys)]
            );
          }
          webPush.setVapidDetails('mailto:brunofreitasbm@gmail.com', vapidKeys.publicKey, vapidKeys.privateKey);
          global.vapidPublicKey = vapidKeys.publicKey;
          console.log('Web Push VAPID keys configuradas.');
          if (onSuccess) onSuccess();
        });
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

module.exports = {
  db,
  isPostgres,
  normalizeRow,
  dbAllAsync,
  dbGetAsync,
  dbRunAsync,
  initDb,
  TENANT_ZERO_ID
};
