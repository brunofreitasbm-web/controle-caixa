const fs = require('fs');
const path = require('path');

const csvPath = path.join(__dirname, '..', 'Cópia de Controle de Caixa (respostas) - Dados Extraídos BD.csv');
const content = fs.readFileSync(csvPath, 'utf8');

// Quick simple CSV line parser handling quotes
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
  const rows = lines.slice(1).map((line, idx) => ({ idx: idx + 2, fields: parseLine(line), raw: line }));
  return { headers, rows };
}

const { headers, rows } = parseCSV(content);

console.log('Headers:', headers);
console.log('Total rows:', rows.length);

const consultoresSet = new Set();
const lojasSet = new Set();
const tiposSet = new Set();

const errors = [];
let parsedCount = 0;

const validConsultores = ["Ana Júlia", "Vitória", "Débora", "Alexandra", "Janine", "Estheffany", "Sabrina", "Isabella", "Bruno", "João"];
const validLojas = ["Marambaia", "Icoaraci", "Mário Covas", "Venda Direta"];

rows.forEach(r => {
  const [consultor, loja, tipo, dataStr, fundoStr, envelopeStr] = r.fields;
  
  if (consultor) consultoresSet.add(consultor);
  if (loja) lojasSet.add(loja);
  if (tipo) tiposSet.add(tipo);

  // Check data issues
  if (!consultor) errors.push({ line: r.idx, error: 'Consultor vazio', raw: r.raw });
  if (!loja) errors.push({ line: r.idx, error: 'Loja vazia', raw: r.raw });
  if (!tipo) errors.push({ line: r.idx, error: 'Tipo de operação vazio', raw: r.raw });
  if (!dataStr) errors.push({ line: r.idx, error: 'Data vazia', raw: r.raw });
  
  // Date format check (DD/MM/YYYY)
  if (dataStr && !/^\d{2}\/\d{2}\/\d{4}$/.test(dataStr)) {
    errors.push({ line: r.idx, error: `Formato de data inválido: "${dataStr}"`, raw: r.raw });
  }

  // Parse money helper
  function parseMoney(val) {
    if (!val) return 0;
    // e.g. "R$ 148,65" or "148,65"
    const cleaned = val.replace(/R\$\s*/g, '').replace(/\./g, '').replace(',', '.').trim();
    const num = parseFloat(cleaned);
    return isNaN(num) ? null : num;
  }

  const fundo = parseMoney(fundoStr);
  const envelope = parseMoney(envelopeStr);

  if (fundo === null && fundoStr !== '') {
    errors.push({ line: r.idx, error: `Valor Fundo de Caixa inválido: "${fundoStr}"`, raw: r.raw });
  }
  if (envelope === null && envelopeStr !== '' && envelopeStr !== undefined) {
    errors.push({ line: r.idx, error: `Valor Envelope inválido: "${envelopeStr}"`, raw: r.raw });
  }
});

console.log('\n--- Distinct Consultores em CSV ---');
console.log(Array.from(consultoresSet));

console.log('\n--- Consultores NÃO encontrados no Sistema (serão definidos como "Desligado") ---');
const unmappedConsultores = Array.from(consultoresSet).filter(c => !validConsultores.includes(c));
console.log(unmappedConsultores);

console.log('\n--- Distinct Lojas em CSV ---');
console.log(Array.from(lojasSet));

console.log('\n--- Lojas NÃO encontradas no Sistema (serão definidas como "Desligado") ---');
const unmappedLojas = Array.from(lojasSet).filter(l => !validLojas.includes(l));
console.log(unmappedLojas);

console.log('\n--- Distinct Tipos de Operação em CSV ---');
console.log(Array.from(tiposSet));

console.log('\n--- Erros ou Falhas detectados nas linhas ---');
console.log(`Total de erros encontrados: ${errors.length}`);
if (errors.length > 0) {
  console.log(JSON.stringify(errors.slice(0, 20), null, 2));
}
