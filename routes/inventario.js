const express = require('express');
const router = express.Router();
const { db, normalizeRow } = require('../config/database');
const { registrarLog } = require('../config/logger');
const { publish } = require('../config/realtime');

/**
 * INVENTÁRIO DE ESTOQUE COMPARTILHADO
 * ==========================================================================
 * Antes, o inventário existia só no localStorage do aparelho de quem estava
 * contando. Aqui ele passa a viver no banco, para que todas as pessoas logadas
 * vejam a contagem sendo feita, em tempo real (via canal SSE em /api/events).
 *
 * Regra de conflito acordada: última digitação vence. O carimbo `atualizadoEm`
 * é gerado NO SERVIDOR nas escritas ao vivo — não dá para confiar no relógio
 * dos celulares. O timestamp do cliente só é usado na importação em lote, para
 * ordenar dados que já existiam nos aparelhos.
 */

const COLUNAS = 'id, loja, codProduto, barras, descricao, validade, countedQty, dataEntrada, qtdEntradaUnidades, qtdEntradaCaixas, atualizadoPor, atualizadoEm, criadoEm';

const SQL_UPSERT = `
  INSERT INTO inventario_itens
    (loja, codProduto, barras, descricao, validade, countedQty, dataEntrada, qtdEntradaUnidades, qtdEntradaCaixas, atualizadoPor, atualizadoEm, criadoEm)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(loja, codProduto) DO UPDATE SET
    barras = excluded.barras,
    descricao = excluded.descricao,
    validade = excluded.validade,
    countedQty = excluded.countedQty,
    dataEntrada = excluded.dataEntrada,
    qtdEntradaUnidades = excluded.qtdEntradaUnidades,
    qtdEntradaCaixas = excluded.qtdEntradaCaixas,
    atualizadoPor = excluded.atualizadoPor,
    atualizadoEm = excluded.atualizadoEm`;

// Na importação em lote não sobrescrevemos um dado mais novo do servidor com
// um dado velho que estava parado no aparelho de alguém.
const SQL_UPSERT_SE_MAIS_NOVO = `${SQL_UPSERT}
  WHERE inventario_itens.atualizadoEm IS NULL
     OR excluded.atualizadoEm >= inventario_itens.atualizadoEm`;

function montarValores(loja, item, atualizadoPor, atualizadoEm) {
  return [
    String(loja),
    String(item.code || item.codProduto || '').trim(),
    item.barras || '',
    item.description || item.descricao || '',
    item.validade ? String(item.validade) : null,
    item.countedQty === undefined || item.countedQty === null ? '' : String(item.countedQty),
    item.dataEntrada || '',
    Number(item.qtdEntradaUnidades || 0),
    Number(item.qtdEntradaCaixas || 0),
    atualizadoPor || 'Sistema',
    atualizadoEm,
    new Date().toISOString()
  ];
}

// Formato que o client já usa (dbBridge): code/description em vez de codProduto/descricao
function paraFormatoClient(row) {
  const r = normalizeRow(row);
  return {
    code: r.codProduto,
    barras: r.barras || '',
    description: r.descricao || '',
    validade: r.validade || null,
    countedQty: r.countedQty === null || r.countedQty === undefined ? '' : r.countedQty,
    dataEntrada: r.dataEntrada || '',
    qtdEntradaUnidades: Number(r.qtdEntradaUnidades || 0),
    qtdEntradaCaixas: Number(r.qtdEntradaCaixas || 0),
    atualizadoPor: r.atualizadoPor || null,
    lastUpdated: r.atualizadoEm || null
  };
}

// --- Listar o inventário de uma loja ---
router.get('/inventario', (req, res) => {
  const { loja } = req.query;
  if (!loja) return res.status(400).json({ error: 'Parâmetro "loja" é obrigatório.' });

  db.all(`SELECT ${COLUNAS} FROM inventario_itens WHERE loja = ? ORDER BY codProduto`, [String(loja)], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json((rows || []).map(paraFormatoClient));
  });
});

