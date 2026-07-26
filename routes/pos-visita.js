const express = require('express');
const router = express.Router();
const multer = require('multer');
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

// Insere todos os registros da importação (sem filtro de tempo — o Bruno
// pediu para considerar qualquer duração, não só >1h), deduplicando por
// (dataSessao, numeroCliente, crianca).
function inserirRegistros(registros) {
  const criadoEm = new Date().toISOString();

  let promise = Promise.resolve();
  let inseridos = 0;
  registros.forEach(r => {
    const { dataSessao, cliente, numeroCliente, crianca, tempoTotalMinutos } = r;
    if (!dataSessao || !cliente || !numeroCliente || !crianca) return;
    const id = `${dataSessao}_${numeroCliente}_${crianca}`;
    promise = promise.then(() => new Promise(resolve => {
      db.run(
        `INSERT INTO pos_visita_registros (id, dataSessao, cliente, numeroCliente, crianca, tempoTotalMinutos, criadoEm)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(dataSessao, numeroCliente, crianca) DO NOTHING`,
        [id, dataSessao, cliente, numeroCliente, crianca, tempoTotalMinutos || 0, criadoEm],
        (err) => {
          if (!err) inseridos++;
          resolve();
        }
      );
    }));
  });

  return promise.then(() => ({ inseridos }));
}

// --------------------------------------------------------------------------
// Importação manual do "Relatório Operacional do Dia anterior" (CSV, 1
// arquivo por dia). Colunas fixas por posição (o arquivo não tem cabeçalho
// confiável pra usar nome): K = responsável, L = telefone, N = tempo total
// (minutos), P = nome da criança. Linha 1 é cabeçalho e é ignorada.
// --------------------------------------------------------------------------

const COLUNA = { cliente: 10, telefone: 11, tempoTotal: 13, crianca: 15 }; // K, L, N, P (0-indexado)

// Parser de CSV simples, tolerante a campos entre aspas e detecta o
// delimitador (",", ";" ou tab) pela linha de cabeçalho — relatórios
// brasileiros costumam usar ";" porque "," é separador decimal.
function parsearCSV(texto) {
  const linhas = texto.split(/\r\n|\r|\n/).filter(l => l.length > 0);
  if (linhas.length === 0) return [];

  const candidatos = [',', ';', '\t'];
  const delimitador = candidatos.reduce((melhor, d) =>
    (linhas[0].split(d).length > linhas[0].split(melhor).length ? d : melhor), candidatos[0]);

  function parsearLinha(linha) {
    const campos = [];
    let atual = '';
    let dentroDeAspas = false;
    for (let i = 0; i < linha.length; i++) {
      const c = linha[i];
      if (c === '"') {
        dentroDeAspas = !dentroDeAspas;
      } else if (c === delimitador && !dentroDeAspas) {
        campos.push(atual);
        atual = '';
      } else {
        atual += c;
      }
    }
    campos.push(atual);
    return campos.map(c => c.trim().replace(/^"|"$/g, ''));
  }

  return linhas.map(parsearLinha);
}

function normalizarTelefone(valor) {
  let digitos = String(valor || '').replace(/\D/g, '');
  if (!digitos) return '';
  if (digitos.length <= 11) digitos = `55${digitos}`;
  return digitos;
}

function normalizarTempoMinutos(valor) {
  if (typeof valor === 'number') return Math.round(valor);
  const texto = String(valor || '').trim();
  const comDoisPontos = texto.match(/^(\d+):(\d{2})$/);
  if (comDoisPontos) return parseInt(comDoisPontos[1], 10) * 60 + parseInt(comDoisPontos[2], 10);
  const numeros = texto.match(/\d+/);
  return numeros ? parseInt(numeros[0], 10) : 0;
}

router.post('/importar-csv', upload.single('arquivo'), (req, res) => {
  if (!checarSecret(req, res)) return;
  if (!req.file) {
    return res.status(400).json({ error: 'Arquivo CSV é obrigatório.' });
  }
  const dataSessao = req.body.dataSessao;
  if (!dataSessao || !/^\d{4}-\d{2}-\d{2}$/.test(dataSessao)) {
    return res.status(400).json({ error: 'Campo "dataSessao" (YYYY-MM-DD) é obrigatório.' });
  }

  const texto = req.file.buffer.toString('utf8');
  const linhas = parsearCSV(texto).slice(1); // linha 1 é cabeçalho

  const registros = linhas
    .filter(cols => cols.length > COLUNA.crianca)
    .map(cols => ({
      dataSessao,
      cliente: (cols[COLUNA.cliente] || '').trim(),
      numeroCliente: normalizarTelefone(cols[COLUNA.telefone]),
      crianca: (cols[COLUNA.crianca] || '').trim(),
      tempoTotalMinutos: normalizarTempoMinutos(cols[COLUNA.tempoTotal])
    }));

  inserirRegistros(registros).then(({ inseridos }) => {
    res.json({ success: true, linhasNoArquivo: linhas.length, inseridos });
  });
});

// Fila de pendentes: sinaliza (jaContactadoAntes) quando o mesmo responsável
// + criança já receberam mensagem em outro dia, pra evitar duplicidade.
router.get('/pendentes', (req, res) => {
  db.all(
    `SELECT p.*,
       EXISTS (
         SELECT 1 FROM pos_visita_registros q
         WHERE q.numeroCliente = p.numeroCliente AND q.crianca = p.crianca AND q.mensagemEnviada = 1
       ) AS "jaContactadoAntes"
     FROM pos_visita_registros p
     WHERE p.mensagemEnviada = 0 OR p.mensagemEnviada IS NULL
     ORDER BY p.dataSessao ASC, p.criadoEm ASC`,
    [],
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      const normalizados = (rows || []).map(normalizeRow).map(r => ({
        ...r, jaContactadoAntes: r.jaContactadoAntes === true || r.jaContactadoAntes === 1
      }));
      res.json({ registros: normalizados });
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

// Relatório automático: quantos foram importados e quantos já foram
// encaminhados, referente ao dia mais recente com registros na base.
router.get('/relatorio', (req, res) => {
  db.get(`SELECT MAX(dataSessao) AS "ultimaData" FROM pos_visita_registros`, [], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    const ultimaData = row && row.ultimaData;
    if (!ultimaData) return res.json({ data: null, importados: 0, enviados: 0 });

    db.all(
      `SELECT mensagemEnviada FROM pos_visita_registros WHERE dataSessao = ?`,
      [ultimaData],
      (err2, rows) => {
        if (err2) return res.status(500).json({ error: err2.message });
        const importados = (rows || []).length;
        const enviados = (rows || []).filter(r => Number(r.mensagemEnviada || r.mensagemenviada) === 1).length;
        res.json({ data: String(ultimaData).slice(0, 10), importados, enviados });
      }
    );
  });
});

module.exports = router;
