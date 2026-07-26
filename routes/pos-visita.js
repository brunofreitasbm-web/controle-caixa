const express = require('express');
const router = express.Router();
const multer = require('multer');
const XLSX = require('xlsx');
const { db, normalizeRow } = require('../config/database');

const upload = multer({ storage: multer.memoryStorage() });

function checarSecret(req, res) {
  const secretEsperado = process.env.POS_VISITA_IMPORT_SECRET;
  if (!secretEsperado) return true;
  const auth = req.headers['authorization'];
  if (auth !== `Bearer ${secretEsperado}`) {
    res.status(401).json({ error: 'Não autorizado.' });
    return false;
  }
  return true;
}

// Insere os registros elegíveis (>60min) no banco, deduplicando por
// (dataSessao, numeroCliente, crianca). Usado tanto pela importação já
// estruturada (JSON) quanto pela importação direta da planilha (XLSX).
function inserirRegistros(registros) {
  const elegiveis = registros.filter(r => Number(r.tempoTotalMinutos) > 60);
  const criadoEm = new Date().toISOString();

  let promise = Promise.resolve();
  let inseridos = 0;
  elegiveis.forEach(r => {
    const { dataSessao, cliente, numeroCliente, crianca, tempoTotalMinutos } = r;
    if (!dataSessao || !cliente || !numeroCliente || !crianca) return;
    const id = `${dataSessao}_${numeroCliente}_${crianca}`;
    promise = promise.then(() => new Promise(resolve => {
      db.run(
        `INSERT INTO pos_visita_registros (id, dataSessao, cliente, numeroCliente, crianca, tempoTotalMinutos, criadoEm)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(dataSessao, numeroCliente, crianca) DO NOTHING`,
        [id, dataSessao, cliente, numeroCliente, crianca, tempoTotalMinutos, criadoEm],
        (err) => {
          if (!err) inseridos++;
          resolve();
        }
      );
    }));
  });

  return promise.then(() => ({ elegiveis: elegiveis.length, inseridos }));
}

// Importação vinda do Make.com já como JSON estruturado (caso o cenário
// converta a planilha lá dentro). Protegida por header Authorization.
router.post('/importar', (req, res) => {
  if (!checarSecret(req, res)) return;

  const { registros } = req.body;
  if (!Array.isArray(registros)) {
    return res.status(400).json({ error: 'Campo "registros" (array) é obrigatório.' });
  }

  inserirRegistros(registros).then(({ elegiveis, inseridos }) => {
    res.json({ success: true, recebidos: registros.length, elegiveis, inseridos });
  });
});

// --------------------------------------------------------------------------
// Importação direta do arquivo .xlsx: o Make só baixa o e-mail e repassa o
// arquivo bruto (multipart/form-data, campo "planilha") — quem interpreta a
// planilha é este servidor, usando a lib xlsx. Evita ter que montar
// conversão de XLSX dentro do Make (não existe módulo nativo pra isso).
// --------------------------------------------------------------------------

