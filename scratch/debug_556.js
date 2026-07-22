const fs = require('fs');
const path = require('path');
const pdfjsLib = require('pdfjs-dist');

async function debug() {
  const pdfPath = path.join(__dirname, '..', 'Modelo_Titulos _ Cacau Show.pdf');
  const data = new Uint8Array(fs.readFileSync(pdfPath));
  const loadingTask = pdfjsLib.getDocument({ data });
  const pdf = await loadingTask.promise;
  
  const page = await pdf.getPage(1);
  const textContent = await page.getTextContent();
  
  const items = textContent.items
    .map(item => ({
      str: item.str.trim(),
      x: Math.round(item.transform[4] * 10) / 10,
      y: Math.round(item.transform[5] * 10) / 10
    }))
    .filter(item => item.str !== '');

  const linesMap = {};
  items.forEach(item => {
    let foundY = Object.keys(linesMap).find(key => Math.abs(parseFloat(key) - item.y) < 4);
    if (!foundY) {
      foundY = item.y;
      linesMap[foundY] = [];
    }
    linesMap[foundY].push(item);
  });

  const sortedY = Object.keys(linesMap).sort((a, b) => parseFloat(b) - parseFloat(a));
  
  const rows = [];
  sortedY.forEach(yStr => {
    const y = parseFloat(yStr);
    const lineItems = linesMap[yStr];
    
    if (rows.length > 0) {
      const lastRow = rows[rows.length - 1];
      const gap = lastRow.y - y;
      if (gap <= 14.0) {
        lastRow.items.push(...lineItems);
        return;
      }
    }
    
    rows.push({ y, items: [...lineItems] });
  });

  const targetRow = rows.find(r => r.y === 556.7);
  if (targetRow) {
    targetRow.items.sort((a, b) => a.x - b.x);
    console.log("Items in row Y=556.7:");
    targetRow.items.forEach(item => {
      console.log(`  "${item.str}" at x=${item.x}, y=${item.y}`);
    });
  }
}

debug();
