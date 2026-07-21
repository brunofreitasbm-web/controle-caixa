const fs = require('fs');
const path = require('path');

const appJs = fs.readFileSync(path.join(__dirname, '..', 'webapp', 'app.js'), 'utf8');
const html = fs.readFileSync(path.join(__dirname, '..', 'webapp', 'index.html'), 'utf8');

const regex = /document\.getElementById\(["']([^"']+)["']\)/g;
let match;
const ids = new Set();
while ((match = regex.exec(appJs)) !== null) {
  ids.add(match[1]);
}

const missing = [];
for (const id of ids) {
  if (!html.includes(`id="${id}"`) && !html.includes(`id='${id}'`)) {
    missing.push(id);
  }
}

console.log('Total getElementById IDs:', ids.size);
console.log('MISSING IDs in index.html:', missing);
