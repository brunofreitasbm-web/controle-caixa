const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const csvPath = path.join(__dirname, '..', 'Cópia de Controle de Caixa (respostas) - Dados Extraídos BD.csv');
const content = fs.readFileSync(csvPath, 'utf8');

function parseCSV(text) {
  const lines = text.split(/\r?\n/).filter(line => line.trim() !== '');
  if (lines.length === 0) return { headers: [], rows: [] };

  function parseLine(line) {
    const fields = [];
    let curField = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          curField += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        fields.push(curField.trim());
        curField = '';
      } else {
        curField += char;
      }
    }
    fields.push(curField.trim());
    return fields;
  }

  const headers = parseLine(lines[0]);
  const rows = lines.slice(1).map((line, idx) => ({ lineNum: idx + 2, fields: parseLine(line), raw: line }));
  return { headers, rows };
}

const validConsultores = ["Ana Júlia", "Vitória", "Débora", "Alexandra", "Janine", "Estheffany", "Sabrina", "Isabella", "Bruno", "João"];
const validLojas = ["Marambaia", "Icoaraci", "Mário Covas", "Venda Direta"];

function parseMoney(val) {
  if (!val || val.trim() === '') return 0;
  const cleaned = val.replace(/R\$\s*/g, '').replace(/\./g, '').replace(',', '.').trim();
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}

function parseDate(dataStr, fallbackIso = null) {
  if (!dataStr || dataStr.trim() === '') return fallbackIso;
  const parts = dataStr.trim().split('/');
  if (parts.length !== 3) return fallbackIso;
  const [day, month, year] = parts;
  // Format as ISO T12:00:00.000Z to avoid timezone shifts
  return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T12:00:00.000Z`;
}

const { rows } = parseCSV(content);

let processedCount = 0;
let consultorSubstitutedCount = 0;
let lojaSubstitutedCount = 0;

const recordsToInsert = [];

rows.forEach(r => {
  let [consultor, loja, tipoOperacao, dataStr, fundoStr, envelopeStr] = r.fields;

  // Rule 1: Consultor replacement
  let finalConsultor = consultor;
  if (!validConsultores.includes(consultor)) {
    finalConsultor = "Desligado";
    consultorSubstitutedCount++;
  }

  // Rule 2: Loja replacement
  let finalLoja = loja;
  if (!validLojas.includes(loja)) {
    finalLoja = "Desligado";
    lojaSubstitutedCount++;
  }

  // Handle specific fixes for the 4 anomalous rows
  let dataOperacao = null;
  let fundoCaixa = null;
  let valorEnvelope = (tipoOperacao === 'Fechamento') ? parseMoney(envelopeStr) : null;

  if (r.lineNum === 1023) {
    // Ana Júlia | Marambaia | Fechamento | [DATA VAZIA]
    dataOperacao = parseDate('12/02/2026');
    fundoCaixa = parseMoney(fundoStr);
  } else if (r.lineNum === 1091) {
    // Ana Alice | Havan | Fechamento | [DATA VAZIA]
    dataOperacao = parseDate('23/02/2026');
    fundoCaixa = parseMoney(fundoStr);
  } else if (r.lineNum === 619) {
    // Sabrina | Havan | Abertura | 15/12/2025 | [FUNDO VAZIO]
    dataOperacao = parseDate(dataStr);
    fundoCaixa = 160.05;
  } else if (r.lineNum === 811) {
    // Janine | Venda Direta | Fechamento | 14/01/2026 | [FUNDO VAZIO]
    dataOperacao = parseDate(dataStr);
    fundoCaixa = 0.00;
  } else {
    dataOperacao = parseDate(dataStr);
    fundoCaixa = parseMoney(fundoStr);
  }

  // Create deterministic ID based on lineNum and raw data
  const hash = crypto.createHash('md5').update(`csv_${r.lineNum}_${r.raw}`).digest('hex').slice(0, 12);
  const id = `csv_${r.lineNum}_${hash}`;

  const status = (tipoOperacao === 'Fechamento') ? 'aguardando_retirada' : 'aberto';
  const criadoEm = new Date().toISOString();

  recordsToInsert.push({
    id,
    consultor: finalConsultor,
    loja: finalLoja,
    tipoOperacao,
    dataOperacao,
    fundoCaixa,
    valorEnvelope,
    observacoes: `Importado do BD anterior (Linha CSV #${r.lineNum})`,
    fotoEnvelope: null,
    status,
    dataRetirada: null,
    retiradoPor: null,
    confirmadoPorApp: null,
    autorizadoPor: null,
    mensagemGerada: 0,
    criadoEm,
    deletadoEm: null
  });

  processedCount++;
});

console.log(`Processed ${processedCount} records.`);
console.log(`Consultores substituídos por 'Desligado': ${consultorSubstitutedCount}`);
console.log(`Lojas substituídas por 'Desligado': ${lojaSubstitutedCount}`);
console.log('Sample record [0]:', recordsToInsert[0]);
console.log('Sample record [last]:', recordsToInsert[recordsToInsert.length - 1]);
