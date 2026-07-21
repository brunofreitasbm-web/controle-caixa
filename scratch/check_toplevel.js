const fs = require('fs');
const path = require('path');

const appJs = fs.readFileSync(path.join(__dirname, '..', 'webapp', 'app.js'), 'utf8');
const lines = appJs.split('\n');

let depth = 0;
lines.forEach((line, index) => {
  const trimmed = line.trim();
  if (trimmed.startsWith('//') || trimmed === '') return;
  
  // Count braces to roughly see top-level execution
  const openCount = (line.match(/\{/g) || []).length;
  const closeCount = (line.match(/\}/g) || []).length;
  
  if (depth === 0 && !trimmed.startsWith('function') && !trimmed.startsWith('async function') && !trimmed.startsWith('class') && !trimmed.startsWith('const') && !trimmed.startsWith('let') && !trimmed.startsWith('var')) {
    console.log(`Top-level call at line ${index + 1}: ${trimmed.slice(0, 60)}`);
  }
  
  depth += openCount - closeCount;
});
