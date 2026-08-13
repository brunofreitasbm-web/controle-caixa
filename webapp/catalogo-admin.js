// Painel interno do Catálogo: pedidos (confirmar Pix / liberar pagamento),
// curadoria de produtos visíveis na vitrine e cadastro de WhatsApp/Pix por loja.
// Login reaproveita o mesmo /api/auth/verify (usuário + PIN) do app principal;
// ações de curadoria/pagamento exigem role "owner" (checado no servidor).

const API_BASE = window.location.protocol === "file:"
  ? "http://localhost:5000/api"
  : "/api";
const USER_KEY = 'catalogo_admin_usuario';

function actorUsuario() {
  return localStorage.getItem(USER_KEY) || '';
}

function formatarMoeda(v) {
  return Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
}

const STATUS_LABEL = {
  novo: 'Novo',
  aguardando_pagamento: 'Aguardando pagamento',
  liberado: 'Liberado',
  cancelado: 'Cancelado'
};

// ---------------------------------------------------------------------
// Login
// ---------------------------------------------------------------------

async function login() {
  const usuario = document.getElementById('login-usuario').value.trim();
  const pin = document.getElementById('login-pin').value.trim();
  const erroEl = document.getElementById('login-erro');
  erroEl.textContent = '';

  if (!usuario || !pin) { erroEl.textContent = 'Informe usuário e PIN.'; return; }

  try {
    const resp = await fetch(`${API_BASE}/auth/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ usuario, pin })
    });
    const dados = await resp.json();
    if (!dados.valid) { erroEl.textContent = 'Usuário ou PIN inválido.'; return; }

    localStorage.setItem(USER_KEY, usuario);
    entrarNoApp();
  } catch (e) {
    erroEl.textContent = 'Erro ao entrar: ' + e.message;
  }
}

function entrarNoApp() {
  document.getElementById('login-box').style.display = 'none';
  document.getElementById('app').style.display = 'block';
  document.getElementById('usuario-atual').textContent = actorUsuario();
  carregarPedidos();
}

// ---------------------------------------------------------------------
// Abas
// ---------------------------------------------------------------------

function ligarAbas() {
  document.querySelectorAll('nav.tabs button').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('nav.tabs button').forEach(b => b.classList.remove('ativo'));
      document.querySelectorAll('.painel').forEach(p => p.classList.remove('ativo'));
      btn.classList.add('ativo');
      document.getElementById(`painel-${btn.dataset.tab}`).classList.add('ativo');
      if (btn.dataset.tab === 'lojas') carregarLojas();
    });
  });
}

// ---------------------------------------------------------------------
// Pedidos
// ---------------------------------------------------------------------

async function carregarPedidos() {
  const status = document.getElementById('filtro-status').value;
  const loja = document.getElementById('filtro-loja').value;
  const params = new URLSearchParams();
  if (status) params.set('status', status);
  if (loja) params.set('loja', loja);

  const container = document.getElementById('lista-pedidos');
  container.innerHTML = '<div class="vazio">Carregando...</div>';

  try {
    const resp = await fetch(`${API_BASE}/catalogo/pedidos?${params}`);
    const pedidos = await resp.json();
    renderizarPedidos(pedidos);
  } catch (e) {
    container.innerHTML = `<div class="vazio">Erro ao carregar pedidos: ${e.message}</div>`;
  }
}

function renderizarPedidos(pedidos) {
  const container = document.getElementById('lista-pedidos');
  if (!pedidos.length) {
    container.innerHTML = '<div class="vazio">Nenhum pedido por aqui.</div>';
    return;
  }

  container.innerHTML = pedidos.map(p => `
    <div class="card" data-id="${p.id}">
      <div class="linha">
        <strong>${p.clienteNome}</strong>
        <span class="badge ${p.status}">${STATUS_LABEL[p.status] || p.status}</span>
      </div>
      <div class="linha"><span>${p.loja} · ${p.tipoEntrega === 'entrega' ? '🛵 Entrega' : '🏪 Retirada'}</span><span>R$ ${formatarMoeda(p.valorTotal)}</span></div>
      <div class="linha"><span>${(p.itens || []).map(it => `${it.qtd}x ${it.descricao}`).join(', ')}</span></div>
      <div class="linha"><span>📱 ${p.clienteTelefone}</span><span>${new Date(p.criadoEm).toLocaleString('pt-BR')}</span></div>
      <div class="linha" data-acoes></div>
    </div>
  `).join('');

  pedidos.forEach(p => ligarAcoesPedido(p));
}

function ligarAcoesPedido(p) {
  const card = document.querySelector(`.card[data-id="${p.id}"] [data-acoes]`);
  if (!card) return;

  const botoes = [];
  if (p.status === 'novo') {
    botoes.push(`<button class="acao confirmar" data-confirmar>Confirmar e enviar Pix</button>`);
  }
  if (p.status === 'aguardando_pagamento') {
    botoes.push(`<button class="acao liberar" data-liberar>Pagamento confirmado (gerente)</button>`);
  }
  if (p.status === 'novo' || p.status === 'aguardando_pagamento') {
    botoes.push(`<button class="acao cancelar" data-cancelar>Cancelar</button>`);
  }
  card.innerHTML = botoes.join(' ');

  const btnConfirmar = card.querySelector('[data-confirmar]');
  if (btnConfirmar) btnConfirmar.onclick = () => confirmarPedido(p.id);

  const btnLiberar = card.querySelector('[data-liberar]');
  if (btnLiberar) btnLiberar.onclick = () => confirmarPagamento(p.id);

  const btnCancelar = card.querySelector('[data-cancelar]');
  if (btnCancelar) btnCancelar.onclick = () => cancelarPedido(p.id);
}

async function confirmarPedido(id) {
  try {
    const resp = await fetch(`${API_BASE}/catalogo/pedidos/${id}/confirmar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ actorUsuario: actorUsuario() })
    });
    const dados = await resp.json();
    if (!resp.ok) throw new Error(dados.error);

    window.open(`https://wa.me/${dados.clienteTelefone}?text=${encodeURIComponent(dados.mensagem)}`, '_blank', 'noopener,noreferrer');
    carregarPedidos();
  } catch (e) {
    alert('Erro ao confirmar pedido: ' + e.message);
  }
}

