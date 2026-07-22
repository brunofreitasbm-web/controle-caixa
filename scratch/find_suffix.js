const fs = require('fs');
const path = require('path');

const items = JSON.parse(fs.readFileSync(path.join(__dirname, 'raw_items.json'), 'utf8'));

// Find all items containing "001" or near Y=505
items.forEach(item => {
  if (Math.abs(item.y - 505) < 15 || item.str.includes("0090037761")) {
    console.log(`Str: "${item.str}" at x=${item.x}, y=${item.y}`);
  }
});
