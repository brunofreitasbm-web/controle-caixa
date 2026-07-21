const fs = require('fs');
const path = require('path');

const iconsDir = path.join(__dirname, '..', 'webapp', 'icons');
if (!fs.existsSync(iconsDir)) {
  fs.mkdirSync(iconsDir, { recursive: true });
}

function generateSVG(size) {
  const strokeWidth = Math.max(3, Math.round(size * 0.025));
  
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <defs>
    <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#4a121a"/>
      <stop offset="50%" stop-color="#330b10"/>
      <stop offset="100%" stop-color="#1f0508"/>
    </linearGradient>
    <linearGradient id="goldGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#f3e5c8"/>
      <stop offset="35%" stop-color="#dfcba5"/>
      <stop offset="70%" stop-color="#bd954b"/>
      <stop offset="100%" stop-color="#8c6a2c"/>
    </linearGradient>
    <linearGradient id="innerGrad" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#5c1a2b"/>
      <stop offset="100%" stop-color="#330b10"/>
    </linearGradient>
    <filter id="shadow" x="-10%" y="-10%" width="120%" height="120%">
      <feDropShadow dx="0" dy="${size * 0.02}" stdDeviation="${size * 0.02}" flood-color="#000000" flood-opacity="0.5"/>
    </filter>
  </defs>

  <!-- Fundo com cantos arredondados (squircle PWA) -->
  <rect width="${size}" height="${size}" rx="${size * 0.22}" fill="url(#bgGrad)"/>
  
  <!-- Moldura Dourada Luxo -->
  <rect x="${strokeWidth}" y="${strokeWidth}" width="${size - strokeWidth * 2}" height="${size - strokeWidth * 2}" rx="${size * 0.21}" fill="none" stroke="url(#goldGrad)" stroke-width="${strokeWidth}"/>

  <!-- Grupo do Ícone da Caixa Registradora / Cofre -->
  <g filter="url(#shadow)">
    <!-- Visor Display Topo -->
    <path d="M ${size * 0.36} ${size * 0.28} L ${size * 0.40} ${size * 0.17} L ${size * 0.60} ${size * 0.17} L ${size * 0.64} ${size * 0.28} Z" fill="url(#goldGrad)"/>
    
    <!-- Corpo Principal do Caixa -->
    <rect x="${size * 0.22}" y="${size * 0.27}" width="${size * 0.56}" height="${size * 0.44}" rx="${size * 0.05}" fill="url(#innerGrad)" stroke="url(#goldGrad)" stroke-width="${size * 0.025}"/>

    <!-- Linha divisória da gaveta -->
    <line x1="${size * 0.26}" y1="${size * 0.53}" x2="${size * 0.74}" y2="${size * 0.53}" stroke="url(#goldGrad)" stroke-width="${size * 0.025}" stroke-linecap="round"/>

    <!-- Puxador da Gaveta -->
    <rect x="${size * 0.42}" y="${size * 0.59}" width="${size * 0.16}" height="${size * 0.05}" rx="${size * 0.015}" fill="url(#goldGrad)"/>

    <!-- Símbolo do Cifrão ($) em Destaque -->
    <text x="${size * 0.5}" y="${size * 0.455}" font-family="'Trebuchet MS', 'Arial Black', sans-serif" font-size="${size * 0.16}" font-weight="900" fill="url(#goldGrad)" text-anchor="middle" dominant-baseline="middle">$</text>
  </g>

  <!-- Rótulo "CONTROLE DE CAIXA" -->
  <text x="${size * 0.5}" y="${size * 0.84}" font-family="'Trebuchet MS', 'Outfit', 'Segoe UI', sans-serif" font-size="${size * 0.068}" font-weight="800" fill="url(#goldGrad)" text-anchor="middle" letter-spacing="${size * 0.004}">CONTROLE DE CAIXA</text>
</svg>`;
}

const svgContent = generateSVG(512);
fs.writeFileSync(path.join(iconsDir, 'icon.svg'), svgContent);
fs.writeFileSync(path.join(iconsDir, 'icon-192.svg'), generateSVG(192));
fs.writeFileSync(path.join(iconsDir, 'icon-512.svg'), svgContent);

console.log('SVG icons generated in webapp/icons successfully!');
