const express = require('express');
const router = express.Router();
const multer = require('multer');
const { db, normalizeRow } = require('../config/database');

const upload = multer({ storage: multer.memoryStorage() });

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
         ON CONFLICT(dataSessao, numeroCliente, crianca) DO UPDATE SET tempoTotalMinutos = excluded.tempoTotalMinutos`,
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
// confiável pra usar nome): F = data da visita, K = responsável, L =
// telefone, M = período (ex. "14:32 - 15:47", usado para calcular a
// permanência por diferença), N = tempo total (fallback, formato H:MM:SS),
// P = nome da criança. Linha 1 é cabeçalho e é ignorada.
// --------------------------------------------------------------------------

const COLUNA = { data: 5, cliente: 10, telefone: 11, periodo: 12, tempoTotal: 13, crianca: 15 }; // F, K, L, M, N, P (0-indexado)

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

// Tempo total (coluna N), formato "H:MM:SS" ou "H:MM" — o parsing anterior
// só reconhecia "H:MM" e caía num fallback que pegava só o primeiro dígito
// (por isso todo mundo aparecia com 0 ou 1 minuto: pegava só a hora de
// "0:47:32", por exemplo). Também aceita fração de dia do Excel (ex.
// "0.0659722" exportado de uma célula de hora sem formatação) e horas
// decimais (ex. "1.5" = 1h30).
function normalizarTempoMinutos(valor) {
  if (typeof valor === 'number') {
    // Fração de dia do Excel (célula de horário salva como número puro).
    if (valor > 0 && valor < 1) return Math.round(valor * 24 * 60);
    return Math.round(valor);
  }
  const texto = String(valor || '').trim().replace(',', '.');

  const comSegundos = texto.match(/^(\d+):(\d{2}):(\d{2})$/);
  if (comSegundos) {
    return parseInt(comSegundos[1], 10) * 60 + parseInt(comSegundos[2], 10) + Math.round(parseInt(comSegundos[3], 10) / 60);
  }
  const comMinutos = texto.match(/^(\d+):(\d{2})$/);
  if (comMinutos) return parseInt(comMinutos[1], 10) * 60 + parseInt(comMinutos[2], 10);

  const decimal = texto.match(/^\d*\.\d+$/);
  if (decimal) {
    const num = parseFloat(texto);
    return num > 0 && num < 1 ? Math.round(num * 24 * 60) : Math.round(num * 60);
  }

  const numeros = texto.match(/\d+/);
  return numeros ? parseInt(numeros[0], 10) : 0;
}

// Período (coluna M), ex. "14:32 - 15:47" ou "14:32:10 às 15:47:22" — extrai
// os dois horários encontrados no texto e calcula a diferença em minutos.
// É a fonte mais confiável de tempo de permanência (pedido do Bruno); a
// coluna N só entra como fallback quando o período não dá pra calcular.
function calcularDiferencaPeriodo(valor) {
  const texto = String(valor || '');
  const horarios = [...texto.matchAll(/(\d{1,2}):(\d{2})(?::(\d{2}))?/g)];
  if (horarios.length < 2) return null;

  const paraMinutos = (m) => parseInt(m[1], 10) * 60 + parseInt(m[2], 10) + (m[3] ? parseInt(m[3], 10) / 60 : 0);
  const inicio = paraMinutos(horarios[0]);
  const fim = paraMinutos(horarios[1]);
  let diferenca = fim - inicio;
  if (diferenca < 0) diferenca += 24 * 60; // cruzou a meia-noite
  return Math.round(diferenca);
}

// Data da visita (coluna F): aceita "dd/mm/aaaa" (com ou sem hora junto) ou
// "aaaa-mm-dd". A data escolhida no upload é só o valor padrão exibido pro
// operador — o que vai pro banco é sempre a data real de cada linha do CSV.
function normalizarDataLinha(valor, dataFallback) {
  const texto = String(valor || '').trim();
  const br = texto.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (br) return `${br[3]}-${br[2]}-${br[1]}`;
  const iso = texto.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  return dataFallback;
}

router.post('/importar-csv', upload.single('arquivo'), (req, res) => {
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
    .map(cols => {
      // N (tempo total, formato H:MM:SS) é a fonte principal — confirmada
      // pelo Bruno. O cálculo pela diferença do período (M) só entra como
      // reserva, se por algum motivo N vier vazio/ilegível naquela linha.
      const tempoDeN = normalizarTempoMinutos(cols[COLUNA.tempoTotal]);
      const tempoTotalMinutos = tempoDeN > 0 ? tempoDeN : (calcularDiferencaPeriodo(cols[COLUNA.periodo]) || 0);
      return {
        dataSessao: normalizarDataLinha(cols[COLUNA.data], dataSessao),
        cliente: (cols[COLUNA.cliente] || '').trim(),
        numeroCliente: normalizarTelefone(cols[COLUNA.telefone]),
        crianca: (cols[COLUNA.crianca] || '').trim(),
        tempoTotalMinutos
      };
    });

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
// encaminhados no mês (padrão: mês atual; aceita ?mes=YYYY-MM pra consultar
// outro mês).
router.get('/relatorio', (req, res) => {
  const mes = (req.query.mes && /^\d{4}-\d{2}$/.test(req.query.mes))
    ? req.query.mes
    : new Date().toISOString().slice(0, 7);

  db.all(
    `SELECT mensagemEnviada FROM pos_visita_registros WHERE dataSessao LIKE ?`,
    [`${mes}%`],
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      const importados = (rows || []).length;
      const enviados = (rows || []).filter(r => Number(r.mensagemEnviada || r.mensagemenviada) === 1).length;
      res.json({ mes, importados, enviados });
    }
  );
});

module.exports = router;
