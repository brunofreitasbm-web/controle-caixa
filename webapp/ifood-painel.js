// ==========================================================================
// iFood Integration Hub v2 — Script Independente (Light Mode & Dark Mode)
// ==========================================================================

const API_BASE = window.location.protocol === "file:"
  ? "http://localhost:5000/api"
  : "/api";

const LOJAS_CONFIG = [
  { id: "marambaia", nome: "Marambaia" },
  { id: "icoaraci", nome: "Icoaraci" },
  { id: "mario-covas", nome: "Mário Covas" }
];

let lojaAtiva = "marambaia";
let overviewDataMap = new Map();
let inventoryItemsCache = [];

// --------------------------------------------------------------------------
// Suporte a Temas (Light / Dark Mode)
// --------------------------------------------------------------------------

function inicializarTema() {
  const btnToggle = document.getElementById("btn-toggle-theme");
  const iconTheme = document.getElementById("icon-theme");
  const labelTheme = document.getElementById("label-theme");

  const salva = localStorage.getItem("ifood_theme") || "light";
  if (salva === "dark") {
    document.documentElement.classList.add("dark");
  } else {
    document.documentElement.classList.remove("dark");
  }

  function atualizarVisualBotao() {
    const isDark = document.documentElement.classList.contains("dark");
    if (iconTheme) iconTheme.className = isDark ? "fa-solid fa-sun text-amber-400" : "fa-solid fa-moon text-slate-500";
    if (labelTheme) labelTheme.textContent = isDark ? "Modo Claro" : "Modo Escuro";
  }

  atualizarVisualBotao();

  if (btnToggle) {
    btnToggle.addEventListener("click", () => {
      document.documentElement.classList.toggle("dark");
      const novoTema = document.documentElement.classList.contains("dark") ? "dark" : "light";
      localStorage.setItem("ifood_theme", novoTema);
      atualizarVisualBotao();
    });
  }
}

// --------------------------------------------------------------------------
// Funções Utilitárias & Feedbacks
// --------------------------------------------------------------------------

function formatarDataHora(iso) {
  if (!iso) return "Nunca sincronizada";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("pt-BR", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit"
  });
}

function mostrarFeedback(msg, tipo = "sucesso") {
  const el = document.getElementById("panel-feedback");
  if (!el) return;

  el.textContent = msg;
  el.className = `mb-4 p-4 rounded-xl text-xs font-semibold ${
    tipo === "sucesso"
      ? "bg-emerald-50 text-emerald-800 border border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/30"
      : "bg-rose-50 text-rose-800 border border-rose-200 dark:bg-rose-500/10 dark:text-rose-400 dark:border-rose-500/30"
  }`;
  el.classList.remove("hidden");

  setTimeout(() => {
    el.classList.add("hidden");
  }, 6000);
}

// --------------------------------------------------------------------------
// Navegação entre Lojas
// --------------------------------------------------------------------------

function selecionarLoja(lojaId) {
  lojaAtiva = lojaId;

  // Atualiza visual das abas de lojas
  document.querySelectorAll("#store-selector-container button").forEach(btn => {
    const isSelected = btn.dataset.store === lojaId;
    btn.classList.toggle("active", isSelected);
  });

  // Atualizar resumo do topo
  atualizarBannerResumo();

  // Carregar dados da loja selecionada
  carregarInventarioLoja();
  carregarCredenciaisLoja();
}

function atualizarBannerResumo() {
  const info = overviewDataMap.get(lojaAtiva);
  const cardStatus = document.getElementById("card-status-conexao");
  const cardMerchant = document.getElementById("card-merchant-id");
  const cardTotal = document.getElementById("card-total-itens");
  const cardAtivos = document.getElementById("card-itens-ativos");
  const cardSync = document.getElementById("card-ultima-sync");

  if (!info) {
    if (cardStatus) cardStatus.innerHTML = `<span class="badge-status badge-paused">Pendente</span>`;
    if (cardMerchant) cardMerchant.textContent = `Merchant ID: Não configurado`;
    if (cardTotal) cardTotal.textContent = "0";
    if (cardAtivos) cardAtivos.textContent = "0 ativos no iFood";
    if (cardSync) cardSync.textContent = "Nunca sincronizada";
    return;
  }

  if (cardStatus) {
    cardStatus.innerHTML = info.configurado
      ? `<span class="badge-status badge-available"><i class="fa-solid fa-circle-check"></i> Configurado</span>`
      : `<span class="badge-status badge-paused"><i class="fa-solid fa-triangle-exclamation"></i> Sem Credenciais</span>`;
  }
  if (cardMerchant) cardMerchant.textContent = `Merchant ID: ${info.merchantId || "Não informado"}`;
  if (cardTotal) cardTotal.textContent = info.totalItens || 0;
  if (cardAtivos) cardAtivos.textContent = `${info.itensAtivos || 0} ativos no iFood`;
  if (cardSync) cardSync.textContent = formatarDataHora(info.ultimaSincronizacao);
}

