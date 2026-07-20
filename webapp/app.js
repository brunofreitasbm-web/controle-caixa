// ==========================================================================
// Controle de Caixa — Cacau Show
// Banco de dados centralizado via API. Fallback para LocalStorage se offline.
// ==========================================================================

const API_BASE = window.location.protocol === "file:"
  ? "http://localhost:5000/api"
  : "/api";
const STORAGE_KEY = "cacaushow_controle_caixa_v1";
const USER_KEY = "cacaushow_current_user";
const PIN_KEY = "cacaushow_pins_v1";
const CONFIG_KEY = "cacaushow_config_v2";
const THEME_KEY = "cacaushow_theme";
const RISCO_DIAS = 2; // envelope aguardando retirada por mais de N dias = alerta

const LOJAS = ["Marambaia", "Icoaraci", "Mário Covas", "Venda Direta"];

// --- CONFIGURAÇÃO MANUAL DOS GRUPOS DE WHATSAPP ---
// Cole aqui o link de convite do grupo do WhatsApp de cada loja.
// Para extrair o link de convite:
// 1. No WhatsApp, abra o grupo da loja correspondente.
// 2. Clique no nome do grupo no topo para abrir os dados do grupo.
// 3. Clique em "Convidar via link" (ou "Invite via link").
// 4. Copiar link (ex: https://chat.whatsapp.com/...) e cole abaixo dentro das aspas.
const WHATSAPP_GRUPOS = {
  "Marambaia": "https://chat.whatsapp.com/HMdUcq1xcoEHj0Z5TUSX7I",
  "Icoaraci": "https://chat.whatsapp.com/Jc5ORUEzXNH5TNYfTZSKsp",
  "Mário Covas": "https://chat.whatsapp.com/EL12D3ceZOPLEColPZZhvF",
  "Venda Direta": "https://chat.whatsapp.com/F8YcLG5nVOtIxjLltT3Tn4"
};

// Perfis de acesso:
// consultora            -> só "Novo Registro"
// consultora_dashboard   -> "Novo Registro" + "Dashboard de Envelopes"
// owner                  -> tudo (Registro, Dashboard, Histórico, Mensal)
const USERS = [
  { nome: "Ana Júlia", role: "consultora" },
  { nome: "Vitória", role: "consultora" },
  { nome: "Débora", role: "consultora" },
  { nome: "Alexandra", role: "consultora_dashboard" },
  { nome: "Janine", role: "consultora" },
  { nome: "Estheffany", role: "consultora" },
  { nome: "Sabrina", role: "consultora" },
  { nome: "Isabella", role: "owner" },
  { nome: "Bruno", role: "owner" },
];

const TABS_POR_ROLE = {
  consultora: ["registro"],
  consultora_dashboard: ["registro", "dashboard"],
  owner: ["registro", "dashboard", "historico", "mensal", "auditoria"],
};

// ==========================================================================
// UI Helpers (Toast, Loading, Modal, Session)
// ==========================================================================
function showToast(mensagem, tipo = "info") {
  const container = document.getElementById("toast-container");
  if (!container) return;
  const toast = document.createElement("div");
  toast.className = `toast ${tipo}`;
  
  let icon = "ℹ️";
  if (tipo === "sucesso") icon = "✅";
  if (tipo === "erro") icon = "❌";
  
  toast.innerHTML = `<span>${icon}</span> <span>${mensagem}</span>`;
  container.appendChild(toast);
  
  // Animate in
  requestAnimationFrame(() => toast.classList.add("show"));
  
  // Remove after 3.5s
  setTimeout(() => {
    toast.classList.remove("show");
    setTimeout(() => toast.remove(), 400);
  }, 3500);
}

// --- Modal de confirmação customizado (substitui alert/confirm nativos) ---
let _confirmResolve = null;

/**
 * Exibe um modal de alerta estilizado (substitui window.alert).
 * @param {string} mensagem - Texto a exibir.
 * @param {object} opts - {icon, title, btnText, btnClass}
 */
function showModal(mensagem, opts = {}) {
  const icon = opts.icon || "ℹ️";
  const title = opts.title || "Aviso";
  const btnText = opts.btnText || "OK";
  const btnClass = opts.btnClass || "";

  const overlay = document.getElementById("modal-confirm");
  document.getElementById("confirm-icon").textContent = icon;
  document.getElementById("confirm-title").textContent = title;
  document.getElementById("confirm-body").textContent = mensagem;

  const okBtn = document.getElementById("confirm-ok");
  const cancelBtn = document.getElementById("confirm-cancel");

  okBtn.textContent = btnText;
  okBtn.className = "btn-primary " + btnClass;
  cancelBtn.classList.add("hidden");

  overlay.classList.remove("hidden");
  okBtn.focus();

  return new Promise(resolve => {
    _confirmResolve = resolve;
    okBtn.onclick = () => { overlay.classList.add("hidden"); cancelBtn.classList.remove("hidden"); resolve(true); };
  });
}

/**
 * Exibe um modal de confirmação estilizado (substitui window.confirm).
 * @param {string} mensagem - Texto da pergunta.
 * @param {object} opts - {icon, title, confirmText, cancelText, confirmClass}
 * @returns {Promise<boolean>}
 */
function showConfirm(mensagem, opts = {}) {
  const icon = opts.icon || "⚠️";
  const title = opts.title || "Confirmação";
  const confirmText = opts.confirmText || "Confirmar";
  const cancelText = opts.cancelText || "Cancelar";
  const confirmClass = opts.confirmClass || "";

  const overlay = document.getElementById("modal-confirm");
  document.getElementById("confirm-icon").textContent = icon;
  document.getElementById("confirm-title").textContent = title;
  document.getElementById("confirm-body").textContent = mensagem;

  const okBtn = document.getElementById("confirm-ok");
  const cancelBtn = document.getElementById("confirm-cancel");

  okBtn.textContent = confirmText;
  okBtn.className = "btn-primary " + confirmClass;
  cancelBtn.textContent = cancelText;
  cancelBtn.classList.remove("hidden");

  overlay.classList.remove("hidden");
  cancelBtn.focus();

  return new Promise(resolve => {
    _confirmResolve = resolve;
    okBtn.onclick = () => { overlay.classList.add("hidden"); resolve(true); };
    cancelBtn.onclick = () => { overlay.classList.add("hidden"); resolve(false); };
  });
}

// --- Animação de contagem nos valores monetários ---
function animateValue(element, targetValue, duration = 600) {
  const start = parseFloat(element.dataset.currentValue || "0");
  const diff = targetValue - start;
  if (Math.abs(diff) < 0.01) { element.textContent = formatBRL(targetValue); return; }

  element.classList.add("valor-animado", "counting");
  const startTime = performance.now();

  function step(now) {
    const elapsed = now - startTime;
    const progress = Math.min(elapsed / duration, 1);
    // easeOutQuart
    const eased = 1 - Math.pow(1 - progress, 4);
    const current = start + diff * eased;
    element.textContent = formatBRL(current);
    if (progress < 1) {
      requestAnimationFrame(step);
    } else {
      element.textContent = formatBRL(targetValue);
      element.dataset.currentValue = targetValue;
      element.classList.remove("counting");
    }
  }
  requestAnimationFrame(step);
}

// --- Skeleton Loading para Dashboard ---
function renderSkeletonCards(containerId, count = 4) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = "";
  for (let i = 0; i < count; i++) {
    const card = document.createElement("div");
    card.className = "loja-card skeleton-card";
    card.innerHTML = `
      <div class="skeleton skeleton-title"></div>
      <div class="skeleton skeleton-value"></div>
      <div class="skeleton skeleton-line medium"></div>
    `;
    container.appendChild(card);
  }
}

function setLoading(btnId, isLoading) {
  const btn = document.getElementById(btnId) || btnId;
  if (!btn) return;
  if (isLoading) {
    btn.classList.add("btn-loading");
    btn.disabled = true;
  } else {
    btn.classList.remove("btn-loading");
    btn.disabled = false;
  }
}

function formatarMoedaInput(e) {
  let value = e.target.value.replace(/\D/g, "");
  if (!value) {
    e.target.value = "";
    return;
  }
  value = (parseInt(value, 10) / 100).toFixed(2);
  value = value.replace(".", ",");
  value = value.replace(/(\d)(?=(\d{3})+(?!\d))/g, "$1.");
  e.target.value = value;
}

