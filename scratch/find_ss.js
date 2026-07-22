const fs = require('fs');
const path = require('path');

const items = JSON.parse(fs.readFileSync(path.join(__dirname, 'raw_items.json'), 'utf8'));

items.forEach(item => {
  if (item.str.includes("SS") || item.str.includes("984023971")) {
    console.log(`Str: "${item.str}" at x=${item.x}, y=${item.y}`);
  }
});
