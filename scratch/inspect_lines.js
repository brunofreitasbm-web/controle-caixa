const fs = require('fs');
const path = require('path');
const pdfjsLib = require('pdfjs-dist');

async function test() {
  const pdfPath = path.join(__dirname, '..', 'Modelo_Titulos _ Cacau Show.pdf');
  const data = new Uint8Array(fs.readFileSync(pdfPath));
  const loadingTask = pdfjsLib.getDocument({ data });
  const pdf = await loadingTask.promise;
  
  const page = await pdf.getPage(1);
  const text = await page.getTextContent();
  
  const items = text.items;
  const linesMap = {};
  
  items.forEach(item => {
    const y = Math.round(item.transform[5] * 10) / 10;
    let foundY = Object.keys(linesMap).find(key => Math.abs(parseFloat(key) - y) < 8);
    if (!foundY) {
      foundY = y;
      linesMap[foundY] = [];
    }
    linesMap[foundY].push(item);
  });

  const sortedY = Object.keys(linesMap).sort((a, b) => parseFloat(b) - parseFloat(a));
  sortedY.forEach((y, index) => {
    const lineItems = linesMap[y].sort((a, b) => a.transform[4] - b.transform[4]);
    const lineText = lineItems.map(item => item.str).join(" ");
    if (lineText.includes("0091665204-") || lineText.includes("984023971-")) {
      console.log(`Line ${index} (y=${y}):`, lineText);
    }
  });
}

test();