function parseMoeda(str) {
  if (!str) return 0;
  if (typeof str === "number") return str;
  return parseFloat(str.replace(/\./g, "").replace(",", "."));
}

document.getElementById("fundo-caixa").addEventListener("input", formatarMoedaInput);
document.getElementById("valor-envelope").addEventListener("input", formatarMoedaInput);

// Só essas pessoas podem confirmar a retirada física do dinheiro.
// Alexandra (Líder de Operações) precisa de autorização (PIN) de Bruno ou Isabella.
const RETIRADA_PERMITIDA = ["Bruno", "Isabella", "Alexandra"];
const AUTORIZADORES = ["Bruno", "Isabella"];

let API_ONLINE = false;
let registros = [];
let pins = {};
let config = { linkGrupo: "" };
let currentUser = carregarJSON(USER_KEY, null);

let tipoOperacaoSelecionado = null;
let fotoDataUrl = null;
let retiradaAlvoId = null;

function carregarJSON(key, fallback) {
  try {
    const v = JSON.parse(localStorage.getItem(key));
    return v ?? fallback;
  } catch {
    return fallback;
  }
}

// --- Detecção do Status de Rede / Conectividade do Servidor ---
const offlineBanner = document.getElementById("offline-banner");

async function checkApiConnection() {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s para Render
  
  try {
    const res = await fetch(`${API_BASE}/config`, { method: "GET", signal: controller.signal });
    clearTimeout(timeoutId);
    if (res.ok) {
      if (!API_ONLINE) console.log("API Backend conectada!");
      API_ONLINE = true;
      offlineBanner.style.display = "none";
    } else {
      throw new Error();
    }
  } catch (err) {
    if (API_ONLINE || offlineBanner.style.display !== "block") {
      console.warn("API Backend offline. Usando localStorage.");
    }
    API_ONLINE = false;
    offlineBanner.style.display = "block";
  }
}

// --- Sincronização Inicial ---
async function inicializarDados() {
  await checkApiConnection();

  if (API_ONLINE) {
    try {
      const resReg = await fetch(`${API_BASE}/registros`);
      registros = await resReg.json();

      // GET /api/pins agora retorna apenas quais usuários têm PIN (sem os PINs reais)
      const resPins = await fetch(`${API_BASE}/pins`);
      const pinsMap = await resPins.json();
      // Marcar quais usuários têm PIN configurado
      Object.keys(pinsMap).forEach(u => { pins[u] = pins[u] || '****'; });
      // Manter pins locais para fallback offline
      if (Object.keys(pins).length) localStorage.setItem(PIN_KEY, JSON.stringify(pins));

      const resConfig = await fetch(`${API_BASE}/config`);
      config = await resConfig.json();
      if (!config.linkGrupo) config.linkGrupo = "";
    } catch (e) {
      console.error("Erro ao puxar dados da API:", e);
      carregarDadosLocais();
    }
  } else {
    carregarDadosLocais();
  }

  renderApp();
}

function carregarDadosLocais() {
  registros = carregarJSON(STORAGE_KEY, []);
  pins = carregarJSON(PIN_KEY, {});
  config = carregarJSON(CONFIG_KEY, { linkGrupo: "" });
}

// --- Salvar dados ---
async function salvarRegistroAPI(reg) {
  if (API_ONLINE) {
    try {
      const res = await fetch(`${API_BASE}/registros?usuario=${encodeURIComponent(currentUser ? currentUser.nome : "")}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(reg)
      });
      if (res.ok) return true;
    } catch (e) {
      console.error("Erro ao salvar registro na API:", e);
    }
  }
  // Fallback Local
  registros.push(reg);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(registros));
  return false;
}

async function atualizarRegistroAPI(id, dados) {
  if (API_ONLINE) {
    try {
      const res = await fetch(`${API_BASE}/registros/${id}?usuario=${encodeURIComponent(currentUser ? currentUser.nome : "")}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(dados)
      });
      if (res.ok) return true;
    } catch (e) {
      console.error("Erro ao atualizar registro na API:", e);
    }
  }
  // Fallback Local
  const idx = registros.findIndex(r => r.id === id);
  if (idx !== -1) {
    registros[idx] = { ...registros[idx], ...dados };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(registros));
  }
  return false;
}

async function excluirRegistroAPI(id) {
  let excluido = false;
  if (API_ONLINE) {
    try {
      const res = await fetch(`${API_BASE}/registros/${id}?usuario=${encodeURIComponent(currentUser ? currentUser.nome : "")}`, {
        method: "DELETE"
      });
      if (res.ok) excluido = true;
    } catch (e) {
      console.error("Erro ao excluir registro na API:", e);
    }
  } else {
    excluido = true;
  }

  if (excluido) {
    const idx = registros.findIndex(r => r.id === id);
    if (idx !== -1) {
      registros.splice(idx, 1);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(registros));
    }
    return true;
  }
  return false;
}

async function salvarPinAPI(usuario, pin) {
  if (API_ONLINE) {
    try {
      const res = await fetch(`${API_BASE}/pins`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ usuario, pin })
      });
      if (res.ok) return true;
    } catch (e) {
      console.error("Erro ao salvar PIN na API:", e);
    }
  }
  // Fallback Local
  pins[usuario] = pin;
  localStorage.setItem(PIN_KEY, JSON.stringify(pins));
  return false;
}

async function salvarConfigAPI(chave, valor) {
  if (API_ONLINE) {
    try {
      const res = await fetch(`${API_BASE}/config`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chave, valor })
      });
      if (res.ok) return true;
    } catch (e) {
      console.error("Erro ao salvar config na API:", e);
    }
  }
  // Fallback Local
  config[chave] = valor;
  localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
  return false;
}

function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }

function formatBRL(v) {
  return (Number(v) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatDataHora(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function diffDias(iso) {
  const ms = Date.now() - new Date(iso).getTime();
  return Math.floor(ms / (1000 * 60 * 60 * 24));
}

function mesmoDia(isoA, isoB) {
  const a = new Date(isoA), b = new Date(isoB);
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

// ==========================================================================
// TEMA
// ==========================================================================
function aplicarTema(theme) {
  document.documentElement.setAttribute("data-theme", theme);
}
(function initTema() {
  const salvo = localStorage.getItem(THEME_KEY);
  if (salvo) aplicarTema(salvo);
})();
document.getElementById("btn-tema").addEventListener("click", () => {
  const atual = document.documentElement.getAttribute("data-theme") ||
    (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  const novo = atual === "dark" ? "light" : "dark";
  aplicarTema(novo);
  localStorage.setItem(THEME_KEY, novo);
});

// ==========================================================================
// LOGIN / PERFIS / PIN
// ==========================================================================
const loginOverlay = document.getElementById("login-overlay");
const loginSelect = document.getElementById("login-select");
const loginPinWrap = document.getElementById("login-pin-wrap");
const loginPinLabel = document.getElementById("login-pin-label");
const loginPinInput = document.getElementById("login-pin");
const loginPinConfirmWrap = document.getElementById("login-pin-confirm-wrap");
const loginPinConfirmInput = document.getElementById("login-pin-confirm");
const loginMsg = document.getElementById("login-msg");
const loginEntrarBtn = document.getElementById("login-entrar");
const appEl = document.getElementById("app");

USERS.forEach(u => {
  const opt = document.createElement("option");
  opt.value = u.nome;
  opt.textContent = u.nome;
  loginSelect.appendChild(opt);
});

function pinValido(v) { return /^\d{4}$/.test(v); }

function resetLoginForm() {
  loginSelect.value = "";
  loginPinInput.value = "";
  loginPinConfirmInput.value = "";
  loginPinWrap.classList.add("hidden");
  loginPinConfirmWrap.classList.add("hidden");
  loginMsg.classList.add("hidden");
  loginEntrarBtn.textContent = "Entrar";
}

loginSelect.addEventListener("change", () => {
  const nome = loginSelect.value;
  loginMsg.classList.add("hidden");
  if (!nome) {
    loginPinWrap.classList.add("hidden");
    loginPinConfirmWrap.classList.add("hidden");
    return;
  }
  loginPinWrap.classList.remove("hidden");
  loginPinInput.value = "";
  loginPinConfirmInput.value = "";
  if (pins[nome]) {
    loginPinLabel.textContent = "PIN (4 dígitos)";
    loginPinConfirmWrap.classList.add("hidden");
    loginEntrarBtn.textContent = "Entrar";
  } else {
    loginPinLabel.textContent = "Crie seu PIN (4 dígitos)";
    loginPinConfirmWrap.classList.remove("hidden");
    loginEntrarBtn.textContent = "Criar PIN e Entrar";
  }
});

loginEntrarBtn.addEventListener("click", async () => {
  const nome = loginSelect.value;
  if (!nome) { mostrarErroLogin("Selecione seu nome."); return; }
  const user = USERS.find(u => u.nome === nome);
  const pinDigitado = loginPinInput.value.trim();

  if (pins[nome]) {
    // Verificar PIN via API (seguro) ou localmente se offline
    if (API_ONLINE) {
      try {
        const res = await fetch(`${API_BASE}/auth/verify`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ usuario: nome, pin: pinDigitado })
        });
        const result = await res.json();
        if (!result.valid) {
          mostrarErroLogin("PIN incorreto.");
          return;
        }
      } catch (e) {
        // Fallback offline: comparar com PIN local (pode ser hash mascarado)
        if (pins[nome] !== '****' && pinDigitado !== pins[nome]) {
          mostrarErroLogin("PIN incorreto.");
          return;
        }
      }
    } else {
      // Offline: comparar com PIN local
      if (pins[nome] !== '****' && pinDigitado !== pins[nome]) {
        mostrarErroLogin("PIN incorreto.");
        return;
      }
    }
  } else {
    const confirma = loginPinConfirmInput.value.trim();
    if (!pinValido(pinDigitado)) { mostrarErroLogin("O PIN deve ter exatamente 4 dígitos."); return; }
    if (pinDigitado !== confirma) { mostrarErroLogin("Os PINs não conferem."); return; }
    await salvarPinAPI(nome, pinDigitado);
    // Salvar localmente para fallback offline
    pins[nome] = pinDigitado;
    localStorage.setItem(PIN_KEY, JSON.stringify(pins));
  }

  currentUser = user;
  localStorage.setItem(USER_KEY, JSON.stringify(currentUser));
  resetLoginForm();
  entrarNoApp();
});

function mostrarErroLogin(msg) {
  loginMsg.textContent = msg;
  loginMsg.classList.remove("hidden");
}

document.getElementById("btn-trocar-usuario").addEventListener("click", () => {
  currentUser = null;
  localStorage.removeItem(USER_KEY);
  resetLoginForm();
  appEl.classList.add("hidden");
  loginOverlay.classList.remove("hidden");
});

function entrarNoApp() {
  loginOverlay.classList.add("hidden");
  appEl.classList.remove("hidden");
  document.getElementById("session-overlay").classList.add("hidden");

  document.getElementById("user-badge").textContent = currentUser.nome;

  const tabsPermitidas = TABS_POR_ROLE[currentUser.role];
  document.querySelectorAll(".tab-btn").forEach(btn => {
    const permitido = tabsPermitidas.includes(btn.dataset.tab);
    btn.classList.toggle("hidden", !permitido);
  });
  // Sync bottom nav visibility (#7)
  document.querySelectorAll(".bottom-nav-btn").forEach(btn => {
    const permitido = tabsPermitidas.includes(btn.dataset.tab);
    btn.classList.toggle("hidden", !permitido);
  });
  document.getElementById("bottom-nav").classList.remove("hidden");
  document.getElementById("fab-novo-registro").classList.remove("hidden");

  const ativa = document.querySelector(".tab-panel.active")?.id.replace("tab-", "");
  if (!tabsPermitidas.includes(ativa)) {
    ativarTab(tabsPermitidas[0]);
  }


  const consultorSelect = document.getElementById("consultor");
  if (currentUser.role !== "owner") {
    consultorSelect.value = currentUser.nome;
    consultorSelect.disabled = true;
  } else {
    consultorSelect.disabled = false;
  }

  const isBruno = currentUser && currentUser.nome === "Bruno";
  document.querySelectorAll(".col-bruno").forEach(el => {
    el.classList.toggle("hidden", !isBruno);
  });

  renderDashboard();
  renderHistorico();
  resetSessionTimer();
  mostrarResumoMatinal();
}

function renderApp() {
  if (currentUser) {
    entrarNoApp();
  }
}

// --- Trocar PIN ---
const modalTrocarPin = document.getElementById("modal-trocar-pin");
document.getElementById("btn-trocar-pin").addEventListener("click", () => {
  document.getElementById("pin-atual").value = "";
  document.getElementById("pin-novo").value = "";
  document.getElementById("pin-novo-confirma").value = "";
  document.getElementById("trocar-pin-msg").classList.add("hidden");
  modalTrocarPin.classList.remove("hidden");
});
document.getElementById("trocar-pin-cancelar").addEventListener("click", () => modalTrocarPin.classList.add("hidden"));
document.getElementById("trocar-pin-salvar").addEventListener("click", async () => {
  const atual = document.getElementById("pin-atual").value.trim();
  const novo = document.getElementById("pin-novo").value.trim();
  const confirma = document.getElementById("pin-novo-confirma").value.trim();
  const msg = document.getElementById("trocar-pin-msg");

  function erro(texto) { msg.textContent = texto; msg.classList.remove("hidden"); }

  if (atual !== pins[currentUser.nome]) { erro("PIN atual incorreto."); return; }
  if (!pinValido(novo)) { erro("O novo PIN deve ter exatamente 4 dígitos."); return; }
  if (novo !== confirma) { erro("Os novos PINs não conferem."); return; }

  await salvarPinAPI(currentUser.nome, novo);
  modalTrocarPin.classList.add("hidden");
  showModal("PIN alterado com sucesso!", { icon: "✅", title: "Sucesso", btnText: "Fechar" });
});

// --- Tabs ---
function ativarTab(tabName) {
  document.querySelectorAll(".tab-btn").forEach(b => {
    b.classList.remove("active");
    b.setAttribute("aria-selected", "false");
    b.setAttribute("tabindex", "-1");
  });
  document.querySelectorAll(".tab-panel").forEach(p => p.classList.remove("active"));
  const activeBtn = document.querySelector(`.tab-btn[data-tab="${tabName}"]`);
  activeBtn.classList.add("active");
  activeBtn.setAttribute("aria-selected", "true");
  activeBtn.setAttribute("tabindex", "0");
  document.getElementById("tab-" + tabName).classList.add("active");
  // Sync bottom nav (#7)
  document.querySelectorAll(".bottom-nav-btn").forEach(b => b.classList.remove("active"));
  const activeBottom = document.querySelector(`.bottom-nav-btn[data-tab="${tabName}"]`);
  if (activeBottom) activeBottom.classList.add("active");

  if (tabName === "dashboard") renderDashboard();
  if (tabName === "historico") renderHistorico();
  if (tabName === "mensal") renderMensal();
  if (tabName === "auditoria") carregarAuditoria();
}

document.querySelectorAll(".tab-btn").forEach(btn => {
  btn.addEventListener("click", () => ativarTab(btn.dataset.tab));
});

// Bottom nav click handlers (#7)
document.querySelectorAll(".bottom-nav-btn").forEach(btn => {
  btn.addEventListener("click", () => ativarTab(btn.dataset.tab));
});

// FAB — abre tab de registro (#7)
document.getElementById("fab-novo-registro").addEventListener("click", () => {
  ativarTab("registro");
  window.scrollTo({ top: 0, behavior: "smooth" });
});

// Navegação por teclado nas tabs (seta esquerda/direita)
document.querySelector(".tabs").addEventListener("keydown", e => {
  const visibleTabs = [...document.querySelectorAll(".tab-btn:not(.hidden)")];
  const currentIndex = visibleTabs.indexOf(document.activeElement);
  if (currentIndex === -1) return;
  let newIndex = currentIndex;
  if (e.key === "ArrowRight") newIndex = (currentIndex + 1) % visibleTabs.length;
  else if (e.key === "ArrowLeft") newIndex = (currentIndex - 1 + visibleTabs.length) % visibleTabs.length;
  else return;
  e.preventDefault();
  visibleTabs[newIndex].focus();
  ativarTab(visibleTabs[newIndex].dataset.tab);
});

// --- Form: tipo operação ---
document.querySelectorAll(".seg-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".seg-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    tipoOperacaoSelecionado = btn.dataset.value;
    atualizarCamposPorOperacao();
  });
});