// --------------------------------------------------------------------------
// Carregamento de Dados da API
// --------------------------------------------------------------------------

async function carregarOverviewGeral() {
  try {
    const res = await fetch(`${API_BASE}/ifood/overview`);
    const json = await res.json();
    const dados = (json.success && json.data) ? json.data : [];

    overviewDataMap = new Map(dados.map(d => [d.loja, d]));
    atualizarBannerResumo();
  } catch (err) {
    console.error("Erro ao buscar overview das lojas:", err);
    overviewDataMap = new Map();
    atualizarBannerResumo();
  }
}

async function carregarInventarioLoja() {
  const tbody = document.getElementById("table-inventory-body");
  const countEl = document.getElementById("inventory-summary-count");
  if (!tbody) return;

  tbody.innerHTML = `
    <tr>
      <td colspan="5" class="p-8 text-center text-slate-400">
        <i class="fa-solid fa-circle-notch fa-spin text-lg mb-2 block text-red-500"></i> Buscando produtos pareados no iFood...
      </td>
    </tr>
  `;

  try {
    const res = await fetch(`${API_BASE}/ifood/sync-status?loja=${encodeURIComponent(lojaAtiva)}`);
    const json = await res.json();

    if (!res.ok || (json && json.error)) {
      tbody.innerHTML = `
        <tr>
          <td colspan="5" class="p-6 text-center text-rose-600 dark:text-rose-400">
            <i class="fa-solid fa-triangle-exclamation mr-1"></i> ${json.error || "Erro ao consultar dados da loja."}
          </td>
        </tr>
      `;
      if (countEl) countEl.textContent = "0 produtos registrados";
      return;
    }

    const dados = Array.isArray(json) ? json : (json.data || []);
    inventoryItemsCache = dados;

    aplicarFiltrosInventario();
  } catch (err) {
    console.error("Erro ao carregar inventário:", err);
    tbody.innerHTML = `
      <tr>
        <td colspan="5" class="p-6 text-center text-slate-400">
          Erro de conexão ao buscar estoque da loja.
        </td>
      </tr>
    `;
  }
}

function aplicarFiltrosInventario() {
  const busca = (document.getElementById("input-search-items")?.value || "").toLowerCase().trim();
  const ocultarPausados = document.getElementById("chk-ocultar-pausados")?.checked ?? true;

  let filtrados = inventoryItemsCache;

  if (ocultarPausados) {
    filtrados = filtrados.filter(item => item.status_enviado === "AVAILABLE");
  }

  if (busca) {
    filtrados = filtrados.filter(item => {
      const desc = (item.descricao || "").toLowerCase();
      const codLocal = (item.codProdutoLocal || "").toLowerCase();
      const codIfood = (item.codProdutoIfood || "").toLowerCase();
      return desc.includes(busca) || codLocal.includes(busca) || codIfood.includes(busca);
    });
  }

  renderizarTabelaInventario(filtrados);
}

