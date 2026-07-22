const fs = require('fs');
const path = require('path');
const pdfjsLib = require('pdfjs-dist');

async function extractText() {
  try {
    const pdfPath = path.join(__dirname, '..', 'Modelo_Titulos _ Cacau Show.pdf');
    const data = new Uint8Array(fs.readFileSync(pdfPath));
    const loadingTask = pdfjsLib.getDocument({ data });
    const pdf = await loadingTask.promise;
    console.log(`Loaded PDF with ${pdf.numPages} pages.`);
    
    let fullText = "";
    
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      
      const items = textContent.items;
      const linesMap = {};
      
      items.forEach(item => {
        const y = Math.round(item.transform[5] * 10) / 10;
        let foundY = Object.keys(linesMap).find(key => Math.abs(parseFloat(key) - y) < 4);
        if (!foundY) {
          foundY = y;
          linesMap[foundY] = [];
        }
        linesMap[foundY].push(item);
      });

      const sortedY = Object.keys(linesMap).sort((a, b) => parseFloat(b) - parseFloat(a));
      sortedY.forEach(y => {
        const lineItems = linesMap[y].sort((a, b) => a.transform[4] - b.transform[4]);
        fullText += lineItems.map(item => item.str).join(" ") + "\n";
      });
    }
    
    fs.writeFileSync(path.join(__dirname, 'extracted_pdf_text.txt'), fullText);
    console.log("Saved extracted text to scratch/extracted_pdf_text.txt");
  } catch (error) {
    console.error("Error parsing PDF:", error);
  }
}

extractText();
