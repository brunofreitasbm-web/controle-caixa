// Catálogo digital — vitrine pública, carrinho em localStorage e fechamento
// de pedido que abre o WhatsApp da loja com a mensagem pronta pro operador.
// Página independente do app.js principal (não exige PIN/login).

const API_BASE = window.location.protocol === "file:"
  ? "http://localhost:5000/api"
  : "/api";

function slugDaUrl() {
  const partes = window.location.pathname.split('/').filter(Boolean);
  const i = partes.indexOf('catalogo');
  return i >= 0 && partes[i + 1] ? partes[i + 1] : partes[partes.length - 1];
}

const SLUG = slugDaUrl();
const CART_KEY = `catalogo_carrinho_${SLUG}`;

let lojaAtual = null;
let carrinho = carregarCarrinho();

function carregarCarrinho() {
  try { return JSON.parse(localStorage.getItem(CART_KEY) || '{}'); } catch (e) { return {}; }
}
function salvarCarrinho() {
  localStorage.setItem(CART_KEY, JSON.stringify(carrinho));
}

function formatarMoeda(v) {
  return Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
}

async function carregarCatalogo() {
  try {
    const resp = await fetch(`${API_BASE}/catalogo/${SLUG}`);
    if (!resp.ok) throw new Error('Loja não encontrada');
    const dados = await resp.json();
    lojaAtual = dados.loja;
    renderizarCatalogo(dados);
  } catch (e) {
    document.getElementById('conteudo').innerHTML = `<div class="vazio">Não encontramos esse catálogo. Confira o link com a loja.</div>`;
    document.getElementById('loja-sub').textContent = 'Link inválido';
  }
}

function renderizarCatalogo(dados) {
  document.getElementById('loja-nome').textContent = `🍫 ${dados.loja.loja}`;
  document.getElementById('loja-sub').textContent = 'Monte seu pedido e feche pelo WhatsApp';

  const categorias = dados.categorias || {};
  const chaves = Object.keys(categorias);
  const conteudo = document.getElementById('conteudo');

  if (chaves.length === 0) {
    conteudo.innerHTML = `<div class="vazio">Nenhum produto disponível no momento. Volte mais tarde!</div>`;
    return;
  }

  conteudo.innerHTML = chaves.map(cat => `
    <section class="categoria">
      <h2>${cat}</h2>
      <div class="grid">
        ${categorias[cat].map(produtoCardHtml).join('')}
      </div>
    </section>
  `).join('');

  chaves.forEach(cat => {
    categorias[cat].forEach(p => ligarAcoesProduto(p));
  });

  atualizarCartBar();
}

function produtoCardHtml(p) {
  const foto = p.fotoUrl
    ? `<div class="produto-foto" style="background-image:url('${p.fotoUrl}')"></div>`
    : `<div class="produto-foto">sem foto</div>`;
  return `
    <div class="produto-card" data-cod="${p.codProduto}">
      ${foto}
      <div class="produto-info">
        <div class="produto-nome">${p.descricao}</div>
        <div class="produto-preco">R$ ${formatarMoeda(p.preco)}</div>
        <div class="produto-acao" data-acao></div>
      </div>
    </div>
  `;
}

function ligarAcoesProduto(p) {
  const card = document.querySelector(`.produto-card[data-cod="${CSS.escape(p.codProduto)}"]`);
  if (!card) return;
  renderizarAcaoProduto(card, p);
}

function renderizarAcaoProduto(card, p) {
  const acao = card.querySelector('[data-acao]');
  const qtd = carrinho[p.codProduto] ? carrinho[p.codProduto].qtd : 0;

  if (qtd === 0) {
    acao.innerHTML = `<button class="btn-add">Adicionar</button>`;
    acao.querySelector('.btn-add').onclick = () => {
      carrinho[p.codProduto] = { descricao: p.descricao, preco: p.preco, qtd: 1 };
      salvarCarrinho();
      renderizarAcaoProduto(card, p);
      atualizarCartBar();
    };
  } else {
    acao.innerHTML = `
      <div class="stepper">
        <button data-menos>−</button>
        <span>${qtd}</span>
        <button data-mais>+</button>
      </div>
    `;
    acao.querySelector('[data-menos]').onclick = () => {
      const novaQtd = qtd - 1;
      if (novaQtd <= 0) delete carrinho[p.codProduto];
      else carrinho[p.codProduto].qtd = novaQtd;
      salvarCarrinho();
      renderizarAcaoProduto(card, p);
      atualizarCartBar();
    };
    acao.querySelector('[data-mais]').onclick = () => {
      carrinho[p.codProduto].qtd = qtd + 1;
      salvarCarrinho();
      renderizarAcaoProduto(card, p);
      atualizarCartBar();
    };
  }
}

function itensCarrinhoArray() {
  return Object.entries(carrinho).map(([codProduto, it]) => ({ codProduto, ...it }));
}

function totalProdutos() {
  return itensCarrinhoArray().reduce((s, it) => s + it.preco * it.qtd, 0);
}

function atualizarCartBar() {
  const itens = itensCarrinhoArray();
  const qtdTotal = itens.reduce((s, it) => s + it.qtd, 0);
  const barra = document.getElementById('cart-bar');
  if (qtdTotal === 0) {
    barra.classList.remove('visivel');
    return;
  }
  barra.classList.add('visivel');
  document.getElementById('cart-resumo').textContent = `${qtdTotal} ite${qtdTotal > 1 ? 'ns' : 'm'} · R$ ${formatarMoeda(totalProdutos())}`;
}

let taxaEntregaAtual = 0;
let distanciaKmAtual = null;

