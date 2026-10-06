// Validação server-side de data URLs (fotos/comprovantes/documentos enviados
// como base64 pelo front). O cliente comprime para WebP (ver
// webapp/upload-utils.js), mas o servidor nunca pode confiar nisso: aqui só
// passa MIME da lista permitida, dentro do teto de tamanho e cujos bytes
// batem com o tipo declarado.

const MIMES_IMAGEM = ['image/webp', 'image/jpeg', 'image/png'];
const MIMES_IMAGEM_E_PDF = [...MIMES_IMAGEM, 'application/pdf'];

// Tetos em bytes já decodificados. O Vercel limita o body a ~4,5MB, então
// 4MB cobre qualquer foto comprimida; documentos da auditoria podem ser PDFs
// maiores (limite do express.json é 15mb em base64, ~11MB decodificados).
const MAX_BYTES_IMAGEM = 4 * 1024 * 1024;
const MAX_BYTES_DOCUMENTO = 10 * 1024 * 1024;

const CABECALHO_RE = /^data:([a-zA-Z0-9.+\/-]+)(?:;[a-zA-Z0-9.+=_-]+)*;base64,$/;

function bytesDoBase64(b64) {
  const limpo = b64.replace(/[\r\n]/g, '');
  const padding = limpo.endsWith('==') ? 2 : limpo.endsWith('=') ? 1 : 0;
  return Math.floor((limpo.length * 3) / 4) - padding;
}

function assinaturaConfere(mime, b64) {
  // Decodifica só o início (suficiente para os magic bytes).
  const head = Buffer.from(b64.replace(/[\r\n]/g, '').slice(0, 32), 'base64');
  if (mime === 'image/jpeg') return head.length >= 3 && head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff;
  if (mime === 'image/png') return head.length >= 8 && head.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  if (mime === 'image/webp') return head.length >= 12 && head.subarray(0, 4).toString('latin1') === 'RIFF' && head.subarray(8, 12).toString('latin1') === 'WEBP';
  if (mime === 'application/pdf') return head.length >= 5 && head.subarray(0, 5).toString('latin1') === '%PDF-';
  return false;
}

// Retorna { ok: true, mime, bytes } ou { ok: false, error }.
// Valor vazio/ausente é tratado por quem chama (campos opcionais).
function validarDataUrl(valor, { permitirPdf = false, maxBytes } = {}) {
  if (typeof valor !== 'string' || !valor) return { ok: false, error: 'Arquivo inválido.' };
  const permitidos = permitirPdf ? MIMES_IMAGEM_E_PDF : MIMES_IMAGEM;
  const teto = maxBytes || (permitirPdf ? MAX_BYTES_DOCUMENTO : MAX_BYTES_IMAGEM);

  // Valida só o cabeçalho com regex; o corpo é checado com um teste simples.
  const virgula = valor.indexOf(',');
  if (virgula < 0 || virgula > 200) return { ok: false, error: 'Arquivo deve ser um data URL base64.' };
  const m = CABECALHO_RE.exec(valor.slice(0, virgula + 1));
  if (!m) return { ok: false, error: 'Arquivo deve ser um data URL base64.' };
  const mime = m[1].toLowerCase();
  if (!permitidos.includes(mime)) {
    return { ok: false, error: `Tipo de arquivo não permitido (${mime}). Permitidos: ${permitidos.join(', ')}.` };
  }
  const corpo = valor.slice(virgula + 1);
  if (!corpo || !/^[A-Za-z0-9+\/=\r\n]+$/.test(corpo)) return { ok: false, error: 'Conteúdo base64 inválido.' };
  const bytes = bytesDoBase64(corpo);
  if (bytes <= 0) return { ok: false, error: 'Arquivo vazio.' };
  if (bytes > teto) {
    return { ok: false, error: `Arquivo excede o limite de ${Math.round(teto / 1024 / 1024)}MB.` };
  }
  if (!assinaturaConfere(mime, corpo)) return { ok: false, error: 'O conteúdo do arquivo não corresponde ao tipo declarado.' };
  return { ok: true, mime, bytes };
}

module.exports = { validarDataUrl, MIMES_IMAGEM, MIMES_IMAGEM_E_PDF, MAX_BYTES_IMAGEM, MAX_BYTES_DOCUMENTO };
