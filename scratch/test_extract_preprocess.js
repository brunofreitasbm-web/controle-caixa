const fs = require('fs');
const path = require('path');

function parseMoedaPdf(str) {
  if (!str) return 0;
  let clean = str.replace(/[^\d.,]/g, '');
  const lastDot = clean.lastIndexOf('.');
  const lastComma = clean.lastIndexOf(',');
  if (lastDot > lastComma) {
    clean = clean.replace(/,/g, '');
    return parseFloat(clean) || 0;
  } else if (lastComma > lastDot) {
    clean = clean.replace(/\./g, '').replace(',', '.');
    return parseFloat(clean) || 0;
  } else {
    return parseFloat(clean) || 0;
  }
}

function detectStoreFromBoletoLine(texto) {
  const upper = texto.toUpperCase();
  if (upper.includes('9201') || upper.includes('MARIO COVAS') || upper.includes('MÁRIO COVAS') || upper.includes('0001008688')) return '9201';
  if (upper.includes('4304') || upper.includes('ICOARACI') || upper.includes('0001008056') || upper.includes('PA BELEM CRUZEIRO') || upper.includes('PA BELÉM CRUZEIRO')) return '4304';
  if (upper.includes('9175') || upper.includes('MARAMBAIA') || upper.includes('0001006495')) return '9175';
  return null;
}

function extrairBoletosDoTexto(text) {
  // Preprocess text to merge document numbers split across lines
  text = text.replace(/(\b\d{10}-)\s*([^\n]*)\n\s*(\d{3})\b/g, '$1$3 $2\n');
  text = text.replace(/(\b\d{9}-)\s*([^\n]*)\n\s*([A-Z]{2,3})\b/g, '$1$3 $2\n');
  
  const boletosExtraidos = [];
  const lojaDoRelatorio = detectStoreFromBoletoLine(text);

  const anchorRegex = /(?:(\d{10})-\s*(\d{3})|(\d{9})-\s*([A-Z]{2,3}))(?=\D)/g;
  const anchors = [];
  let m;
  while ((m = anchorRegex.exec(text)) !== null) {
    anchors.push({
      index: m.index,
      numero: m[1] || m[3],
      seq: m[2] || m[4],
      matchedText: m[0]
    });
  }

  console.log("Total Anchors found:", anchors.length);

  for (let i = 0; i < anchors.length; i++) {
    const inicio = anchors[i].index;
    const fim = i + 1 < anchors.length ? anchors[i + 1].index : text.length;
    const bloco = text.slice(inicio, fim).replace(/\s+/g, ' ').trim();

    const hasDebito = bloco.toLowerCase().includes('debito') || bloco.toLowerCase().includes('débito');
    if (!hasDebito) {
      console.log(`Skipped ${anchors[i].matchedText}: No 'debito' / 'débito' found in block.`);
      continue;
    }

    const dateMatch = bloco.match(/\b(\d{2})\/(\d{2})\/(\d{2,4})\b/);
    if (!dateMatch) {
      console.log(`Skipped ${anchors[i].matchedText}: No date match found in block.`);
      continue;
    }

    const valueMatch = bloco.match(/R\$\s*([\d.,]*\d)/);
    if (!valueMatch) {
      console.log(`Skipped ${anchors[i].matchedText}: No R$ value match found in block.`);
      continue;
    }
    const valor = parseMoedaPdf(valueMatch[1]);
    if (!valor) {
      console.log(`Skipped ${anchors[i].matchedText}: Value is 0 / falsy.`);
      continue;
    }

    const documento = `${anchors[i].numero}-${anchors[i].seq}`;
    boletosExtraidos.push({
      documento,
      valor,
      vencimento: dateMatch[0]
    });
  }

  console.log("Successfully extracted boletos:", boletosExtraidos.length);
  return boletosExtraidos;
}

const text = fs.readFileSync(path.join(__dirname, 'extracted_pdf_text.txt'), 'utf8');
extrairBoletosDoTexto(text);