async function confirmarPagamento(id) {
  if (!confirm('Confirma que você já bateu o olho no extrato/app do banco com a gerente e o Pix caiu?')) return;
  try {
    const resp = await fetch(`${API_BASE}/catalogo/pedidos/${id}/confirmar-pagamento`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ actorUsuario: actorUsuario() })
    });
    const dados = await resp.json();
    if (!resp.ok) throw new Error(dados.error);
    carregarPedidos();
  } catch (e) {
    alert('Erro ao liberar pedido: ' + e.message);
  }
}

async function cancelarPedido(id) {
  const motivo = prompt('Motivo do cancelamento (opcional):') || '';
  try {
    const resp = await fetch(`${API_BASE}/catalogo/pedidos/${id}/cancelar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ actorUsuario: actorUsuario(), motivo })
    });
    const dados = await resp.json();
    if (!resp.ok) throw new Error(dados.error);
    carregarPedidos();
  } catch (e) {
    alert('Erro ao cancelar pedido: ' + e.message);
  }
}

// ---------------------------------------------------------------------
// Produtos (curadoria da vitrine)
// ---------------------------------------------------------------------

async function buscarProdutos() {
  const busca = document.getElementById('busca-produto').value.trim();
  const visivel = document.getElementById('filtro-visivel').value;
  const params = new URLSearchParams({ actorUsuario: actorUsuario() });
  if (busca) params.set('busca', busca);
  if (visivel) params.set('visivel', visivel);

  const container = document.getElementById('lista-produtos');
  container.innerHTML = '<div class="vazio">Buscando...</div>';

  try {
    const resp = await fetch(`${API_BASE}/catalogo-admin/produtos?${params}`);
    const produtos = await resp.json();
    if (!resp.ok) throw new Error(produtos.error);
    renderizarProdutos(produtos);
  } catch (e) {
    container.innerHTML = `<div class="vazio">Erro: ${e.message}</div>`;
  }
}

function renderizarProdutos(produtos) {
  const container = document.getElementById('lista-produtos');
  if (!produtos.length) {
    container.innerHTML = '<div class="vazio">Nenhum produto encontrado.</div>';
    return;
  }

  container.innerHTML = produtos.map(p => `
    <div class="card" data-cod="${p.codProduto}">
      <div class="linha">
        <strong>${p.descricao}</strong>
        <span>R$ ${formatarMoeda(p.preco)}</span>
      </div>
      <div class="linha"><span>Cód. ${p.codProduto} · ${p.grupo || ''}</span></div>
      <div class="linha">
        <label class="toggle"><input type="checkbox" data-visivel ${p.visivelCatalogo ? 'checked' : ''}> Visível no catálogo</label>
      </div>
      <div class="linha">
        <input type="text" data-categoria placeholder="Categoria de exibição" value="${p.categoriaExibicao || ''}" style="flex:1">
      </div>
      <div class="linha">
        <input type="text" data-foto placeholder="URL da foto (link oficial da franquia)" value="${p.fotoUrl || ''}" style="flex:1">
      </div>
      <div class="linha"><button class="acao confirmar" data-salvar>Salvar</button></div>
    </div>
  `).join('');

  produtos.forEach(p => {
    const card = document.querySelector(`.card[data-cod="${CSS.escape(p.codProduto)}"]`);
    card.querySelector('[data-salvar]').onclick = () => salvarProduto(p.codProduto, card);
  });
}

async function salvarProduto(codProduto, card) {
  const visivelCatalogo = card.querySelector('[data-visivel]').checked;
  const categoriaExibicao = card.querySelector('[data-categoria]').value.trim();
  const fotoUrl = card.querySelector('[data-foto]').value.trim();

  try {
    const resp = await fetch(`${API_BASE}/catalogo-admin/produtos/${encodeURIComponent(codProduto)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ actorUsuario: actorUsuario(), visivelCatalogo, categoriaExibicao, fotoUrl })
    });
    const dados = await resp.json();
    if (!resp.ok) throw new Error(dados.error);
    alert('Produto atualizado.');
  } catch (e) {
    alert('Erro ao salvar: ' + e.message);
  }
}

