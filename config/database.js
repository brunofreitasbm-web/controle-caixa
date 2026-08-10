const path = require('path');
const webPush = require('web-push');

const isPostgres = !!process.env.DATABASE_URL;

const camelCaseMap = {
  tipooperacao: 'tipoOperacao',
  dataoperacao: 'dataOperacao',
  fundocaixa: 'fundoCaixa',
  valorenvelope: 'valorEnvelope',
  valorfaturado: 'valorFaturado',
  fotoenvelope: 'fotoEnvelope',
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
  enviadopor: 'enviadoPor'
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
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
      rejectUnauthorized: sslRejectUnauthorized
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
          nome TEXT UNIQUE NOT NULL,
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
        )`
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
        `CREATE INDEX IF NOT EXISTS idx_solicitacoes_retirada_status_criado ON solicitacoes_retirada(status, criadoEm DESC)`
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
                  'INSERT INTO colaboradores (nome, role, criadoEm) VALUES (?, ?, ?) ON CONFLICT(nome) DO NOTHING',
                  [u.nome, u.role, agora],
                  () => res()
                );
              });
            });
            Promise.all(inserts).then(() => resolve());
          });
        });
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
        
        // Inicializar VAPID keys para Web Push
        db.get('SELECT valor FROM configuracoes WHERE chave = ?', ['vapid_keys'], (err3, row) => {
          let vapidKeys;
          if (!err3 && row && row.valor) {
            vapidKeys = JSON.parse(row.valor);
          } else {
            vapidKeys = webPush.generateVAPIDKeys();
            db.run('INSERT INTO configuracoes (chave, valor) VALUES (?, ?) ON CONFLICT(chave) DO UPDATE SET valor = ?', ['vapid_keys', JSON.stringify(vapidKeys), JSON.stringify(vapidKeys)]);
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
  initDb
};
