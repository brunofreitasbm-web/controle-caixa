// Importa/atualiza data/catalogo-seed.json em catalogo_produtos.
// Upsert por codProduto: sempre atualiza descricao/codBarras/grupo/preco
// (a planilha de preços é a fonte de verdade para isso), mas NUNCA mexe em
// visivelCatalogo/fotoUrl/categoriaExibicao — essas três são decisão do
// Owner pela tela de admin e não podem ser apagadas ao reimportar a planilha.
//
// Uso: node scripts/import-catalogo.js [caminho-do-json]

const fs = require('fs');
const path = require('path');
const { initDb, dbRunAsync } = require('../config/database');

const arquivo = process.argv[2] || path.join(__dirname, '..', 'data', 'catalogo-seed.json');

async function main() {
  const itens = JSON.parse(fs.readFileSync(arquivo, 'utf-8'));
  console.log(`Importando ${itens.length} itens de ${arquivo}...`);

  const atualizadoEm = new Date().toISOString();
  let ok = 0;

  for (const item of itens) {
    await dbRunAsync(
      `INSERT INTO catalogo_produtos (codProduto, descricao, codBarras, grupo, preco, atualizadoEm)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(codProduto) DO UPDATE SET
         descricao = excluded.descricao,
         codBarras = excluded.codBarras,
         grupo = excluded.grupo,
         preco = excluded.preco,
         atualizadoEm = excluded.atualizadoEm`,
      [item.codProduto, item.descricao, item.codBarras || null, item.grupo, item.preco, atualizadoEm]
    );
    ok++;
    if (ok % 500 === 0) console.log(`  ${ok}/${itens.length}...`);
  }

  console.log(`Concluído: ${ok} produtos importados/atualizados.`);
  process.exit(0);
}

initDb(() => {
  main().catch(err => {
    console.error('Erro ao importar catálogo:', err);
    process.exit(1);
  });
});