function atualizarCamposPorOperacao() {
  const fieldEnvelope = document.getElementById("field-valor-envelope");
  const valorEnvelopeInput = document.getElementById("valor-envelope");
  const fotoHint = document.getElementById("foto-hint");

  if (tipoOperacaoSelecionado === "Abertura") {
    fieldEnvelope.classList.add("hidden");
    valorEnvelopeInput.required = false;
    fotoHint.textContent = "(não necessário na abertura)";
  } else {
    fieldEnvelope.classList.remove("hidden");
    valorEnvelopeInput.required = true;
    fotoHint.textContent = "(recomendado no fechamento)";
  }
}

// --- Sugestão automática de Fundo de Caixa ---
document.getElementById("loja").addEventListener("change", () => {
  const loja = document.getElementById("loja").value;
  const fundoInput = document.getElementById("fundo-caixa");
  const hint = document.getElementById("fundo-caixa-hint");
  const ultimo = [...registros]
    .filter(r => r.loja === loja)
    .sort((a, b) => new Date(b.dataOperacao) - new Date(a.dataOperacao))[0];

  if (ultimo) {
    if (!fundoInput.value) {
      let val = ultimo.fundoCaixa.toFixed(2).replace(".", ",");
      val = val.replace(/(\d)(?=(\d{3})+(?!\d))/g, "$1.");
      fundoInput.value = val;
    }
    hint.textContent = `Preenchido com o último fundo de caixa registrado em ${loja} (${formatBRL(ultimo.fundoCaixa)}). Edite se for diferente.`;
    hint.classList.remove("hidden");
  } else {
    hint.classList.add("hidden");
  }
});

// --- Tags de Observação (#14) ---
const OBS_TAGS = [
  "Sem ocorrências",
  "Troco faltando",
  "Cédula rasgada",
  "Sistema TEF falhou",
  "Sangria extra",
  "Diferença no caixa",
  "Abertura com atraso"
];

(function initObsTags() {
  const obsField = document.getElementById("observacoes").closest(".field");
  const tagsWrap = document.createElement("div");
  tagsWrap.className = "obs-tags";
  OBS_TAGS.forEach(tag => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "obs-tag-btn";
    btn.textContent = tag;
    btn.addEventListener("click", () => {
      const obsInput = document.getElementById("observacoes");
      const current = obsInput.value.trim();
      btn.classList.toggle("active");
      if (btn.classList.contains("active")) {
        obsInput.value = current ? current + ", " + tag : tag;
      } else {
        obsInput.value = current.replace(new RegExp(",?\\s*" + tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), "g"), "").replace(/^,\s*/, "").trim();
      }
    });
    tagsWrap.appendChild(btn);
  });
  obsField.insertBefore(tagsWrap, document.getElementById("observacoes"));
})();

// --- Foto ---
const fotoInput = document.getElementById("foto-envelope");
const fotoPreviewWrap = document.getElementById("foto-preview-wrap");
const fotoPreview = document.getElementById("foto-preview");

fotoInput.addEventListener("change", () => {
  const file = fotoInput.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      const MAX_WIDTH = 800;
      const MAX_HEIGHT = 800;
      let width = img.width;
      let height = img.height;

      if (width > height) {
        if (width > MAX_WIDTH) {
          height *= MAX_WIDTH / width;
          width = MAX_WIDTH;
        }
      } else {
        if (height > MAX_HEIGHT) {
          width *= MAX_HEIGHT / height;
          height = MAX_HEIGHT;
        }
      }
      
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, width, height);
      
      // Comprime e redimensiona para JPEG (qualidade 60%)
      fotoDataUrl = canvas.toDataURL("image/jpeg", 0.6);
      fotoPreview.src = fotoDataUrl;
      fotoPreviewWrap.classList.remove("hidden");
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
});

document.getElementById("foto-remover").addEventListener("click", () => {
  fotoDataUrl = null;
  fotoInput.value = "";
  fotoPreviewWrap.classList.add("hidden");
});

// --- Data/hora default = agora ---
function setAgora(inputEl) {
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  inputEl.value = now.toISOString().slice(0, 16);
}
setAgora(document.getElementById("data-operacao"));

// --- Submit ---
document.getElementById("form-registro").addEventListener("submit", async e => {
  e.preventDefault();

  const btnSubmit = document.querySelector("#form-registro button[type='submit']");
  
  const consultor = document.getElementById("consultor").value;
  const loja = document.getElementById("loja").value;
  const dataOperacao = document.getElementById("data-operacao").value;
  const fundoCaixaRaw = document.getElementById("fundo-caixa").value;
  const valorEnvelopeRaw = document.getElementById("valor-envelope").value;
  const observacoes = document.getElementById("observacoes").value;

  if (!tipoOperacaoSelecionado) {
    showToast("Selecione o tipo de operação (Abertura ou Fechamento).", "erro");
    return;
  }
  if (!consultor || !loja || !dataOperacao || fundoCaixaRaw === "") {
    showToast("Preencha todos os campos obrigatórios.", "erro");
    return;
  }
  if (tipoOperacaoSelecionado === "Fechamento" && valorEnvelopeRaw === "") {
    showToast("Informe o valor do envelope no fechamento.", "erro");
    return;
  }

  const fundoCaixa = parseMoeda(fundoCaixaRaw);
  const valorEnvelope = parseMoeda(valorEnvelopeRaw);

  const duplicado = loja !== "Venda Direta" && registros.some(r =>
    r.loja === loja &&
    r.tipoOperacao === tipoOperacaoSelecionado &&
    mesmoDia(r.dataOperacao, dataOperacao)
  );
  if (duplicado) {
    showToast(`Já existe um registro de ${tipoOperacaoSelecionado} para ${loja} nesse dia.`, "erro");
    return;
  }

  setLoading(btnSubmit, true);

  const registro = {
    id: uid(),
    consultor,
    loja,
    tipoOperacao: tipoOperacaoSelecionado,
    dataOperacao: new Date(dataOperacao).toISOString(),
    fundoCaixa,
    valorEnvelope: tipoOperacaoSelecionado === "Fechamento" ? valorEnvelope : null,
    observacoes: observacoes || null,
    fotoEnvelope: tipoOperacaoSelecionado === "Fechamento" ? fotoDataUrl : null,
    status: tipoOperacaoSelecionado === "Fechamento" ? "aguardando_retirada" : "aberto",
    dataRetirada: null,
    retiradoPor: null,
    confirmadoPorApp: null,
    autorizadoPor: null,
    mensagemGerada: false,
    criadoEm: new Date().toISOString(),
  };

  // Se salvar na API com sucesso, adicionamos localmente e atualizamos.
  const apiSalvo = await salvarRegistroAPI(registro);
  if (apiSalvo) {
    registros.push(registro);
  }

  setLoading(btnSubmit, false);
  showToast("Registro salvo com sucesso!", "sucesso");
  await showModal(`Seu registro de ${tipoOperacaoSelecionado} para a loja ${loja} foi realizado com sucesso!`, { icon: "✅", title: "Registro Salvo" });

  // === RECONCILIAÇÃO ABERTURA ↔ FECHAMENTO (#8) ===
  if (tipoOperacaoSelecionado === "Abertura") {
    const ultimoFechamento = [...registros]
      .filter(r => r.loja === loja && r.tipoOperacao === "Fechamento")
      .sort((a, b) => new Date(b.dataOperacao) - new Date(a.dataOperacao))[0];

    if (ultimoFechamento && ultimoFechamento.fundoCaixa !== undefined) {
      const diff = fundoCaixa - ultimoFechamento.fundoCaixa;
      if (Math.abs(diff) > 0.01) {
        showModal(
          `Divergência detectada! O fundo de caixa desta abertura (${formatBRL(fundoCaixa)}) difere do último fechamento de ${loja} (${formatBRL(ultimoFechamento.fundoCaixa)}). Diferença: ${formatBRL(Math.abs(diff))} (${diff > 0 ? 'a mais' : 'a menos'}).`,
          { icon: "⚠️", title: "Divergência de Fundo de Caixa", btnText: "Entendido" }
        );
        // Notificar via email (silencioso)
        if (API_ONLINE) {
          fetch(`${API_BASE}/divergencia`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              loja,
              consultor,
              fundoAbertura: fundoCaixa,
              fundoUltimoFechamento: ultimoFechamento.fundoCaixa,
              diferenca: diff
            })
          }).catch(() => {});
        }
      }
    }
  }

  e.target.reset();
  document.querySelectorAll(".seg-btn").forEach(b => b.classList.remove("active"));
  tipoOperacaoSelecionado = null;
  fotoDataUrl = null;
  fotoPreviewWrap.classList.add("hidden");
  atualizarCamposPorOperacao();
  setAgora(document.getElementById("data-operacao"));
  document.getElementById("fundo-caixa-hint").classList.add("hidden");
  if (currentUser.role !== "owner") {
    document.getElementById("consultor").value = currentUser.nome;
  }

  mostrarGeradorMensagem(registro);
});

