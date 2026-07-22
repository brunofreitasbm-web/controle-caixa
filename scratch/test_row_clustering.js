const fs = require('fs');
const path = require('path');

const items = JSON.parse(fs.readFileSync(path.join(__dirname, 'raw_items.json'), 'utf8'));

// Filter out empty items
const validItems = items.filter(item => item.str.trim() !== '');

// Sort items by Y coordinate descending
validItems.sort((a, b) => b.y - a.y);

// Cluster items into rows
const rows = [];
const rowTolerance = 12; // A row has height ~24, so 12 is a good threshold

validItems.forEach(item => {
  // Find if this item belongs to an existing row
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

console.log(`Clustered into ${rows.length} rows.`);

// Filter rows to only keep ones that look like data rows (e.g., they contain a document number or are within the table Y range)
// Table data rows are generally between Y=30 and Y=600
const dataRows = rows.filter(row => {
  const yCenter = row.sumY / row.items.length;
  // Does it contain a document number prefix or suffix?
  const hasDocPrefix = row.items.some(item => /^\d{9,10}-?$/.test(item.str));
  const hasDebito = row.items.some(item => /d[eé]bito/i.test(item.str));
  return yCenter > 20 && yCenter < 600 && (hasDocPrefix || hasDebito);
});

console.log(`Found ${dataRows.length} data rows.`);

dataRows.forEach((row, index) => {
  // Sort items in this row by X coordinate ascending
  row.items.sort((a, b) => a.x - b.x);
  
  // Format items nicely
  const rowText = row.items.map(item => `[${item.str} (x=${item.x}, y=${item.y})]`).join(" ");
  console.log(`\nRow ${index + 1} (Y-Center = ${(row.sumY / row.items.length).toFixed(1)}):`);
  console.log(rowText);
});