function renderizarTabelaInventario(lista) {
  const tbody = document.getElementById("table-inventory-body");
  const countEl = document.getElementById("inventory-summary-count");
  if (!tbody) return;

  const totalAtivos = inventoryItemsCache.filter(i => i.status_enviado === "AVAILABLE").length;
  const totalPausados = inventoryItemsCache.length - totalAtivos;
  const ocultarPausados = document.getElementById("chk-ocultar-pausados")?.checked ?? true;

  if (!Array.isArray(lista) || lista.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="5" class="p-8 text-center text-slate-400">
          <i class="fa-solid fa-box-open text-2xl mb-2 block text-slate-300 dark:text-slate-600"></i>
          ${ocultarPausados ? "Nenhum produto ativo com estoque nesta loja (Itens sem estoque estão ocultos)." : "Nenhum produto encontrado nesta loja."}
        </td>
      </tr>
    `;
    if (countEl) countEl.textContent = "0 produtos exibidos";
    return;
  }

  if (countEl) {
    countEl.textContent = `Exibindo ${lista.length} produtos ${ocultarPausados ? `ativos (${totalPausados} pausados ocultos)` : `registrados`}`;
  }

  tbody.innerHTML = "";
  lista.forEach(item => {
    const isAtivo = item.status_enviado === "AVAILABLE";
    const tr = document.createElement("tr");
    tr.className = "hover:bg-slate-50 dark:hover:bg-slate-800/40 transition";
    tr.innerHTML = `
      <td class="p-3.5 font-medium text-slate-900 dark:text-white">${item.descricao || "--"}</td>
      <td class="p-3.5 font-mono text-slate-500 dark:text-slate-400">${item.codProdutoLocal || "--"}</td>
      <td class="p-3.5 font-mono text-slate-500 dark:text-slate-400">${item.codProdutoIfood || "--"}</td>
      <td class="p-3.5">
        <span class="badge-status ${isAtivo ? "badge-available" : "badge-paused"}">
          <i class="fa-solid ${isAtivo ? "fa-circle-check" : "fa-pause"}"></i> ${isAtivo ? "Ativo" : "Pausado"}
        </span>
      </td>
      <td class="p-3.5 text-right font-mono text-[11px] text-slate-400">
        ${formatarDataHora(item.data_sincronizacao)}
      </td>
    `;
    tbody.appendChild(tr);
  });
}

async function carregarCredenciaisLoja() {
  const inputMerchant = document.getElementById("cfg-merchant-id");
  const inputClient = document.getElementById("cfg-client-id");
  const inputSecret = document.getElementById("cfg-client-secret");
  if (!inputMerchant || !inputClient || !inputSecret) return;

  inputMerchant.value = "";
  inputClient.value = "";
  inputSecret.value = "";
  inputSecret.placeholder = "Seu Client Secret";

  try {
    const res = await fetch(`${API_BASE}/ifood-config?loja=${encodeURIComponent(lojaAtiva)}`);
    const json = await res.json();

    if (json.success && json.data) {
      inputMerchant.value = json.data.merchantId || "";
      inputClient.value = json.data.clientId || "";
      inputSecret.placeholder = "•••••••• (Chave gravada com segurança)";
    }
  } catch (err) {
    console.error("Erro ao buscar credenciais:", err);
  }
}

async function salvarCredenciaisLoja(e) {
  e.preventDefault();

  const merchantId = document.getElementById("cfg-merchant-id").value.trim();
  const clientId = document.getElementById("cfg-client-id").value.trim();
  const clientSecret = document.getElementById("cfg-client-secret").value.trim();

  if (!merchantId || !clientId) {
    mostrarFeedback("Preencha o Merchant ID e Client ID da loja.", "erro");
    return;
  }

  const btn = document.getElementById("btn-save-credentials");
  if (!btn) return;
  const originalHtml = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Salvando no banco...`;

  try {
    const res = await fetch(`${API_BASE}/ifood-config`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ loja: lojaAtiva, merchantId, clientId, clientSecret })
    });
    const json = await res.json();

    if (json.success) {
      mostrarFeedback("Credenciais do iFood salvas com sucesso!");
      document.getElementById("cfg-client-secret").value = "";
      document.getElementById("cfg-client-secret").placeholder = "•••••••• (Chave gravada com segurança)";
      await carregarOverviewGeral();
    } else {
      mostrarFeedback(json.error || "Erro ao salvar credenciais.", "erro");
    }
  } catch (err) {
    console.error(err);
    mostrarFeedback("Erro de comunicação ao salvar credenciais.", "erro");
  } finally {
    btn.disabled = false;
    btn.innerHTML = originalHtml;
  }
}

