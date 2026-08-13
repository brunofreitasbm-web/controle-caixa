const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { db, dbAllAsync, dbGetAsync, dbRunAsync, normalizeRow } = require('../config/database');
const { publish } = require('../config/realtime');
const { enviarNotificacaoPush } = require('../config/notifications');
const { normalizarTelefone } = require('../config/utils');
const requireOwner = require('./middleware/requireOwner');

/**
 * CATÁLOGO DIGITAL
 * ==========================================================================
 * Vitrine pública por loja (link compartilhável, sem PIN), carrinho no
 * cliente e pedido fechado que vira aviso automático no WhatsApp da loja
 * para o operador separar/entregar. Pagamento é sempre Pix com conferência
 * humana — o sistema nunca confirma crédito sozinho, só registra quem
 * confirmou (ver POST /catalogo/pedidos/:id/confirmar-pagamento).
 *
 * Distância para taxa de entrega: até 5km = R$ 8, acima = R$ 15. Geocodifica
 * o CEP pela BrasilAPI (gratuita, sem chave) e compara com a coordenada da
 * loja em catalogo_lojas (mesmos valores de LOJAS_GEOLOC no app.js).
 */

const TAXA_ATE_5KM = 8;
const TAXA_ACIMA_5KM = 15;
const RAIO_TAXA_MINIMA_KM = 5;

function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

async function geocodeCep(cep) {
  const cepLimpo = String(cep || '').replace(/\D/g, '');
  if (cepLimpo.length !== 8) return null;
  try {
    const resp = await fetch(`https://brasilapi.com.br/api/cep/v2/${cepLimpo}`, { signal: AbortSignal.timeout(5000) });
    if (!resp.ok) return null;
    const dados = await resp.json();
    const coords = dados && dados.location && dados.location.coordinates;
    if (!coords || coords.latitude == null || coords.longitude == null) return null;
    return { latitude: Number(coords.latitude), longitude: Number(coords.longitude) };
  } catch (e) {
    console.error('Erro ao geocodificar CEP na BrasilAPI:', e.message);
    return null;
  }
}

async function buscarLoja(slugOuNome) {
  const row = await dbGetAsync(
    'SELECT * FROM catalogo_lojas WHERE slug = ? OR loja = ?',
    [slugOuNome, slugOuNome]
  );
  return normalizeRow(row);
}

