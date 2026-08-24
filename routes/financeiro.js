const express = require('express');
const router = express.Router();
const { db } = require('../config/database');
const { publish } = require('../config/realtime');
const requireOwner = require('./middleware/requireOwner');
const { enviarNotificacaoNfeFaturamentoNovosProdutos } = require('../config/notifications');

/**
 * Localiza a linha da NF-e correspondente à loja. A chave usada pelo client é
 * "<numero>_<loja>" porque a mesma nota pode existir para lojas diferentes.
 */
function acharLinhaNf(numero, loja, cb) {
  db.all('SELECT * FROM nfs WHERE numero = ?', [numero], (err, rows) => {
    if (err) return cb(err);
    if (!rows || rows.length === 0) return cb(null, null);

    const alvo = (loja || '').toString().trim();
    for (const r of rows) {
      try {
        const rowInfo = JSON.parse(r.info || '{}');
        const rowStore = rowInfo.targetStore ? rowInfo.targetStore.toString().trim() : '';
        if (rowStore === alvo) return cb(null, r);
      } catch (e) {}
    }
    return cb(null, rows.length === 1 ? rows[0] : null);
  });
}

// --- NF-e Endpoints ---
// LIMIT de segurança: a tela de NF-es carrega a lista inteira de uma vez pra
// busca/filtro no cliente (não é paginada). Hoje a tabela tem poucas dezenas
// de linhas — o LIMIT é só uma trava pra não deixar a query virar um scan
// sem fim se isso crescer muito antes de existir paginação de verdade.
router.get('/nfs', (req, res) => {
  db.all('SELECT * FROM nfs ORDER BY criadoEm DESC LIMIT 2000', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    try {
      const result = (rows || []).map(r => ({
        id: r.id,
        numero: r.numero,
        info: JSON.parse(r.info || '{}'),
        products: JSON.parse(r.products || '[]'),
        criadoEm: r.criadoEm
      }));
      res.json(result);
    } catch (parseErr) {
      res.status(500).json({ error: 'Erro ao processar dados de Notas Fiscais.' });
    }
  });
});

router.post('/nfs', (req, res) => {
  const { numero, info, products } = req.body;
  if (!numero) return res.status(400).json({ error: 'Número da NF-e é obrigatório.' });

  db.all('SELECT * FROM nfs WHERE numero = ?', [numero], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    
    // Check if there is an exact duplicate
    const isDuplicate = (rows || []).some(row => {
      try {
        const rowInfo = JSON.parse(row.info || '{}');
        const rowProducts = JSON.parse(row.products || '[]');
        
        const store1 = (rowInfo.targetStore || '').toString().trim();
        const store2 = (info.targetStore || '').toString().trim();
        if (store1 !== store2) return false;
        
        const p1 = rowProducts || [];
        const p2 = products || [];
        if (p1.length !== p2.length) return false;
        
        const map1 = {};
        for (const item of p1) {
          const code = (item.code || '').toString().trim();
          const qty = Number(item.nfQty || 0);
          map1[code] = (map1[code] || 0) + qty;
        }
        
        const map2 = {};
        for (const item of p2) {
          const code = (item.code || '').toString().trim();
          const qty = Number(item.nfQty || 0);
          map2[code] = (map2[code] || 0) + qty;
        }
        
        const keys1 = Object.keys(map1);
        for (const key of keys1) {
          if (map1[key] !== map2[key]) return false;
        }
        
        return true;
      } catch (e) {
        return false;
      }
    });

    if (isDuplicate) {
      return res.status(409).json({ success: false, error: 'duplicated', message: 'Esta NF-e já foi importada anteriormente.' });
    }

    // Tela de Faturamento NFE (Owner): compara os códigos desta NF-e contra
    // TODOS os já vistos em qualquer NF-e anterior (qualquer loja) para saber
    // quais produtos são inéditos e merecem o push "produto novo" — feito
    // antes do INSERT, senão a própria nota que está entrando contaminaria a
    // comparação.
    db.all('SELECT products FROM nfs', [], (errConhecidos, rowsConhecidos) => {
      const codigosConhecidos = new Set();
      if (!errConhecidos && rowsConhecidos) {
        rowsConhecidos.forEach(row => {
          try {
            (JSON.parse(row.products || '[]') || []).forEach(p => {
              if (p && p.code) codigosConhecidos.add(String(p.code).trim());
            });
          } catch (e) {}
        });
      }
      const produtosNovos = (products || []).filter(p => p && p.code && !codigosConhecidos.has(String(p.code).trim()));

      const criadoEm = new Date().toISOString();
      db.run(
        'INSERT INTO nfs (numero, info, products, criadoEm) VALUES (?, ?, ?, ?)',
        [numero, JSON.stringify(info || {}), JSON.stringify(products || []), criadoEm],
        function(err2) {
          if (err2) return res.status(500).json({ error: err2.message });
          const loja = info && info.targetStore ? String(info.targetStore).trim() : '';
          publish('nf.importada', {
            numero,
            loja,
            totalProdutos: (products || []).length
          }, { origem: req.query.clientId || (req.body && req.body.clientId), usuario: req.query.usuario });

          if (produtosNovos.length > 0) {
            enviarNotificacaoNfeFaturamentoNovosProdutos(loja, numero, produtosNovos);
          }

          res.status(201).json({ success: true, numero });
        }
      );
    });
  });
});

