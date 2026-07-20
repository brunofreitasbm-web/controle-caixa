const fs = require('fs');
const path = require('path');

const csvPath = path.join(__dirname, '..', 'Cópia de Controle de Caixa (respostas) - Dados Extraídos BD.csv');
const lines = fs.readFileSync(csvPath, 'utf8').split(/\r?\n/);

const targets = [619, 811, 1023, 1091];

targets.forEach(lineNum => {
  console.log(`\n--- CONTEXT FOR LINE ${lineNum} ---`);
  const start = Math.max(1, lineNum - 3);
  const end = Math.min(lines.length, lineNum + 3);
  for (let i = start; i <= end; i++) {
    const prefix = i === lineNum ? '==>' : '   ';
    console.log(`${prefix} Line ${i}: ${lines[i - 1]}`);
  }
});
