const fs = require('fs');
const path = require('path');

const srcDirs = ['api', 'config', 'middleware', 'routes', 'services', 'webapp'];
const baseDir = path.join(__dirname, '..');

const getAllFiles = (dirPath, arrayOfFiles) => {
  const files = fs.readdirSync(dirPath);

  arrayOfFiles = arrayOfFiles || [];

  files.forEach((file) => {
    if (fs.statSync(path.join(dirPath, file)).isDirectory()) {
      if (file !== 'node_modules' && file !== '.git') {
        arrayOfFiles = getAllFiles(path.join(dirPath, file), arrayOfFiles);
      }
    } else {
      if (file.endsWith('.js') || file.endsWith('.html') || file.endsWith('.css')) {
        arrayOfFiles.push(path.join(dirPath, file));
      }
    }
  });

  return arrayOfFiles;
};

const allFiles = [];
srcDirs.forEach(d => {
    const p = path.join(baseDir, d);
    if(fs.existsSync(p)) {
        getAllFiles(p, allFiles);
    }
});
allFiles.push(path.join(baseDir, 'server.js'));
allFiles.push(path.join(baseDir, 'landingLovable.html'));

console.log(`Total files to analyze: ${allFiles.length}`);

// Read all files' contents
const fileContents = allFiles.map(f => ({
    path: f,
    name: path.basename(f),
    nameWithoutExt: path.basename(f, path.extname(f)),
    content: fs.readFileSync(f, 'utf8')
}));

const deadFiles = [];

fileContents.forEach(file => {
    if (file.name === 'server.js' || file.name === 'index.html' || file.name === 'app.js' || file.name === 'sw.js' || file.name === 'bluedox.html' || file.name === 'landingLovable.html' || file.name === 'landing.html') return;
    
    // Check if this file is referenced anywhere
    const isReferenced = fileContents.some(otherFile => {
        if (otherFile.path === file.path) return false;
        // Simple string matching for the filename (without extension)
        return otherFile.content.includes(file.nameWithoutExt);
    });

    if (!isReferenced) {
        deadFiles.push(file.name);
    }
});

console.log('--- POTENTIAL DEAD FILES ---');
deadFiles.forEach(f => console.log(f));