router.put('/nfs/:numero', (req, res) => {
  let { numero } = req.params;
  const { info, products } = req.body;

  let targetStoreFromKey = '';
  if (numero.includes('_')) {
    const parts = numero.split('_');
    numero = parts[0];
    targetStoreFromKey = parts[1];
  }

  db.all('SELECT * FROM nfs WHERE numero = ?', [numero], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!rows || rows.length === 0) {
      return res.status(404).json({ error: 'Nota Fiscal não encontrada.' });
    }

    const incomingStore = (info && info.targetStore ? info.targetStore : targetStoreFromKey).toString().trim();
    let targetRow = null;
    
    for (const r of rows) {
      try {
        const rowInfo = JSON.parse(r.info || '{}');
        const rowStore = rowInfo.targetStore ? rowInfo.targetStore.toString().trim() : '';
        if (rowStore === incomingStore) {
          targetRow = r;
          break;
        }
      } catch (e) {}
    }

    if (!targetRow && rows.length === 1) {
      targetRow = rows[0];
    }

    if (!targetRow) {
      return res.status(404).json({ error: 'Nota Fiscal correspondente a esta loja não encontrada.' });
    }

    const fields = [];
    const values = [];

    if (info) {
      fields.push('info = ?');
      values.push(JSON.stringify(info));
    }
    if (products) {
      fields.push('products = ?');
      values.push(JSON.stringify(products));
    }

    if (fields.length === 0) {
      return res.status(400).json({ error: 'Nenhum campo para atualizar' });
    }

    if (targetRow.id !== undefined) {
      values.push(targetRow.id);
      const sql = `UPDATE nfs SET ${fields.join(', ')} WHERE id = ?`;
      db.run(sql, values, function(err2) {
        if (err2) return res.status(500).json({ error: err2.message });
        res.json({ success: true });
      });
    } else {
      values.push(numero);
      const sql = `UPDATE nfs SET ${fields.join(', ')} WHERE numero = ?`;
      db.run(sql, values, function(err2) {
        if (err2) return res.status(500).json({ error: err2.message });
        res.json({ success: true });
      });
    }
  });
});

/**
 * PATCH /api/nfs/:numero/item/:code — grava a contagem de UM produto.
 *
 * O PUT acima regrava o array `products` inteiro, o que fazia duas pessoas
 * conferindo a mesma nota apagarem a contagem uma da outra (a última resposta
 * a chegar levava consigo a cópia desatualizada da outra). Aqui o merge é feito
 * no servidor: lê a linha, altera só o produto informado e regrava.
 */
