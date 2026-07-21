const fs = require('fs');
const path = require('path');

// Ensure output dir exists
const iconsDir = path.join(__dirname, 'webapp', 'icons');
if (!fs.existsSync(iconsDir)) {
  fs.mkdirSync(iconsDir, { recursive: true });
}

function generateSVG(size) {
  const strokeWidth = Math.max(2, Math.round(size * 0.025));
  const innerRadius = Math.round(size * 0.08);
  
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <defs>
    <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#4a121a"/>
      <stop offset="50%" stop-color="#330b10"/>
      <stop offset="100%" stop-color="#20060a"/>
    </linearGradient>
    <linearGradient id="goldGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#dfcba5"/>
      <stop offset="50%" stop-color="#bd954b"/>
      <stop offset="100%" stop-color="#8c6a2c"/>
    </linearGradient>
    <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="${size * 0.015}" result="blur" />
      <feComposite in="SourceGraphic" in2="blur" operator="over" />
    </filter>
  </defs>

  <!-- Fundo com cantos arredondados -->
  <rect width="${size}" height="${size}" rx="${size * 0.22}" fill="url(#bgGrad)"/>
  
  <!-- Borda elegante em degradê dourado -->
  <rect x="${strokeWidth}" y="${strokeWidth}" width="${size - strokeWidth*2}" height="${size - strokeWidth*2}" rx="${size * 0.21}" fill="none" stroke="url(#goldGrad)" stroke-width="${strokeWidth}"/>

  <!-- Ícone central: Caixa de Registradora / Cofre com Círculo de Segurança -->
  <g stroke="url(#goldGrad)" stroke-linecap="round" stroke-linejoin="round" fill="none">
    <!-- Base / Registro -->
    <rect x="${size * 0.22}" y="${size * 0.28}" width="${size * 0.56}" height="${size * 0.44}" rx="${size * 0.06}" stroke-width="${size * 0.035}" fill="#3d0e15"/>
    
    <!-- Tela / Visor Superior -->
    <path d="M ${size * 0.35} ${size * 0.28} L ${size * 0.40} ${size * 0.18} L ${size * 0.60} ${size * 0.18} L ${size * 0.65} ${size * 0.28} Z" stroke-width="${size * 0.03}" fill="url(#goldGrad)" opacity="0.9"/>
    
    <!-- Gaveta de Dinheiro com slot de cédulas -->
    <line x1="${size * 0.28}" y1="${size * 0.56}" x2="${size * 0.72}" y2="${size * 0.56}" stroke-width="${size * 0.03}"/>
    <rect x="${size * 0.42}" y="${size * 0.61}" width="${size * 0.16}" height="${size * 0.05}" rx="${size * 0.015}" fill="url(#goldGrad)"/>

    <!-- Fechadura / Cifrão $ no Visor -->
    <circle cx="${size * 0.5}" cy="${size * 0.42}" r="${size * 0.08}" stroke-width="${size * 0.03}" fill="#4a121a"/>
    <text x="${size * 0.5}" y="${size * 0.445}" font-family="Arial, sans-serif" font-size="${size * 0.11}" font-weight="bold" fill="url(#goldGrad)" text-anchor="middle" stroke="none">$</text>
  </g>

  <!-- Texto "CONTROLE DE CAIXA" -->
  <text x="${size * 0.5}" y="${size * 0.84}" font-family="'Outfit', 'Segoe UI', sans-serif" font-size="${size * 0.075}" font-weight="800" fill="url(#goldGrad)" text-anchor="middle" letter-spacing="${size * 0.005}">CONTROLE DE CAIXA</text>
</svg>`;
}

fs.writeFileSync(path.join(iconsDir, 'icon.svg'), generateSVG(512));
console.log('SVG icon generated successfully!');