// ---------------------------------------------------------------------
// Lojas (WhatsApp de pedidos + Pix)
// ---------------------------------------------------------------------

async function carregarLojas() {
  const container = document.getElementById('lista-lojas');
  container.innerHTML = '<div class="vazio">Carregando...</div>';

  try {
    const resp = await fetch(`${API_BASE}/catalogo-admin/lojas?actorUsuario=${encodeURIComponent(actorUsuario())}`);
    const lojas = await resp.json();
    if (!resp.ok) throw new Error(lojas.error);
    renderizarLojas(lojas);
  } catch (e) {
    container.innerHTML = `<div class="vazio">Erro: ${e.message}</div>`;
  }
}

function renderizarLojas(lojas) {
  const container = document.getElementById('lista-lojas');
  container.innerHTML = lojas.map(l => `
    <div class="card" data-loja="${l.loja}">
      <h3>${l.loja} <small style="color:var(--muted)">(/catalogo/${l.slug})</small></h3>
      <div class="linha">
        <label style="flex:1">WhatsApp de pedidos (só números, com DDD)
          <input type="text" data-whatsapp placeholder="5591900000000" value="${l.whatsappPedidos || ''}" style="width:100%">
        </label>
      </div>
      <div class="linha">
        <label style="flex:1">Chave Pix
          <input type="text" data-pix placeholder="chave pix" value="${l.pixChave || ''}" style="width:100%">
        </label>
      </div>
      <div class="linha">
        <label style="flex:1">Titular do Pix
          <input type="text" data-titular placeholder="Nome do titular" value="${l.pixTitular || ''}" style="width:100%">
        </label>
      </div>
      <div class="linha">
        <label class="toggle"><input type="checkbox" data-ativo ${l.ativo ? 'checked' : ''}> Link do catálogo ativo</label>
      </div>
      <div class="linha"><button class="acao confirmar" data-salvar-loja>Salvar</button></div>
    </div>
  `).join('');

  lojas.forEach(l => {
    const card = document.querySelector(`.card[data-loja="${CSS.escape(l.loja)}"]`);
    card.querySelector('[data-salvar-loja]').onclick = () => salvarLoja(l.loja, card);
  });
}

async function salvarLoja(loja, card) {
  const whatsappPedidos = card.querySelector('[data-whatsapp]').value.trim();
  const pixChave = card.querySelector('[data-pix]').value.trim();
  const pixTitular = card.querySelector('[data-titular]').value.trim();
  const ativo = card.querySelector('[data-ativo]').checked;

  try {
    const resp = await fetch(`${API_BASE}/catalogo-admin/lojas/${encodeURIComponent(loja)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ actorUsuario: actorUsuario(), whatsappPedidos, pixChave, pixTitular, ativo })
    });
    const dados = await resp.json();
    if (!resp.ok) throw new Error(dados.error);
    alert('Loja atualizada.');
  } catch (e) {
    alert('Erro ao salvar: ' + e.message);
  }
}

// ---------------------------------------------------------------------

document.addEventListener('DOMContentLoaded', () => {
  ligarAbas();
  document.getElementById('btn-login').onclick = login;
  document.getElementById('btn-atualizar-pedidos').onclick = carregarPedidos;
  document.getElementById('filtro-status').onchange = carregarPedidos;
  document.getElementById('filtro-loja').onchange = carregarPedidos;
  document.getElementById('busca-produto').addEventListener('keyup', (e) => { if (e.key === 'Enter') buscarProdutos(); });
  document.getElementById('filtro-visivel').onchange = buscarProdutos;

  if (actorUsuario()) entrarNoApp();
});