router.patch('/nfs/:numero/item/:code', (req, res) => {
  let { numero, code } = req.params;
  const { countedQty, usuario, clientId } = req.body || {};
  let loja = (req.body && req.body.loja) || '';

  if (numero.includes('_')) {
    const parts = numero.split('_');
    numero = parts[0];
    if (!loja) loja = parts[1];
  }

  acharLinhaNf(numero, loja, (err, linha) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!linha) return res.status(404).json({ error: 'Nota Fiscal não encontrada para esta loja.' });

    let produtos;
    try {
      produtos = JSON.parse(linha.products || '[]');
    } catch (e) {
      return res.status(500).json({ error: 'Não foi possível ler os produtos desta NF-e.' });
    }

    const produto = produtos.find(p => String(p.code) === String(code));
    if (!produto) return res.status(404).json({ error: 'Produto não encontrado nesta NF-e.' });

    produto.countedQty = countedQty === undefined || countedQty === null ? '' : String(countedQty);
    produto.conferidoPor = usuario || null;
    produto.conferidoEm = new Date().toISOString();

    // Digitar de novo reabre a nota: ela deixa de estar concluída.
    let info = {};
    try { info = JSON.parse(linha.info || '{}'); } catch (e) {}
    info.concluidaEm = null;

    db.run('UPDATE nfs SET products = ?, info = ? WHERE id = ?', [JSON.stringify(produtos), JSON.stringify(info), linha.id], (err2) => {
      if (err2) return res.status(500).json({ error: err2.message });

      publish('nf.item', {
        numero,
        loja: (loja || '').toString().trim(),
        code: String(code),
        countedQty: produto.countedQty,
        conferidoPor: produto.conferidoPor,
        conferidoEm: produto.conferidoEm
      }, { origem: clientId, usuario });

      res.json({ success: true, countedQty: produto.countedQty });
    });
  });
});

/** Marca a conferência como concluída e avisa todo mundo. */
router.post('/nfs/:numero/concluir', (req, res) => {
  let { numero } = req.params;
  const { usuario, clientId } = req.body || {};
  let loja = (req.body && req.body.loja) || '';

  if (numero.includes('_')) {
    const parts = numero.split('_');
    numero = parts[0];
    if (!loja) loja = parts[1];
  }

  acharLinhaNf(numero, loja, (err, linha) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!linha) return res.status(404).json({ error: 'Nota Fiscal não encontrada para esta loja.' });

    let info = {};
    try { info = JSON.parse(linha.info || '{}'); } catch (e) {}
    const concluidaEm = new Date().toISOString();
    info.concluidaEm = concluidaEm;
    info.concluidaPor = usuario || null;

    db.run('UPDATE nfs SET info = ? WHERE id = ?', [JSON.stringify(info), linha.id], (err2) => {
      if (err2) return res.status(500).json({ error: err2.message });
      publish('nf.concluida', {
        numero,
        loja: (loja || '').toString().trim(),
        concluidaEm,
        concluidaPor: usuario || null
      }, { origem: clientId, usuario });
      res.json({ success: true, concluidaEm });
    });
  });
});

router.delete('/nfs', requireOwner, (req, res) => {
  db.run('DELETE FROM nfs', [], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true, message: 'Todos os registros de NF-e foram removidos.' });
  });
});

router.delete('/nfs/:id', requireOwner, (req, res) => {
  const { id } = req.params;
  const cleanId = id.includes('_') ? id.split('_')[0] : id;
  db.run('DELETE FROM nfs WHERE id = ? OR numero = ?', [id, cleanId], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    publish('nf.excluida', { numero: cleanId, chave: id }, { origem: req.query.clientId, usuario: req.query.usuario });
    res.json({ success: true });
  });
});

// Tabela `boletos` (import, listagem, auditoria) foi removida da UI, mas os
// dados existentes seguem lidos direto do banco por services/ia-briefing.js
// (briefing diário de "boletos vencidos/a vencer") — por isso a tabela e o
// schema em config/database.js permanecem, só as rotas HTTP saíram daqui.

module.exports = router;
