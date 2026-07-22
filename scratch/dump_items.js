const fs = require('fs');
const path = require('path');
const pdfjsLib = require('pdfjs-dist');

async function dumpItems() {
  try {
    const pdfPath = path.join(__dirname, '..', 'Modelo_Titulos _ Cacau Show.pdf');
    const data = new Uint8Array(fs.readFileSync(pdfPath));
    const loadingTask = pdfjsLib.getDocument({ data });
    const pdf = await loadingTask.promise;
    
    const page = await pdf.getPage(1);
    const textContent = await page.getTextContent();
    
    const items = textContent.items.map(item => ({
      str: item.str,
      x: Math.round(item.transform[4] * 10) / 10,
      y: Math.round(item.transform[5] * 10) / 10,
      w: Math.round(item.width * 10) / 10,
      h: Math.round(item.height * 10) / 10
    }));
    
    fs.writeFileSync(path.join(__dirname, 'raw_items.json'), JSON.stringify(items, null, 2));
    console.log("Saved raw items to scratch/raw_items.json");
  } catch (error) {
    console.error("Error dumping items:", error);
  }
}

dumpItems();
