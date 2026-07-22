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

      // 1. Find all prefix items (document number prefixes: 9-10 digits, optionally ending with a hyphen, located at x between 38 and 46)
      const prefixItems = items.filter(item => item.x >= 38 && item.x <= 46 && /^\d{9,10}-?$/.test(item.str));
      
      // Sort prefix items by Y descending (top of page to bottom)
      prefixItems.sort((a, b) => b.y - a.y);

      // 2. Define rows based on prefix Y coordinates
      const rows = prefixItems.map((prefix, idx) => {
        // Top boundary: 10 units above the prefix Y (covers wrapped text like "SOFTWARE" above "984023971-")
        const topBoundary = prefix.y + 10.0;
        
        // Bottom boundary: Top boundary of the next row, or 0 for the last row
        const bottomBoundary = (idx + 1 < prefixItems.length) ? (prefixItems[idx + 1].y + 10.0) : 0.0;
        
        return {
          prefix,
          topBoundary,
          bottomBoundary,
          items: []
        };
      });

      // 3. Assign all items to their respective rows based on Y boundaries
      items.forEach(item => {
        const row = rows.find(r => item.y > r.bottomBoundary && item.y <= r.topBoundary);
        if (row) {
          row.items.push(item);
        }
      });

      // 4. Process each row
      rows.forEach(row => {
        // Sort items in the row horizontally
        row.items.sort((a, b) => a.x - b.x);

        const prefixItem = row.prefix;

        // Find suffix (at x between prefix.x and 70, matching \d{3} or [A-Z]{2,3})
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

        // Find valor (x coordinate is in the range 480 to 515)
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