function abrirCarrinho() {
  const itens = itensCarrinhoArray();
  const lista = document.getElementById('lista-carrinho');
  lista.innerHTML = itens.map(it => `
    <div class="sheet-item">
      <span class="nome">${it.qtd}x ${it.descricao}</span>
      <span>R$ ${formatarMoeda(it.preco * it.qtd)}</span>
    </div>
  `).join('') || '<p class="aviso">Carrinho vazio.</p>';

  document.getElementById('total-produtos').textContent = `Subtotal: R$ ${formatarMoeda(totalProdutos())}`;
  taxaEntregaAtual = 0;
  distanciaKmAtual = null;
  atualizarTotalGeral();
  document.getElementById('campo-cep').style.display = 'none';
  document.querySelector('input[name="tipo-entrega"][value="retirada"]').checked = true;
  document.getElementById('erro-checkout').textContent = '';
  document.getElementById('overlay-carrinho').classList.add('aberto');
}

function atualizarTotalGeral() {
  document.getElementById('total-geral').textContent = `Total: R$ ${formatarMoeda(totalProdutos() + taxaEntregaAtual)}`;
}

async function consultarTaxaEntrega(cep) {
  const info = document.getElementById('taxa-info');
  const cepLimpo = cep.replace(/\D/g, '');
  if (cepLimpo.length !== 8) {
    info.textContent = '';
    taxaEntregaAtual = 0;
    atualizarTotalGeral();
    return;
  }
  info.textContent = 'Calculando taxa de entrega...';
  try {
    const resp = await fetch(`${API_BASE}/catalogo/${SLUG}/taxa-entrega?cep=${cepLimpo}`);
    const dados = await resp.json();
    taxaEntregaAtual = dados.taxa || 0;
    distanciaKmAtual = dados.distanciaKm;
    info.textContent = dados.aviso
      ? dados.aviso
      : `Distância: ${dados.distanciaKm} km — taxa de entrega: R$ ${formatarMoeda(dados.taxa)}`;
  } catch (e) {
    taxaEntregaAtual = 15;
    info.textContent = 'Não foi possível calcular a distância — taxa padrão aplicada.';
  }
  atualizarTotalGeral();
}

async function confirmarPedido() {
  const erro = document.getElementById('erro-checkout');
  erro.textContent = '';

  const clienteNome = document.getElementById('cliente-nome').value.trim();
  const clienteTelefone = document.getElementById('cliente-telefone').value.trim();
  const tipoEntrega = document.querySelector('input[name="tipo-entrega"]:checked').value;
  const cep = document.getElementById('cliente-cep').value.trim();
  const observacoes = document.getElementById('cliente-obs').value.trim();
  const itens = itensCarrinhoArray();

  if (itens.length === 0) { erro.textContent = 'Seu carrinho está vazio.'; return; }
  if (!clienteNome) { erro.textContent = 'Informe seu nome.'; return; }
  if (!clienteTelefone) { erro.textContent = 'Informe seu WhatsApp.'; return; }
  if (tipoEntrega === 'entrega' && cep.replace(/\D/g, '').length !== 8) {
    erro.textContent = 'Informe um CEP válido para a entrega.';
    return;
  }

  const btn = document.getElementById('btn-confirmar-pedido');
  btn.disabled = true;
  btn.textContent = 'Enviando pedido...';

  try {
    const resp = await fetch(`${API_BASE}/catalogo/pedidos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        slugLoja: SLUG,
        clienteNome,
        clienteTelefone,
        itens: itens.map(it => ({ codProduto: it.codProduto, qtd: it.qtd })),
        tipoEntrega,
        cep: tipoEntrega === 'entrega' ? cep : null,
        distanciaKm: distanciaKmAtual,
        observacoes
      })
    });
    const dados = await resp.json();
    if (!resp.ok) throw new Error(dados.error || 'Falha ao enviar o pedido.');

    // O window.open precisa continuar dentro do gesto do clique — nada de
    // await antes dele — mas aqui já esperamos o fetch, então é o clique
    // seguinte do usuário que abre; por isso usamos location.href, que não
    // é bloqueado por popup blocker mesmo fora do gesto original.
    const numeroLoja = (lojaAtual && lojaAtual.whatsappPedidos) || '';
    const linkWhats = `https://wa.me/${numeroLoja}?text=${encodeURIComponent(dados.mensagem)}`;

    carrinho = {};
    salvarCarrinho();

    document.getElementById('overlay-carrinho').classList.remove('aberto');
    window.location.href = linkWhats;
  } catch (e) {
    erro.textContent = e.message;
  } finally {
    btn.disabled = false;
    btn.textContent = 'Fechar pedido pelo WhatsApp';
  }
}

document.addEventListener('DOMContentLoaded', () => {
  carregarCatalogo();

  document.getElementById('btn-ver-carrinho').onclick = abrirCarrinho;
  document.getElementById('fechar-carrinho').onclick = () => document.getElementById('overlay-carrinho').classList.remove('aberto');

  document.querySelectorAll('input[name="tipo-entrega"]').forEach(radio => {
    radio.addEventListener('change', () => {
      const isEntrega = radio.value === 'entrega' && radio.checked;
      document.getElementById('campo-cep').style.display = isEntrega ? 'block' : 'none';
      if (!isEntrega) { taxaEntregaAtual = 0; atualizarTotalGeral(); }
    });
  });

  let debounceCep;
  document.getElementById('cliente-cep').addEventListener('input', (e) => {
    clearTimeout(debounceCep);
    debounceCep = setTimeout(() => consultarTaxaEntrega(e.target.value), 500);
  });

  document.getElementById('btn-confirmar-pedido').onclick = confirmarPedido;
});
