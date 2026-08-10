function normalizarTelefone(valor) {
  let digitos = String(valor || '').replace(/\D/g, '');
  if (!digitos) return '';
  if (digitos.length <= 11) digitos = `55${digitos}`;
  return digitos;
}

module.exports = {
  normalizarTelefone
};
