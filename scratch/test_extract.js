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
  const boletosExtraidos = [];
  const lojaDoRelatorio = detectStoreFromBoletoLine(text);
  console.log("Loja do relatório detectada:", lojaDoRelatorio);

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

  console.log("Anchors found:", anchors.length);
  anchors.forEach((a, index) => {
    console.log(`Anchor ${index}: ${a.matchedText} (${a.numero} - ${a.seq}) at index ${a.index}`);
  });

  for (let i = 0; i < anchors.length; i++) {
    const inicio = anchors[i].index;
    const fim = i + 1 < anchors.length ? anchors[i + 1].index : text.length;
    const bloco = text.slice(inicio, fim).replace(/\s+/g, ' ').trim();

    console.log(`\n--- BLOCO ${i} ---`);
    console.log("Raw block snippet:", text.slice(inicio, Math.min(inicio + 200, fim)).replace(/\n/g, '\\n'));
    console.log("Cleaned block:", bloco);

    const hasDebito = bloco.toLowerCase().includes('debito') || bloco.toLowerCase().includes('débito');
    console.log("Has 'debito'?", hasDebito);

    const dateMatch = bloco.match(/\b(\d{2})\/(\d{2})\/(\d{2,4})\b/);
    console.log("Date match:", dateMatch ? dateMatch[0] : "NONE");
    if (!dateMatch) continue;

    const valueMatch = bloco.match(/R\$\s*([\d.,]*\d)/);
    console.log("Value match:", valueMatch ? valueMatch[0] : "NONE");
    if (!valueMatch) continue;

    const valor = parseMoedaPdf(valueMatch[1]);
    console.log("Parsed valor:", valor);
  }

  return boletosExtraidos;
}

const text = fs.readFileSync(path.join(__dirname, 'extracted_pdf_text.txt'), 'utf8');
extrairBoletosDoTexto(text);
