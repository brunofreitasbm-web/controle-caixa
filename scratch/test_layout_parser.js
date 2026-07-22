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

      // Group into rows using Y tolerance
      const rows = [];
      const rowTolerance = 12;

      // Sort by Y descending
      items.sort((a, b) => b.y - a.y);

      items.forEach(item => {
        let foundRow = rows.find(row => {
          const rowYCenter = row.sumY / row.items.length;
          return Math.abs(rowYCenter - item.y) <= rowTolerance;
        });

        if (foundRow) {
          foundRow.items.push(item);
          foundRow.sumY += item.y;
        } else {
          rows.push({
            sumY: item.y,
            items: [item]
          });
        }
      });

      // Process each row
      rows.forEach(row => {
        // Sort items in the row horizontally
        row.items.sort((a, b) => a.x - b.x);

        // Find the document number prefix (e.g. 10 digits or 9 digits followed by hyphen)
        const prefixItem = row.items.find(item => /^\d{9,10}-?$/.test(item.str));
        if (!prefixItem) return;

        // Find the suffix (it should be at x around 57, matching \d{3} or [A-Z]{2,3})
        // Or it is the item immediately following the prefix in x coordinate
        const suffixItem = row.items.find(item => item.x > prefixItem.x && item.x < 70 && (/^\d{3}$/.test(item.str) || /^[A-Z]{2,3}$/.test(item.str)));
        
        let documento = prefixItem.str;
        if (suffixItem) {
          const cleanPrefix = prefixItem.str.endsWith('-') ? prefixItem.str.slice(0, -1) : prefixItem.str;
          documento = `${cleanPrefix}-${suffixItem.str}`;
        }

        // Find type of doc
        const isDebito = row.items.some(item => /d[eé]bito/i.test(item.str));
        if (!isDebito) return; // Only process debits

        // Find date of vencimento (x is around 440 to 470, matches \d{2}/\d{2}/\d{2,4})
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

        // Find Doc. Faturamento (x around 370 to 410)
        // Usually looks like \d{9}-
        const docFatPrefixItem = row.items.find(item => item.x >= 370 && item.x <= 395 && /^\d{6,9}-$/.test(item.str));
        let docFaturamento = null;
        if (docFatPrefixItem) {
          const docFatSuffixItem = row.items.find(item => item.x > docFatPrefixItem.x && item.x < 420 && /^\d{3}$/.test(item.str));
          if (docFatSuffixItem) {
            docFaturamento = `${docFatPrefixItem.str}${docFatSuffixItem.str}`;
          }
        }

        // Find Parcela (x around 300 to 330, matches \d+/\d+)
        const parcelaItem = row.items.find(item => item.x >= 300 && item.x <= 330 && /^\d+\/\d+$/.test(item.str));
        const parcela = parcelaItem ? parcelaItem.str : "1/1";

        // Store
        // We can detect store from the whole row text
        const rowText = row.items.map(item => item.str).join(" ");
        const lojaNoBloco = detectStoreFromBoletoLine(rowText);
        const loja = lojaNoBloco || "9175"; // Default to Marambaia if not found

        // Descrição (gather all items between Company/Tipo and Parcela)
        // Empresa column is around x = 140 to 185
        // Parcela column starts at x >= 300
        // So description is between x = 185 and x = 300
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
      console.log("Parsed Boletos list:");
      boletosExtraidos.forEach((b, idx) => {
        console.log(`${idx + 1}. Doc: ${b.documento} | Venc: ${b.vencimento} | Valor: R$ ${b.valor} | Parcela: ${b.parcela} | Loja: ${b.loja} | DocFat: ${b.docFaturamento} | Desc: ${b.descricao}`);
      });
    }
  } catch (error) {
    console.error(error);
  }
}

runParser();