// Normaliza um cabeçalho de coluna pra comparação tolerante a acento/caixa/
// espaço (ex.: "Número Cliente", "numero_cliente" e "NumeroCliente" batem).
function normalizarChave(txt) {
  return String(txt || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

const CANDIDATOS_COLUNA = {
  data: ['data', 'datasessao'],
  cliente: ['cliente', 'responsavel', 'nomeresponsavel'],
  numeroCliente: ['numerocliente', 'telefone', 'telefonecliente', 'whatsapp', 'numero'],
  tempoTotalMinutos: ['tempototalsession', 'tempototalminutos', 'tempototal', 'duracao', 'tempodesessao'],
  crianca: ['crianca', 'nomecrianca']
};

function acharValor(linhaNormalizada, campo) {
  for (const candidato of CANDIDATOS_COLUNA[campo]) {
    if (linhaNormalizada[candidato] !== undefined) return linhaNormalizada[candidato];
  }
  return undefined;
}

function normalizarTelefone(valor) {
  let digitos = String(valor || '').replace(/\D/g, '');
  if (!digitos) return '';
  // Assume DDI 55 (Brasil) quando o número vier só com DDD+número (10-11 dígitos).
  if (digitos.length <= 11) digitos = `55${digitos}`;
  return digitos;
}

function normalizarTempoMinutos(valor) {
  if (typeof valor === 'number') return Math.round(valor);
  const texto = String(valor || '').trim();
  const comDoisPontos = texto.match(/^(\d+):(\d{2})$/); // formato "h:mm"
  if (comDoisPontos) return parseInt(comDoisPontos[1], 10) * 60 + parseInt(comDoisPontos[2], 10);
  const numeros = texto.match(/\d+/);
  return numeros ? parseInt(numeros[0], 10) : 0;
}

function normalizarData(valor) {
  if (valor instanceof Date) return valor.toISOString().slice(0, 10);
  const texto = String(valor || '').trim();
  const br = texto.match(/^(\d{2})\/(\d{2})\/(\d{4})$/); // "dd/mm/aaaa"
  if (br) return `${br[3]}-${br[2]}-${br[1]}`;
  return texto.slice(0, 10);
}

// Lê o buffer de um .xlsx, mapeia as colunas (tolerante a variação de nome) e
// insere os registros elegíveis. Compartilhado pelas duas rotas de import
// (multipart e raw) — a única diferença entre elas é como o Express extrai
// o buffer do corpo da requisição.
function processarPlanilhaBuffer(buffer) {
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  const primeiraAba = workbook.SheetNames[0];
  const linhas = XLSX.utils.sheet_to_json(workbook.Sheets[primeiraAba], { defval: null });

  const registros = linhas.map(linha => {
    const linhaNormalizada = {};
    Object.keys(linha).forEach(chave => { linhaNormalizada[normalizarChave(chave)] = linha[chave]; });

    return {
      dataSessao: normalizarData(acharValor(linhaNormalizada, 'data')),
      cliente: String(acharValor(linhaNormalizada, 'cliente') || '').trim(),
      numeroCliente: normalizarTelefone(acharValor(linhaNormalizada, 'numeroCliente')),
      crianca: String(acharValor(linhaNormalizada, 'crianca') || '').trim(),
      tempoTotalMinutos: normalizarTempoMinutos(acharValor(linhaNormalizada, 'tempoTotalMinutos'))
    };
  });

  return inserirRegistros(registros).then(({ elegiveis, inseridos }) => ({
    linhasNaPlanilha: linhas.length, elegiveis, inseridos
  }));
}

router.post('/importar-planilha', upload.single('planilha'), (req, res) => {
  if (!checarSecret(req, res)) return;
  if (!req.file) {
    return res.status(400).json({ error: 'Arquivo "planilha" (multipart/form-data) é obrigatório.' });
  }

  try {
    processarPlanilhaBuffer(req.file.buffer).then(resultado => res.json({ success: true, ...resultado }));
  } catch (err) {
    res.status(400).json({ error: `Falha ao ler a planilha: ${err.message}` });
  }
});

// Variante que recebe o arquivo como corpo binário puro (Content-Type:
// application/octet-stream), usada pelo Make quando o passthrough de binário
// via multipart/form-data não valida corretamente entre módulos HTTP.
router.post('/importar-planilha-raw', express.raw({ type: '*/*', limit: '20mb' }), (req, res) => {
  if (!checarSecret(req, res)) return;
  if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
    return res.status(400).json({ error: 'Corpo da requisição vazio ou inválido.' });
  }

  try {
    processarPlanilhaBuffer(req.body).then(resultado => res.json({ success: true, ...resultado }));
  } catch (err) {
    res.status(400).json({ error: `Falha ao ler a planilha: ${err.message}` });
  }
});

// Fila de pendentes: não filtra por dia exato — o relatório chega à noite e
// é disparado só na manhã seguinte, então "pendente" é o filtro certo.
router.get('/pendentes', (req, res) => {
  db.all(
    `SELECT * FROM pos_visita_registros WHERE mensagemEnviada = 0 OR mensagemEnviada IS NULL ORDER BY dataSessao ASC, criadoEm ASC`,
    [],
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ registros: (rows || []).map(normalizeRow) });
    }
  );
});

router.post('/marcar-enviada', (req, res) => {
  const { id } = req.body;
  if (!id) {
    return res.status(400).json({ error: 'Campo "id" é obrigatório.' });
  }
  const agora = new Date().toISOString();
  db.run(
    `UPDATE pos_visita_registros SET mensagemEnviada = 1, mensagemEnviadaEm = ? WHERE id = ?`,
    [agora, id],
    (err) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true });
    }
  );
});

module.exports = router;