// --- Gerador de Mensagem WhatsApp ---
function mensagemAviso(r) {
  if (r.tipoOperacao === "Abertura") {
    return (
      `🔔 Abertura de Caixa - Cacau Show\n` +
      `Loja: ${r.loja}\n` +
      `Consultor: ${r.consultor}\n` +
      `Data: ${formatDataHora(r.dataOperacao)}\n` +
      `Fundo de Caixa: ${formatBRL(r.fundoCaixa)}`
    );
  }
  return (
    `🔔 Fechamento de Caixa - Cacau Show\n` +
    `Loja: ${r.loja}\n` +
    `Consultor: ${r.consultor}\n` +
    `Data: ${formatDataHora(r.dataOperacao)}\n` +
    `Fundo de Caixa: ${formatBRL(r.fundoCaixa)}\n` +
    `Valor do Envelope: ${formatBRL(r.valorEnvelope)}`
  );
}

function mostrarGeradorMensagem(registro) {
  const banner = document.getElementById("aviso-banner");
  const textarea = document.getElementById("aviso-texto");
  const status = document.getElementById("aviso-status");
  const linkBtn = document.getElementById("btn-abrir-whatsapp");

  textarea.value = mensagemAviso(registro);
  status.classList.add("hidden");

  const linkGrupoLoja = WHATSAPP_GRUPOS[registro.loja];

  linkBtn.href = linkGrupoLoja
    ? linkGrupoLoja
    : `https://wa.me/?text=${encodeURIComponent(mensagemAviso(registro))}`;

  async function marcarGerado() {
    registro.mensagemGerada = true;
    await atualizarRegistroAPI(registro.id, { mensagemGerada: true });
    status.classList.remove("hidden");
  }

  document.getElementById("btn-copiar-mensagem").onclick = async () => {
    try {
      await navigator.clipboard.writeText(textarea.value);
    } catch {
      textarea.select();
      document.execCommand("copy");
    }
    await marcarGerado();
  };

  linkBtn.onclick = async () => await marcarGerado();

  banner.classList.remove("hidden");
}

