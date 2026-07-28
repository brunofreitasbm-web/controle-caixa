export function buildWaLink(numero, texto) {
  const digits = String(numero || '').replace(/\D/g, '');
  return `https://wa.me/${digits}?text=${encodeURIComponent(texto || '')}`;
}

export function abrirWhatsapp(numero, texto) {
  window.open(buildWaLink(numero, texto), '_blank', 'noopener');
}