// --- Gravar/atualizar um item (uma digitação de quantidade ou validade) ---
router.put('/inventario/:loja/:cod', (req, res) => {
  const { loja, cod } = req.params;
  const { usuario, clientId } = req.query;
  const item = { ...(req.body || {}), code: cod };

  const atualizadoEm = new Date().toISOString();
  const valores = montarValores(loja, item, usuario, atualizadoEm);

  db.run(SQL_UPSERT, valores, function (err) {
    if (err) return res.status(500).json({ error: err.message });

    const payload = {
      loja: String(loja),
      item: {
        code: String(cod),
        barras: item.barras || '',
        description: item.description || item.descricao || '',
        validade: item.validade || null,
        countedQty: item.countedQty === undefined || item.countedQty === null ? '' : String(item.countedQty),
        dataEntrada: item.dataEntrada || '',
        qtdEntradaUnidades: Number(item.qtdEntradaUnidades || 0),
        qtdEntradaCaixas: Number(item.qtdEntradaCaixas || 0),
        atualizadoPor: usuario || null,
        lastUpdated: atualizadoEm
      }
    };

    publish('inventario.item', payload, { origem: clientId, usuario });
    res.json({ success: true, atualizadoEm });
  });
});

// --- Gravar vários itens de uma vez ---
// Usado pela migração inicial (dados que já estavam no localStorage dos
// aparelhos) e pelo crédito automático de produtos de NF-e conferida.
router.post('/inventario/bulk', (req, res) => {
  const { loja, itens, usuario, clientId, origem } = req.body || {};
  if (!loja || !Array.isArray(itens)) {
    return res.status(400).json({ error: 'Envie { loja, itens: [] }.' });
  }
  if (itens.length === 0) return res.json({ success: true, gravados: 0 });

  const agora = new Date().toISOString();
  let pendentes = itens.length;
  let erros = 0;

  itens.forEach(item => {
    // Migração respeita o carimbo que veio do aparelho; o resto usa a hora do servidor.
    const usarCarimboDoCliente = origem === 'migracao' && (item.lastUpdated || item.atualizadoEm);
    const atualizadoEm = usarCarimboDoCliente ? String(item.lastUpdated || item.atualizadoEm) : agora;
    const sql = usarCarimboDoCliente ? SQL_UPSERT_SE_MAIS_NOVO : SQL_UPSERT;

    db.run(sql, montarValores(loja, item, item.atualizadoPor || usuario, atualizadoEm), (err) => {
      if (err) {
        erros++;
        console.error('[Inventário] Erro no bulk:', err.message);
      }
      if (--pendentes === 0) finalizar();
    });
  });

  function finalizar() {
    if (origem === 'migracao') {
      registrarLog(null, 'INVENTARIO_MIGRACAO', `Importou ${itens.length} item(ns) do aparelho para a loja ${loja}.`, usuario);
    }

    // Lote grande vira só um aviso: os outros clientes recarregam a loja
    // inteira em vez de receber centenas de itens no evento.
    if (itens.length > 100) {
      publish('inventario.recarregar', { loja: String(loja), total: itens.length }, { origem: clientId, usuario });
    } else {
      publish('inventario.bulk', {
        loja: String(loja),
        itens: itens.map(i => ({
          code: String(i.code || i.codProduto || '').trim(),
          barras: i.barras || '',
          description: i.description || i.descricao || '',
          validade: i.validade || null,
          countedQty: i.countedQty === undefined || i.countedQty === null ? '' : String(i.countedQty),
          dataEntrada: i.dataEntrada || '',
          qtdEntradaUnidades: Number(i.qtdEntradaUnidades || 0),
          qtdEntradaCaixas: Number(i.qtdEntradaCaixas || 0),
          atualizadoPor: i.atualizadoPor || usuario || null
        }))
      }, { origem: clientId, usuario });
    }

    res.json({ success: true, gravados: itens.length - erros, erros });
  }
});

// --- Remover um item do inventário ---
router.delete('/inventario/:loja/:cod', (req, res) => {
  const { loja, cod } = req.params;
  const { usuario, clientId } = req.query;

  db.run('DELETE FROM inventario_itens WHERE loja = ? AND codProduto = ?', [String(loja), String(cod)], (err) => {
    if (err) return res.status(500).json({ error: err.message });
    registrarLog(null, 'INVENTARIO_EXCLUSAO', `Removeu o produto ${cod} do inventário da loja ${loja}.`, usuario);
    publish('inventario.excluido', { loja: String(loja), code: String(cod) }, { origem: clientId, usuario });
    res.json({ success: true });
  });
});

module.exports = router;