// --- Dashboard ---
function renderDashboard() {
  const filtroLoja = document.getElementById("filtro-loja-pendentes").value;
  const pendentes = registros.filter(r => r.status === "aguardando_retirada");

  const hoje = new Date().toISOString();
  const semFechamento = LOJAS.filter(loja => {
    return !registros.some(r => r.loja === loja && r.tipoOperacao === "Fechamento" && mesmoDia(r.dataOperacao, hoje));
  });
  const alertaCard = document.getElementById("alerta-sem-fechamento");
  if (semFechamento.length) {
    document.getElementById("lojas-sem-fechamento").textContent = " " + semFechamento.join(", ");
    alertaCard.classList.remove("hidden");
  } else {
    alertaCard.classList.add("hidden");
  }

  const cardsWrap = document.getElementById("cards-lojas");
  cardsWrap.innerHTML = "";
  let totalGeral = 0;
  const totaisPorLoja = {};

  LOJAS.forEach(loja => {
    const doLoja = pendentes.filter(r => r.loja === loja);
    const total = doLoja.reduce((s, r) => s + (r.valorEnvelope || 0), 0);
    totaisPorLoja[loja] = total;
    totalGeral += total;
    const maisAntigo = doLoja.reduce((max, r) => {
      const dias = diffDias(r.dataOperacao);
      return dias > max ? dias : max;
    }, 0);
    const emRisco = maisAntigo >= RISCO_DIAS && doLoja.length > 0;

    const card = document.createElement("div");
    card.className = "loja-card" + (emRisco ? " alerta" : "");
    card.innerHTML = `
      <h4>${loja}</h4>
      <div class="valor">${formatBRL(total)}</div>
      <div class="meta">
        <span>${doLoja.length} envelope(s)</span>
        <span>${doLoja.length ? maisAntigo + "d mais antigo" : "—"}</span>
      </div>
      ${emRisco ? `<span class="badge-alerta">⚠ Retirada atrasada</span>` : ""}
    `;
    cardsWrap.appendChild(card);
  });

  document.getElementById("dash-total-geral").textContent = formatBRL(totalGeral) + " em trânsito";

  const barChart = document.getElementById("bar-chart");
  barChart.innerHTML = "";
  const maiorValor = Math.max(...Object.values(totaisPorLoja), 1);
  LOJAS.forEach(loja => {
    const total = totaisPorLoja[loja];
    const pct = Math.round((total / maiorValor) * 100);
    const row = document.createElement("div");
    row.className = "bar-row";
    row.innerHTML = `
      <span>${loja}</span>
      <div class="bar-track"><div class="bar-fill" style="width:${pct}%"></div></div>
      <span class="bar-value">${formatBRL(total)}</span>
    `;
    barChart.appendChild(row);
  });

  const filtrados = filtroLoja ? pendentes.filter(r => r.loja === filtroLoja) : pendentes;
  const tbody = document.querySelector("#tabela-pendentes tbody");
  tbody.innerHTML = "";

  const podeRetirar = RETIRADA_PERMITIDA.includes(currentUser.nome);

  filtrados
    .sort((a, b) => new Date(a.dataOperacao) - new Date(b.dataOperacao))
    .forEach(r => {
      const dias = diffDias(r.dataOperacao);
      const risco = dias >= RISCO_DIAS;
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${r.loja}</td>
        <td>${r.consultor}</td>
        <td>${formatDataHora(r.dataOperacao)}</td>
        <td>${formatBRL(r.valorEnvelope)}</td>
        <td><span class="dias-badge ${risco ? "risco" : ""}">${dias}d</span></td>
        <td>${fotoCelula(r)}</td>
        <td>${avisoCelula(r)}</td>
        <td>${podeRetirar
          ? `<button class="btn-retirar" data-id="${r.id}">Marcar retirado</button>`
          : `<span class="retirada-bloqueada">🔒 Só Bruno, Isabella ou Alexandra</span>`}</td>
      `;
      tbody.appendChild(tr);
    });

  document.getElementById("pendentes-vazio").classList.toggle("hidden", filtrados.length > 0);

  tbody.querySelectorAll(".btn-retirar").forEach(btn => {
    btn.addEventListener("click", () => abrirModalRetirada(btn.dataset.id));
  });
  tbody.querySelectorAll(".thumb-btn").forEach(img => {
    img.addEventListener("click", () => abrirModalFoto(img.dataset.src));
  });
}

function fotoCelula(r) {
  if (r.fotoEnvelope) {
    return `<img class="thumb-btn" src="${r.fotoEnvelope}" data-src="${r.fotoEnvelope}" alt="foto envelope">`;
  }
  return `<span class="no-photo">sem foto</span>`;
}

function avisoCelula(r) {
  if (r.tipoOperacao !== "Fechamento") return "—";
  return r.mensagemGerada
    ? `<span class="aviso-pill sim">✅ Mensagem gerada</span>`
    : `<span class="aviso-pill nao">⏳ Não gerada</span>`;
}

document.getElementById("filtro-loja-pendentes").addEventListener("change", renderDashboard);

// --- Modal retirada ---
const modalRetirada = document.getElementById("modal-retirada");
const autorizacaoWrap = document.getElementById("autorizacao-wrap");
const autorizacaoPinInput = document.getElementById("autorizacao-pin");

function abrirModalRetirada(id) {
  if (!RETIRADA_PERMITIDA.includes(currentUser.nome)) {
    showModal("Apenas Bruno, Isabella ou Alexandra podem confirmar retiradas.", { icon: "🔒", title: "Acesso restrito" });
    return;
  }
  retiradaAlvoId = id;
  const r = registros.find(x => x.id === id);
  document.getElementById("modal-sub-info").textContent =
    `${r.loja} — ${r.consultor} — ${formatBRL(r.valorEnvelope)}`;
  setAgora(document.getElementById("retirada-data"));
  document.getElementById("retirada-responsavel").value = "";
  autorizacaoPinInput.value = "";

  const precisaAutorizacao = currentUser.nome === "Alexandra";
  autorizacaoWrap.classList.toggle("hidden", !precisaAutorizacao);

  modalRetirada.classList.remove("hidden");
}

document.getElementById("modal-cancelar").addEventListener("click", () => {
  modalRetirada.classList.add("hidden");
  retiradaAlvoId = null;
});

document.getElementById("modal-confirmar").addEventListener("click", async () => {
  const data = document.getElementById("retirada-data").value;
  const responsavel = document.getElementById("retirada-responsavel").value.trim();
  if (!data || !responsavel) {
    showModal("Preencha a data e o responsável pela retirada.", { icon: "📝", title: "Campos obrigatórios" });
    return;
  }

  let autorizadoPor = null;
  if (currentUser.nome === "Alexandra") {
    const pinDigitado = autorizacaoPinInput.value.trim();
    autorizadoPor = AUTORIZADORES.find(nome => pins[nome] && pins[nome] === pinDigitado);
    if (!autorizadoPor) {
      showModal("PIN de autorização inválido. Peça para Bruno ou Isabella autorizar com o PIN deles.", { icon: "🔑", title: "Autorização necessária" });
      return;
    }
  }

  const r = registros.find(x => x.id === retiradaAlvoId);
  const dataRetirada = new Date(data).toISOString();

  const updates = {
    status: "retirado",
    dataRetirada: dataRetirada,
    retiradoPor: responsavel,
    confirmadoPorApp: currentUser.nome,
    autorizadoPor: autorizadoPor
  };

  await atualizarRegistroAPI(retiradaAlvoId, updates);

  // Atualizar lista local caso estejamos offline
  r.status = "retirado";
  r.dataRetirada = dataRetirada;
  r.retiradoPor = responsavel;
  r.confirmadoPorApp = currentUser.nome;
  r.autorizadoPor = autorizadoPor;

  modalRetirada.classList.add("hidden");
  retiradaAlvoId = null;
  renderDashboard();
});

// --- Modal foto ---
const modalFoto = document.getElementById("modal-foto");
function abrirModalFoto(src) {
  document.getElementById("modal-foto-img").src = src;
  modalFoto.classList.remove("hidden");
}
document.getElementById("modal-foto-fechar").addEventListener("click", () => {
  modalFoto.classList.add("hidden");
});

// --- Histórico com Paginação (#4) ---
const HIST_PER_PAGE = 20;
let histPaginaAtual = 1;

function renderHistorico() {
  const filtroLoja = document.getElementById("filtro-loja-hist").value;
  const filtroStatus = document.getElementById("filtro-status-hist").value;
  const busca = document.getElementById("busca-hist").value.trim().toLowerCase();

  let lista = [...registros].sort((a, b) => new Date(b.dataOperacao) - new Date(a.dataOperacao));
  if (filtroLoja) lista = lista.filter(r => r.loja === filtroLoja);
  if (filtroStatus) lista = lista.filter(r => r.status === filtroStatus);
  if (busca) {
    lista = lista.filter(r =>
      [r.loja, r.consultor, r.observacoes].some(v => (v || "").toLowerCase().includes(busca))
    );
  }

  // KPIs (#9)
  const totalRegistros = lista.length;
  const totalEnvelope = lista.filter(r => r.valorEnvelope != null).reduce((s, r) => s + (r.valorEnvelope || 0), 0);
  const qtdFechamentos = lista.filter(r => r.tipoOperacao === "Fechamento").length;
  const media = qtdFechamentos > 0 ? totalEnvelope / qtdFechamentos : 0;

  let kpiBar = document.getElementById("hist-kpi-bar");
  if (!kpiBar) {
    kpiBar = document.createElement("div");
    kpiBar.id = "hist-kpi-bar";
    kpiBar.className = "kpi-bar";
    const tableHeader = document.querySelector("#tab-historico .table-header");
    tableHeader.parentElement.insertBefore(kpiBar, tableHeader.nextSibling);
  }
  kpiBar.innerHTML = `
    <div class="kpi-item"><span class="kpi-value">${totalRegistros}</span><span class="kpi-label">Registros</span></div>
    <div class="kpi-item"><span class="kpi-value">${formatBRL(totalEnvelope)}</span><span class="kpi-label">Total Envelopes</span></div>
    <div class="kpi-item"><span class="kpi-value">${formatBRL(media)}</span><span class="kpi-label">Média/Fechamento</span></div>
    <div class="kpi-item"><span class="kpi-value">${qtdFechamentos}</span><span class="kpi-label">Fechamentos</span></div>
  `;

  // Paginação
  const totalPaginas = Math.max(1, Math.ceil(lista.length / HIST_PER_PAGE));
  if (histPaginaAtual > totalPaginas) histPaginaAtual = totalPaginas;
  const inicio = (histPaginaAtual - 1) * HIST_PER_PAGE;
  const paginada = lista.slice(inicio, inicio + HIST_PER_PAGE);

  const tbody = document.querySelector("#tabela-historico tbody");
  tbody.innerHTML = "";

  const statusLabel = {
    aberto: "Aberto",
    aguardando_retirada: "Aguardando retirada",
    retirado: "Retirado",
  };

  const isBruno = currentUser && currentUser.nome === "Bruno";

  paginada.forEach(r => {
    const tr = document.createElement("tr");
    let retiradaTexto = "—";
    if (r.dataRetirada) {
      retiradaTexto = `${formatDataHora(r.dataRetirada)} · ${r.retiradoPor}`;
      if (r.confirmadoPorApp) retiradaTexto += ` (confirmado por ${r.confirmadoPorApp}`;
      if (r.autorizadoPor) retiradaTexto += `, autorizado por ${r.autorizadoPor}`;
      if (r.confirmadoPorApp) retiradaTexto += `)`;
    }
    tr.innerHTML = `
      <td>${formatDataHora(r.dataOperacao)}</td>
      <td>${r.loja}</td>
      <td>${r.consultor}</td>
      <td>${formatBRL(r.fundoCaixa)}</td>
      <td>${r.valorEnvelope != null ? formatBRL(r.valorEnvelope) : "—"}</td>
      <td><span class="status-pill status-${r.status}">${statusLabel[r.status]}</span></td>
      <td>${retiradaTexto}</td>
      <td>${avisoCelula(r)}</td>
      <td>${fotoCelula(r)}</td>
      ${isBruno ? `<td><button class="btn-excluir" data-id="${r.id}">Excluir</button></td>` : ""}
    `;
    tbody.appendChild(tr);
  });

  document.getElementById("historico-vazio").classList.toggle("hidden", lista.length > 0);

  // Controles de paginação
  let paginacao = document.getElementById("hist-paginacao");
  if (!paginacao) {
    paginacao = document.createElement("div");
    paginacao.id = "hist-paginacao";
    paginacao.className = "paginacao";
    document.querySelector("#tabela-historico").closest(".table-wrap").appendChild(paginacao);
  }

  if (totalPaginas > 1) {
    paginacao.classList.remove("hidden");
    paginacao.innerHTML = `
      <button class="btn-pag" id="hist-prev" ${histPaginaAtual <= 1 ? "disabled" : ""}>← Anterior</button>
      <span class="pag-info">Página ${histPaginaAtual} de ${totalPaginas} (${lista.length} registros)</span>
      <button class="btn-pag" id="hist-next" ${histPaginaAtual >= totalPaginas ? "disabled" : ""}>Próxima →</button>
    `;
    document.getElementById("hist-prev").addEventListener("click", () => {
      if (histPaginaAtual > 1) { histPaginaAtual--; renderHistorico(); }
    });
    document.getElementById("hist-next").addEventListener("click", () => {
      if (histPaginaAtual < totalPaginas) { histPaginaAtual++; renderHistorico(); }
    });
  } else {
    paginacao.classList.add("hidden");
  }

  tbody.querySelectorAll(".thumb-btn").forEach(img => {
    img.addEventListener("click", () => abrirModalFoto(img.dataset.src));
  });

  tbody.querySelectorAll(".btn-excluir").forEach(btn => {
    btn.addEventListener("click", async () => {
      const confirmado = await showConfirm(
        "Deseja realmente apagar este registro permanentemente? Esta ação não pode ser desfeita.",
        { icon: "🗑️", title: "Excluir registro", confirmText: "Excluir", cancelText: "Cancelar", confirmClass: "btn-danger" }
      );
      if (confirmado) {
        const id = btn.dataset.id;
        const sucesso = await excluirRegistroAPI(id);
        if (sucesso) {
          showToast("Registro apagado com sucesso!", "sucesso");
          renderDashboard();
          renderHistorico();
          renderMensal();
        } else {
          showModal("Erro ao apagar registro ou você não possui permissão.", { icon: "❌", title: "Erro" });
        }
      }
    });
  });
}

document.getElementById("filtro-loja-hist").addEventListener("change", () => { histPaginaAtual = 1; renderHistorico(); });
document.getElementById("filtro-status-hist").addEventListener("change", () => { histPaginaAtual = 1; renderHistorico(); });
document.getElementById("busca-hist").addEventListener("input", () => { histPaginaAtual = 1; renderHistorico(); });

// --- Dashboard Mensal ---
function mesKey(iso) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function mesLabel(chave) {
  const [ano, mes] = chave.split("-");
  const nomes = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
  return `${nomes[Number(mes) - 1]}/${ano}`;
}

const mensalMesInput = document.getElementById("mensal-mes-filtro");
(function initMesFiltro() {
  const now = new Date();
  mensalMesInput.value = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
})();
mensalMesInput.addEventListener("change", renderMensal);

function renderMensal() {
  const fechamentos = registros.filter(r => r.tipoOperacao === "Fechamento");
  const mesSelecionado = mensalMesInput.value;

  const cardsWrap = document.getElementById("cards-lojas-mensal");
  cardsWrap.innerHTML = "";
  const totaisMes = {};

  LOJAS.forEach(loja => {
    const doMes = fechamentos.filter(r => r.loja === loja && mesKey(r.dataOperacao) === mesSelecionado);
    const total = doMes.reduce((s, r) => s + (r.valorEnvelope || 0), 0);
    totaisMes[loja] = total;

    const card = document.createElement("div");
    card.className = "loja-card";
    card.innerHTML = `
      <h4>${loja}</h4>
      <div class="valor">${formatBRL(total)}</div>
      <div class="meta"><span>${doMes.length} fechamento(s) no mês</span></div>
    `;
    cardsWrap.appendChild(card);
  });

  const barChart = document.getElementById("bar-chart-mensal");
  barChart.innerHTML = "";
  const maiorValor = Math.max(...Object.values(totaisMes), 1);
  LOJAS.forEach(loja => {
    const total = totaisMes[loja];
    const pct = Math.round((total / maiorValor) * 100);
    const row = document.createElement("div");
    row.className = "bar-row";
    row.innerHTML = `
      <span>${loja}</span>
      <div class="bar-track"><div class="bar-fill" style="width:${pct}%"></div></div>
      <span class="bar-value">${formatBRL(total)}</span>
    `;
    barChart.appendChild(row);
  });

  const somaPorMesLoja = {};
  fechamentos.forEach(r => {
    const chave = `${mesKey(r.dataOperacao)}|${r.loja}`;
    if (!somaPorMesLoja[chave]) somaPorMesLoja[chave] = { mes: mesKey(r.dataOperacao), loja: r.loja, total: 0, qtd: 0 };
    somaPorMesLoja[chave].total += r.valorEnvelope || 0;
    somaPorMesLoja[chave].qtd += 1;
  });

  const linhas = Object.values(somaPorMesLoja).sort((a, b) => b.mes.localeCompare(a.mes) || a.loja.localeCompare(b.loja));
  const tbody = document.querySelector("#tabela-mensal tbody");
  tbody.innerHTML = "";
  linhas.forEach(l => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${mesLabel(l.mes)}</td>
      <td>${l.loja}</td>
      <td>${formatBRL(l.total)}</td>
      <td>${l.qtd}</td>
    `;
    tbody.appendChild(tr);
  });

  document.getElementById("mensal-vazio").classList.toggle("hidden", linhas.length > 0);
}

