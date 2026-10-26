const { db } = require('../../config/database');

// Colaborador desligado (pelo Hub ou pelo owner) tem colaboradores.ativo = 0; NULL conta como ativo.
// Nomes que não existem na tabela também contam como ativos: aqui só se barra quem foi desligado.
function nomesInativos(nomes, cb) {
  const lista = [...new Set((nomes || []).map(n => String(n || '').trim()).filter(Boolean))];
  if (lista.length === 0) return cb(null, new Set());
  const marcas = lista.map(() => '?').join(', ');
  db.all(`SELECT nome FROM colaboradores WHERE ativo = 0 AND nome IN (${marcas})`, lista, (err, rows) => {
    if (err) return cb(err);
    cb(null, new Set((rows || []).map(r => r.nome)));
  });
}

module.exports = { nomesInativos };
