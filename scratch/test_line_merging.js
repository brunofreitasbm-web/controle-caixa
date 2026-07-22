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

async function runParser() {
  try {
    const pdfPath = path.join(__dirname, '..', 'Modelo_Titulos _ Cacau Show.pdf');
    const data = new Uint8Array(fs.readFileSync(pdfPath));
    const loadingTask = pdfjsLib.getDocument({ data });
    const pdf = await loadingTask.promise;
    
    const boletosExtraidos = [];
    
    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const textContent = await page.getTextContent();
      
      const items = textContent.items
        .map(item => ({
          str: item.str.trim(),
          x: Math.round(item.transform[4] * 10) / 10,
          y: Math.round(item.transform[5] * 10) / 10,
          w: Math.round(item.width * 10) / 10,
          h: Math.round(item.height * 10) / 10
        }))
        .filter(item => item.str !== '');

      // Group into lines using small tolerance (4)
      const linesMap = {};
      items.forEach(item => {
        let foundY = Object.keys(linesMap).find(key => Math.abs(parseFloat(key) - item.y) < 4);
        if (!foundY) {
          foundY = item.y;
          linesMap[foundY] = [];
        }
        linesMap[foundY].push(item);
      });

      // Sort lines by Y coordinate descending
      const sortedY = Object.keys(linesMap).sort((a, b) => parseFloat(b) - parseFloat(a));
      
      const rows = [];
      sortedY.forEach(yStr => {
        const y = parseFloat(yStr);
        const lineItems = linesMap[yStr];
        
        // Find if we should merge with the previous row
        if (rows.length > 0) {
          const lastRow = rows[rows.length - 1];
          const gap = lastRow.y - y;
          if (gap <= 14.0) {
            // Merge items
            lastRow.items.push(...lineItems);
            // Don't update lastRow.y to keep it representing the top line's Y
            return;
          }
        }
        
        rows.push({
          y,
          items: [...lineItems]
        });
      });

      // Process each merged row
      rows.forEach(row => {
        // Sort items in the row horizontally
        row.items.sort((a, b) => a.x - b.x);

        // Find the document number prefix
        const prefixItem = row.items.find(item => /^\d{9,10}-?$/.test(item.str));
        if (!prefixItem) return;

        // Find suffix
        const suffixItem = row.items.find(item => item.x > prefixItem.x && item.x < 70 && (/^\d{3}$/.test(item.str) || /^[A-Z]{2,3}$/.test(item.str)));
        
        let documento = prefixItem.str;
        if (suffixItem) {
          const cleanPrefix = prefixItem.str.endsWith('-') ? prefixItem.str.slice(0, -1) : prefixItem.str;
          documento = `${cleanPrefix}-${suffixItem.str}`;
        }

        // Only process debits
        const isDebito = row.items.some(item => /d[eé]bito/i.test(item.str));
        if (!isDebito) return;

        // Find date
        const dateItem = row.items.find(item => /^\b\d{2}\/\d{2}\/\d{2,4}\b$/.test(item.str));
        if (!dateItem) return;
        
        let vencimento = dateItem.str;
        const dateParts = vencimento.split('/');
        if (dateParts[2].length === 2) {
          vencimento = `${dateParts[0]}/${dateParts[1]}/20${dateParts[2]}`;
        }

        // Find valor
        const valorItems = row.items.filter(item => item.x >= 480 && item.x <= 515);
        let valorStr = "";
        valorItems.forEach(vi => {
          valorStr += " " + vi.str;
        });
        valorStr = valorStr.trim();

        const valor = parseMoedaPdf(valorStr);
        if (!valor) return;

        // Find Doc. Faturamento
        const docFatPrefixItem = row.items.find(item => item.x >= 370 && item.x <= 395 && /^\d{6,9}-$/.test(item.str));
        let docFaturamento = null;
        if (docFatPrefixItem) {
          const docFatSuffixItem = row.items.find(item => item.x > docFatPrefixItem.x && item.x < 420 && /^\d{3}$/.test(item.str));
          if (docFatSuffixItem) {
            docFaturamento = `${docFatPrefixItem.str}${docFatSuffixItem.str}`;
          }
        }

        const parcelaItem = row.items.find(item => item.x >= 300 && item.x <= 330 && /^\d+\/\d+$/.test(item.str));
        const parcela = parcelaItem ? parcelaItem.str : "1/1";

        const rowText = row.items.map(item => item.str).join(" ");
        const lojaNoBloco = detectStoreFromBoletoLine(rowText);
        const loja = lojaNoBloco || "9175";

        const descItems = row.items.filter(item => item.x >= 185 && item.x < 300);
        let descricao = descItems.map(item => item.str).join(" ").trim();
        if (!descricao) descricao = "Duplicata Cacau Show";

        boletosExtraidos.push({
          documento,
          docFaturamento,
          parcela,
          loja,
          descricao,
          vencimento,
          valor,
          status: "Aberto"
        });
      });
    }

    console.log("Total parsed boletos:", boletosExtraidos.length);
    if (boletosExtraidos.length > 0) {
      boletosExtraidos.forEach((b, idx) => {
        console.log(`${idx + 1}. Doc: ${b.documento} | Venc: ${b.vencimento} | Valor: R$ ${b.valor} | Parcela: ${b.parcela} | Loja: ${b.loja} | DocFat: ${b.docFaturamento} | Desc: ${b.descricao}`);
      });
    }
  } catch (error) {
    console.error(error);
  }
}

runParser();
