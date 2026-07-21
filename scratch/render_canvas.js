const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

const htmlPath = path.join(__dirname, 'canvas_generator.html');

// Executar via Edge / Chrome headless para salvar as imagens dataURL
const command = `"C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe" --headless --disable-gpu --dump-dom "${htmlPath}"`;

exec(command, (err, stdout, stderr) => {
  if (err) {
    console.error('Edge error:', err);
    return;
  }
  // Extract data URLs from stdout script execution if any or write node script to save base64
  console.log('HTML Dumped');
});