// --- Exportar CSV ---
document.getElementById("btn-exportar").addEventListener("click", () => {
  const header = ["Data", "Loja", "Consultor", "Operacao", "Fundo Caixa", "Valor Envelope", "Status", "Data Retirada", "Retirado Por", "Confirmado Por", "Autorizado Por", "Mensagem Gerada", "Observacoes"];
  const linhas = registros.map(r => [
    formatDataHora(r.dataOperacao),
    r.loja,
    r.consultor,
    r.tipoOperacao,
    r.fundoCaixa,
    r.valorEnvelope ?? "",
    r.status,
    r.dataRetirada ? formatDataHora(r.dataRetirada) : "",
    r.retiradoPor ?? "",
    r.confirmadoPorApp ?? "",
    r.autorizadoPor ?? "",
    r.tipoOperacao === "Fechamento" ? (r.mensagemGerada ? "Sim" : "Não") : "",
    (r.observacoes ?? "").replace(/[\r\n,]/g, " "),
  ]);
  const csv = [header, ...linhas].map(l => l.map(c => `"${c}"`).join(",")).join("\n");
  const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `controle_caixa_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
});

// --- Init & Verificação Periódica de Rede ---
atualizarCamposPorOperacao();
inicializarDados();

// Polling suave de conectividade a cada 10 segundos
setInterval(checkApiConnection, 10000);

// ==========================================================================
// AUDITORIA (Rastreabilidade)
// ==========================================================================
async function carregarAuditoria() {
  if (currentUser?.role !== "owner") return;
  const tbody = document.querySelector("#tabela-auditoria tbody");
  const vazioMsg = document.getElementById("auditoria-vazio");
  const btnAtualizar = document.getElementById("btn-atualizar-auditoria");
  
  if (btnAtualizar) setLoading(btnAtualizar, true);
  
  try {
    const res = await fetch(`${API_BASE}/logs?usuario=${encodeURIComponent(currentUser.nome)}`);
    if (!res.ok) throw new Error("Sem permissão ou falha na API");
    const logs = await res.json();
    
    tbody.innerHTML = "";
    if (logs.length === 0) {
      vazioMsg.classList.remove("hidden");
    } else {
      vazioMsg.classList.add("hidden");
      logs.forEach(log => {
        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td>${new Date(log.data).toLocaleString("pt-BR")}</td>
          <td><b>${log.usuario}</b></td>
          <td><span class="status-pill ${log.acao === 'DELETE' ? 'status-aguardando_retirada' : 'status-retirado'}">${log.acao}</span></td>
          <td>${log.descricao}</td>
        `;
        tbody.appendChild(tr);
      });
    }
  } catch (err) {
    showToast("Erro ao carregar auditoria: " + err.message, "erro");
  } finally {
    if (btnAtualizar) setLoading(btnAtualizar, false);
  }
}

const btnAtualizarAuditoria = document.getElementById("btn-atualizar-auditoria");
if (btnAtualizarAuditoria) {
  btnAtualizarAuditoria.addEventListener("click", carregarAuditoria);
}

// ==========================================================================
// SESSÃO: TIMEOUT POR INATIVIDADE (#17)
// ==========================================================================
const SESSION_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutos
const SESSION_WARNING_MS = 25 * 60 * 1000; // aviso aos 25 min
let sessionTimer = null;
let sessionWarningTimer = null;
const SESSION_EVENTS = ["mousedown", "mousemove", "keydown", "touchstart", "scroll", "click"];