async function forcarSincronizacaoEstoque() {
  const btn = document.getElementById("btn-force-sync");
  if (!btn) return;

  const originalHtml = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Sincronizando...`;

  try {
    const res = await fetch(`${API_BASE}/ifood/sync-force`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ loja: lojaAtiva })
    });
    const json = await res.json();

    if (res.ok && json.success) {
      mostrarFeedback(`Sincronização executada com sucesso! Total de ${json.count || 0} itens processados.`);
      await Promise.all([carregarOverviewGeral(), carregarInventarioLoja()]);
    } else {
      mostrarFeedback(json.error || "Falha ao sincronizar catálogo iFood.", "erro");
    }
  } catch (err) {
    console.error(err);
    mostrarFeedback("Erro de conexão durante a sincronização.", "erro");
  } finally {
    btn.disabled = false;
    btn.innerHTML = originalHtml;
  }
}

// --------------------------------------------------------------------------
// Inicialização de Listeners e Controle UI
// --------------------------------------------------------------------------

function inicializarEventosUI() {
  // Troca de Lojas
  document.querySelectorAll("#store-selector-container button").forEach(btn => {
    btn.addEventListener("click", () => {
      selecionarLoja(btn.dataset.store);
    });
  });

  // Troca de Sub-abas (Cardápio / Credenciais / Logs)
  document.querySelectorAll(".nav-tab").forEach(tabBtn => {
    tabBtn.addEventListener("click", () => {
      document.querySelectorAll(".nav-tab").forEach(b => b.classList.remove("active"));
      document.querySelectorAll(".tab-content").forEach(c => c.classList.add("hidden"));

      tabBtn.classList.add("active");
      const targetId = tabBtn.dataset.tab;
      const targetEl = document.getElementById(targetId);
      if (targetEl) targetEl.classList.remove("hidden");
    });
  });

  // Busca e Filtros em tempo real na tabela
  const inputSearch = document.getElementById("input-search-items");
  if (inputSearch) {
    inputSearch.addEventListener("input", aplicarFiltrosInventario);
  }

  const chkOcultar = document.getElementById("chk-ocultar-pausados");
  if (chkOcultar) {
    chkOcultar.addEventListener("change", aplicarFiltrosInventario);
  }

  // Formulário de credenciais
  const formCreds = document.getElementById("form-ifood-credentials");
  if (formCreds) {
    formCreds.addEventListener("submit", salvarCredenciaisLoja);
  }

  // Botão Sincronizar Agora
  const btnSync = document.getElementById("btn-force-sync");
  if (btnSync) {
    btnSync.addEventListener("click", forcarSincronizacaoEstoque);
  }

  // Ativação por Código de 8 Caracteres (User Code)
  const btnGenCode = document.getElementById("btn-generate-user-code");
  if (btnGenCode) {
    btnGenCode.addEventListener("click", gerarCodigoAtivacaoIfood);
  }

  const btnCopyCode = document.getElementById("btn-copy-user-code");
  if (btnCopyCode) {
    btnCopyCode.addEventListener("click", copiarCodigoUserCode);
  }

  const btnCompCode = document.getElementById("btn-complete-user-code");
  if (btnCompCode) {
    btnCompCode.addEventListener("click", finalizarAtivacaoCodigoIfood);
  }
}

let currentAuthorizationVerifier = null;

async function gerarCodigoAtivacaoIfood() {
  const btn = document.getElementById("btn-generate-user-code");
  const codeBox = document.getElementById("user-code-box");
  const displayCode = document.getElementById("display-user-code");
  const linkUrl = document.getElementById("link-verification-url");

  if (!btn || !displayCode) return;
  const originalHtml = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Solicitando código ao iFood...`;

  try {
    const res = await fetch(`${API_BASE}/ifood/user-code`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ loja: lojaAtiva })
    });
    const json = await res.json();

    if (res.ok && json.success && json.userCode) {
      displayCode.textContent = json.userCode;
      currentAuthorizationVerifier = json.authorizationCodeVerifier;
      if (linkUrl && json.verificationUrl) {
        linkUrl.href = json.verificationUrl;
      }
      if (codeBox) codeBox.classList.remove("hidden");
      mostrarFeedback("Código de 8 dígitos gerado com sucesso! Copie e cole no Portal iFood.");
    } else {
      mostrarFeedback(json.error || "Não foi possível gerar o código do iFood.", "erro");
    }
  } catch (err) {
    console.error(err);
    mostrarFeedback("Erro de comunicação ao solicitar código.", "erro");
  } finally {
    btn.disabled = false;
    btn.innerHTML = originalHtml;
  }
}

async function finalizarAtivacaoCodigoIfood() {
  const btn = document.getElementById("btn-complete-user-code");
  if (!btn) return;

  const originalHtml = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Verificando autorização...`;

  try {
    const res = await fetch(`${API_BASE}/ifood/complete-user-code`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ loja: lojaAtiva, verifier: currentAuthorizationVerifier })
    });
    const json = await res.json();

    if (res.ok && json.success) {
      mostrarFeedback(json.message || "Integração ativada e autorizada com sucesso!");
      await carregarOverviewGeral();
      await carregarCredenciaisLoja();
    } else {
      mostrarFeedback(json.error || "Código ainda não foi autorizado no Portal iFood. Cole o código no iFood e tente novamente.", "erro");
    }
  } catch (err) {
    console.error(err);
    mostrarFeedback("Erro ao verificar autorização do código.", "erro");
  } finally {
    btn.disabled = false;
    btn.innerHTML = originalHtml;
  }
}

function copiarCodigoUserCode() {
  const codeText = document.getElementById("display-user-code")?.textContent.trim();
  if (codeText) {
    navigator.clipboard.writeText(codeText);
    mostrarFeedback(`Código "${codeText}" copiado para a área de transferência!`);
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  inicializarTema();
  inicializarEventosUI();
  await carregarOverviewGeral();
  selecionarLoja("marambaia");
});
