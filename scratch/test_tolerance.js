const fs = require('fs');
const path = require('path');
const pdfjsLib = require('pdfjs-dist');

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

async function testWithTolerance(tolerance) {
  try {
    const pdfPath = path.join(__dirname, '..', 'Modelo_Titulos _ Cacau Show.pdf');
    const data = new Uint8Array(fs.readFileSync(pdfPath));
    const loadingTask = pdfjsLib.getDocument({ data });
    const pdf = await loadingTask.promise;
    
    let textContent = "";
    
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const text = await page.getTextContent();
      
      const items = text.items;
      const linesMap = {};
      
      items.forEach(item => {
        const y = Math.round(item.transform[5] * 10) / 10;
        let foundY = Object.keys(linesMap).find(key => Math.abs(parseFloat(key) - y) < tolerance);
        if (!foundY) {
          foundY = y;
          linesMap[foundY] = [];
        }
        linesMap[foundY].push(item);
      });

      const sortedY = Object.keys(linesMap).sort((a, b) => parseFloat(b) - parseFloat(a));
      sortedY.forEach(y => {
        const lineItems = linesMap[y].sort((a, b) => a.transform[4] - b.transform[4]);
        textContent += lineItems.map(item => item.str).join(" ") + "\n";
      });
    }

    // Now extract boletos
    const boletosExtraidos = [];
    const lojaDoRelatorio = detectStoreFromBoletoLine(textContent);

    const anchorRegex = /(?:(\d{10})-\s*(\d{3})|(\d{9})-\s*([A-Z]{2,3}))(?=\D)/g;
    const anchors = [];
    let m;
    while ((m = anchorRegex.exec(textContent)) !== null) {
      anchors.push({
        index: m.index,
        numero: m[1] || m[3],
        seq: m[2] || m[4],
        matchedText: m[0]
      });
    }

    for (let i = 0; i < anchors.length; i++) {
      const inicio = anchors[i].index;
      const fim = i + 1 < anchors.length ? anchors[i + 1].index : textContent.length;
      const bloco = textContent.slice(inicio, fim).replace(/\s+/g, ' ').trim();

      const hasDebito = bloco.toLowerCase().includes('debito') || bloco.toLowerCase().includes('débito');
      if (!hasDebito) continue;

      const dateMatch = bloco.match(/\b(\d{2})\/(\d{2})\/(\d{2,4})\b/);
      if (!dateMatch) continue;
      let vencimento = dateMatch[0];
      if (dateMatch[3].length === 2) {
        vencimento = `${dateMatch[1]}/${dateMatch[2]}/20${dateMatch[3]}`;
      }

      const valueMatch = bloco.match(/R\$\s*([\d.,]*\d)/);
      if (!valueMatch) continue;
      const valor = parseMoedaPdf(valueMatch[1]);
      if (!valor) continue;

      const documento = `${anchors[i].numero}-${anchors[i].seq}`;

      const docFatMatch = bloco.match(/\b(\d{6,9}-\d{3})\s+\d{2}\/\d{2}\/\d{2,4}/);
      const docFaturamento = docFatMatch ? docFatMatch[1] : null;

      const parcelaMatch = bloco.match(/\b(\d+\/\d+)\b/);
      const parcela = parcelaMatch ? parcelaMatch[1] : '1/1';

      let descricao = "Duplicata Cacau Show";
      const afterDebito = bloco.split(/d[eé]bito/i).pop();
      if (afterDebito) {
        const descMatch = afterDebito.trim().match(/^(.+?)\s+\d+\/\d+\s+\d{6,10}/);
        if (descMatch && descMatch[1]) descricao = descMatch[1].trim();
      }

      const lojaNoBloco = detectStoreFromBoletoLine(bloco);
      const loja = lojaNoBloco || lojaDoRelatorio || "9175";

      boletosExtraidos.push({
        documento,
        docFaturamento,
        parcela,
        loja,
        descricao,
        vencimento,
        valor
      });
    }

    console.log(`With tolerance = ${tolerance}:`);
    console.log(`- Anchors found: ${anchors.length}`);
    console.log(`- Extracted boletos: ${boletosExtraidos.length}`);
    if (boletosExtraidos.length > 0) {
      console.log("- Sample boleto 1:", boletosExtraidos[0]);
      console.log("- Sample boleto 2:", boletosExtraidos[1]);
    }
  } catch (error) {
    console.error(error);
  }
}

testWithTolerance(8);
testWithTolerance(9);
testWithTolerance(10);