function formatarMoeda(valor) {
  return Number(valor || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
}

function montarMensagemPedido(pedido, loja) {
  const itens = pedido.itens.map(it => `• ${it.qtd}x ${it.descricao} (cód. ${it.codProduto}) — R$ ${formatarMoeda(it.preco * it.qtd)}`).join('\n');
  const entregaLinha = pedido.tipoEntrega === 'entrega'
    ? `Entrega — CEP ${pedido.cep || '-'} (taxa R$ ${formatarMoeda(pedido.taxaEntrega)})`
    : 'Retirada no balcão';
  return [
    `🛍️ *Novo pedido pelo catálogo — ${loja.loja}*`,
    '',
    itens,
    '',
    `Subtotal produtos: R$ ${formatarMoeda(pedido.valorProdutos)}`,
    pedido.tipoEntrega === 'entrega' ? `Taxa de entrega: R$ ${formatarMoeda(pedido.taxaEntrega)}` : null,
    `*Total: R$ ${formatarMoeda(pedido.valorTotal)}*`,
    '',
    `Cliente: ${pedido.clienteNome}`,
    `Telefone: ${pedido.clienteTelefone}`,
    entregaLinha,
    pedido.observacoes ? `Obs.: ${pedido.observacoes}` : null,
    '',
    `Pedido #${pedido.id.slice(0, 8)}`
  ].filter(Boolean).join('\n');
}

function montarMensagemPix(pedido, loja) {
  return [
    `Olá, ${pedido.clienteNome}! 👋`,
    `Seu pedido #${pedido.id.slice(0, 8)} na ${loja.loja} foi confirmado.`,
    '',
    `Total a pagar: *R$ ${formatarMoeda(pedido.valorTotal)}*`,
    loja.pixChave ? `Chave Pix (${loja.pixTitular || loja.loja}): *${loja.pixChave}*` : 'Chave Pix: (a loja vai te enviar em seguida)',
    '',
    'Assim que o pagamento cair, o pedido é liberado para retirada/entrega. Pode mandar o comprovante por aqui.'
  ].join('\n');
}

// -------------------------------------------------------------------------
// Vitrine pública
// -------------------------------------------------------------------------

// GET /catalogo/pedidos precisa vir ANTES de /catalogo/:slug — como ambas
// têm um só segmento depois de /catalogo, o Express casaria "pedidos" como
// se fosse slug de loja se essa ordem fosse invertida.
router.get('/catalogo/pedidos', async (req, res) => {
  try {
    const { loja, status } = req.query;
    const condicoes = [];
    const params = [];
    if (loja) { condicoes.push('loja = ?'); params.push(loja); }
    if (status) { condicoes.push('status = ?'); params.push(status); }
    const where = condicoes.length ? `WHERE ${condicoes.join(' AND ')}` : '';

    const rows = await dbAllAsync(`SELECT * FROM catalogo_pedidos ${where} ORDER BY criadoEm DESC LIMIT 200`, params);
    res.json((rows || []).map(r => {
      const pedido = normalizeRow(r);
      try { pedido.itens = JSON.parse(pedido.itens || '[]'); } catch (e) { pedido.itens = []; }
      return pedido;
    }));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/catalogo/:slug', async (req, res) => {
  try {
    const loja = await buscarLoja(req.params.slug);
    if (!loja || !loja.ativo) return res.status(404).json({ error: 'Loja não encontrada.' });

    const rows = await dbAllAsync(
      `SELECT p.codProduto, p.descricao, p.codBarras, p.grupo, p.preco, p.fotoUrl, p.categoriaExibicao
       FROM catalogo_produtos p
       LEFT JOIN catalogo_loja_produtos lp ON lp.codProduto = p.codProduto AND lp.loja = ?
       WHERE p.visivelCatalogo = 1 AND (lp.disponivel IS NULL OR lp.disponivel = 1)
       ORDER BY p.categoriaExibicao, p.descricao`,
      [loja.loja]
    );

    const produtos = (rows || []).map(normalizeRow);
    const categorias = {};
    produtos.forEach(p => {
      const cat = p.categoriaExibicao || p.grupo || 'Outros';
      if (!categorias[cat]) categorias[cat] = [];
      categorias[cat].push(p);
    });

    res.json({
      loja: { loja: loja.loja, slug: loja.slug, whatsappPedidos: loja.whatsappPedidos || null },
      categorias
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/catalogo/:slug/taxa-entrega', async (req, res) => {
  try {
    const loja = await buscarLoja(req.params.slug);
    if (!loja || !loja.ativo) return res.status(404).json({ error: 'Loja não encontrada.' });

    const coords = await geocodeCep(req.query.cep);
    if (!coords || loja.latitude == null || loja.longitude == null) {
      return res.json({ distanciaKm: null, taxa: TAXA_ACIMA_5KM, aviso: 'Não conseguimos calcular a distância pelo CEP — taxa padrão aplicada, a loja confirma com você.' });
    }

    const distanciaKm = haversineKm(loja.latitude, loja.longitude, coords.latitude, coords.longitude);
    const taxa = distanciaKm <= RAIO_TAXA_MINIMA_KM ? TAXA_ATE_5KM : TAXA_ACIMA_5KM;
    res.json({ distanciaKm: Number(distanciaKm.toFixed(1)), taxa });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// -------------------------------------------------------------------------
// Pedidos (público cria, operador/gerente conduzem)
// -------------------------------------------------------------------------

router.post('/catalogo/pedidos', async (req, res) => {
  try {
    const { slugLoja, clienteNome, clienteTelefone, itens, tipoEntrega, cep, distanciaKm, observacoes } = req.body;

    if (!slugLoja || !clienteNome || !clienteTelefone || !Array.isArray(itens) || itens.length === 0) {
      return res.status(400).json({ error: 'slugLoja, clienteNome, clienteTelefone e itens são obrigatórios.' });
    }
    if (!['retirada', 'entrega'].includes(tipoEntrega)) {
      return res.status(400).json({ error: 'tipoEntrega deve ser "retirada" ou "entrega".' });
    }

    const loja = await buscarLoja(slugLoja);
    if (!loja || !loja.ativo) return res.status(404).json({ error: 'Loja não encontrada.' });

    // Preço nunca vem do cliente: cada item é revalidado contra o preço atual
    // cadastrado no catálogo, para o total não poder ser manipulado no navegador.
    const codigos = itens.map(it => String(it.codProduto));
    const placeholders = codigos.map(() => '?').join(',');
    const produtosDb = await dbAllAsync(
      `SELECT codProduto, descricao, preco FROM catalogo_produtos WHERE codProduto IN (${placeholders}) AND visivelCatalogo = 1`,
      codigos
    );
    const mapaProdutos = new Map((produtosDb || []).map(normalizeRow).map(p => [p.codProduto, p]));

    const itensValidados = itens.map(it => {
      const produto = mapaProdutos.get(String(it.codProduto));
      const qtd = Math.max(1, parseInt(it.qtd, 10) || 1);
      return produto
        ? { codProduto: produto.codProduto, descricao: produto.descricao, qtd, preco: Number(produto.preco) || 0 }
        : null;
    }).filter(Boolean);

    if (itensValidados.length === 0) {
      return res.status(400).json({ error: 'Nenhum item do pedido está disponível no catálogo.' });
    }

    const valorProdutos = itensValidados.reduce((soma, it) => soma + it.preco * it.qtd, 0);

    // Taxa de entrega também é recalculada no servidor (não confia no valor
    // que veio do front) — só os dois degraus fixos existem.
    let taxaEntrega = 0;
    let distanciaFinal = null;
    if (tipoEntrega === 'entrega') {
      const coords = await geocodeCep(cep);
      if (coords && loja.latitude != null && loja.longitude != null) {
        distanciaFinal = haversineKm(loja.latitude, loja.longitude, coords.latitude, coords.longitude);
        taxaEntrega = distanciaFinal <= RAIO_TAXA_MINIMA_KM ? TAXA_ATE_5KM : TAXA_ACIMA_5KM;
      } else {
        taxaEntrega = TAXA_ACIMA_5KM;
      }
    }

    const valorTotal = valorProdutos + taxaEntrega;
    const id = crypto.randomUUID();
    const criadoEm = new Date().toISOString();
    const telefoneNormalizado = normalizarTelefone(clienteTelefone);

    await dbRunAsync(
      `INSERT INTO catalogo_pedidos
        (id, loja, clienteNome, clienteTelefone, itens, valorProdutos, tipoEntrega, cep, distanciaKm, taxaEntrega, valorTotal, observacoes, status, criadoEm)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'novo', ?)`,
      [id, loja.loja, clienteNome, telefoneNormalizado, JSON.stringify(itensValidados), valorProdutos, tipoEntrega, cep || null, distanciaFinal, taxaEntrega, valorTotal, observacoes || null, criadoEm]
    );

    const pedido = { id, loja: loja.loja, clienteNome, clienteTelefone: telefoneNormalizado, itens: itensValidados, valorProdutos, tipoEntrega, cep, taxaEntrega, valorTotal, observacoes, criadoEm };

    publish('catalogo.pedido.novo', pedido, {});
    enviarNotificacaoPush('🛍️ Novo pedido no catálogo', `${clienteNome} fechou um pedido de R$ ${formatarMoeda(valorTotal)} na ${loja.loja}.`, null, 'catalogo_pedido');

    res.json({ success: true, id, valorTotal, mensagem: montarMensagemPedido(pedido, loja) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/catalogo/pedidos/:id/confirmar', async (req, res) => {
  try {
    const { actorUsuario } = req.body;
    if (!actorUsuario) return res.status(400).json({ error: 'actorUsuario é obrigatório.' });

    const row = await dbGetAsync('SELECT * FROM catalogo_pedidos WHERE id = ?', [req.params.id]);
    const pedido = normalizeRow(row);
    if (!pedido) return res.status(404).json({ error: 'Pedido não encontrado.' });
    if (pedido.status !== 'novo') return res.status(409).json({ error: `Pedido já está em "${pedido.status}".` });

    const loja = await buscarLoja(pedido.loja);
    const atualizadoEm = new Date().toISOString();
    await dbRunAsync(
      `UPDATE catalogo_pedidos SET status = 'aguardando_pagamento', confirmadoPor = ?, atualizadoEm = ? WHERE id = ?`,
      [actorUsuario, atualizadoEm, req.params.id]
    );

    try { pedido.itens = JSON.parse(pedido.itens || '[]'); } catch (e) { pedido.itens = []; }
    publish('catalogo.pedido.confirmado', { id: pedido.id, loja: pedido.loja, status: 'aguardando_pagamento' }, {});

    res.json({ success: true, mensagem: montarMensagemPix(pedido, loja || {}), clienteTelefone: pedido.clienteTelefone });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Só gerente/owner: o sistema nunca decide sozinho que o Pix caiu, só
// registra quem olhou o extrato/app do banco e liberou o pedido.
router.post('/catalogo/pedidos/:id/confirmar-pagamento', requireOwner, async (req, res) => {
  try {
    const { actorUsuario } = req.body;
    const row = await dbGetAsync('SELECT * FROM catalogo_pedidos WHERE id = ?', [req.params.id]);
    const pedido = normalizeRow(row);
    if (!pedido) return res.status(404).json({ error: 'Pedido não encontrado.' });
    if (pedido.status !== 'aguardando_pagamento') return res.status(409).json({ error: `Pedido está em "${pedido.status}", não em aguardando_pagamento.` });

    const atualizadoEm = new Date().toISOString();
    await dbRunAsync(
      `UPDATE catalogo_pedidos SET status = 'liberado', pagamentoConfirmadoPor = ?, atualizadoEm = ? WHERE id = ?`,
      [actorUsuario, atualizadoEm, req.params.id]
    );

    publish('catalogo.pedido.liberado', { id: pedido.id, loja: pedido.loja, status: 'liberado' }, {});
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/catalogo/pedidos/:id/cancelar', async (req, res) => {
  try {
    const { actorUsuario, motivo } = req.body;
    if (!actorUsuario) return res.status(400).json({ error: 'actorUsuario é obrigatório.' });
    const atualizadoEm = new Date().toISOString();
    await dbRunAsync(
      `UPDATE catalogo_pedidos SET status = 'cancelado', observacoes = COALESCE(observacoes, '') || ? , atualizadoEm = ? WHERE id = ?`,
      [motivo ? `\n[Cancelado por ${actorUsuario}] ${motivo}` : `\n[Cancelado por ${actorUsuario}]`, atualizadoEm, req.params.id]
    );
    publish('catalogo.pedido.cancelado', { id: req.params.id }, {});
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// -------------------------------------------------------------------------
// Admin do catálogo (produtos, lojas, disponibilidade por loja) — sempre
// protegido por requireOwner: curadoria de vitrine e dados de Pix/WhatsApp
// não são para qualquer consultora mexer.
// -------------------------------------------------------------------------

router.get('/catalogo-admin/produtos', requireOwner, async (req, res) => {
  try {
    const { busca, visivel } = req.query;
    const condicoes = [];
    const params = [];
    if (busca) {
      condicoes.push('(descricao LIKE ? OR codProduto LIKE ?)');
      params.push(`%${busca}%`, `%${busca}%`);
    }
    if (visivel === '1' || visivel === '0') {
      condicoes.push('visivelCatalogo = ?');
      params.push(Number(visivel));
    }
    const where = condicoes.length ? `WHERE ${condicoes.join(' AND ')}` : '';
    const rows = await dbAllAsync(`SELECT * FROM catalogo_produtos ${where} ORDER BY grupo, descricao LIMIT 500`, params);
    res.json((rows || []).map(normalizeRow));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/catalogo-admin/produtos/:codProduto', requireOwner, async (req, res) => {
  try {
    const { visivelCatalogo, fotoUrl, categoriaExibicao } = req.body;
    const atualizadoEm = new Date().toISOString();
    await dbRunAsync(
      `UPDATE catalogo_produtos SET
        visivelCatalogo = COALESCE(?, visivelCatalogo),
        fotoUrl = COALESCE(?, fotoUrl),
        categoriaExibicao = COALESCE(?, categoriaExibicao),
        atualizadoEm = ?
       WHERE codProduto = ?`,
      [visivelCatalogo === undefined ? null : Number(!!visivelCatalogo), fotoUrl === undefined ? null : fotoUrl, categoriaExibicao === undefined ? null : categoriaExibicao, atualizadoEm, req.params.codProduto]
    );
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/catalogo-admin/lojas', requireOwner, async (req, res) => {
  try {
    const rows = await dbAllAsync('SELECT * FROM catalogo_lojas ORDER BY loja', []);
    res.json((rows || []).map(normalizeRow));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/catalogo-admin/lojas/:loja', requireOwner, async (req, res) => {
  try {
    const { whatsappPedidos, pixChave, pixTitular, ativo } = req.body;
    await dbRunAsync(
      `UPDATE catalogo_lojas SET
        whatsappPedidos = COALESCE(?, whatsappPedidos),
        pixChave = COALESCE(?, pixChave),
        pixTitular = COALESCE(?, pixTitular),
        ativo = COALESCE(?, ativo)
       WHERE loja = ?`,
      [whatsappPedidos === undefined ? null : whatsappPedidos, pixChave === undefined ? null : pixChave, pixTitular === undefined ? null : pixTitular, ativo === undefined ? null : Number(!!ativo), req.params.loja]
    );
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/catalogo-admin/loja-produtos/:loja', requireOwner, async (req, res) => {
  try {
    const rows = await dbAllAsync(
      `SELECT p.codProduto, p.descricao, p.grupo, COALESCE(lp.disponivel, 1) as disponivel
       FROM catalogo_produtos p
       LEFT JOIN catalogo_loja_produtos lp ON lp.codProduto = p.codProduto AND lp.loja = ?
       WHERE p.visivelCatalogo = 1
       ORDER BY p.grupo, p.descricao`,
      [req.params.loja]
    );
    res.json((rows || []).map(normalizeRow));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/catalogo-admin/loja-produtos', requireOwner, async (req, res) => {
  try {
    const { loja, codProduto, disponivel } = req.body;
    if (!loja || !codProduto) return res.status(400).json({ error: 'loja e codProduto são obrigatórios.' });
    await dbRunAsync(
      `INSERT INTO catalogo_loja_produtos (loja, codProduto, disponivel) VALUES (?, ?, ?)
       ON CONFLICT(loja, codProduto) DO UPDATE SET disponivel = excluded.disponivel`,
      [loja, codProduto, Number(!!disponivel)]
    );
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
