const fs = require('fs');
const path = require('path');

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

const { headers, rows } = parseCSV(content);

console.log('--- DETAILED CHECK OF CSV ROWS ---');
const missingDates = [];
const missingFundo = [];
const badFundo = [];
const badEnvelope = [];
const invalidTipos = [];

rows.forEach(r => {
  const [consultor, loja, tipo, dataStr, fundoStr, envelopeStr] = r.fields;

  if (!dataStr || dataStr.trim() === '') {
    missingDates.push(r);
  }

  if (tipo !== 'Abertura' && tipo !== 'Fechamento') {
    invalidTipos.push(r);
  }

  if (!fundoStr || fundoStr.trim() === '') {
    missingFundo.push(r);
  } else {
    const cleaned = fundoStr.replace(/R\$\s*/g, '').replace(/\./g, '').replace(',', '.').trim();
    if (isNaN(parseFloat(cleaned))) {
      badFundo.push({ ...r, cleaned });
    }
  }

  if (envelopeStr && envelopeStr.trim() !== '') {
    const cleanedEnv = envelopeStr.replace(/R\$\s*/g, '').replace(/\./g, '').replace(',', '.').trim();
    if (isNaN(parseFloat(cleanedEnv))) {
      badEnvelope.push({ ...r, cleanedEnv });
    }
  }
});

console.log('Missing dates count:', missingDates.length, missingDates);
console.log('Invalid tipo count:', invalidTipos.length, invalidTipos);
console.log('Missing fundo count:', missingFundo.length, missingFundo);
console.log('Bad fundo count:', badFundo.length, badFundo);
console.log('Bad envelope count:', badEnvelope.length, badEnvelope);

// Let's also check date ranges
const validDates = rows
  .map(r => r.fields[3])
  .filter(d => d && /^\d{2}\/\d{2}\/\d{4}$/.test(d))
  .map(d => {
    const [day, month, year] = d.split('/');
    return new Date(`${year}-${month}-${day}`);
  });

validDates.sort((a, b) => a - b);

console.log('Earliest date:', validDates[0]?.toISOString().slice(0, 10));
console.log('Latest date:', validDates[validDates.length - 1]?.toISOString().slice(0, 10));