function resetSessionTimer() {
  if (!currentUser) return;
  clearTimeout(sessionTimer);
  clearTimeout(sessionWarningTimer);

  // Warning timer
  sessionWarningTimer = setTimeout(() => {
    showToast("Sua sessão será bloqueada em 5 minutos por inatividade.", "info");
  }, SESSION_WARNING_MS);

  // Lock timer
  sessionTimer = setTimeout(() => {
    lockSession();
  }, SESSION_TIMEOUT_MS);
}

function lockSession() {
  if (!currentUser) return;
  const overlay = document.getElementById("session-overlay");
  overlay.classList.remove("hidden");
  document.getElementById("session-pin").value = "";
  document.getElementById("session-msg").classList.add("hidden");
  document.getElementById("session-pin").focus();
}

// Event listeners para reset do timer
SESSION_EVENTS.forEach(evt => {
  document.addEventListener(evt, () => {
    if (currentUser && document.getElementById("session-overlay").classList.contains("hidden")) {
      resetSessionTimer();
    }
  }, { passive: true });
});

// Desbloquear sessão (usa API segura quando online)
document.getElementById("session-unlock").addEventListener("click", async () => {
  const pinDigitado = document.getElementById("session-pin").value.trim();
  const msg = document.getElementById("session-msg");

  if (!currentUser) return;

  let pinCorreto = false;

  if (API_ONLINE) {
    try {
      const res = await fetch(`${API_BASE}/auth/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ usuario: currentUser.nome, pin: pinDigitado })
      });
      const result = await res.json();
      pinCorreto = result.valid;
    } catch {
      // Fallback local
      pinCorreto = pins[currentUser.nome] && (pins[currentUser.nome] === '****' || pinDigitado === pins[currentUser.nome]);
    }
  } else {
    pinCorreto = pins[currentUser.nome] && (pins[currentUser.nome] === '****' || pinDigitado === pins[currentUser.nome]);
  }

  if (pinCorreto) {
    document.getElementById("session-overlay").classList.add("hidden");
    msg.classList.add("hidden");
    resetSessionTimer();
    showToast("Sessão desbloqueada!", "sucesso");
  } else {
    msg.textContent = "PIN incorreto. Tente novamente.";
    msg.classList.remove("hidden");
  }
});

// Logout da sessão bloqueada
document.getElementById("session-logout").addEventListener("click", () => {
  currentUser = null;
  localStorage.removeItem(USER_KEY);
  resetLoginForm();
  document.getElementById("session-overlay").classList.add("hidden");
  appEl.classList.add("hidden");
  loginOverlay.classList.remove("hidden");
});

// Enter no campo de PIN da sessão
document.getElementById("session-pin").addEventListener("keydown", e => {
  if (e.key === "Enter") document.getElementById("session-unlock").click();
});

// ==========================================================================
// RESUMO MATINAL (#6) — Apenas para Alexandra, Bruno e Isabella
// ==========================================================================
const RESUMO_KEY = "cacaushow_ultimo_resumo";
const RESUMO_USUARIOS = ["Alexandra", "Bruno", "Isabella"];

function mostrarResumoMatinal() {
  if (!currentUser || !RESUMO_USUARIOS.includes(currentUser.nome)) return;

  // Mostrar no máximo 1x por dia por usuário
  const hoje = new Date().toISOString().slice(0, 10);
  const ultimoResumo = carregarJSON(RESUMO_KEY, {});
  if (ultimoResumo[currentUser.nome] === hoje) return;

  const ontem = new Date();
  ontem.setDate(ontem.getDate() - 1);
  const hojeISO = new Date().toISOString();

  // Dados para o resumo
  const pendentes = registros.filter(r => r.status === "aguardando_retirada");
  const totalPendente = pendentes.reduce((s, r) => s + (r.valorEnvelope || 0), 0);
  const pendentesMaisAntigos = pendentes.filter(r => diffDias(r.dataOperacao) >= RISCO_DIAS);

  const semFechamentoOntem = LOJAS.filter(loja =>
    !registros.some(r => r.loja === loja && r.tipoOperacao === "Fechamento" && mesmoDia(r.dataOperacao, ontem.toISOString()))
  );

  const envelopesPorLoja = {};
  LOJAS.forEach(loja => {
    const doLoja = pendentes.filter(r => r.loja === loja);
    envelopesPorLoja[loja] = {
      qtd: doLoja.length,
      total: doLoja.reduce((s, r) => s + (r.valorEnvelope || 0), 0)
    };
  });

  // Montar mensagem
  let msg = `📊 Bom dia, ${currentUser.nome}! Aqui está o resumo operacional:\n\n`;
  msg += `💰 Total em trânsito: ${formatBRL(totalPendente)}\n`;
  msg += `📦 Envelopes pendentes: ${pendentes.length}\n`;

  if (pendentesMaisAntigos.length > 0) {
    msg += `\n🔴 ${pendentesMaisAntigos.length} envelope(s) há ${RISCO_DIAS}+ dias sem retirada!\n`;
  }

  if (semFechamentoOntem.length > 0 && semFechamentoOntem.length < LOJAS.length) {
    msg += `\n⚠ Lojas sem fechamento ontem: ${semFechamentoOntem.join(", ")}\n`;
  }

  msg += `\n📍 Detalhamento por loja:`;
  LOJAS.forEach(loja => {
    const info = envelopesPorLoja[loja];
    if (info.qtd > 0) {
      msg += `\n  • ${loja}: ${info.qtd} envelope(s) — ${formatBRL(info.total)}`;
    }
  });

  if (pendentes.length === 0) {
    msg += `\n\n✅ Todas as lojas em dia! Nenhum envelope pendente.`;
  }

  showModal(msg, {
    icon: "☀️",
    title: "Resumo Matinal",
    btnText: "Entendido"
  });

  // Marcar como exibido hoje
  ultimoResumo[currentUser.nome] = hoje;
  localStorage.setItem(RESUMO_KEY, JSON.stringify(ultimoResumo));
}

// ==========================================================================
// FILA DE SINCRONIZAÇÃO OFFLINE (#16)
// ==========================================================================
const SYNC_QUEUE_KEY = "cacaushow_sync_queue";

function getSyncQueue() {
  return carregarJSON(SYNC_QUEUE_KEY, []);
}

function addToSyncQueue(action) {
  const queue = getSyncQueue();
  queue.push({ ...action, timestamp: new Date().toISOString() });
  localStorage.setItem(SYNC_QUEUE_KEY, JSON.stringify(queue));
  atualizarBadgeSync();
}

function atualizarBadgeSync() {
  const queue = getSyncQueue();
  const badge = document.getElementById("sync-badge");
  if (badge) {
    if (queue.length > 0) {
      badge.textContent = queue.length;
      badge.classList.remove("hidden");
    } else {
      badge.classList.add("hidden");
    }
  }
}

async function processarFilaSync() {
  if (!API_ONLINE) return;
  const queue = getSyncQueue();
  if (queue.length === 0) return;

  console.log(`Sincronizando ${queue.length} operação(ões) pendentes...`);
  const failed = [];

  for (const item of queue) {
    try {
      let res;
      if (item.type === "CREATE") {
        res = await fetch(`${API_BASE}/registros?usuario=${encodeURIComponent(item.usuario || "")}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(item.data)
        });
      } else if (item.type === "UPDATE") {
        res = await fetch(`${API_BASE}/registros/${item.id}?usuario=${encodeURIComponent(item.usuario || "")}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(item.data)
        });
      } else if (item.type === "PIN") {
        res = await fetch(`${API_BASE}/pins`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(item.data)
        });
      }

      if (!res || !res.ok) {
        failed.push(item);
      }
    } catch {
      failed.push(item);
    }
  }

  localStorage.setItem(SYNC_QUEUE_KEY, JSON.stringify(failed));
  atualizarBadgeSync();

  if (failed.length === 0 && queue.length > 0) {
    showToast(`${queue.length} registro(s) sincronizado(s) com sucesso!`, "sucesso");
  } else if (failed.length > 0) {
    showToast(`${queue.length - failed.length} sincronizado(s), ${failed.length} pendente(s).`, "info");
  }
}

// Tentar sincronizar quando a API voltar online
const _originalCheckApi = checkApiConnection;
checkApiConnection = async function() {
  const wasOffline = !API_ONLINE;
  await _originalCheckApi();
  if (wasOffline && API_ONLINE) {
    processarFilaSync();
  }
};

// Badge de sync pendente
atualizarBadgeSync();
