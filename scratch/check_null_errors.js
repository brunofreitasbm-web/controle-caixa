const fs = require('fs');
const path = require('path');

const appJs = fs.readFileSync(path.join(__dirname, '..', 'webapp', 'app.js'), 'utf8');
const lines = appJs.split('\n');

const regexDirectAccess = /document\.getElementById\(["']([^"']+)["']\)\.([a-zA-Z0-9_$]+)/;

lines.forEach((line, index) => {
  const match = regexDirectAccess.exec(line);
  if (match) {
    const id = match[1];
    const prop = match[2];
    console.log(`Line ${index + 1}: getElementById("${id}").${prop}`);
  }
});
