const fs = require('fs');
const path = require('path');

const items = JSON.parse(fs.readFileSync(path.join(__dirname, 'raw_items.json'), 'utf8'));

// Filter out empty items
const validItems = items.filter(item => item.str.trim() !== '');

// Let's print the items that contain "-" or look like doc numbers, along with their coordinates
console.log("Analyzing document numbers and their coordinates:");
validItems.forEach(item => {
  if (/^\d{9,10}-?$/.test(item.str) || /^\d{3}$/.test(item.str) || item.str === 'Debito' || item.str === 'Débito') {
    console.log(`Str: "${item.str}" \t x: ${item.x} \t y: ${item.y} \t w: ${item.w}`);
  }
});
