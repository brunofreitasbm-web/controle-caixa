// ==========================================================================
// Controle de Caixa
// Banco de dados centralizado via API. Fallback para LocalStorage se offline.
// ==========================================================================

let API_BASE = window.location.protocol === "file:"
  ? "http://localhost:5000/api"
  : "/api";
const STORAGE_KEY = "cacaushow_controle_caixa_v1";
const USER_KEY = "cacaushow_current_user";
const PIN_KEY = "cacaushow_pins_v1";
const CONFIG_KEY = "cacaushow_config_v2";
const THEME_KEY = "cacaushow_theme";
const RISCO_DIAS = 2; // envelope aguardando retirada por mais de N dias = alerta
let sessionTimeoutMs = 30 * 60 * 1000; // 30 minutos por padrão (carregado dinamicamente do config)

const LOJAS = ["Marambaia", "Icoaraci", "Mário Covas", "Venda Direta"];
const LOJAS_FA = ["Grão Pará", "ParqueShopping", "Parque Circuito"];

// --- CONFIGURAÇÃO MANUAL DOS GRUPOS DE WHATSAPP ---
// Cole aqui o link de convite do grupo do WhatsApp de cada loja.
// Para extrair o link de convite:
// 1. No WhatsApp, abra o grupo da loja correspondente.
// 2. Clique no nome do grupo no topo para abrir os dados do grupo.
// 3. Clique em "Convidar via link" (ou "Invite via link").
// 4. Copiar link (ex: https://chat.whatsapp.com/...) e cole abaixo dentro das aspas.
let WHATSAPP_GRUPOS = {
  "Marambaia": "https://chat.whatsapp.com/HMdUcq1xcoEHj0Z5TUSX7I",
  "Icoaraci": "https://chat.whatsapp.com/Jc5ORUEzXNH5TNYfTZSKsp",
  "Mário Covas": "https://chat.whatsapp.com/EL12D3ceZOPLEColPZZhvF",
  "Venda Direta": "https://chat.whatsapp.com/F8YcLG5nVOtIxjLltT3Tn4"
};

// Grupos WhatsApp do FaçaAmigos (preencher quando disponibilizar os links)
let WHATSAPP_GRUPOS_FA = {
  "Grão Pará": "",       // TODO: cole o link do grupo Grão Pará aqui
  "ParqueShopping": "https://chat.whatsapp.com/LpA1OZEKr0aCyLf0GoUXyt",  // TODO: cole o link do grupo ParqueShopping aqui
  "Parque Circuito": ""  // TODO: cole o link do grupo Parque Circuito aqui
};

// Perfis de acesso:
// consultora            -> só "Novo Registro"
// consultora_dashboard   -> "Novo Registro" + "Dashboard de Envelopes"
// owner                  -> tudo (Registro, Dashboard, Histórico, Mensal)
// consultora_fa          -> apenas aba "faca-amigos" (só Registro FA)
let USERS = [
  { nome: "Ana Júlia", role: "consultora" },
  { nome: "Vitória", role: "consultora" },
  { nome: "Débora", role: "consultora" },
  { nome: "Alexandra", role: "consultora_dashboard" },
  { nome: "LiderOP", role: "consultora_dashboard" },
  { nome: "Janine", role: "consultora" },
  { nome: "Estheffany", role: "consultora" },
  { nome: "Sabrina", role: "consultora" },
  { nome: "Treinamento Cacau Show", role: "consultora" },
  { nome: "Alice", role: "consultora_fa" },
  { nome: "Alessandra", role: "consultora_fa" },
  { nome: "Treinamento Faça Amigos", role: "consultora_fa" },
  { nome: "Isabella", role: "owner" },
  { nome: "Bruno", role: "owner" },
];

const TABS_POR_ROLE = {
  consultora: ["registro", "conferencia-nfe", "inventario-estoque", "configuracoes"],
  consultora_dashboard: ["registro", "dashboard", "historico", "conferencia-nfe", "inventario-estoque", "boletos", "configuracoes"],
  consultora_fa: ["faca-amigos", "configuracoes"],
  owner: ["registro", "dashboard", "historico", "mensal", "auditoria", "faca-amigos", "colaboradores", "rh-modulo", "conferencia-nfe", "inventario-estoque", "boletos", "auditoria-boletos", "configuracoes"],
};

// Mapeamento de perfis para as preferências de notificação
const ROLE_NOTIF_MAP = {
  "consultora": "colab",
  "consultora_dashboard": "lider",
  "consultora_fa": "colab",
  "owner": "owner"
};

// Notificação por tipo e perfil (default: tudo ativado via Email)
const DEFAULT_NOTIF_PREFS = {
  "envelopes": { colab: true, lider: true, owner: true, colab_ch: "email", lider_ch: "email", owner_ch: "email" },
  "inv-inicio": { colab: true, lider: true, owner: true, colab_ch: "email", lider_ch: "email", owner_ch: "email" },
  "inv-fim": { colab: true, lider: true, owner: true, colab_ch: "email", lider_ch: "email", owner_ch: "email" },
  "nfe": { colab: true, lider: true, owner: true, colab_ch: "email", lider_ch: "email", owner_ch: "email" },
  "divergencia": { colab: true, lider: true, owner: true, colab_ch: "email", lider_ch: "email", owner_ch: "email" }
};
const NOTIF_PREFS_KEY = "cacaushow_notif_prefs_v1";
// Chave mestra de notificações de eventos (email + push). Default: desativada.
const NOTIF_MASTER_KEY = "cacaushow_notif_master_v1";

function notifMasterFromValue(valor) {
  const v = String(valor == null ? "" : valor).trim().toLowerCase();
  return v === "1" || v === "true";
}

function loadNotifMasterEnabled() {
  return notifMasterFromValue(localStorage.getItem(NOTIF_MASTER_KEY));
}

// ==========================================================================
// UI Helpers (Toast, Loading, Modal, Session)
// ==========================================================================
function showToast(mensagem, tipo = "info") {
  const container = document.getElementById("toast-container");
  if (!container) return;
  const toast = document.createElement("div");
  toast.className = `toast ${tipo}`;

  let icon = '<i class="fa-solid fa-circle-info"></i>';
  if (tipo === "sucesso") icon = '<i class="fa-solid fa-circle-check" style="color: var(--green);"></i>';
  if (tipo === "erro") icon = '<i class="fa-solid fa-circle-xmark" style="color: var(--red);"></i>';

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
  e.target.value = "R$ " + value;
  // Dispara evento de change para que a validação/autosave em tempo real rode
  e.target.dispatchEvent(new Event("change", { bubbles: true }));
}

function parseMoeda(str) {
  if (!str) return 0;
  if (typeof str === "number") return str;
  const clean = str.replace(/[^0-9,-]/g, "");
  if (!clean) return 0;
  return parseFloat(clean.replace(/\./g, "").replace(",", "."));
}

document.getElementById("fundo-caixa").addEventListener("input", formatarMoedaInput);
document.getElementById("valor-envelope").addEventListener("input", formatarMoedaInput);
// Campos FA
document.getElementById("fa-fundo-caixa").addEventListener("input", formatarMoedaInput);
document.getElementById("fa-valor-envelope").addEventListener("input", formatarMoedaInput);

// --- Rascunho / Autosave dos formulários no localStorage ---
function salvarRascunhosForm() {
  const rascunhoCaixa = {
    consultor: document.getElementById("consultor").value,
    loja: document.getElementById("loja").value,
    dataOperacao: document.getElementById("data-operacao").value,
    tipoOperacao: tipoOperacaoSelecionado,
    fundoCaixa: document.getElementById("fundo-caixa").value,
    valorEnvelope: document.getElementById("valor-envelope").value,
    observacoes: document.getElementById("observacoes").value
  };
  localStorage.setItem("rascunho_registro_caixa", JSON.stringify(rascunhoCaixa));
}

function salvarRascunhosFormFA() {
  const rascunhoFa = {
    consultor: document.getElementById("fa-consultor").value,
    loja: document.getElementById("fa-loja").value,
    dataOperacao: document.getElementById("fa-data-operacao").value,
    tipoOperacao: faTipoOperacaoSelecionado,
    fundoCaixa: document.getElementById("fa-fundo-caixa").value,
    valorEnvelope: document.getElementById("fa-valor-envelope").value,
    observacoes: document.getElementById("fa-observacoes").value
  };
  localStorage.setItem("rascunho_registro_fa", JSON.stringify(rascunhoFa));
}

function restaurarRascunhosForm() {
  try {
    const rawCaixa = localStorage.getItem("rascunho_registro_caixa");
    if (rawCaixa) {
      const data = JSON.parse(rawCaixa);
      if (data.consultor) document.getElementById("consultor").value = data.consultor;
      if (data.loja) document.getElementById("loja").value = data.loja;
      if (data.dataOperacao) document.getElementById("data-operacao").value = data.dataOperacao;
      if (data.tipoOperacao) {
        tipoOperacaoSelecionado = data.tipoOperacao;
        document.querySelectorAll("#tipo-operacao .seg-btn").forEach(b => {
          b.classList.toggle("active", b.dataset.value === tipoOperacaoSelecionado);
        });
        atualizarCamposPorOperacao();
      }
      if (data.fundoCaixa) document.getElementById("fundo-caixa").value = data.fundoCaixa;
      if (data.valorEnvelope) document.getElementById("valor-envelope").value = data.valorEnvelope;
      if (data.observacoes) document.getElementById("observacoes").value = data.observacoes;
    }
  } catch (e) {
    console.error("Erro ao restaurar rascunho Caixa:", e);
  }

  try {
    const rawFa = localStorage.getItem("rascunho_registro_fa");
    if (rawFa) {
      const data = JSON.parse(rawFa);
      if (data.consultor) document.getElementById("fa-consultor").value = data.consultor;
      if (data.loja) document.getElementById("fa-loja").value = data.loja;
      if (data.dataOperacao) document.getElementById("fa-data-operacao").value = data.dataOperacao;
      if (data.tipoOperacao) {
        faTipoOperacaoSelecionado = data.tipoOperacao;
        document.querySelectorAll("#fa-tipo-operacao .seg-btn").forEach(b => {
          b.classList.toggle("active", b.dataset.value === faTipoOperacaoSelecionado);
        });
        atualizarFaCamposPorOperacao();
      }
      if (data.fundoCaixa) document.getElementById("fa-fundo-caixa").value = data.fundoCaixa;
      if (data.valorEnvelope) document.getElementById("fa-valor-envelope").value = data.valorEnvelope;
      if (data.observacoes) document.getElementById("fa-observacoes").value = data.observacoes;
    }
  } catch (e) {
    console.error("Erro ao restaurar rascunho FA:", e);
  }
}

function inicializarAutosaveForm() {
  const fieldsCaixa = ["consultor", "loja", "data-operacao", "fundo-caixa", "valor-envelope", "observacoes"];
  fieldsCaixa.forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener("input", salvarRascunhosForm);
      el.addEventListener("change", salvarRascunhosForm);
    }
  });

  const fieldsFa = ["fa-consultor", "fa-loja", "fa-data-operacao", "fa-fundo-caixa", "fa-valor-envelope", "fa-observacoes"];
  fieldsFa.forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener("input", salvarRascunhosFormFA);
      el.addEventListener("change", salvarRascunhosFormFA);
    }
  });

  // Salvar rascunho ao selecionar operação
  document.querySelectorAll("#tipo-operacao .seg-btn").forEach(btn => {
    btn.addEventListener("click", salvarRascunhosForm);
  });
  document.querySelectorAll("#fa-tipo-operacao .seg-btn").forEach(btn => {
    btn.addEventListener("click", salvarRascunhosFormFA);
  });
}

// --- Pré-seleção Baseada em Horário para Abertura/Fechamento ---
function preselecionarOperacaoPorHorario() {
  const hour = new Date().getHours();
  const operacaoSugerida = hour < 13 ? "Abertura" : "Fechamento";

  const rascunhoCaixa = localStorage.getItem("rascunho_registro_caixa");
  if (!rascunhoCaixa) {
    const btnCacau = document.querySelector(`#tipo-operacao .seg-btn[data-value="${operacaoSugerida}"]`);
    if (btnCacau) {
      document.querySelectorAll("#tipo-operacao .seg-btn").forEach(b => b.classList.remove("active"));
      btnCacau.classList.add("active");
      tipoOperacaoSelecionado = operacaoSugerida;
      atualizarCamposPorOperacao();
    }
  }

  const rascunhoFa = localStorage.getItem("rascunho_registro_fa");
  if (!rascunhoFa) {
    const btnFa = document.querySelector(`#fa-tipo-operacao .seg-btn[data-value="${operacaoSugerida}"]`);
    if (btnFa) {
      document.querySelectorAll("#fa-tipo-operacao .seg-btn").forEach(b => b.classList.remove("active"));
      btnFa.classList.add("active");
      faTipoOperacaoSelecionado = operacaoSugerida;
      atualizarFaCamposPorOperacao();
    }
  }
}

// --- Limpeza Visual e Comportamento dos Erros Inline ---
function limparErrosInline(prefix = "") {
  const ids = ["consultor", "loja", "tipo-operacao", "data-operacao", "fundo-caixa", "valor-envelope", "foto-envelope"];
  ids.forEach(id => {
    const fullId = prefix ? `${prefix}-${id}` : id;
    const el = document.getElementById(fullId);
    if (el) el.classList.remove("input-error");
    const errEl = document.getElementById(`${fullId}-error`);
    if (errEl) errEl.classList.add("hidden");
  });
}

function registrarLimparErroAoDigitar() {
  const ids = ["consultor", "loja", "tipo-operacao", "data-operacao", "fundo-caixa", "valor-envelope", "foto-envelope",
               "fa-consultor", "fa-loja", "fa-tipo-operacao", "fa-data-operacao", "fa-fundo-caixa", "fa-valor-envelope", "fa-foto-envelope"];
  ids.forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      const handler = () => {
        el.classList.remove("input-error");
        const errEl = document.getElementById(`${id}-error`);
        if (errEl) errEl.classList.add("hidden");
      };
      el.addEventListener("input", handler);
      el.addEventListener("change", handler);
    }
  });
  document.querySelectorAll("#tipo-operacao .seg-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.getElementById("tipo-operacao").classList.remove("input-error");
      const err = document.getElementById("tipo-operacao-error");
      if (err) err.classList.add("hidden");
    });
  });
  document.querySelectorAll("#fa-tipo-operacao .seg-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.getElementById("fa-tipo-operacao").classList.remove("input-error");
      const err = document.getElementById("fa-tipo-operacao-error");
      if (err) err.classList.add("hidden");
    });
  });
}

// Só essas pessoas podem confirmar a retirada física do dinheiro.
// Alexandra (Líder de Operações) precisa de autorização (PIN) de Bruno ou Isabella.
const RETIRADA_PERMITIDA = ["Bruno", "Isabella", "Alexandra", "LiderOP"];
const AUTORIZADORES = ["Bruno", "Isabella"];

let API_ONLINE = false;
let registros = [];
let registrosFA = []; // Registros FaçaAmigos (isolados)
let pins = {};
let config = { linkGrupo: "" };
let currentUser = carregarJSON(USER_KEY, null);

let tipoOperacaoSelecionado = null;
let fotoDataUrl = null;
let retiradaAlvoId = null;

// Estado específico do FaçaAmigos
let faTipoOperacaoSelecionado = null;
let faFotoDataUrl = null;
let faRetiradaAlvoId = null;

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
  const endpoints = [
    API_BASE,
    "http://localhost:5000/api",
    "http://127.0.0.1:5000/api"
  ];

  for (const ep of endpoints) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 4000);
      const res = await fetch(`${ep}/config`, { method: "GET", signal: controller.signal });
      clearTimeout(timeoutId);

      if (res && res.ok) {
        if (!API_ONLINE) console.log(`API Backend conectada via ${ep}!`);
        API_BASE = ep;
        API_ONLINE = true;
        offlineBanner.style.display = "none";
        offlineBanner.classList.remove("server-down");
        return true;
      }
    } catch (e) {
      // Tentar próximo endpoint
    }
  }

  if (API_ONLINE || offlineBanner.style.display !== "block") {
    console.warn("API Backend offline. Executando modo offline com armazenamento local.");
  }
  API_ONLINE = false;
  
  if (!navigator.onLine) {
    offlineBanner.classList.remove("server-down");
    offlineBanner.innerHTML = '<i class="fa-solid fa-wifi-slash"></i> Sem conexão com a internet. O app está rodando offline e sincronizará quando a rede voltar.';
  } else {
    offlineBanner.classList.add("server-down");
    offlineBanner.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i> Alerta: Servidor indisponível. Algumas funções podem falhar. Entre em contato com o suporte.';
  }
  
  offlineBanner.style.display = "block";
  return false;
}

const defaultNotifRules = {
  envelopes: { colab: false, lider: true, owner: true },
  inventario_inicio: { colab: false, lider: true, owner: true },
  inventario_conclusao: { colab: false, lider: true, owner: true },
  conferencia_nfe: { colab: false, lider: true, owner: true },
  divergencia_caixa: { colab: false, lider: true, owner: true }
};

function getDestinatariosNotificacao(tipo) {
  // Mapeamento de tipo de notificação para chave nas preferências
  const notifTypeMap = {
    'conferencia_nfe': 'nfe',
    'inventario_inicio': 'inv-inicio',
    'inventario_fim': 'inv-fim',
    'envelopes': 'envelopes',
    'divergencia': 'divergencia'
  };

  const prefKey = notifTypeMap[tipo] || tipo;
  const prefs = loadNotificationPrefs();
  const typeRules = prefs[prefKey] || { colab: false, lider: true, owner: true };

  const rolesPermitidos = [];
  if (typeRules.colab) {
    rolesPermitidos.push('consultora', 'consultora_fa');
  }
  if (typeRules.lider) {
    rolesPermitidos.push('consultora_dashboard');
  }
  if (typeRules.owner) {
    rolesPermitidos.push('owner');
  }

  return USERS.filter(u => rolesPermitidos.includes(u.role)).map(u => u.nome);
}

// --- Sincronização Inicial ---
async function inicializarDados() {
  await checkApiConnection();

  if (API_ONLINE) {
    try {
      const resReg = await fetch(`${API_BASE}/registros`);
      const dataReg = await resReg.json();
      registros = Array.isArray(dataReg) ? dataReg : [];
      localStorage.setItem(STORAGE_KEY, JSON.stringify(registros));

      // Carregar registros FA
      const resRegFA = await fetch(`${API_BASE}/registros-fa`);
      const dataRegFA = await resRegFA.json();
      registrosFA = Array.isArray(dataRegFA) ? dataRegFA : [];

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

      // Sincronizar preferências de notificação do servidor para local
      if (config.notificacoes_config) {
        try {
          const serverPrefs = JSON.parse(config.notificacoes_config);
          localStorage.setItem(NOTIF_PREFS_KEY, JSON.stringify(serverPrefs));
        } catch (e) {
          console.error("Erro ao sincronizar notificacoes_config do servidor:", e);
        }
      }

      // Chave mestra de notificações de eventos (default: desativada)
      localStorage.setItem(NOTIF_MASTER_KEY, notifMasterFromValue(config.notificacoes_eventos_ativas) ? "1" : "0");
      renderNotificationTable();

      // Carregar lista de colaboradores cadastrados
      await carregarColaboradores();

      // Carregar NF-es do servidor — merge com dados locais
      try {
        const resNfs = await fetch(`${API_BASE}/nfs`);
        if (resNfs.ok) {
          const dataNfs = await resNfs.json();
          const serverNfs = {};
          dataNfs.forEach(nf => {
            if (!nf || !nf.numero) return;
            if (!nf.info) nf.info = {};
            if (nf.info.rawEmissaoDate) {
              nf.info.rawEmissaoDate = new Date(nf.info.rawEmissaoDate);
            }
            if (Array.isArray(nf.products)) {
              nf.products.forEach(p => {
                if (p.validade) p.validade = new Date(p.validade);
              });
            }
            const store = nf.info.targetStore ? nf.info.targetStore.toString() : '9175';
            nf.info.targetStore = store;
            const key = `${nf.numero.toString().trim()}_${store}`;
            serverNfs[key] = { info: nf.info, products: Array.isArray(nf.products) ? nf.products : [] };
          });
          // Merge: server wins over stale local data
          importedNfs = Object.assign({}, importedNfs, serverNfs);
          localStorage.setItem("cacaushow_imported_nfs", JSON.stringify(importedNfs));
        }
      } catch (nfErr) {
        console.error("Erro ao sincronizar NF-es do servidor:", nfErr);
      }
    } catch (e) {
      console.error("Erro ao puxar dados da API:", e);
      carregarDadosLocais();
    }
  } else {
    carregarDadosLocais();
    carregarColaboradores();
  }

  renderApp();
  // Sinaliza que os dados do servidor foram carregados — DOMContentLoaded vai renderizar
  window._nfsServerLoaded = true;
  if (typeof renderNfCardsGallery === 'function') {
    try { renderNfCardsGallery(); } catch(e) { /* DOM pode não estar pronto ainda */ }
  }
}

const STORAGE_KEY_FA = "cacaushow_controle_caixa_fa_v1";

function carregarDadosLocais() {
  registros = carregarJSON(STORAGE_KEY, []);
  registrosFA = carregarJSON(STORAGE_KEY_FA, []);
  pins = carregarJSON(PIN_KEY, {});
  config = carregarJSON(CONFIG_KEY, { linkGrupo: "" });
}

// --- Salvar dados ---
async function salvarRegistroAPI(reg) {
  if (currentUser && currentUser.nome && currentUser.nome.includes("Treinamento")) {
    console.log("Modo Treinamento: Registro não armazenado no Banco de Dados/LocalStorage.");
    return true; // Retorna sucesso sem persistir
  }
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

// ==================== FAÇAAMIGOS API FUNCTIONS ====================

async function salvarRegistroFAAPI(reg) {
  if (currentUser && currentUser.nome && currentUser.nome.includes("Treinamento")) {
    console.log("Modo Treinamento FA: Registro não armazenado no Banco de Dados/LocalStorage.");
    return true; // Retorna sucesso sem persistir
  }
  if (API_ONLINE) {
    try {
      const res = await fetch(`${API_BASE}/registros-fa?usuario=${encodeURIComponent(currentUser ? currentUser.nome : "")}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(reg)
      });
      if (res.ok) return true;
    } catch (e) {
      console.error("Erro ao salvar registro FA na API:", e);
    }
  }
  // Fallback Local
  registrosFA.push(reg);
  localStorage.setItem(STORAGE_KEY_FA, JSON.stringify(registrosFA));
  return false;
}

async function atualizarRegistroFAAPI(id, dados) {
  if (API_ONLINE) {
    try {
      const res = await fetch(`${API_BASE}/registros-fa/${id}?usuario=${encodeURIComponent(currentUser ? currentUser.nome : "")}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(dados)
      });
      if (res.ok) return true;
    } catch (e) {
      console.error("Erro ao atualizar registro FA na API:", e);
    }
  }
  // Fallback Local
  const idx = registrosFA.findIndex(r => r.id === id);
  if (idx !== -1) {
    registrosFA[idx] = { ...registrosFA[idx], ...dados };
    localStorage.setItem(STORAGE_KEY_FA, JSON.stringify(registrosFA));
  }
  return false;
}

async function excluirRegistroFAAPI(id) {
  let excluido = false;
  if (API_ONLINE) {
    try {
      const res = await fetch(`${API_BASE}/registros-fa/${id}?usuario=${encodeURIComponent(currentUser ? currentUser.nome : "")}`, {
        method: "DELETE"
      });
      if (res.ok) excluido = true;
    } catch (e) {
      console.error("Erro ao excluir registro FA na API:", e);
    }
  } else {
    excluido = true;
  }

  if (excluido) {
    const idx = registrosFA.findIndex(r => r.id === id);
    if (idx !== -1) {
      registrosFA.splice(idx, 1);
      localStorage.setItem(STORAGE_KEY_FA, JSON.stringify(registrosFA));
    }
    return true;
  }
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
// TEMA & CONFIGURAÇÕES GERAIS (HUB de Operações)
// ==========================================================================
function aplicarTema() {
  // Modo escuro removido: o app opera exclusivamente no tema claro.
  document.documentElement.setAttribute("data-theme", "light");
}

function aplicarCorDestaque(color) {
  if (!color) return;
  document.documentElement.style.setProperty('--wine', color);
  document.documentElement.style.setProperty('--wine-light', color + 'ee');
  // Destacar botão ativo no painel
  document.querySelectorAll(".config-accent-btn").forEach(btn => {
    if (btn.dataset.accent === color) {
      btn.style.outline = "2px solid #ffffff";
      btn.style.transform = "scale(1.15)";
    } else {
      btn.style.outline = "none";
      btn.style.transform = "scale(1)";
    }
  });
}

function carregarConfiguracoes() {
  config = carregarJSON(CONFIG_KEY, {
    linkGrupo: "",
    accentColor: "#56707f",
    sessionTimeout: 1800,
    whatsappGrupos: {},
    whatsappGruposFa: {}
  });

  // Migração: navegadores com a antiga cor de marca (marrom cacau) salva localmente
  // passam a usar o novo acento neutro padrão automaticamente.
  if (config.accentColor === "#5c3a21") {
    config.accentColor = "#56707f";
    localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
  }

  // Aplicar Tema (sempre claro)
  aplicarTema();

  // Aplicar Cor
  aplicarCorDestaque(config.accentColor || "#56707f");

  // Configurar timeout da sessão
  const timeoutVal = parseInt(config.sessionTimeout !== undefined ? config.sessionTimeout : 1800);
  if (timeoutVal === 0) {
    sessionTimeoutMs = 0;
  } else {
    sessionTimeoutMs = timeoutVal * 1000;
  }

  // Sobrescrever grupos de WhatsApp com os links salvos no config
  if (config.whatsappGrupos) {
    Object.assign(WHATSAPP_GRUPOS, config.whatsappGrupos);
  }
  if (config.whatsappGruposFa) {
    Object.assign(WHATSAPP_GRUPOS_FA, config.whatsappGruposFa);
  }
}

// Inicializar carregamento de configurações e aplicar imediatamente
(function initConfiguracoes() {
  carregarConfiguracoes();
})();


// ==========================================================================
// LOGIN / PERFIS / PIN
// ==========================================================================
const loginOverlay = document.getElementById("login-overlay");
const loginStepCards = document.getElementById("login-step-cards");
const loginStepPin = document.getElementById("login-step-pin");
const loginUserGrid = document.getElementById("login-user-grid");
const loginBackBtn = document.getElementById("login-back-btn");
const loginUsuarioNomeSpan = document.getElementById("login-usuario-nome");
const loginUsuarioAvatar = document.getElementById("login-usuario-avatar");
const loginPinLabel = document.getElementById("login-pin-label");
const loginPinInput = document.getElementById("login-pin");
const loginPinConfirmWrap = document.getElementById("login-pin-confirm-wrap");
const loginPinConfirmInput = document.getElementById("login-pin-confirm");
const loginMsg = document.getElementById("login-msg");
const loginEntrarBtn = document.getElementById("login-entrar");
const appEl = document.getElementById("app");

let loginUsuarioSelecionado = null;

// Emojis amigáveis/carinhosos para o avatar de cada colaborador(a) — sem
// nenhuma relação com aparência ou características pessoais. A escolha é
// estável por nome (mesma pessoa sempre vê o mesmo emoji).
const EMOJIS_AMIGAVEIS = ['😊', '🤗', '🥰', '😄', '✨', '🌟', '💛', '🌸', '🍀', '🌻', '💫', '🌈', '😇', '🧡'];

function getEmojiUsuario(nome) {
  let hash = 0;
  for (let i = 0; i < nome.length; i++) {
    hash = (hash * 31 + nome.charCodeAt(i)) >>> 0;
  }
  return EMOJIS_AMIGAVEIS[hash % EMOJIS_AMIGAVEIS.length];
}

function renderLoginUserGrid() {
  loginUserGrid.innerHTML = "";
  USERS.forEach(u => {
    const card = document.createElement("button");
    card.type = "button";
    card.className = "login-user-card";
    card.setAttribute("role", "listitem");
    card.innerHTML = `
      <span class="login-user-avatar">${getEmojiUsuario(u.nome)}</span>
      <span class="login-user-name">${u.nome}</span>
    `;
    card.addEventListener("click", () => selecionarUsuarioLogin(u.nome));
    loginUserGrid.appendChild(card);
  });
}
renderLoginUserGrid();

function selecionarUsuarioLogin(nome) {
  loginUsuarioSelecionado = nome;
  loginMsg.classList.add("hidden");
  loginUsuarioNomeSpan.textContent = nome;
  loginUsuarioAvatar.textContent = getEmojiUsuario(nome);
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

  loginStepCards.classList.remove("slide-out-left");
  loginStepPin.classList.remove("slide-in-right");
  loginStepCards.classList.add("slide-out-left");
  
  setTimeout(() => {
    loginStepCards.classList.add("hidden");
    loginStepCards.classList.remove("slide-out-left");
    loginStepPin.classList.remove("hidden");
    loginStepPin.classList.add("slide-in-right");
    
    // Reset/clear dots for new input
    updatePinDots(loginPinInput, "pin-dots-login");
    updatePinDots(loginPinConfirmInput, "pin-dots-confirm");
    
    setTimeout(() => loginPinInput.focus(), 50);
  }, 200);
}

loginBackBtn.addEventListener("click", () => {
  loginUsuarioSelecionado = null;
  loginStepPin.classList.remove("slide-in-right");
  loginStepPin.classList.add("hidden");
  loginStepCards.classList.remove("hidden");
  loginStepCards.classList.add("slide-in-right");
  loginMsg.classList.add("hidden");
  
  loginPinInput.value = "";
  loginPinConfirmInput.value = "";
  updatePinDots(loginPinInput, "pin-dots-login");
  updatePinDots(loginPinConfirmInput, "pin-dots-confirm");
  
  setTimeout(() => {
    loginStepCards.classList.remove("slide-in-right");
  }, 350);
});

function pinValido(v) { return /^\d{4}$/.test(v); }

function resetLoginForm() {
  loginUsuarioSelecionado = null;
  loginPinInput.value = "";
  loginPinConfirmInput.value = "";
  updatePinDots(loginPinInput, "pin-dots-login");
  updatePinDots(loginPinConfirmInput, "pin-dots-confirm");
  loginPinConfirmWrap.classList.add("hidden");
  loginMsg.classList.add("hidden");
  loginEntrarBtn.textContent = "Entrar";
  loginStepPin.classList.add("hidden");
  loginStepCards.classList.remove("hidden");
}

loginEntrarBtn.addEventListener("click", async () => {
  const nome = loginUsuarioSelecionado;
  if (!nome) { mostrarErroLogin("Selecione seu nome."); return; }
  const user = USERS.find(u => u.nome === nome);
  const pinDigitado = loginPinInput.value.trim();

  // Se o campo de confirmação NÃO está escondido, o usuário está criando seu PIN
  const ehCriacao = !loginPinConfirmWrap.classList.contains("hidden");

  if (ehCriacao) {
    const confirma = loginPinConfirmInput.value.trim();
    if (!pinValido(pinDigitado)) { mostrarErroLogin("O PIN deve ter exatamente 4 dígitos."); return; }
    if (pinDigitado !== confirma) { mostrarErroLogin("Os PINs não conferem."); return; }
    await salvarPinAPI(nome, pinDigitado);
    pins[nome] = '****';
    localStorage.setItem(PIN_KEY, JSON.stringify(pins));
  } else {
    // Autenticação com PIN existente
    if (API_ONLINE) {
      try {
        const res = await fetch(`${API_BASE}/auth/verify`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ usuario: nome, pin: pinDigitado })
        });
        const result = await res.json();
        if (result.hasPin === false) {
          delete pins[nome];
          localStorage.setItem(PIN_KEY, JSON.stringify(pins));
          loginPinLabel.textContent = "Crie seu PIN (4 dígitos)";
          loginPinConfirmWrap.classList.remove("hidden");
          loginEntrarBtn.textContent = "Criar PIN e Entrar";
          mostrarErroLogin("Usuário não possui PIN. Por favor, crie seu PIN e confirme.");
          return;
        }
        if (!result.valid) {
          mostrarErroLogin("PIN incorreto.");
          return;
        }
      } catch (e) {
        if (pins[nome] && pins[nome] !== '****' && pinDigitado !== pins[nome]) {
          mostrarErroLogin("PIN incorreto.");
          return;
        }
      }
    } else {
      if (pins[nome] && pins[nome] !== '****' && pinDigitado !== pins[nome]) {
        mostrarErroLogin("PIN incorreto.");
        return;
      }
    }
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
  atualizarNotificacoes();
});

function entrarNoApp() {
  loginOverlay.classList.add("hidden");
  document.getElementById("session-overlay").classList.add("hidden");

  // Atualizar dados de Perfil (BlueDox style) na Topbar
  if (currentUser) {
    const avatarEl = document.getElementById("topbar-user-avatar");
    const nameEl = document.getElementById("topbar-user-name");
    if (avatarEl) {
      avatarEl.textContent = currentUser.nome ? currentUser.nome.charAt(0).toUpperCase() : "U";
    }
    if (nameEl) {
      nameEl.textContent = currentUser.nome.split(" ")[0] || "Usuário";
    }
  }

  inscreverPushNotificacoes();

  // Exibir botão de trocar módulo para todos os perfis permitidos
  const btnTopbar = document.getElementById("btn-topbar-trocar-modulo");
  if (btnTopbar) btnTopbar.classList.remove("hidden");

  ajustarCardsModulos();

  const ultimoModulo = localStorage.getItem("ultimoModulo_" + currentUser.nome);
  if (ultimoModulo) {
    iniciarModuloBase(ultimoModulo);
  } else {
    document.getElementById("module-selection-overlay").classList.remove("hidden");
    appEl.classList.add("hidden");
  }
}

function ajustarCardsModulos() {
  const btnCacau = document.getElementById("btn-mod-cacau");
  const btnFaca = document.getElementById("btn-mod-faca");
  const btnRh = document.getElementById("btn-mod-rh");
  const btnPonto = document.getElementById("btn-mod-ponto");

  const role = currentUser.role;

  if (btnCacau) btnCacau.classList.toggle("hidden", !(role === "owner" || role === "consultora" || role === "consultora_dashboard"));
  if (btnFaca) btnFaca.classList.toggle("hidden", !(role === "owner" || role === "consultora_fa"));
  if (btnRh) btnRh.classList.toggle("hidden", !(role === "owner"));
  if (btnPonto) btnPonto.classList.toggle("hidden", false); // Ponto é para todos os colaboradores
}

function iniciarModuloBase(moduloOpcional) {
  document.getElementById("module-selection-overlay").classList.add("hidden");
  appEl.classList.remove("hidden");

  document.getElementById("user-badge").textContent = currentUser.nome;

  let tabsPermitidas = [...TABS_POR_ROLE[currentUser.role]];

  if (moduloOpcional) {
    localStorage.setItem("ultimoModulo_" + currentUser.nome, moduloOpcional);
    if (moduloOpcional === "cacau-show") {
      tabsPermitidas = TABS_POR_ROLE[currentUser.role].filter(tab => tab !== "faca-amigos" && tab !== "rh-modulo" && tab !== "controle-ponto");
      document.getElementById("btn-trocar-modulo").classList.remove("hidden");
    } else if (moduloOpcional === "faca-amigos") {
      tabsPermitidas = ["faca-amigos", "configuracoes"];
      document.getElementById("btn-trocar-modulo").classList.remove("hidden");
    } else if (moduloOpcional === "rh-modulo") {
      tabsPermitidas = ["rh-modulo", "colaboradores", "configuracoes"];
      document.getElementById("btn-trocar-modulo").classList.remove("hidden");
    } else if (moduloOpcional === "controle-ponto") {
      tabsPermitidas = ["controle-ponto", "configuracoes"];
      document.getElementById("btn-trocar-modulo").classList.remove("hidden");
    }
  } else {
    document.getElementById("btn-trocar-modulo").classList.add("hidden");
  }

  const nomesPermitidosBoletos = ["Alexandra", "LiderOP", "Bruno", "Isabella"];
  if (!nomesPermitidosBoletos.includes(currentUser.nome)) {
    tabsPermitidas = tabsPermitidas.filter(tab => tab !== "boletos");
  }

  const nomesPermitidosAuditoriaBoletos = ["Bruno", "Isabella"];
  if (!nomesPermitidosAuditoriaBoletos.includes(currentUser.nome)) {
    tabsPermitidas = tabsPermitidas.filter(tab => tab !== "auditoria-boletos");
  }

  document.querySelectorAll(".tab-btn").forEach(btn => {
    const permitido = tabsPermitidas.includes(btn.dataset.tab);
    btn.classList.toggle("hidden", !permitido);
  });

  // Atualizar visibilidade dos grupos do menu lateral
  const groupCaixa = document.getElementById("group-controle-caixa");
  if (groupCaixa) {
    const temTabCaixa = Array.from(groupCaixa.querySelectorAll(".tab-btn")).some(btn => !btn.classList.contains("hidden"));
    groupCaixa.classList.toggle("hidden", !temTabCaixa);
  }
  const groupLogistica = document.getElementById("group-logistica");
  if (groupLogistica) {
    const temTabLogistica = Array.from(groupLogistica.querySelectorAll(".tab-btn")).some(btn => !btn.classList.contains("hidden"));
    groupLogistica.classList.toggle("hidden", !temTabLogistica);
  }
  const groupBoletos = document.getElementById("group-boletos");
  if (groupBoletos) {
    const temTabBoletos = Array.from(groupBoletos.querySelectorAll(".tab-btn")).some(btn => !btn.classList.contains("hidden"));
    groupBoletos.classList.toggle("hidden", !temTabBoletos);
  }

  // Sync bottom nav visibility (#7)
  document.querySelectorAll(".bottom-nav-btn").forEach(btn => {
    const permitido = tabsPermitidas.includes(btn.dataset.tab);
    btn.classList.toggle("hidden", !permitido);
  });
  document.getElementById("bottom-nav").classList.remove("hidden");
  document.getElementById("fab-novo-registro").classList.remove("hidden");

  // Configura a aba padrão após selecionar módulo (Owners)
  if (currentUser.role === "owner" && moduloOpcional) {
    if (moduloOpcional === "cacau-show") {
      ativarTab("dashboard");
    } else if (moduloOpcional === "faca-amigos") {
      faSubTabAtiva = "fa-dashboard";
      ativarTab("faca-amigos");
    } else if (moduloOpcional === "rh-modulo") {
      ativarTab("rh-modulo");
    }
  } else {
    const ativa = document.querySelector(".tab-panel.active")?.id.replace("tab-", "");
    if (!tabsPermitidas.includes(ativa)) {
      ativarTab(tabsPermitidas[0]);
    }
  }

  // Sugerir Abertura/Fechamento por hora e restaurar rascunhos salvos
  preselecionarOperacaoPorHorario();
  restaurarRascunhosForm();

  // Verificar aviso de Inventário Mensal Obrigatório para colaboradoras Cacau Show
  verificarInventarioMensalNotificacao();

  // Configurações específicas por role
  const isFAConsultora = currentUser.role === "consultora_fa";
  const isOwner = currentUser.role === "owner";

  // Consultor Cacau Show
  const consultorSelect = document.getElementById("consultor");
  if (currentUser.role !== "owner") {
    consultorSelect.value = currentUser.nome;
    consultorSelect.disabled = true;
  } else {
    consultorSelect.disabled = false;
  }

  // Consultor FA
  const faConsultorSelect = document.getElementById("fa-consultor");
  if (isFAConsultora) {
    faConsultorSelect.value = currentUser.nome;
    faConsultorSelect.disabled = true;
    // Sub-abas FA: consultora_fa só vê Registro
    document.querySelectorAll(".fa-sub-btn").forEach(btn => {
      btn.classList.add("hidden");
    });
    document.getElementById("fa-tablink-registro").classList.remove("hidden");
    document.getElementById("fa-subnav").classList.add("fa-subnav-single");
    faSubTabAtiva = "fa-registro";
    ativarFaSubTab("fa-registro");
  } else if (isOwner) {
    faConsultorSelect.disabled = false;
    // Owners vêem todas as sub-abas FA
    document.querySelectorAll(".fa-sub-btn").forEach(btn => {
      btn.classList.remove("hidden");
    });
    document.getElementById("fa-subnav").classList.remove("fa-subnav-single");
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

/**
 * Função para calcular se a data atual corresponde ao 1º dia útil da última semana do mês
 * e notificar as colaboradoras da Cacau Show com prazo de 2 dias úteis, notificando Alexandra.
 */
function verificarInventarioMensalNotificacao() {
  if (!currentUser) return;
  
  // Apenas colaboradoras da Cacau Show (não aplica a consultora_fa pura)
  if (currentUser.role === "consultora_fa") return;

  const hoje = new Date();
  const ano = hoje.getFullYear();
  const mes = hoje.getMonth(); // 0-indexed
  const diaSemana = hoje.getDay(); // 0=Dom, 1=Seg, 2=Ter...

  // Obter o último dia do mês
  const ultimoDiaMes = new Date(ano, mes + 1, 0);
  const totalDiasMes = ultimoDiaMes.getDate();

  // Encontrar o 1º dia útil da última semana (últimos 7 dias do mês)
  let primeiroDiaUtilUltimaSemana = null;
  for (let d = totalDiasMes - 6; d <= totalDiasMes; d++) {
    const dataTemp = new Date(ano, mes, d);
    const dayOfWeek = dataTemp.getDay();
    if (dayOfWeek !== 0 && dayOfWeek !== 6) { // Não é Sábado nem Domingo
      primeiroDiaUtilUltimaSemana = dataTemp;
      break;
    }
  }

  if (!primeiroDiaUtilUltimaSemana) return;

  // Verificar se HOJE é o 1º dia útil da última semana
  const isHojePrimeiroDiaUtil = hoje.getDate() === primeiroDiaUtilUltimaSemana.getDate() &&
                                hoje.getMonth() === primeiroDiaUtilUltimaSemana.getMonth() &&
                                hoje.getFullYear() === primeiroDiaUtilUltimaSemana.getFullYear();

  if (!isHojePrimeiroDiaUtil) return;

  // Evitar notificação repetida no mesmo dia para o mesmo usuário
  const storageKey = `inv_alert_${ano}_${mes}_${currentUser.nome}`;
  if (localStorage.getItem(storageKey)) return;

  // Calcular a data de término (2 dias úteis após o 1º dia útil)
  let diasAdicionados = 0;
  let dataTermino = new Date(primeiroDiaUtilUltimaSemana);
  while (diasAdicionados < 2) {
    dataTermino.setDate(dataTermino.getDate() + 1);
    const dow = dataTermino.getDay();
    if (dow !== 0 && dow !== 6) {
      diasAdicionados++;
    }
  }

  const dataInicioStr = primeiroDiaUtilUltimaSemana.toLocaleDateString('pt-BR');
  const dataTerminoStr = dataTermino.toLocaleDateString('pt-BR');

  // Disparar Notificação Silenciosa para Alexandra (Gestão/Dashboard) sobre o início e fim do prazo
  const notifKeyAlexandra = `inv_notif_alexandra_${ano}_${mes}`;
  if (!localStorage.getItem(notifKeyAlexandra)) {
    localStorage.setItem(notifKeyAlexandra, "true");
    fetch('/api/notificar-gestao', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        destinatarios: getDestinatariosNotificacao('inventario_inicio'),
        assunto: `📋 AVISO: Início do Inventário Mensal Obrigatório (${dataInicioStr})`,
        mensagem: `Atenção Alexandra, o Inventário Mensal Obrigatório das lojas foi iniciado hoje (${dataInicioStr}). O prazo para conclusão pelas colaboradoras é de 2 dias úteis, finalizando em ${dataTerminoStr}.`,
        operador: currentUser.nome
      })
    }).catch(err => console.error('Erro notificação Alexandra:', err));
  }

  // Exibir Pop-up de Alerta para a Colaboradora
  setTimeout(() => {
    showModal(
      `⚠️ INVENTÁRIO MENSAL OBRIGATÓRIO INICIADO!\n\nHoje (${dataInicioStr}) é o primeiro dia útil para a realização do Inventário Cego Mensal Obrigatório de estoque e validade.\n\n⏰ Prazo para conclusão: 2 dias úteis (Término até ${dataTerminoStr}).\n\nPor favor, acesse a aba "Inventário de Estoque" no Módulo Logística para iniciar a contagem.`,
      {
        icon: "📋",
        title: "Inventário Mensal Obrigatório",
        btnText: "Entendi / Ir para Inventário",
        btnClass: "bg-brand-600 hover:bg-brand-500 text-white font-bold"
      }
    ).then(() => {
      localStorage.setItem(storageKey, "true");
      ativarTab("inventario-estoque");
    });
  }, 600);
}

// Botões de Seleção de Módulo
document.getElementById("btn-mod-cacau").addEventListener("click", () => {
  iniciarModuloBase("cacau-show");
});

document.getElementById("btn-mod-faca").addEventListener("click", () => {
  iniciarModuloBase("faca-amigos");
});

const btnModRh = document.getElementById("btn-mod-rh");
if (btnModRh) {
  btnModRh.addEventListener("click", () => {
    iniciarModuloBase("rh-modulo");
  });
}

const btnModPonto = document.getElementById("btn-mod-ponto");
if (btnModPonto) {
  btnModPonto.addEventListener("click", () => {
    iniciarModuloBase("controle-ponto");
    ativarTab("controle-ponto");
  });
}

// Botão Trocar Módulo na Topbar / Sidebar
const trocarModuloHandler = () => {
  appEl.classList.add("hidden");
  document.getElementById("module-selection-overlay").classList.remove("hidden");
};
document.getElementById("btn-trocar-modulo").addEventListener("click", trocarModuloHandler);
const btnTopbarTrocar = document.getElementById("btn-topbar-trocar-modulo");
if (btnTopbarTrocar) btnTopbarTrocar.addEventListener("click", trocarModuloHandler);

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
  // Painel que começa como "hidden" e deve voltar a ser hidden quando inativo
  const PANELS_HIDDEN_BY_DEFAULT = ["auditoria", "faca-amigos", "conferencia-nfe", "inventario-estoque", "rh-modulo", "auditoria-boletos", "configuracoes", "controle-ponto"];

  document.querySelectorAll(".tab-btn").forEach(b => {
    b.classList.remove("active");
    b.setAttribute("aria-selected", "false");
    b.setAttribute("tabindex", "-1");
  });

  // Remove active de todos os painéis e re-oculta os que eram hidden por padrão
  document.querySelectorAll(".tab-panel").forEach(p => {
    p.classList.remove("active");
    const panelId = p.id.replace("tab-", "");
    if (PANELS_HIDDEN_BY_DEFAULT.includes(panelId) && panelId !== tabName) {
      p.classList.add("hidden");
    }
  });

  const activeBtn = document.querySelector(`.tab-btn[data-tab="${tabName}"]`);
  if (activeBtn) {
    activeBtn.classList.add("active");
    activeBtn.setAttribute("aria-selected", "true");
    activeBtn.setAttribute("tabindex", "0");
  }

  const activePanel = document.getElementById("tab-" + tabName);
  if (activePanel) {
    activePanel.classList.remove("hidden"); // ← garante que hidden seja removido
    activePanel.classList.add("active");
  }

  if (tabName === "configuracoes") {
    inicializarPainelConfiguracoes();
  }

  // Sync bottom nav (#7)
  document.querySelectorAll(".bottom-nav-btn").forEach(b => b.classList.remove("active"));
  const activeBottom = document.querySelector(`.bottom-nav-btn[data-tab="${tabName}"]`);
  if (activeBottom) activeBottom.classList.add("active");

  // Aplicar/remover tema visual FAçaAmigos
  document.body.classList.toggle("tema-fa", tabName === "faca-amigos");

  if (tabName === "dashboard") renderDashboard();
  if (tabName === "historico") renderHistorico();
  if (tabName === "mensal") renderMensal();
  if (tabName === "auditoria") carregarAuditoria();
  if (tabName === "faca-amigos") ativarFaSubTab(faSubTabAtiva);
  if (tabName === "colaboradores") renderizarColaboradores();
  if (tabName === "rh-modulo") renderRhModulo();
  if (tabName === "boletos") carregarBoletosServidor();
  if (tabName === "auditoria-boletos") carregarBoletosServidor();
  if (tabName === "conferencia-nfe") renderNfCardsGallery();
  if (tabName === "controle-ponto") inicializarAbaPonto();
  // Fecha a sidebar mobile ao selecionar uma aba
  fecharSidebarMobile();
}

// --- Controle da Sidebar Mobile ---
const sidebarEl = document.getElementById("sidebar");
const sidebarOverlayEl = document.getElementById("sidebar-overlay");
const btnHamburger = document.getElementById("btn-menu-hamburger");
const btnCloseSidebar = document.getElementById("btn-close-sidebar");

function abrirSidebarMobile() {
  if (sidebarEl) sidebarEl.classList.add("open");
  if (sidebarOverlayEl) sidebarOverlayEl.classList.add("open");
}

function fecharSidebarMobile() {
  if (sidebarEl) sidebarEl.classList.remove("open");
  if (sidebarOverlayEl) sidebarOverlayEl.classList.remove("open");
}

if (btnHamburger) btnHamburger.addEventListener("click", abrirSidebarMobile);
if (btnCloseSidebar) btnCloseSidebar.addEventListener("click", fecharSidebarMobile);
if (sidebarOverlayEl) sidebarOverlayEl.addEventListener("click", fecharSidebarMobile);

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") fecharSidebarMobile();
});

// Enter ativa o botão principal (.btn-primary) do modal/overlay aberto no
// momento, sem precisar clicar — vale para login, PIN, confirmações
// (showModal/showConfirm) e qualquer outro .modal-overlay visível.
document.addEventListener("keydown", (e) => {
  if (e.key !== "Enter") return;
  const tag = e.target.tagName;
  if (tag === "TEXTAREA" || tag === "BUTTON" || tag === "A") return;

  // Quando há mais de um overlay visível ao mesmo tempo (ex.: uma confirmação
  // aberta por cima da tela de login), o último no DOM é o que fica
  // visualmente por cima — todos compartilham o mesmo z-index.
  const overlaysVisiveis = Array.from(document.querySelectorAll(".modal-overlay"))
    .filter(o => !o.classList.contains("hidden"));
  const overlayAberto = overlaysVisiveis[overlaysVisiveis.length - 1];
  if (!overlayAberto) return;

  const btnPrincipal = overlayAberto.querySelector(".btn-primary:not(:disabled)");
  if (btnPrincipal) {
    e.preventDefault();
    btnPrincipal.click();
  }
});

// Toggle expandir/colapsar grupos da sidebar (Acordeão suave)
document.querySelectorAll(".sidebar-group-header").forEach(header => {
  header.addEventListener("click", () => {
    const group = header.closest(".sidebar-group");
    if (group) {
      const isExpanded = group.classList.contains("expanded");
      if (isExpanded) {
        group.classList.remove("expanded");
        group.classList.add("collapsed");
        header.setAttribute("aria-expanded", "false");
      } else {
        group.classList.remove("collapsed");
        group.classList.add("expanded");
        header.setAttribute("aria-expanded", "true");
      }
    }
  });
});


// Sub-tab ativa do FaçaAmigos
let faSubTabAtiva = "fa-registro";

function ativarFaSubTab(subTabName) {
  if (currentUser && currentUser.role === "consultora_fa") {
    subTabName = "fa-registro";
  }
  faSubTabAtiva = subTabName;
  document.querySelectorAll(".fa-sub-btn").forEach(b => b.classList.remove("active"));
  document.querySelectorAll(".fa-tab-panel").forEach(p => p.classList.add("hidden"));
  const activeBtn = document.querySelector(`.fa-sub-btn[data-fa-tab="${subTabName}"]`);
  if (activeBtn) activeBtn.classList.add("active");
  const panel = document.getElementById(`fa-tab-${subTabName}`);
  if (panel) panel.classList.remove("hidden");

  if (subTabName === "fa-dashboard") renderFaDashboard();
  if (subTabName === "fa-historico") renderFaHistorico();
  if (subTabName === "fa-mensal") renderFaMensal();
}

// Listeners para sub-abas FA
document.querySelectorAll(".fa-sub-btn").forEach(btn => {
  btn.addEventListener("click", () => ativarFaSubTab(btn.dataset.faTab));
});

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
const tabsContainer = document.querySelector(".tabs") || document.querySelector(".sidebar-nav");
if (tabsContainer) {
  tabsContainer.addEventListener("keydown", e => {
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
}

// --- Form: tipo operação (Cacau Show) ---
document.querySelectorAll("#tipo-operacao .seg-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll("#tipo-operacao .seg-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    tipoOperacaoSelecionado = btn.dataset.value;
    atualizarCamposPorOperacao();
  });
});

// --- Form: tipo operação (FaçaAmigos) ---
document.querySelectorAll("#fa-tipo-operacao .seg-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll("#fa-tipo-operacao .seg-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    faTipoOperacaoSelecionado = btn.dataset.value;
    atualizarFaCamposPorOperacao();
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
    fotoHint.textContent = "(Obrigatório no fechamento) *";
  }
}

function atualizarFaCamposPorOperacao() {
  const fieldEnvelope = document.getElementById("fa-field-valor-envelope");
  const valorEnvelopeInput = document.getElementById("fa-valor-envelope");
  const fotoHint = document.getElementById("fa-foto-hint");

  if (faTipoOperacaoSelecionado === "Abertura") {
    fieldEnvelope.classList.add("hidden");
    valorEnvelopeInput.required = false;
    fotoHint.textContent = "(não necessário na abertura)";
  } else {
    fieldEnvelope.classList.remove("hidden");
    valorEnvelopeInput.required = true;
    fotoHint.textContent = "(Obrigatório no fechamento) *";
  }
}

// --- Sugestão automática de Fundo de Caixa (Cacau Show) ---
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

// --- Sugestão automática de Fundo de Caixa (FaçaAmigos) ---
document.getElementById("fa-loja").addEventListener("change", () => {
  const loja = document.getElementById("fa-loja").value;
  const fundoInput = document.getElementById("fa-fundo-caixa");
  const hint = document.getElementById("fa-fundo-caixa-hint");
  const ultimo = [...registrosFA]
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

// --- FA: Foto ---
const faFotoInput = document.getElementById("fa-foto-envelope");
const faFotoPreviewWrap = document.getElementById("fa-foto-preview-wrap");
const faFotoPreview = document.getElementById("fa-foto-preview");

faFotoInput.addEventListener("change", () => {
  const file = faFotoInput.files[0];
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
        if (width > MAX_WIDTH) { height *= MAX_WIDTH / width; width = MAX_WIDTH; }
      } else {
        if (height > MAX_HEIGHT) { width *= MAX_HEIGHT / height; height = MAX_HEIGHT; }
      }
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, width, height);
      faFotoDataUrl = canvas.toDataURL("image/jpeg", 0.6);
      faFotoPreview.src = faFotoDataUrl;
      faFotoPreviewWrap.classList.remove("hidden");
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
});

document.getElementById("fa-foto-remover").addEventListener("click", () => {
  faFotoDataUrl = null;
  faFotoInput.value = "";
  faFotoPreviewWrap.classList.add("hidden");
});

// --- Data/hora default = agora ---
function setAgora(inputEl) {
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  inputEl.value = now.toISOString().slice(0, 16);
}
setAgora(document.getElementById("data-operacao"));
setAgora(document.getElementById("fa-data-operacao"));

// --- Validação Visual em Tempo Real ---
function validarValoresTempoReal(fundoId, envelopeId, errorFundoId, errorEnvelopeId) {
  const fundoInput = document.getElementById(fundoId);
  const envelopeInput = document.getElementById(envelopeId);
  const errFundo = document.getElementById(errorFundoId);
  const errEnvelope = document.getElementById(errorEnvelopeId);

  if (!fundoInput || !envelopeInput) return;

  function check() {
    const isCacauShow = document.querySelector(`#tipo-operacao .seg-btn.active`) !== null;
    const isFa = document.querySelector(`#fa-tipo-operacao .seg-btn.active`) !== null;
    let tipo = "";
    if (isCacauShow) tipo = document.querySelector(`#tipo-operacao .seg-btn.active`)?.dataset.value;
    else if (isFa) tipo = document.querySelector(`#fa-tipo-operacao .seg-btn.active`)?.dataset.value;

    if (tipo !== "Fechamento") {
      envelopeInput.classList.remove("input-error");
      if (errEnvelope) errEnvelope.classList.add("hidden");
      return;
    }

    const fundo = parseMoeda(fundoInput.value);
    const env = parseMoeda(envelopeInput.value);

    if (fundoInput.value && envelopeInput.value) {
      // Alerta se envelope for < 30% do fundo (quebra muito alta ou esquecimento de venda)
      if (env < (fundo * 0.3) && env !== 0) {
        envelopeInput.classList.add("input-error");
        if (errEnvelope) {
          errEnvelope.textContent = "Alerta: Valor do envelope anormalmente baixo comparado ao fundo.";
          errEnvelope.classList.remove("hidden");
        }
      } else {
        envelopeInput.classList.remove("input-error");
        if (errEnvelope) errEnvelope.classList.add("hidden");
      }
    }
  }

  fundoInput.addEventListener("input", check);
  envelopeInput.addEventListener("input", check);
}

validarValoresTempoReal("fundo-caixa", "valor-envelope", "fundo-caixa-error", "valor-envelope-error");

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

  limparErrosInline("");

  let temErro = false;
  let primeiroInvalido = null;

  function marcarErro(inputEl, errorEl) {
    if (inputEl) {
      inputEl.classList.add("input-error");
      if (!primeiroInvalido) primeiroInvalido = inputEl;
    }
    if (errorEl) errorEl.classList.remove("hidden");
    temErro = true;
  }

  if (!consultor) {
    marcarErro(document.getElementById("consultor"), document.getElementById("consultor-error"));
  }
  if (!loja) {
    marcarErro(document.getElementById("loja"), document.getElementById("loja-error"));
  }
  if (!tipoOperacaoSelecionado) {
    marcarErro(document.getElementById("tipo-operacao"), document.getElementById("tipo-operacao-error"));
  }
  if (!dataOperacao) {
    marcarErro(document.getElementById("data-operacao"), document.getElementById("data-operacao-error"));
  }
  if (fundoCaixaRaw === "" || isNaN(parseMoeda(fundoCaixaRaw))) {
    marcarErro(document.getElementById("fundo-caixa"), document.getElementById("fundo-caixa-error"));
  }
  if (tipoOperacaoSelecionado === "Fechamento") {
    if (valorEnvelopeRaw === "" || isNaN(parseMoeda(valorEnvelopeRaw))) {
      marcarErro(document.getElementById("valor-envelope"), document.getElementById("valor-envelope-error"));
    }
    if (!fotoDataUrl) {
      marcarErro(document.getElementById("foto-envelope"), document.getElementById("foto-envelope-error"));
    }
  }

  if (temErro) {
    if (primeiroInvalido) primeiroInvalido.focus();
    showToast("Por favor, preencha todos os campos obrigatórios corretamente.", "erro");
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
  if (apiSalvo && (!currentUser || !currentUser.nome || !currentUser.nome.includes("Treinamento"))) {
    registros.push(registro);
  }

  setLoading(btnSubmit, false);
  showToast("Registro salvo com sucesso!", "sucesso");
  localStorage.removeItem("rascunho_registro_caixa");
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
          }).catch(() => { });
        }
      }
    }
  }

  e.target.reset();
  document.querySelectorAll("#tipo-operacao .seg-btn").forEach(b => b.classList.remove("active"));
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

// ==================== FAÇAAMIGOS FORM SUBMIT ====================
document.getElementById("form-registro-fa").addEventListener("submit", async e => {
  e.preventDefault();

  const btnSubmit = document.getElementById("fa-submit-btn");

  const consultor = document.getElementById("fa-consultor").value;
  const loja = document.getElementById("fa-loja").value;
  const dataOperacao = document.getElementById("fa-data-operacao").value;
  const fundoCaixaRaw = document.getElementById("fa-fundo-caixa").value;
  const valorEnvelopeRaw = document.getElementById("fa-valor-envelope").value;
  const observacoes = document.getElementById("fa-observacoes").value;

  limparErrosInline("fa");

  let temErro = false;
  let primeiroInvalido = null;

  function marcarErro(inputEl, errorEl) {
    if (inputEl) {
      inputEl.classList.add("input-error");
      if (!primeiroInvalido) primeiroInvalido = inputEl;
    }
    if (errorEl) errorEl.classList.remove("hidden");
    temErro = true;
  }

  if (!consultor) {
    marcarErro(document.getElementById("fa-consultor"), document.getElementById("fa-consultor-error"));
  }
  if (!loja) {
    marcarErro(document.getElementById("fa-loja"), document.getElementById("fa-loja-error"));
  }
  if (!faTipoOperacaoSelecionado) {
    marcarErro(document.getElementById("fa-tipo-operacao"), document.getElementById("fa-tipo-operacao-error"));
  }
  if (!dataOperacao) {
    marcarErro(document.getElementById("fa-data-operacao"), document.getElementById("fa-data-operacao-error"));
  }
  if (fundoCaixaRaw === "" || isNaN(parseMoeda(fundoCaixaRaw))) {
    marcarErro(document.getElementById("fa-fundo-caixa"), document.getElementById("fa-fundo-caixa-error"));
  }
  if (faTipoOperacaoSelecionado === "Fechamento") {
    if (valorEnvelopeRaw === "" || isNaN(parseMoeda(valorEnvelopeRaw))) {
      marcarErro(document.getElementById("fa-valor-envelope"), document.getElementById("fa-valor-envelope-error"));
    }
    if (!faFotoDataUrl) {
      marcarErro(document.getElementById("fa-foto-envelope"), document.getElementById("fa-foto-envelope-error"));
    }
  }

  if (temErro) {
    if (primeiroInvalido) primeiroInvalido.focus();
    showToast("Por favor, preencha todos os campos obrigatórios corretamente.", "erro");
    return;
  }

  const fundoCaixa = parseMoeda(fundoCaixaRaw);
  const valorEnvelope = parseMoeda(valorEnvelopeRaw);

  const duplicado = registrosFA.some(r =>
    r.loja === loja &&
    r.tipoOperacao === faTipoOperacaoSelecionado &&
    mesmoDia(r.dataOperacao, dataOperacao)
  );
  if (duplicado) {
    showToast(`Já existe um registro de ${faTipoOperacaoSelecionado} para ${loja} nesse dia.`, "erro");
    return;
  }

  setLoading(btnSubmit, true);

  const registro = {
    id: uid(),
    consultor,
    loja,
    tipoOperacao: faTipoOperacaoSelecionado,
    dataOperacao: new Date(dataOperacao).toISOString(),
    fundoCaixa,
    valorEnvelope: faTipoOperacaoSelecionado === "Fechamento" ? valorEnvelope : null,
    observacoes: observacoes || null,
    fotoEnvelope: faTipoOperacaoSelecionado === "Fechamento" ? faFotoDataUrl : null,
    status: faTipoOperacaoSelecionado === "Fechamento" ? "aguardando_retirada" : "aberto",
    dataRetirada: null,
    retiradoPor: null,
    confirmadoPorApp: null,
    autorizadoPor: null,
    mensagemGerada: false,
    criadoEm: new Date().toISOString(),
  };

  const apiSalvo = await salvarRegistroFAAPI(registro);
  if (apiSalvo && (!currentUser || !currentUser.nome || !currentUser.nome.includes("Treinamento"))) {
    registrosFA.push(registro);
  }

  setLoading(btnSubmit, false);
  showToast("Registro FaçaAmigos salvo com sucesso!", "sucesso");
  localStorage.removeItem("rascunho_registro_fa");
  await showModal(`Registro de ${faTipoOperacaoSelecionado} para ${loja} (FaçaAmigos) foi salvo com sucesso!`, { icon: "✅", title: "Registro Salvo" });

  // Reconciliação FA: Abertura vs Fechamento anterior
  if (faTipoOperacaoSelecionado === "Abertura") {
    const ultimoFechamento = [...registrosFA]
      .filter(r => r.loja === loja && r.tipoOperacao === "Fechamento")
      .sort((a, b) => new Date(b.dataOperacao) - new Date(a.dataOperacao))[0];
    if (ultimoFechamento && ultimoFechamento.fundoCaixa !== undefined) {
      const diff = fundoCaixa - ultimoFechamento.fundoCaixa;
      if (Math.abs(diff) > 0.01) {
        showModal(
          `[FaçaAmigos] Divergência detectada! Abertura (${formatBRL(fundoCaixa)}) difere do último fechamento de ${loja} (${formatBRL(ultimoFechamento.fundoCaixa)}). Diferença: ${formatBRL(Math.abs(diff))} (${diff > 0 ? 'a mais' : 'a menos'}).`,
          { icon: "⚠️", title: "Divergência FaçaAmigos", btnText: "Entendido" }
        );
      }
    }
  }

  e.target.reset();
  document.querySelectorAll("#fa-tipo-operacao .seg-btn").forEach(b => b.classList.remove("active"));
  faTipoOperacaoSelecionado = null;
  faFotoDataUrl = null;
  faFotoPreviewWrap.classList.add("hidden");
  atualizarFaCamposPorOperacao();
  setAgora(document.getElementById("fa-data-operacao"));
  document.getElementById("fa-fundo-caixa-hint").classList.add("hidden");
  if (currentUser.role === "consultora_fa") {
    document.getElementById("fa-consultor").value = currentUser.nome;
  }

  mostrarFaGeradorMensagem(registro);
});

// --- Gerador de Mensagem WhatsApp (Cacau Show) ---
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

// ==================== FAÇAAMIGOS WHATSAPP GENERATOR ====================

function mensagemAvisoFA(r) {
  if (r.tipoOperacao === "Abertura") {
    return (
      `🧡 Abertura de Caixa - FaçaAmigos\n` +
      `Loja: ${r.loja}\n` +
      `Consultora: ${r.consultor}\n` +
      `Data: ${formatDataHora(r.dataOperacao)}\n` +
      `Fundo de Caixa: ${formatBRL(r.fundoCaixa)}`
    );
  }
  return (
    `🧡 Fechamento de Caixa - FaçaAmigos\n` +
    `Loja: ${r.loja}\n` +
    `Consultora: ${r.consultor}\n` +
    `Data: ${formatDataHora(r.dataOperacao)}\n` +
    `Fundo de Caixa: ${formatBRL(r.fundoCaixa)}\n` +
    `Valor do Envelope: ${formatBRL(r.valorEnvelope)}`
  );
}

function mostrarFaGeradorMensagem(registro) {
  const banner = document.getElementById("fa-aviso-banner");
  const textarea = document.getElementById("fa-aviso-texto");
  const status = document.getElementById("fa-aviso-status");
  const linkBtn = document.getElementById("fa-btn-abrir-whatsapp");

  textarea.value = mensagemAvisoFA(registro);
  status.classList.add("hidden");

  const linkGrupoLoja = WHATSAPP_GRUPOS_FA[registro.loja];
  linkBtn.href = linkGrupoLoja
    ? linkGrupoLoja
    : `https://wa.me/?text=${encodeURIComponent(mensagemAvisoFA(registro))}`;

  async function marcarFaGerado() {
    registro.mensagemGerada = true;
    await atualizarRegistroFAAPI(registro.id, { mensagemGerada: true });
    status.classList.remove("hidden");
  }

  document.getElementById("fa-btn-copiar-mensagem").onclick = async () => {
    try {
      await navigator.clipboard.writeText(textarea.value);
    } catch {
      textarea.select();
      document.execCommand("copy");
    }
    await marcarFaGerado();
  };

  linkBtn.onclick = async () => await marcarFaGerado();
  banner.classList.remove("hidden");
}

// ==================== FAÇAAMIGOS RENDER FUNCTIONS ====================

// LOJAS_FA moved to top of file (near LOJAS) to avoid temporal dead zone

function renderFaDashboard() {
  atualizarNotificacoes();
  const filtroLoja = document.getElementById("fa-filtro-loja-pendentes").value;
  const pendentes = registrosFA.filter(r => r.status === "aguardando_retirada" && (Number(r.valorEnvelope) || 0) > 0);

  const hoje = new Date().toISOString();
  const semFechamento = LOJAS_FA.filter(loja => {
    return !registrosFA.some(r => r.loja === loja && r.tipoOperacao === "Fechamento" && mesmoDia(r.dataOperacao, hoje));
  });
  const alertaCard = document.getElementById("fa-alerta-sem-fechamento");
  if (semFechamento.length) {
    document.getElementById("fa-lojas-sem-fechamento").textContent = " " + semFechamento.join(", ");
    alertaCard.classList.remove("hidden");
  } else {
    alertaCard.classList.add("hidden");
  }

  const cardsWrap = document.getElementById("fa-cards-lojas");
  cardsWrap.innerHTML = "";
  let totalGeral = 0;
  const totaisPorLoja = {};

  LOJAS_FA.forEach(loja => {
    const doLoja = pendentes.filter(r => r.loja === loja);
    const total = doLoja.reduce((s, r) => s + (Number(r.valorEnvelope) || 0), 0);
    totaisPorLoja[loja] = total;
    totalGeral += total;
    const maisAntigo = doLoja.reduce((max, r) => {
      const dias = diffDias(r.dataOperacao);
      return dias > max ? dias : max;
    }, 0);
    const emRisco = maisAntigo >= RISCO_DIAS && doLoja.length > 0;

    const card = document.createElement("div");
    card.className = "loja-card fa-loja-card" + (emRisco ? " alerta" : "");
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

  document.getElementById("fa-dash-total-geral").textContent = formatBRL(totalGeral) + " em trânsito";

  const barChart = document.getElementById("fa-bar-chart");
  barChart.innerHTML = "";
  const maiorValor = Math.max(...Object.values(totaisPorLoja), 1);
  LOJAS_FA.forEach(loja => {
    const total = totaisPorLoja[loja];
    const pct = Math.round((total / maiorValor) * 100);
    const row = document.createElement("div");
    row.className = "bar-row";
    row.innerHTML = `
      <span>${loja}</span>
      <div class="bar-track"><div class="bar-fill fa-bar-fill" style="width:${pct}%"></div></div>
      <span class="bar-value">${formatBRL(total)}</span>
    `;
    barChart.appendChild(row);
  });

  let selecionadosFAPendentes = new Set();

  function atualizarBatchBarFAPendentes(filtrados) {
    const bar = document.getElementById("fa-batch-actions-pendentes");
    const countInfo = document.getElementById("fa-batch-count-info");
    const selectAllCheckbox = document.getElementById("fa-select-all-pendentes");

    if (!bar) return;

    if (selecionadosFAPendentes.size > 0) {
      bar.classList.remove("hidden");
      const selecionadosList = filtrados.filter(r => selecionadosFAPendentes.has(r.id));
      const totalValor = selecionadosList.reduce((s, r) => s + (Number(r.valorEnvelope) || 0), 0);
      countInfo.textContent = `${selecionadosFAPendentes.size} envelope(s) selecionado(s) (${formatBRL(totalValor)})`;
    } else {
      bar.classList.add("hidden");
    }

    if (selectAllCheckbox) {
      selectAllCheckbox.checked = filtrados.length > 0 && filtrados.every(r => selecionadosFAPendentes.has(r.id));
      selectAllCheckbox.indeterminate = selecionadosFAPendentes.size > 0 && !selectAllCheckbox.checked;
    }
  }

  const filtrados = filtroLoja ? pendentes.filter(r => r.loja === filtroLoja) : pendentes;
  const tbody = document.querySelector("#fa-tabela-pendentes tbody");
  tbody.innerHTML = "";

  // Apenas Bruno e Isabella podem retirar no FA
  const podeRetirar = currentUser && (currentUser.nome === "Bruno" || currentUser.nome === "Isabella");

  // Limpar IDs selecionados que não estão mais na lista de filtrados
  const idsFiltrados = new Set(filtrados.map(r => r.id));
  selecionadosFAPendentes = new Set([...selecionadosFAPendentes].filter(id => idsFiltrados.has(id)));

  filtrados
    .sort((a, b) => new Date(b.dataOperacao) - new Date(a.dataOperacao))
    .forEach(r => {
      const dias = diffDias(r.dataOperacao);
      const risco = dias >= RISCO_DIAS;
      const isSelected = selecionadosFAPendentes.has(r.id);
      const tr = document.createElement("tr");
      if (isSelected) tr.classList.add("selected-row");

      tr.innerHTML = `
        <td style="text-align: center;">
          ${podeRetirar ? `<input type="checkbox" class="chk-fa-pendente" data-id="${r.id}" ${isSelected ? "checked" : ""}>` : ""}
        </td>
        <td>${r.loja}</td>
        <td>${r.consultor}</td>
        <td>${formatDataHora(r.dataOperacao)}</td>
        <td>${formatBRL(r.valorEnvelope)}</td>
        <td><span class="dias-badge ${risco ? "risco" : ""}">${dias}d</span></td>
        <td>${fotoCelula(r)}</td>
        <td>${avisoCelula(r)}</td>
        <td>${podeRetirar
          ? `<button class="btn-retirar fa-btn-retirar" data-id="${r.id}">Marcar retirado</button>`
          : `<span class="retirada-bloqueada">🔒 Só Bruno ou Isabella</span>`}</td>
      `;
      tbody.appendChild(tr);
    });

  atualizarBatchBarFAPendentes(filtrados);

  document.getElementById("fa-pendentes-vazio").classList.toggle("hidden", filtrados.length > 0);

  // Checkbox Select All Listener
  const selectAll = document.getElementById("fa-select-all-pendentes");
  if (selectAll) {
    selectAll.onclick = () => {
      if (selectAll.checked) {
        filtrados.forEach(r => selecionadosFAPendentes.add(r.id));
      } else {
        selecionadosFAPendentes.clear();
      }
      renderFaDashboard();
    };
  }

  // Individual Checkbox Listeners
  tbody.querySelectorAll(".chk-fa-pendente").forEach(chk => {
    chk.addEventListener("change", (e) => {
      e.stopPropagation();
      const id = chk.dataset.id;
      if (chk.checked) {
        selecionadosFAPendentes.add(id);
      } else {
        selecionadosFAPendentes.delete(id);
      }
      renderFaDashboard();
    });
  });

  const btnBatch = document.getElementById("fa-btn-batch-retirar");
  if (btnBatch) {
    btnBatch.onclick = () => {
      if (selecionadosFAPendentes.size > 0) {
        abrirModalRetiradaFA(Array.from(selecionadosFAPendentes));
      }
    };
  }

  tbody.querySelectorAll(".fa-btn-retirar").forEach(btn => {
    btn.addEventListener("click", () => abrirModalRetiradaFA(btn.dataset.id));
  });
  tbody.querySelectorAll(".thumb-btn").forEach(img => {
    img.addEventListener("click", () => abrirModalFoto(img.dataset.src));
  });
}

// Modal retirada FA (apenas Bruno/Isabella, sem necessidade de autorização adicional)
function abrirModalRetiradaFA(target) {
  if (!currentUser || (currentUser.nome !== "Bruno" && currentUser.nome !== "Isabella")) {
    showModal("Apenas Bruno ou Isabella podem confirmar retiradas no FaçaAmigos.", { icon: "🔒", title: "Acesso restrito" });
    return;
  }
  retiradaAlvoId = target; // Pode ser uma string ID ou um Array de IDs
  const isBatch = Array.isArray(target);

  if (isBatch) {
    const selecionadosList = registrosFA.filter(x => target.includes(x.id));
    const totalVal = selecionadosList.reduce((s, r) => s + (Number(r.valorEnvelope) || 0), 0);
    document.getElementById("modal-sub-info").textContent =
      `[FaçaAmigos - Retirada em Lote] ${target.length} envelopes selecionados — Total: ${formatBRL(totalVal)}`;
  } else {
    const r = registrosFA.find(x => x.id === target);
    document.getElementById("modal-sub-info").textContent =
      `[FaçaAmigos] ${r.loja} — ${r.consultor} — ${formatBRL(r.valorEnvelope)}`;
  }

  setAgora(document.getElementById("retirada-data"));
  document.getElementById("retirada-responsavel").value = "";
  // Ocultar campo de autorização de PIN (não é necessário para owners no FA)
  document.getElementById("autorizacao-wrap").classList.add("hidden");
  // Temporariamente conectar o modal ao contexto FA
  document.getElementById("modal-confirmar").dataset.faMode = "true";
  document.getElementById("modal-retirada").classList.remove("hidden");
}

document.getElementById("fa-filtro-loja-pendentes").addEventListener("change", renderFaDashboard);

let faHistPaginaAtual = 1;
const FA_HIST_PER_PAGE = 20;

function renderFaHistorico() {
  const filtroLoja = document.getElementById("fa-filtro-loja-hist").value;
  const filtroStatus = document.getElementById("fa-filtro-status-hist").value;
  const busca = document.getElementById("fa-busca-hist").value.trim().toLowerCase();

  let lista = [...registrosFA].sort((a, b) => new Date(b.dataOperacao) - new Date(a.dataOperacao));
  if (filtroLoja) lista = lista.filter(r => r.loja === filtroLoja);
  if (filtroStatus === "ativas") {
    lista = lista.filter(r => r.status !== "retirado");
  } else if (filtroStatus) {
    lista = lista.filter(r => r.status === filtroStatus);
  }
  if (busca) {
    lista = lista.filter(r =>
      [r.loja, r.consultor, r.observacoes].some(v => (v || "").toLowerCase().includes(busca))
    );
  }

  const totalPaginas = Math.max(1, Math.ceil(lista.length / FA_HIST_PER_PAGE));
  if (faHistPaginaAtual > totalPaginas) faHistPaginaAtual = totalPaginas;
  const inicio = (faHistPaginaAtual - 1) * FA_HIST_PER_PAGE;
  const paginada = lista.slice(inicio, inicio + FA_HIST_PER_PAGE);

  const tbody = document.querySelector("#fa-tabela-historico tbody");
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
      if (r.confirmadoPorApp) retiradaTexto += ` (confirmado por ${r.confirmadoPorApp})`;
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
      ${isBruno ? `<td><button class="btn-excluir fa-btn-excluir" data-id="${r.id}">Excluir</button></td>` : ""}
    `;
    tbody.appendChild(tr);
  });

  document.getElementById("fa-historico-vazio").classList.toggle("hidden", lista.length > 0);

  // Paginação FA
  let paginacao = document.getElementById("fa-hist-paginacao");
  if (!paginacao) {
    paginacao = document.createElement("div");
    paginacao.id = "fa-hist-paginacao";
    paginacao.className = "paginacao";
    document.querySelector("#fa-tabela-historico").closest(".table-wrap").appendChild(paginacao);
  }
  if (totalPaginas > 1) {
    paginacao.classList.remove("hidden");
    paginacao.innerHTML = `
      <button class="btn-pag" id="fa-hist-prev" ${faHistPaginaAtual <= 1 ? "disabled" : ""}>← Anterior</button>
      <span class="pag-info">Página ${faHistPaginaAtual} de ${totalPaginas} (${lista.length} registros)</span>
      <button class="btn-pag" id="fa-hist-next" ${faHistPaginaAtual >= totalPaginas ? "disabled" : ""}>Próxima →</button>
    `;
    document.getElementById("fa-hist-prev").addEventListener("click", () => {
      if (faHistPaginaAtual > 1) { faHistPaginaAtual--; renderFaHistorico(); }
    });
    document.getElementById("fa-hist-next").addEventListener("click", () => {
      if (faHistPaginaAtual < totalPaginas) { faHistPaginaAtual++; renderFaHistorico(); }
    });
  } else {
    paginacao.classList.add("hidden");
  }

  tbody.querySelectorAll(".thumb-btn").forEach(img => {
    img.addEventListener("click", () => abrirModalFoto(img.dataset.src));
  });

  tbody.querySelectorAll(".fa-btn-excluir").forEach(btn => {
    btn.addEventListener("click", async () => {
      const id = btn.dataset.id;
      const reg = registrosFA.find(r => r.id === id);
      const info = reg ? `do colaborador "${reg.consultor}" no valor de R$ ${reg.valorEnvelope || reg.fundoCaixa || 0} da loja "${reg.loja}"` : "este registro";
      const confirmado = await showConfirm(
        `[FaçaAmigos] Deseja realmente apagar o registro ${info}? Esta ação não pode ser desfeita.`,
        { icon: "🗑️", title: "Excluir registro FA", confirmText: "Excluir", cancelText: "Cancelar", confirmClass: "btn-danger" }
      );
      if (confirmado) {
        const sucesso = await excluirRegistroFAAPI(id);
        if (sucesso) {
          showToast("Registro FA apagado com sucesso!", "sucesso");
          renderFaDashboard();
          renderFaHistorico();
          renderFaMensal();
        } else {
          showModal("Erro ao apagar registro FA ou você não possui permissão.", { icon: "❌", title: "Erro" });
        }
      }
    });
  });
}

document.getElementById("fa-filtro-loja-hist").addEventListener("change", () => { faHistPaginaAtual = 1; renderFaHistorico(); });
document.getElementById("fa-filtro-status-hist").addEventListener("change", () => { faHistPaginaAtual = 1; renderFaHistorico(); });
document.getElementById("fa-busca-hist").addEventListener("input", () => { faHistPaginaAtual = 1; renderFaHistorico(); });

// FA: Exportar CSV
document.getElementById("fa-btn-exportar").addEventListener("click", () => {
  const header = ["Data", "Loja", "Consultora", "Operacao", "Fundo Caixa", "Valor Envelope", "Status", "Data Retirada", "Retirado Por", "Confirmado Por", "Mensagem Gerada", "Observacoes"];
  const linhas = registrosFA.map(r => [
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
    r.tipoOperacao === "Fechamento" ? (r.mensagemGerada ? "Sim" : "Não") : "",
    (r.observacoes ?? "").replace(/[\r\n,]/g, " "),
  ]);
  const csv = [header, ...linhas].map(l => l.map(c => `"${c}"`).join(",")).join("\n");
  const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `facaamigos_caixa_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
});

function renderFaMensal() {
  const fechamentos = registrosFA.filter(r => r.tipoOperacao === "Fechamento");
  const mesSelecionado = document.getElementById("fa-mensal-mes-filtro").value;

  const cardsWrap = document.getElementById("fa-cards-lojas-mensal");
  cardsWrap.innerHTML = "";
  const totaisMes = {};

  LOJAS_FA.forEach(loja => {
    const doMes = fechamentos.filter(r => r.loja === loja && mesKey(r.dataOperacao) === mesSelecionado);
    const total = doMes.reduce((s, r) => s + (Number(r.valorEnvelope) || 0), 0);
    totaisMes[loja] = total;

    const card = document.createElement("div");
    card.className = "loja-card fa-loja-card";
    card.innerHTML = `
      <h4>${loja}</h4>
      <div class="valor">${formatBRL(total)}</div>
      <div class="meta"><span>${doMes.length} fechamento(s) no mês</span></div>
    `;
    cardsWrap.appendChild(card);
  });

  const barChart = document.getElementById("fa-bar-chart-mensal");
  barChart.innerHTML = "";
  const maiorValor = Math.max(...Object.values(totaisMes), 1);
  LOJAS_FA.forEach(loja => {
    const total = totaisMes[loja];
    const pct = Math.round((total / maiorValor) * 100);
    const row = document.createElement("div");
    row.className = "bar-row";
    row.innerHTML = `
      <span>${loja}</span>
      <div class="bar-track"><div class="bar-fill fa-bar-fill" style="width:${pct}%"></div></div>
      <span class="bar-value">${formatBRL(total)}</span>
    `;
    barChart.appendChild(row);
  });
}

const faMensalMesInput = document.getElementById("fa-mensal-mes-filtro");
(function initFaMesFiltro() {
  const now = new Date();
  faMensalMesInput.value = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
})();
faMensalMesInput.addEventListener("change", renderFaMensal);

// ==================== FACADE: Modal confirmar retirada FA ====================
// Intercept the existing modal-confirmar for FA mode
const _originalModalConfirmar = document.getElementById("modal-confirmar-listener");
document.getElementById("modal-confirmar").addEventListener("click", async () => {
  // handled inside modal-confirmar click
});

// Override modal-confirmar button to support FA mode
const modalConfirmarBtn = document.getElementById("modal-confirmar");
const _originalConfirmarClick = modalConfirmarBtn.onclick;
modalConfirmarBtn.addEventListener("click", async function faConfirmarHandler() {
  if (this.dataset.faMode !== "true") return;
  this.dataset.faMode = "";

  const data = document.getElementById("retirada-data").value;
  const responsavel = document.getElementById("retirada-responsavel").value.trim();
  if (!data || !responsavel) {
    showModal("Preencha a data e o responsável pela retirada.", { icon: "📝", title: "Campos obrigatórios" });
    return;
  }

  const r = registrosFA.find(x => x.id === faRetiradaAlvoId);
  if (!r) return;
  const dataRetirada = new Date(data).toISOString();

  const updates = {
    status: "retirado",
    dataRetirada: dataRetirada,
    retiradoPor: responsavel,
    confirmadoPorApp: currentUser.nome,
    autorizadoPor: null
  };

  await atualizarRegistroFAAPI(faRetiradaAlvoId, updates);
  r.status = "retirado";
  r.dataRetirada = dataRetirada;
  r.retiradoPor = responsavel;
  r.confirmadoPorApp = currentUser.nome;

  document.getElementById("modal-retirada").classList.add("hidden");
  faRetiradaAlvoId = null;
  renderFaDashboard();
  showToast("Retirada FA confirmada com sucesso!", "sucesso");
});

// --- Notificações System ---
function obterNotificacoesPendentes() {
  if (!currentUser || currentUser.role !== "owner") return [];

  // Obter pendências de Cacau Show
  const cshow = (registros || []).filter(r => r.status === "aguardando_retirada" && (Number(r.valorEnvelope) || 0) > 0)
    .map(r => ({
      id: r.id,
      loja: r.loja,
      valor: Number(r.valorEnvelope) || 0,
      data: r.dataOperacao,
      consultor: r.consultor,
      origem: "Cacau Show"
    }));

  // Obter pendências de Faça Amigos
  const famigos = (registrosFA || []).filter(r => r.status === "aguardando_retirada" && (Number(r.valorEnvelope) || 0) > 0)
    .map(r => ({
      id: r.id,
      loja: r.loja,
      valor: Number(r.valorEnvelope) || 0,
      data: r.dataOperacao,
      consultor: r.consultor,
      origem: "Faça Amigos"
    }));

  // Combinamos ambas e ordenamos pela data da operação (mais recente primeiro)
  return [...cshow, ...famigos].sort((a, b) => new Date(b.data) - new Date(a.data));
}

function atualizarNotificacoes() {
  const btnNotif = document.getElementById("btn-notificacoes");
  const badgeNotif = document.getElementById("notificacao-badge");
  const dropdown = document.getElementById("notifications-dropdown");
  const list = document.getElementById("notifications-list");

  if (!btnNotif || !badgeNotif) return;

  if (!currentUser || currentUser.role !== "owner") {
    btnNotif.classList.add("hidden");
    if (dropdown) dropdown.classList.add("hidden");
    return;
  }

  btnNotif.classList.remove("hidden");

  const pendentes = obterNotificacoesPendentes();
  
  // Obter IDs já lidos de localStorage
  let lidas = [];
  try {
    lidas = JSON.parse(localStorage.getItem("notificacoes_lidas")) || [];
  } catch (e) {
    lidas = [];
  }

  // Filtrar apenas as pendências que ainda não foram marcadas como lidas
  const unreadCount = pendentes.filter(p => !lidas.includes(p.id)).length;

  if (unreadCount > 0) {
    badgeNotif.textContent = unreadCount;
    badgeNotif.classList.remove("hidden");
  } else {
    badgeNotif.classList.add("hidden");
  }

  // Renderizar a lista (limitado às últimas 7)
  if (list) {
    list.innerHTML = "";
    const ultimasSete = pendentes.slice(0, 7);

    if (ultimasSete.length === 0) {
      list.innerHTML = `
        <div class="notification-empty">
          <i class="fa-regular fa-bell-slash"></i>
          Nenhuma pendência recente
        </div>
      `;
    } else {
      ultimasSete.forEach(p => {
        const isUnread = !lidas.includes(p.id);
        const item = document.createElement("div");
        item.className = `notification-item${isUnread ? " unread" : ""}`;
        item.dataset.id = p.id;
        
        // Formatar data
        let dataFormatada = "";
        try {
          dataFormatada = new Date(p.data).toLocaleDateString("pt-BR", {
            day: "2-digit",
            month: "2-digit",
            year: "numeric"
          });
        } catch(e) {
          dataFormatada = p.data;
        }

        const origemClass = p.origem === "Cacau Show" ? "cacau" : "faca";
        const valorFormatado = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(p.valor);

        item.innerHTML = `
          <div class="notification-meta">
            <span class="notification-origin ${origemClass}">${p.origem}</span>
            <span class="notification-date">${dataFormatada}</span>
          </div>
          <div class="notification-title">${p.loja}</div>
          <div class="notification-desc">${valorFormatado} • Reg. por ${p.consultor}</div>
        `;

        item.addEventListener("click", () => {
          if (isUnread) {
            marcarComoLida(p.id);
          }
        });

        list.appendChild(item);
      });
    }
  }
}

function marcarComoLida(id) {
  let lidas = [];
  try {
    lidas = JSON.parse(localStorage.getItem("notificacoes_lidas")) || [];
  } catch (e) {}

  if (!lidas.includes(id)) {
    lidas.push(id);
    localStorage.setItem("notificacoes_lidas", JSON.stringify(lidas));
    atualizarNotificacoes();
  }
}

function marcarTodasComoLidas() {
  const pendentes = obterNotificacoesPendentes();
  let lidas = [];
  try {
    lidas = JSON.parse(localStorage.getItem("notificacoes_lidas")) || [];
  } catch (e) {}

  pendentes.forEach(p => {
    if (!lidas.includes(p.id)) {
      lidas.push(p.id);
    }
  });

  localStorage.setItem("notificacoes_lidas", JSON.stringify(lidas));
  atualizarNotificacoes();
}

// Configurar Event Listeners das notificações
function inicializarNotificacoesListeners() {
  const btnNotif = document.getElementById("btn-notificacoes");
  const dropdown = document.getElementById("notifications-dropdown");
  const btnMarcarLidas = document.getElementById("btn-marcar-todas-lidas");

  if (btnNotif && dropdown) {
    btnNotif.onclick = (e) => {
      e.stopPropagation();
      dropdown.classList.toggle("hidden");
    };
  }

  if (btnMarcarLidas) {
    btnMarcarLidas.onclick = (e) => {
      e.stopPropagation();
      marcarTodasComoLidas();
    };
  }

  // Fechar ao clicar fora
  document.addEventListener("click", (e) => {
    if (dropdown && !dropdown.classList.contains("hidden")) {
      if (!dropdown.contains(e.target) && e.target !== btnNotif) {
        dropdown.classList.add("hidden");
      }
    }
  });
}

// --- Dashboard ---

function renderDashboard() {
  const filtroLoja = document.getElementById("filtro-loja-pendentes").value;
  const pendentes = registros.filter(r => r.status === "aguardando_retirada" && (Number(r.valorEnvelope) || 0) > 0);

  // --- Atualizar Badge de Notificação (Pendências) ---
  atualizarNotificacoes();


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
    const total = doLoja.reduce((s, r) => s + (Number(r.valorEnvelope) || 0), 0);
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

  let selecionadosPendentes = new Set();

  function atualizarBatchBarPendentes(filtrados) {
    const bar = document.getElementById("batch-actions-pendentes");
    const countInfo = document.getElementById("batch-count-info");
    const selectAllCheckbox = document.getElementById("select-all-pendentes");

    if (!bar) return;

    if (selecionadosPendentes.size > 0) {
      bar.classList.remove("hidden");
      const selecionadosList = filtrados.filter(r => selecionadosPendentes.has(r.id));
      const totalValor = selecionadosList.reduce((s, r) => s + (Number(r.valorEnvelope) || 0), 0);
      countInfo.textContent = `${selecionadosPendentes.size} envelope(s) selecionado(s) (${formatBRL(totalValor)})`;
    } else {
      bar.classList.add("hidden");
    }

    if (selectAllCheckbox) {
      selectAllCheckbox.checked = filtrados.length > 0 && filtrados.every(r => selecionadosPendentes.has(r.id));
      selectAllCheckbox.indeterminate = selecionadosPendentes.size > 0 && !selectAllCheckbox.checked;
    }
  }

  const filtrados = filtroLoja ? pendentes.filter(r => r.loja === filtroLoja) : pendentes;
  const tbody = document.querySelector("#tabela-pendentes tbody");
  tbody.innerHTML = "";

  const podeRetirar = RETIRADA_PERMITIDA.includes(currentUser.nome);

  // Limpar IDs selecionados que não estão mais na lista de filtrados
  const idsFiltrados = new Set(filtrados.map(r => r.id));
  selecionadosPendentes = new Set([...selecionadosPendentes].filter(id => idsFiltrados.has(id)));

  filtrados
    .sort((a, b) => new Date(b.dataOperacao) - new Date(a.dataOperacao))
    .forEach(r => {
      const dias = diffDias(r.dataOperacao);
      const risco = dias >= RISCO_DIAS;
      const isSelected = selecionadosPendentes.has(r.id);
      const tr = document.createElement("tr");
      if (isSelected) tr.classList.add("selected-row");

      tr.innerHTML = `
        <td style="text-align: center;">
          ${podeRetirar ? `<input type="checkbox" class="chk-pendente" data-id="${r.id}" ${isSelected ? "checked" : ""}>` : ""}
        </td>
        <td>${r.loja}</td>
        <td>${r.consultor}</td>
        <td>${formatDataHora(r.dataOperacao)}</td>
        <td>${formatBRL(r.valorEnvelope)}</td>
        <td><span class="dias-badge ${risco ? "risco" : ""}">${dias}d</span></td>
        <td>${fotoCelula(r)}</td>
        <td>${avisoCelula(r)}</td>
        <td>${podeRetirar
          ? `<button class="btn-retirar" data-id="${r.id}">Marcar retirado</button>`
          : `<span class="retirada-bloqueada">🔒 Só Bruno, Isabella, Alexandra ou LiderOP</span>`}</td>
      `;
      tbody.appendChild(tr);
    });

  atualizarBatchBarPendentes(filtrados);

  document.getElementById("pendentes-vazio").classList.toggle("hidden", filtrados.length > 0);

  // Checkbox Select All Listener
  const selectAll = document.getElementById("select-all-pendentes");
  if (selectAll) {
    selectAll.onclick = () => {
      if (selectAll.checked) {
        filtrados.forEach(r => selecionadosPendentes.add(r.id));
      } else {
        selecionadosPendentes.clear();
      }
      renderDashboard();
    };
  }

  // Individual Checkbox Listeners
  tbody.querySelectorAll(".chk-pendente").forEach(chk => {
    chk.addEventListener("change", (e) => {
      e.stopPropagation();
      const id = chk.dataset.id;
      if (chk.checked) {
        selecionadosPendentes.add(id);
      } else {
        selecionadosPendentes.delete(id);
      }
      renderDashboard();
    });
  });

  const btnBatch = document.getElementById("btn-batch-retirar");
  if (btnBatch) {
    btnBatch.onclick = () => {
      if (selecionadosPendentes.size > 0) {
        abrirModalRetirada(Array.from(selecionadosPendentes));
      }
    };
  }

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

function abrirModalRetirada(target) {
  if (!RETIRADA_PERMITIDA.includes(currentUser.nome)) {
    showModal("Apenas Bruno, Isabella, Alexandra ou LiderOP podem confirmar retiradas.", { icon: "🔒", title: "Acesso restrito" });
    return;
  }
  retiradaAlvoId = target; // Pode ser uma string ID ou um Array de IDs
  const isBatch = Array.isArray(target);

  if (isBatch) {
    const selecionadosList = registros.filter(x => target.includes(x.id));
    const totalVal = selecionadosList.reduce((s, r) => s + (Number(r.valorEnvelope) || 0), 0);
    document.getElementById("modal-sub-info").textContent =
      `[Retirada em Lote] ${target.length} envelopes selecionados — Total: ${formatBRL(totalVal)}`;
  } else {
    const r = registros.find(x => x.id === target);
    document.getElementById("modal-sub-info").textContent =
      `${r.loja} — ${r.consultor} — ${formatBRL(r.valorEnvelope)}`;
  }

  setAgora(document.getElementById("retirada-data"));
  document.getElementById("retirada-responsavel").value = "";
  autorizacaoPinInput.value = "";

  const precisaAutorizacao = currentUser.nome === "Alexandra" || currentUser.nome === "LiderOP";
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
  if (currentUser.nome === "Alexandra" || currentUser.nome === "LiderOP") {
    const pinDigitado = autorizacaoPinInput.value.trim();
    autorizadoPor = AUTORIZADORES.find(nome => pins[nome] && pins[nome] === pinDigitado);
    if (!autorizadoPor) {
      showModal("PIN de autorização inválido. Peça para Bruno ou Isabella autorizar com o PIN deles.", { icon: "🔑", title: "Autorização necessária" });
      return;
    }
  }

  const isFA = document.getElementById("modal-confirmar").dataset.faMode === "true";
  const targets = Array.isArray(retiradaAlvoId) ? retiradaAlvoId : [retiradaAlvoId];
  const dataRetirada = new Date(data).toISOString();

  const updates = {
    status: "retirado",
    dataRetirada: dataRetirada,
    retiradoPor: responsavel,
    confirmadoPorApp: currentUser.nome,
    autorizadoPor: autorizadoPor
  };

  for (const id of targets) {
    if (isFA) {
      await atualizarRegistroFAAPI(id, updates);
      const r = registrosFA.find(x => x.id === id);
      if (r) {
        r.status = "retirado";
        r.dataRetirada = dataRetirada;
        r.retiradoPor = responsavel;
        r.confirmadoPorApp = currentUser.nome;
      }
    } else {
      await atualizarRegistroAPI(id, updates);
      const r = registros.find(x => x.id === id);
      if (r) {
        r.status = "retirado";
        r.dataRetirada = dataRetirada;
        r.retiradoPor = responsavel;
        r.confirmadoPorApp = currentUser.nome;
        r.autorizadoPor = autorizadoPor;
      }
    }
  }

  delete document.getElementById("modal-confirmar").dataset.faMode;
  modalRetirada.classList.add("hidden");
  retiradaAlvoId = null;

  if (isFA) {
    renderFaDashboard();
    showToast(`${targets.length} retirada(s) FA confirmada(s) com sucesso!`, "sucesso");
  } else {
    renderDashboard();
    showToast(`${targets.length} retirada(s) confirmada(s) com sucesso!`, "sucesso");
  }
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

const RETIRADA_CUTOFFS = {
  'Icoaraci': '2025-06-05T23:59:59.999Z',
  'Marambaia': '2025-06-06T23:59:59.999Z',
  'Desligado': '2025-06-06T23:59:59.999Z',
  'Mário Covas': '2025-06-06T23:59:59.999Z',
  'Venda Direta': '2025-06-06T23:59:59.999Z'
};

function eHistoricoArquivado(r) {
  if (!r || !r.dataOperacao) return false;
  const cutoff = RETIRADA_CUTOFFS[r.loja] || '2025-06-06T23:59:59.999Z';
  return r.dataOperacao <= cutoff;
}

const HIST_PER_PAGE = 20;
let histPaginaAtual = 1;

function renderHistorico() {
  const filtroLoja = document.getElementById("filtro-loja-hist").value;
  const filtroStatus = document.getElementById("filtro-status-hist").value;
  const busca = document.getElementById("busca-hist").value.trim().toLowerCase();

  let lista = [...registros].sort((a, b) => new Date(b.dataOperacao) - new Date(a.dataOperacao));
  if (filtroLoja) lista = lista.filter(r => r.loja === filtroLoja);

  if (filtroStatus === "ativas") {
    lista = lista.filter(r => !eHistoricoArquivado(r));
  } else if (filtroStatus === "arquivados") {
    lista = lista.filter(r => eHistoricoArquivado(r));
  } else if (filtroStatus) {
    lista = lista.filter(r => r.status === filtroStatus);
  }

  if (busca) {
    lista = lista.filter(r =>
      [r.loja, r.consultor, r.observacoes].some(v => (v || "").toLowerCase().includes(busca))
    );
  }

  // KPIs (#9) (Ocultado a pedido do usuário)
  const kpiBar = document.getElementById("hist-kpi-bar");
  if (kpiBar) {
    kpiBar.remove();
  }

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
      const id = btn.dataset.id;
      const reg = registros.find(r => r.id === id);
      const info = reg ? `do colaborador "${reg.consultor}" no valor de R$ ${reg.valorEnvelope || reg.fundoCaixa || 0} da loja "${reg.loja}"` : "este registro";
      const confirmado = await showConfirm(
        `Deseja realmente apagar permanentemente o registro ${info}? Esta ação não pode ser desfeita.`,
        { icon: "🗑️", title: "Excluir registro", confirmText: "Excluir", cancelText: "Cancelar", confirmClass: "btn-danger" }
      );
      if (confirmado) {
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
    const total = doMes.reduce((s, r) => s + (Number(r.valorEnvelope) || 0), 0);
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
    somaPorMesLoja[chave].total += Number(r.valorEnvelope) || 0;
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
atualizarFaCamposPorOperacao();
inicializarDados();

// Polling suave de conectividade a cada 10 segundos
setInterval(checkApiConnection, 10000);

// ==========================================================================
// AUDITORIA (Rastreabilidade)
// ==========================================================================
async function carregarAuditoria() {
  if (currentUser?.role !== "owner") return;
  const timelineWrap = document.getElementById("auditoria-timeline");
  const vazioMsg = document.getElementById("auditoria-vazio");
  const btnAtualizar = document.getElementById("btn-atualizar-auditoria");

  if (btnAtualizar) setLoading(btnAtualizar, true);

  try {
    const res = await fetch(`${API_BASE}/logs?usuario=${encodeURIComponent(currentUser.nome)}`);
    if (!res.ok) throw new Error("Sem permissão ou falha na API");
    const logs = await res.json();

    timelineWrap.innerHTML = "";
    if (logs.length === 0) {
      vazioMsg.classList.remove("hidden");
    } else {
      vazioMsg.classList.add("hidden");
      logs.forEach(log => {
        const item = document.createElement("div");
        item.className = "timeline-item";
        item.innerHTML = `
          <div class="timeline-icon">${log.acao === 'DELETE' ? '🗑️' : '📝'}</div>
          <div class="timeline-content">
            <div class="timeline-header">
              <span>${new Date(log.data).toLocaleString("pt-BR")}</span>
              <strong>${log.usuario}</strong>
            </div>
            <div class="timeline-body">
              <span class="status-pill ${log.acao === 'DELETE' ? 'status-aguardando_retirada' : 'status-retirado'}">${log.acao}</span>
              <p style="margin-top: 8px;">${log.descricao}</p>
            </div>
          </div>
        `;
        timelineWrap.appendChild(item);
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
let sessionTimer = null;
let sessionWarningTimer = null;
const SESSION_EVENTS = ["mousedown", "mousemove", "keydown", "touchstart", "scroll", "click"];

function resetSessionTimer() {
  if (!currentUser || sessionTimeoutMs === 0) {
    clearTimeout(sessionTimer);
    clearTimeout(sessionWarningTimer);
    return;
  }
  clearTimeout(sessionTimer);
  clearTimeout(sessionWarningTimer);

  // Warning timer (5 min antes ou logo antes de expirar)
  const warningTime = Math.max(1000, sessionTimeoutMs - 5 * 60 * 1000);
  sessionWarningTimer = setTimeout(() => {
    showToast("Sua sessão será bloqueada em breve por inatividade.", "info");
  }, warningTime);

  // Lock timer
  sessionTimer = setTimeout(() => {
    lockSession();
  }, sessionTimeoutMs);
}

function lockSession() {
  if (!currentUser) return;
  const overlay = document.getElementById("session-overlay");
  overlay.classList.remove("hidden");
  const sessionPin = document.getElementById("session-pin");
  sessionPin.value = "";
  updatePinDots(sessionPin, "pin-dots-session");
  document.getElementById("session-msg").classList.add("hidden");
  sessionPin.focus();
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

// ==========================================================================
// RESUMO MATINAL (#6) — Apenas para Alexandra, Bruno e Isabella
// ==========================================================================
const RESUMO_KEY = "cacaushow_ultimo_resumo";
const RESUMO_USUARIOS = ["Alexandra", "LiderOP", "Bruno", "Isabella"];

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
  const pendentes = registros.filter(r => r.status === "aguardando_retirada" && (Number(r.valorEnvelope) || 0) > 0);
  const totalPendente = pendentes.reduce((s, r) => s + (Number(r.valorEnvelope) || 0), 0);
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
checkApiConnection = async function () {
  const wasOffline = !API_ONLINE;
  await _originalCheckApi();
  if (wasOffline && API_ONLINE) {
    processarFilaSync();
  }
};

// Badge de sync pendente
atualizarBadgeSync();

// ==================== PUSH NOTIFICATIONS ====================
async function inscreverPushNotificacoes() {
  if (currentUser.role !== 'owner' && currentUser.nome !== 'Alexandra' && currentUser.nome !== 'LiderOP') return;
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;

  try {
    const swReg = await navigator.serviceWorker.register('/sw.js');
    console.log('Service Worker registrado', swReg);

    let subscription = await swReg.pushManager.getSubscription();
    if (!subscription) {
      const resVapid = await fetch('/api/vapidPublicKey');
      const vapidPublicKey = await resVapid.text();

      const convertedVapidKey = urlBase64ToUint8Array(vapidPublicKey);
      subscription = await swReg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: convertedVapidKey
      });
    }

    await fetch('/api/subscribe', {
      method: 'POST',
      body: JSON.stringify({ subscription, usuario: currentUser.nome }),
      headers: { 'Content-Type': 'application/json' }
    });
    console.log('Inscrição push enviada para o servidor.');
  } catch (error) {
    console.error('Erro ao inscrever push notification', error);
  }
}

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/\-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

// ==================== PWA INSTALL PROMPT ====================
let deferredInstallPrompt = null;
const btnInstalarPwa = document.getElementById("btn-instalar-pwa");

window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  deferredInstallPrompt = e;
  if (btnInstalarPwa) {
    btnInstalarPwa.classList.remove("hidden");
  }
});

if (btnInstalarPwa) {
  btnInstalarPwa.addEventListener("click", async () => {
    if (!deferredInstallPrompt) return;
    deferredInstallPrompt.prompt();
    const { outcome } = await deferredInstallPrompt.userChoice;
    console.log(`Resultado do prompt de instalação: ${outcome}`);
    deferredInstallPrompt = null;
    btnInstalarPwa.classList.add("hidden");
  });
}

window.addEventListener("appinstalled", () => {
  console.log("Aplicativo Controle de Caixa instalado com sucesso.");
  if (btnInstalarPwa) {
    btnInstalarPwa.classList.add("hidden");
  }
  showToast("Aplicativo Controle de Caixa instalado com sucesso!", "success");
});

// ==========================================================================
// MÓDULO: GERENCIAMENTO DE COLABORADORES & PINS (Acesso Bruno e Isabella)
// ==========================================================================

async function carregarColaboradores() {
  if (API_ONLINE) {
    try {
      const res = await fetch(`${API_BASE}/colaboradores`);
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        USERS = data.map(c => ({ nome: c.nome, role: c.role }));
        localStorage.setItem("cacaushow_users_cache", JSON.stringify(USERS));

        // FORÇAR ATUALIZAÇÃO DO ROLE SE MUDOU NO BANCO
        if (currentUser) {
          const userDb = USERS.find(u => u.nome === currentUser.nome);
          if (userDb && userDb.role !== currentUser.role) {
            currentUser.role = userDb.role;
            localStorage.setItem("session_user", JSON.stringify(currentUser));
            console.log(`Permissão de ${currentUser.nome} atualizada para ${currentUser.role}`);
            // Recarrega permissões na interface
            if (typeof iniciarModuloBase === "function") {
              iniciarModuloBase();
            }
          }
        }
      }
    } catch (e) {
      console.error("Erro ao carregar colaboradores:", e);
    }
  } else {
    const cachedUsers = carregarJSON("cacaushow_users_cache", null);
    if (cachedUsers) USERS = cachedUsers;
  }
  preencherDropdownUsuarios();
}

function preencherDropdownUsuarios() {
  if (typeof renderLoginUserGrid === "function") renderLoginUserGrid();

  // Atualizar select de consultoras nos formulários
  const consultorSelect = document.getElementById("consultor");
  if (consultorSelect && !consultorSelect.disabled) {
    const valConsultor = consultorSelect.value;
    const consultorasCacau = USERS.filter(u => u.role !== "consultora_fa");
    consultorSelect.innerHTML = `<option value="" disabled selected>Selecione</option>` +
      consultorasCacau.map(u => `<option value="${u.nome}">${u.nome}</option>`).join("");
    if (valConsultor) consultorSelect.value = valConsultor;
  }

  const faConsultorSelect = document.getElementById("fa-consultor");
  if (faConsultorSelect && !faConsultorSelect.disabled) {
    const valFAConsultor = faConsultorSelect.value;
    const consultorasFA = USERS.filter(u => u.role === "consultora_fa" || u.role === "owner");
    faConsultorSelect.innerHTML = `<option value="" disabled selected>Selecione</option>` +
      consultorasFA.map(u => `<option value="${u.nome}">${u.nome}</option>`).join("");
    if (valFAConsultor) faConsultorSelect.value = valFAConsultor;
  }
}

async function renderizarColaboradores() {
  await carregarColaboradores();
  const tbody = document.getElementById("colaboradores-tbody");
  if (!tbody) return;

  const roleLabels = {
    consultora: "Consultora (Apenas Registro)",
    consultora_dashboard: "Líder de Operações Cacau Show",
    consultora_fa: "Consultora FaçaAmigos (FA)",
    owner: "Administrador / Owner (Bruno e Isabella)"
  };

  const roleStyles = {
    consultora: "background: rgba(33, 150, 243, 0.12); color: #1976d2;",
    consultora_dashboard: "background: rgba(156, 39, 176, 0.12); color: #7b1fa2;",
    consultora_fa: "background: rgba(255, 152, 0, 0.12); color: #e65100;",
    owner: "background: rgba(76, 175, 80, 0.12); color: #2e7d32;"
  };

  tbody.innerHTML = "";
  if (USERS.length === 0) {
    tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; padding: 20px;">Nenhum colaborador encontrado.</td></tr>`;
    return;
  }

  USERS.forEach(u => {
    const tr = document.createElement("tr");
    const temPin = pins[u.nome] && pins[u.nome] !== '';
    const statusPinHtml = temPin
      ? `<span style="color: #2e7d32; font-weight: 500;">🔒 PIN Cadastrado</span>`
      : `<span style="color: #d9534f; font-weight: 500;">⚠️ Sem PIN (Cria no 1º login)</span>`;

    const labelRole = roleLabels[u.role] || u.role;
    const styleBadge = roleStyles[u.role] || "background: rgba(0,0,0,0.06); color: #333;";

    tr.innerHTML = `
      <td><strong>${u.nome}</strong></td>
      <td><span style="padding: 4px 10px; border-radius: 12px; font-size: 0.82rem; font-weight: 600; display: inline-block; ${styleBadge}">${labelRole}</span></td>
      <td>${statusPinHtml}</td>
      <td style="text-align: right; white-space: nowrap;">
        <button class="btn-mini-outline btn-alterar-pin" data-nome="${u.nome}" style="margin-right: 6px;">✏️ Alterar PIN</button>
        <button class="btn-mini-outline btn-excluir-colab" data-nome="${u.nome}" style="color: #d9534f; border-color: #d9534f;">🗑️ Excluir</button>
      </td>
    `;
    tbody.appendChild(tr);
  });

  tbody.querySelectorAll(".btn-alterar-pin").forEach(btn => {
    btn.onclick = () => abrirModalAdminPin(btn.dataset.nome);
  });

  tbody.querySelectorAll(".btn-excluir-colab").forEach(btn => {
    btn.onclick = () => excluirColaborador(btn.dataset.nome);
  });
}

let usuarioPinAdminEmEdicao = null;

function abrirModalAdminPin(nome) {
  usuarioPinAdminEmEdicao = nome;
  document.getElementById("admin-pin-user-name").textContent = nome;
  document.getElementById("admin-pin-input").value = "";
  document.getElementById("modal-admin-pin").classList.remove("hidden");
}

function fecharModalAdminPin() {
  usuarioPinAdminEmEdicao = null;
  document.getElementById("modal-admin-pin").classList.add("hidden");
}

const btnAdminPinCancelar = document.getElementById("admin-pin-cancelar");
if (btnAdminPinCancelar) btnAdminPinCancelar.onclick = fecharModalAdminPin;

const btnAdminPinSalvar = document.getElementById("admin-pin-salvar");
if (btnAdminPinSalvar) {
  btnAdminPinSalvar.onclick = async () => {
    if (!usuarioPinAdminEmEdicao) return;
    const pinDigitado = document.getElementById("admin-pin-input").value.trim();
    if (!pinValido(pinDigitado)) {
      showToast("O PIN deve conter exatamente 4 dígitos.", "erro");
      return;
    }
    await salvarPinAPI(usuarioPinAdminEmEdicao, pinDigitado);
    pins[usuarioPinAdminEmEdicao] = '****';
    localStorage.setItem(PIN_KEY, JSON.stringify(pins));
    showToast(`PIN de ${usuarioPinAdminEmEdicao} alterado com sucesso!`, "sucesso");
    fecharModalAdminPin();
    renderizarColaboradores();
  };
}

const btnAdminPinResetar = document.getElementById("admin-pin-resetar");
if (btnAdminPinResetar) {
  btnAdminPinResetar.onclick = async () => {
    if (!usuarioPinAdminEmEdicao) return;
    const ok = await showModal(`Deseja remover o PIN de "${usuarioPinAdminEmEdicao}"? O usuário precisará criar um novo PIN ao fazer login.`, {
      title: "Resetar PIN",
      icon: "🔑",
      btnText: "Resetar PIN",
      btnClass: "btn-danger"
    });
    if (!ok) return;

    if (API_ONLINE) {
      try {
        await fetch(`${API_BASE}/pins/${encodeURIComponent(usuarioPinAdminEmEdicao)}`, { method: "DELETE" });
      } catch (e) { console.error(e); }
    }
    delete pins[usuarioPinAdminEmEdicao];
    localStorage.setItem(PIN_KEY, JSON.stringify(pins));
    showToast(`PIN de ${usuarioPinAdminEmEdicao} removido.`, "info");
    fecharModalAdminPin();
    renderizarColaboradores();
  };
}

async function excluirColaborador(nome) {
  if (nome === "Bruno" || nome === "Isabella") {
    showToast("Os administradores Bruno e Isabella não podem ser excluídos.", "erro");
    return;
  }
  const ok = await showModal(`Tem certeza que deseja excluir o colaborador "${nome}"? Esta ação é irreversível.`, {
    title: "Excluir Colaborador",
    icon: "⚠️",
    btnText: "Excluir Colaborador",
    btnClass: "btn-danger"
  });
  if (!ok) return;

  if (API_ONLINE) {
    try {
      const res = await fetch(`${API_BASE}/colaboradores/${encodeURIComponent(nome)}`, { method: "DELETE" });
      const resData = await res.json();
      if (resData.error) {
        showToast(`Erro ao excluir: ${resData.error}`, "erro");
        return;
      }
    } catch (e) {
      showToast("Erro ao se conectar ao servidor.", "erro");
      return;
    }
  }

  delete pins[nome];
  localStorage.setItem(PIN_KEY, JSON.stringify(pins));
  USERS = USERS.filter(u => u.nome !== nome);
  localStorage.setItem("cacaushow_users_cache", JSON.stringify(USERS));

  showToast(`Colaborador "${nome}" excluído com sucesso!`, "sucesso");
  await renderizarColaboradores();
}

const formCadastrarColab = document.getElementById("form-cadastrar-colaborador");
if (formCadastrarColab) {
  formCadastrarColab.onsubmit = async (e) => {
    e.preventDefault();
    const nome = document.getElementById("colab-nome").value.trim();
    const role = document.getElementById("colab-role").value;
    const pin = document.getElementById("colab-pin").value.trim();

    if (!nome) {
      showToast("Informe o nome do colaborador.", "erro");
      return;
    }

    if (pin && !pinValido(pin)) {
      showToast("Se informado, o PIN deve conter exatamente 4 dígitos.", "erro");
      return;
    }

    if (API_ONLINE) {
      try {
        const res = await fetch(`${API_BASE}/colaboradores`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ nome, role })
        });
        const data = await res.json();
        if (data.error) {
          showToast(`Erro: ${data.error}`, "erro");
          return;
        }
        if (pin) {
          await salvarPinAPI(nome, pin);
          pins[nome] = '****';
          localStorage.setItem(PIN_KEY, JSON.stringify(pins));
        }
      } catch (err) {
        showToast("Erro de comunicação com o servidor.", "erro");
        return;
      }
    } else {
      const idx = USERS.findIndex(u => u.nome === nome);
      if (idx >= 0) USERS[idx].role = role;
      else USERS.push({ nome, role });
      localStorage.setItem("cacaushow_users_cache", JSON.stringify(USERS));
      if (pin) {
        pins[nome] = pin;
        localStorage.setItem(PIN_KEY, JSON.stringify(pins));
      }
    }

    showToast(`Colaborador "${nome}" salvo com sucesso!`, "sucesso");
    formCadastrarColab.reset();
    await renderizarColaboradores();
  };
}

const btnAtualizarColab = document.getElementById("btn-atualizar-colaboradores");
if (btnAtualizarColab) {
  btnAtualizarColab.onclick = async () => {
    await renderizarColaboradores();
    showToast("Lista de colaboradores atualizada.", "info");
  };
}

/* ==========================================================================
   CACAU SHOW UNIFIED DATABASE BRIDGE - INTEGRAÇÃO APP CONTROLE DE CAIXA & INVENTÁRIO
   ========================================================================== */
class CacauShowControlBoxBridge {
  constructor() {
    this.channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('cacaushow_app_bridge') : null;
    this.initListeners();
  }

  initListeners() {
    if (this.channel) {
      this.channel.onmessage = (event) => {
        if (event.data && event.data.type === 'INVENTORY_UPDATE') {
          const { storeId, payload } = event.data;
          console.log(`📦 [Inventário & Validade -> Caixa] Atualização recebida para a Loja ${storeId}:`, payload);
          if (typeof showToast === 'function') {
            showToast(`📦 Estoque Atualizado: ${payload.description} (${payload.countedQty || 0} UN)`, "info");
          }
        }
      };
    }
  }

  // Obter inventário e validades da loja
  getInventarioLoja(storeId) {
    const items = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key.startsWith(`cacaushow_db_inventory_${storeId}_`)) {
        try {
          items.push(JSON.parse(localStorage.getItem(key)));
        } catch (e) { }
      }
    }
    return items;
  }

  // Dar baixa de venda no estoque do inventário direto do Caixa
  baixarEstoqueVenda(storeId, productCode, qtdVendida) {
    const key = `cacaushow_db_inventory_${storeId}_${productCode}`;
    const data = localStorage.getItem(key);
    if (data) {
      const item = JSON.parse(data);
      const atual = Number(item.countedQty || 0);
      item.countedQty = Math.max(0, atual - qtdVendida);
      item.lastUpdated = new Date().toISOString();

      localStorage.setItem(key, JSON.stringify(item));
      if (this.channel) {
        this.channel.postMessage({ type: 'INVENTORY_UPDATE', storeId, payload: item });
      }
      return item;
    }
    return null;
  }

  // Salvar item de inventário individualmente no localStorage e notificar via BroadcastChannel
  saveInventoryItem(storeId, item) {
    if (!storeId || !item || !item.code) return;
    const key = `cacaushow_db_inventory_${storeId}_${item.code}`;
    const payload = {
      code: item.code,
      barras: item.barras || '',
      description: item.description || '',
      validade: item.validade ? new Date(item.validade).toISOString() : null,
      daysRemaining: item.daysRemaining,
      countedQty: item.countedQty !== undefined ? item.countedQty : '',
      dataEntrada: item.dataEntrada || '',
      qtdEntradaUnidades: item.qtdEntradaUnidades || 0,
      lastUpdated: new Date().toISOString()
    };
    localStorage.setItem(key, JSON.stringify(payload));
    if (this.channel) {
      this.channel.postMessage({ type: 'INVENTORY_UPDATE', storeId, payload });
    }
    return payload;
  }
}

window.cacauShowBoxBridge = new CacauShowControlBoxBridge();
const dbBridge = window.cacauShowBoxBridge;

/* ==========================================================================
   CACAU SHOW LOGISTICS & INVENTORY SYSTEM - INTEGRATED ENGINE
   ========================================================================== */

let products = [];
let currentFilter = 'all';
let searchQuery = '';
let html5QrCode = null;
let importedNfs = {};
let activeNfNumber = null;
let activeNfNumbers = [];
let selectedNfNumbers = [];
let nfSearchQuery = '';
let html5QrCodeNf = null;
let currentStore = '9175';
let nfGalleryStoreFilter = null; // aba ativa da galeria de NF-e (separação física por loja)
const today = new Date();
const formattedTodayStr = today.toLocaleDateString('pt-BR');

// ==========================================================================
// CODBARRA_CONSULTA — Biblioteca de Consulta de Códigos de Barras
// Regra de prioridade na leitura:
//   1º) CodBarra (EAN/barras do produto) — campo "barras" no XML da NF-e
//   2º) CodProduto (código da etiqueta da caixa) — fallback via CSV
// Os dois mapas abaixo permitem converter em ambas as direções:
//   codBarraParaCodProd["7896986207013"] → "1000001"
//   codProdParaCodBarra["1000001"]       → "7896986207013"
// ==========================================================================
let codBarraParaCodProd = {}; // CodBarra (EAN) → CodProd
let codProdParaCodBarra = {}; // CodProd → CodBarra (EAN)
let codBarraParaDesc    = {}; // CodBarra → Descrição do produto
let codProdParaDesc     = {}; // CodProd  → Descrição do produto

// Parser CSV que respeita campos entre aspas (ex: "BOMBOM 13,5G" tem vírgula interna)
function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

async function carregarCodBarraConsulta() {
  try {
    const url = window.location.protocol === 'file:'
      ? 'http://localhost:5000/api/codbarra-consulta'
      : '/api/codbarra-consulta';
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const csvText = await res.text();
    const linhas = csvText.split(/\r?\n/);
    // Header: CodProd,Desc. Prod.,CodBarra
    // O CodBarra é sempre a última coluna; a descrição pode conter vírgulas (campos entre aspas)
    for (let i = 1; i < linhas.length; i++) {
      const linha = linhas[i].trim();
      if (!linha) continue;
      const partes = parseCSVLine(linha);
      if (partes.length < 2) continue;
      const codProd  = partes[0].trim();
      const codBarra = partes[partes.length - 1].trim();
      const desc     = partes.slice(1, partes.length - 1).join(',').trim();
      if (codProd) {
        codProdParaDesc[codProd] = desc;
        if (codBarra) {
          codBarraParaCodProd[codBarra]  = codProd;
          codProdParaCodBarra[codProd]   = codBarra;
          codBarraParaDesc[codBarra]     = desc;
        }
      }
    }
    console.log(`[CodBarra] Biblioteca carregada: ${Object.keys(codBarraParaCodProd).length} registros com EAN, ${Object.keys(codProdParaDesc).length} produtos no total.`);
    // Enriquece produtos sem EAN no inventário e nas NF-es importadas
    enrichirProdutosComBarras();
  } catch (err) {
    console.warn('[CodBarra] Falha ao carregar Codbarra_Consulta.csv:', err.message);
  }
}

// Popula o campo barras (EAN) em produtos de NF-e e itens de inventário que chegaram sem EAN.
// Usa o CSV como ponte: CodProd → CodBarra. Isso garante que a leitura pelo scanner
// seja sempre resolvida na 1ª tentativa (CodBarra direto), evitando depender do fallback.
function enrichirProdutosComBarras() {
  // Enriquece NF-es importadas
  let nfsAlteradas = false;
  for (const key of Object.keys(importedNfs)) {
    const nf = importedNfs[key];
    if (!Array.isArray(nf.products)) continue;
    for (const p of nf.products) {
      if (!p.barras && p.code) {
        const ean = codProdParaCodBarra[p.code.toString()];
        if (ean) { p.barras = ean; nfsAlteradas = true; }
      }
    }
  }
  if (nfsAlteradas) {
    try { localStorage.setItem('cacaushow_imported_nfs', JSON.stringify(importedNfs)); } catch (e) {}
  }

  // Enriquece itens de inventário em localStorage
  const lojas = ['9175', '4304', '9201'];
  for (const lojaId of lojas) {
    const items = dbBridge.getInventarioLoja(lojaId);
    for (const item of items) {
      if (!item.barras && item.code) {
        const ean = codProdParaCodBarra[item.code.toString()];
        if (ean) { item.barras = ean; dbBridge.saveInventoryItem(lojaId, item); }
      }
    }
  }

  // Atualiza o array products em memória (inventário aberto)
  if (Array.isArray(products)) {
    for (const p of products) {
      if (!p.barras && p.code) {
        const ean = codProdParaCodBarra[p.code.toString()];
        if (ean) p.barras = ean;
      }
    }
  }
}

/**
 * Resolve um código lido pela câmera para um produto da NF-e ou do inventário.
 * Prioridade:
 *   1) Busca direta pelo CodBarra (campo "barras") — leitura do código EAN do produto.
 *   2) Fallback: se o código lido for um CodBarra no CSV, converte para CodProd e busca pelo code.
 *   3) Fallback: se o código lido for diretamente um CodProduto (etiqueta da caixa), busca pelo code.
 *
 * @param {Array} produtosList - Array de produtos para buscar
 * @param {string} cleanCode   - Código limpo lido pela câmera
 * @returns {{ produto: object|null, metodo: string }}
 */
function resolverCodigoBipado(produtosList, cleanCode) {
  // 1º — CodBarra direto (EAN lido da câmera)
  let p = produtosList.find(prod => prod.barras && prod.barras.trim() === cleanCode);
  if (p) return { produto: p, metodo: 'CodBarra' };

  // 2º — Fallback via CSV: CodBarra → CodProd
  const codProdViaBarras = codBarraParaCodProd[cleanCode];
  if (codProdViaBarras) {
    p = produtosList.find(prod => prod.code && prod.code.toString() === codProdViaBarras.toString());
    if (p) return { produto: p, metodo: 'CodBarra→CodProd (CSV)' };
  }

  // 3º — Fallback: o operador leu o CodProduto da etiqueta da caixa
  p = produtosList.find(prod => prod.code && prod.code.toString() === cleanCode.toString());
  if (p) {
    // Se o produto ainda não tem EAN, enriquece a partir do CSV
    if (!p.barras && codProdParaCodBarra[cleanCode]) {
      p.barras = codProdParaCodBarra[cleanCode];
    }
    return { produto: p, metodo: 'CodProduto' };
  }

  return { produto: null, metodo: 'não encontrado' };
}

function inicializarImportedNfs() {
  // Carrega dados locais como ponto de partida
  const salvas = carregarJSON("cacaushow_imported_nfs", {});
  const limpas = {};
  
  for (const numNF in salvas) {
    const nf = salvas[numNF];
    if (!nf || !nf.info) continue;
    
    if (!nf.info.targetStore) {
      nf.info.targetStore = '9175';
    }
    if (nf.products) {
      nf.products.forEach(p => {
        if (p.validade && !(p.validade instanceof Date)) p.validade = new Date(p.validade);
      });
    }
    if (nf.info && nf.info.rawEmissaoDate && !(nf.info.rawEmissaoDate instanceof Date)) {
      nf.info.rawEmissaoDate = new Date(nf.info.rawEmissaoDate);
    }
    limpas[numNF] = nf;
  }
  
  // NÃO sobrescreve se o servidor já carregou dados mais recentes
  if (!window._nfsServerLoaded) {
    importedNfs = limpas;
  } else {
    // Merge: server data tem prioridade, mas mantém locais não presentes no servidor
    importedNfs = Object.assign({}, limpas, importedNfs);
  }
  
  const keys = Object.keys(importedNfs);
  if (keys.length > 0 && !activeNfNumber) {
    activeNfNumber = keys[0];
  }
  
  nfGalleryStoreFilter = 'todas';
}

function verificarBoletosVesperaNotificacao() {
  const amanha = new Date();
  amanha.setDate(amanha.getDate() + 1);
  const amanhaStr = amanha.toLocaleDateString("pt-BR");
  const hojeStr = new Date().toLocaleDateString("pt-BR");

  boletos.forEach(b => {
    if (b.status === "Aberto" && b.vencimento === amanhaStr) {
      const key = `notif_vespera_${b.id}_${hojeStr}`;
      if (!localStorage.getItem(key)) {
        const storeLabel = b.loja === "9175" ? "Marambaia (9175)" : (b.loja === "4304" ? "Icoaraci (4304)" : "Mário Covas (9201)");
        
        fetch('/api/notificar-gestao', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            destinatarios: ['Isabella'],
            assunto: `⏳ Boleto Vencendo Amanhã - Loja ${storeLabel}`,
            mensagem: `Atenção Isabella,\n\nHá um boleto vencendo amanhã (${b.vencimento}) no valor de ${formatBRL(b.valor)} para a loja ${storeLabel}.\n\n` +
              `• Loja: ${storeLabel}\n` +
              `• Valor: ${formatBRL(b.valor)}\n` +
              `• Descrição: ${b.descricao}\n` +
              `• Documento: ${b.documento}`,
            operador: 'Sistema'
          })
        })
        .then(() => {
          localStorage.setItem(key, "true");
        })
        .catch(err => console.error("Erro ao notificar boleto de véspera:", err));
      }
    }
  });
}

async function carregarBoletosServidor() {
  try {
    const res = await fetch("/api/boletos");
    if (res.ok) {
      const todos = await res.json();
      const agora = new Date().getTime();
      
      // Filtrar boletos pagos há mais de 24 horas no frontend
      boletos = todos.filter(b => {
        if (b.status === "Pago" && b.pagoEm) {
          const tempoPagamento = new Date(b.pagoEm).getTime();
          if (agora - tempoPagamento > 24 * 60 * 60 * 1000) {
            return false;
          }
        }
        return true;
      });
      
      renderBoletos();
      verificarBoletosVesperaNotificacao();
      if (window.carregarAuditoriaBoletos) {
        window.carregarAuditoriaBoletos();
      }
    }
  } catch (err) {
    console.error("Erro ao carregar boletos do servidor:", err);
  }
}

async function inicializarBoletos() {
  await carregarBoletosServidor();
}

// Init Event Listeners para a Logística
// ==========================================================================
// MÓDULO: PREFERÊNCIAS DE NOTIFICAÇÕES (Owner pode configurar)
// ==========================================================================

function loadNotificationPrefs() {
  const saved = localStorage.getItem(NOTIF_PREFS_KEY);
  return saved ? JSON.parse(saved) : JSON.parse(JSON.stringify(DEFAULT_NOTIF_PREFS));
}

async function saveNotificationPrefs(prefs, masterEnabled) {
  localStorage.setItem(NOTIF_PREFS_KEY, JSON.stringify(prefs));
  await salvarConfigAPI("notificacoes_config", JSON.stringify(prefs));

  localStorage.setItem(NOTIF_MASTER_KEY, masterEnabled ? "1" : "0");
  await salvarConfigAPI("notificacoes_eventos_ativas", masterEnabled ? "1" : "0");

  renderNotificationTable();
  showToast(
    masterEnabled
      ? "Preferências salvas. Notificações de eventos ATIVADAS."
      : "Preferências salvas. Notificações de eventos DESATIVADAS (nenhum alerta será enviado).",
    "sucesso"
  );
}

function shouldNotifyUser(notificationType, userRole) {
  const prefs = loadNotificationPrefs();
  const notifKey = notificationType;
  const roleKey = ROLE_NOTIF_MAP[userRole] || "colab";

  if (prefs[notifKey] && prefs[notifKey][roleKey] !== undefined) {
    return prefs[notifKey][roleKey];
  }
  return true; // default: notificar
}

function getNotificationChannel(notificationType, userRole) {
  const prefs = loadNotificationPrefs();
  const notifKey = notificationType;
  const roleKey = ROLE_NOTIF_MAP[userRole] || "colab";
  const channelKey = `${roleKey}_ch`;

  if (prefs[notifKey] && prefs[notifKey][channelKey]) {
    return prefs[notifKey][channelKey];
  }
  return "email"; // default: email
}

function sendNotification(destinatarios, assunto, mensagem, canal = "email") {
  if (!destinatarios || destinatarios.length === 0) return;

  const textCheck = `${assunto || ''} ${mensagem || ''}`.toLowerCase();
  const isDivergencia = textCheck.includes('divergênc') || textCheck.includes('divergenc');

  if (canal === "push" && !isDivergencia) {
    // Enviar Push Notification
    if ("serviceWorker" in navigator && "PushManager" in window) {
      navigator.serviceWorker.getRegistration().then(registration => {
        if (registration && registration.showNotification) {
          registration.showNotification(assunto, {
            body: mensagem,
            icon: "/icons/icon-192.png",
            badge: "/icons/icon-192.png",
            tag: "notificacao-cacau",
            requireInteraction: true
          });
        }
      });
    }
  }

  // Sempre enviar para backend (email ou push via servidor)
  fetch('/api/notificar-gestao', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      destinatarios: destinatarios,
      assunto: assunto,
      mensagem: mensagem,
      canal: isDivergencia && canal === "push" ? "email" : canal
    })
  }).catch(err => console.error('Erro ao enviar notificação:', err));
}

function initializeNotificationPrefs() {
  const prefs = loadNotificationPrefs();

  // Preencher checkboxes baseado nas preferências salvas
  Object.keys(prefs).forEach(notifType => {
    const colab = document.getElementById(`notif-${notifType}-colab`);
    const lider = document.getElementById(`notif-${notifType}-lider`);
    const owner = document.getElementById(`notif-${notifType}-owner`);

    if (colab) colab.checked = prefs[notifType].colab;
    if (lider) lider.checked = prefs[notifType].lider;
    if (owner) owner.checked = prefs[notifType].owner;
  });
}

function renderNotifRoleCell(notifType, role, isOwner) {
  const isPushDisabledForType = notifType === "divergencia";
  const dis = !isOwner ? "disabled" : "";
  const fade = !isOwner ? "opacity: 0.5;" : "";
  const disPush = (!isOwner || isPushDisabledForType) ? "disabled" : "";
  const fadePush = (!isOwner || isPushDisabledForType) ? "opacity: 0.4;" : "";

  return `
    <div class="flex flex-col gap-1.5">
      <label class="flex items-center gap-2">
        <input type="checkbox" id="notif-${notifType}-${role}" class="notif-check" data-type="${notifType}" data-role="${role}" ${dis} style="${fade}" />
        <span style="font-size: 0.7rem; opacity: 0.75;">Ativo</span>
      </label>
      <div class="flex items-center gap-3 pl-1">
        <label class="flex items-center gap-1">
          <input type="radio" name="notif-${notifType}-${role}-channel" value="email" class="notif-channel" data-type="${notifType}" data-role="${role}" ${dis} style="${fade}" />
          <span style="font-size: 0.68rem;">Email</span>
        </label>
        <label class="flex items-center gap-1" title="${isPushDisabledForType ? 'Push desativado temporariamente para divergências' : ''}">
          <input type="radio" name="notif-${notifType}-${role}-channel" value="push" class="notif-channel" data-type="${notifType}" data-role="${role}" ${disPush} style="${fadePush}" />
          <span style="font-size: 0.68rem; ${isPushDisabledForType ? 'text-decoration: line-through; opacity: 0.5;' : ''}">Push</span>
        </label>
      </div>
    </div>
  `;
}

function renderNotificationTable() {
  const tbody = document.getElementById("notif-table-body");
  if (!tbody) return;
  const isOwner = currentUser && currentUser.role === "owner";
  const badgeEl = document.getElementById("notif-owner-badge");

  if (badgeEl) badgeEl.classList.toggle("hidden", !isOwner);

  const notifLabels = {
    "envelopes": { title: "Acúmulo de Envelopes (>= R$ 1.000)", desc: "Alerta de segurança ao atingir limite em trânsito" },
    "inv-inicio": { title: "Início de Inventário", desc: "Aviso de abertura do inventário mensal cego" },
    "inv-fim": { title: "Conclusão de Inventário", desc: "Confirmação de finalização das contagens" },
    "nfe": { title: "Conferência de NF-e", desc: "Início e fim do recebimento/conferência de notas" },
    "divergencia": { title: "Divergência de Fundo de Caixa", desc: "Aviso de diferença no fechamento/abertura (Push desativado temporariamente)" }
  };

  const prefs = loadNotificationPrefs();

  tbody.innerHTML = "";

  Object.keys(DEFAULT_NOTIF_PREFS).forEach(notifType => {
    const label = notifLabels[notifType];
    const tr = document.createElement("tr");

    tr.innerHTML = `
      <td class="py-4 px-4">
        <div class="font-bold">${label.title}</div>
        <div class="text-[10px] text-muted">${label.desc}</div>
      </td>
      <td class="py-4 px-4">${renderNotifRoleCell(notifType, "colab", isOwner)}</td>
      <td class="py-4 px-4">${renderNotifRoleCell(notifType, "lider", isOwner)}</td>
      <td class="py-4 px-4">${renderNotifRoleCell(notifType, "owner", isOwner)}</td>
    `;

    tbody.appendChild(tr);
  });

  // Carregar preferências salvas (ativo/inativo + canal por perfil)
  Object.keys(prefs).forEach(notifType => {
    ["colab", "lider", "owner"].forEach(role => {
      const checkbox = document.getElementById(`notif-${notifType}-${role}`);
      if (checkbox) checkbox.checked = !!prefs[notifType][role];

      let channel = prefs[notifType][`${role}_ch`] || "email";
      if (notifType === "divergencia" && channel === "push") {
        channel = "email";
      }
      const radio = document.querySelector(`input.notif-channel[name="notif-${notifType}-${role}-channel"][value="${channel}"]`);
      if (radio) radio.checked = true;
    });
  });

  renderNotifMasterSwitch(isOwner);
}

// Chave mestra: reflete o estado atual e suspende visualmente as regras quando desligada
function renderNotifMasterSwitch(isOwner) {
  const toggle = document.getElementById("config-toggle-notificacoes-ativas");
  if (!toggle) return;

  const ativo = loadNotifMasterEnabled();
  toggle.checked = ativo;
  toggle.disabled = !isOwner;
  toggle.style.opacity = isOwner ? "" : "0.5";

  const statusEl = document.getElementById("notif-master-status");
  if (statusEl) {
    statusEl.textContent = ativo ? "Ativado" : "Desativado";
    statusEl.classList.toggle("text-brand-700", ativo);
    statusEl.classList.toggle("text-muted", !ativo);
  }

  const tbody = document.getElementById("notif-table-body");
  if (tbody) {
    tbody.style.opacity = ativo ? "" : "0.45";
    tbody.title = ativo ? "" : "Ative a chave mestra acima para que estas regras entrem em vigor.";
  }
}

function setupNotificationEvents() {
  const btnSave = document.getElementById("config-btn-save-notificacoes");
  if (!btnSave) return;

  btnSave.addEventListener("click", () => {
    if (currentUser && currentUser.role !== "owner") {
      showToast("Apenas Owners podem modificar as preferências de notificações.", "erro");
      return;
    }

    const prefs = {};

    // Ler todos os checkboxes e canais de rádio, montando o objeto de preferências
    Object.keys(DEFAULT_NOTIF_PREFS).forEach(notifType => {
      const colab = document.getElementById(`notif-${notifType}-colab`);
      const lider = document.getElementById(`notif-${notifType}-lider`);
      const owner = document.getElementById(`notif-${notifType}-owner`);

      const colab_ch = document.querySelector(`input[name="notif-${notifType}-colab-channel"]:checked`)?.value || "email";
      const lider_ch = document.querySelector(`input[name="notif-${notifType}-lider-channel"]:checked`)?.value || "email";
      const owner_ch = document.querySelector(`input[name="notif-${notifType}-owner-channel"]:checked`)?.value || "email";

      prefs[notifType] = {
        colab: colab ? colab.checked : true,
        lider: lider ? lider.checked : true,
        owner: owner ? owner.checked : true,
        colab_ch: colab_ch,
        lider_ch: lider_ch,
        owner_ch: owner_ch
      };
    });

    const masterToggle = document.getElementById("config-toggle-notificacoes-ativas");
    saveNotificationPrefs(prefs, masterToggle ? masterToggle.checked : false);
  });

  const masterToggle = document.getElementById("config-toggle-notificacoes-ativas");
  if (masterToggle) {
    masterToggle.addEventListener("change", () => {
      const isOwner = currentUser && currentUser.role === "owner";
      const statusEl = document.getElementById("notif-master-status");
      if (statusEl) statusEl.textContent = masterToggle.checked ? "Ativado (não salvo)" : "Desativado (não salvo)";
      const tbody = document.getElementById("notif-table-body");
      if (tbody) tbody.style.opacity = masterToggle.checked ? "" : "0.45";
      if (!isOwner) masterToggle.checked = loadNotifMasterEnabled();
    });
  }
}

function updatePinDots(inputEl, dotsContainerId) {
  const container = document.getElementById(dotsContainerId);
  if (!container) return;
  const dots = container.querySelectorAll(".pin-dot");
  const len = inputEl.value.length;
  dots.forEach((dot, index) => {
    if (index < len) {
      dot.classList.add("filled");
    } else {
      dot.classList.remove("filled");
    }
  });
}

function setupPinDotsEventHandlers() {
  const loginPinInput = document.getElementById("login-pin");
  const loginPinConfirmInput = document.getElementById("login-pin-confirm");
  const sessionPinInput = document.getElementById("session-pin");

  const pinInputsSetup = [
    { input: loginPinInput, dots: "pin-dots-login" },
    { input: loginPinConfirmInput, dots: "pin-dots-confirm" },
    { input: sessionPinInput, dots: "pin-dots-session" }
  ];
  
  pinInputsSetup.forEach(setup => {
    if (setup.input) {
      const container = document.getElementById(setup.dots);
      if (container) {
        container.addEventListener("click", () => {
          setup.input.focus();
        });
      }
      setup.input.addEventListener("input", () => {
        updatePinDots(setup.input, setup.dots);
      });
    }
  });
}

document.addEventListener('DOMContentLoaded', () => {
  setupPinDotsEventHandlers();
  inicializarAutosaveForm();
  registrarLimparErroAoDigitar();
  inicializarImportedNfs();
  inicializarBoletos();
  renderNotificationTable();
  setupNotificationEvents();

  // Carrega a biblioteca de consulta de códigos de barras (Codbarra_Consulta.csv)
  // para permitir o fallback CodBarra → CodProduto na conferência e no inventário
  carregarCodBarraConsulta();
  
  // Aguarda o servidor retornar e re-renderiza a galeria de NF-es
  const tentarRenderGaleria = () => {
    if (typeof renderNfCardsGallery === 'function') renderNfCardsGallery();
  };
  // Renderiza imediatamente com dados locais, e novamente após servidor responder
  tentarRenderGaleria();
  setTimeout(tentarRenderGaleria, 1500);
  setTimeout(tentarRenderGaleria, 4000);
  
  const nfFileEl = document.getElementById('nf-file');
  if (nfFileEl) nfFileEl.addEventListener('change', handleNfFileUpload);

  // Inicializar Drag and Drop para o Painel de NF-e
  const nfDropZone = document.getElementById('nf-drop-zone');
  if (nfDropZone) {
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
      nfDropZone.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
      }, false);
    });

    ['dragenter', 'dragover'].forEach(eventName => {
      nfDropZone.addEventListener(eventName, () => {
        nfDropZone.classList.add('border-brand-500', 'bg-brand-900/30');
        nfDropZone.classList.remove('border-brand-700/80');
      }, false);
    });

    ['dragleave', 'dragend', 'drop'].forEach(eventName => {
      nfDropZone.addEventListener(eventName, () => {
        nfDropZone.classList.remove('border-brand-500', 'bg-brand-900/30');
        nfDropZone.classList.add('border-brand-700/80');
      }, false);
    });

    nfDropZone.addEventListener('drop', (e) => {
      const dt = e.dataTransfer;
      const files = dt.files;
      if (files && files.length > 0) {
        handleNfFiles(Array.from(files));
      }
    }, false);
  }

  const nfSearchInput = document.getElementById('nf-search-input');
  if (nfSearchInput) {
    nfSearchInput.addEventListener('input', (e) => {
      nfSearchQuery = e.target.value.trim().toLowerCase();
      renderNfTable();
    });
  }

  const searchInput = document.getElementById('search-input');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      searchQuery = e.target.value.trim().toLowerCase();
      renderTable();
    });
  }

  const filterAll = document.getElementById('filter-all');
  if (filterAll) filterAll.addEventListener('click', () => setFilter('all'));
  const filterRed = document.getElementById('filter-red');
  if (filterRed) filterRed.addEventListener('click', () => setFilter('red'));
  const filterOrange = document.getElementById('filter-orange');
  if (filterOrange) filterOrange.addEventListener('click', () => setFilter('orange'));
  const filterGreen = document.getElementById('filter-green');
  if (filterGreen) filterGreen.addEventListener('click', () => setFilter('green'));

  const storeSelectors = document.querySelectorAll('.store-selector, #store-selector');
  if (storeSelectors.length > 0) {
    currentStore = storeSelectors[0].value || '9175';
    storeSelectors.forEach(sel => {
      sel.value = currentStore;
      sel.addEventListener('change', (e) => {
        currentStore = e.target.value;
        document.querySelectorAll('.store-selector, #store-selector').forEach(s => {
          s.value = currentStore;
        });
        loadInventoryForCurrentStore();
        if (typeof renderTable === 'function') renderTable();
        if (typeof renderNfCardsGallery === 'function') renderNfCardsGallery();
        showToast(`Loja ativa alterada para Loja ${currentStore}`, 'info');
      });
    });
  }
  loadInventoryForCurrentStore();

  const btnExport = document.getElementById('btn-export');
  if (btnExport) btnExport.addEventListener('click', exportExcel);

  const btnNfWhatsapp = document.getElementById('btn-nf-whatsapp');
  if (btnNfWhatsapp) btnNfWhatsapp.addEventListener('click', notificarWhatsappGestao);

  const btnToggleNfScanner = document.getElementById('btn-toggle-nf-scanner');
  if (btnToggleNfScanner) btnToggleNfScanner.addEventListener('click', toggleNfScanner);

  const btnBackGallery = document.getElementById('btn-back-to-gallery');
  if (btnBackGallery) btnBackGallery.addEventListener('click', backToNfGallery);

  const btnConferirSel = document.getElementById('btn-conferir-selecionadas');
  if (btnConferirSel) btnConferirSel.addEventListener('click', () => {
    if (selectedNfNumbers.length > 0) {
      openNfConferenceDirectScanner(selectedNfNumbers);
    }
  });

  const btnConcluirConf = document.getElementById('btn-concluir-conferencia');
  if (btnConcluirConf) btnConcluirConf.addEventListener('click', concluirConferenciaAtiva);

  // --- Scanner do Inventário de Estoque ---
  // Usa a mesma regra de prioridade: CodBarra → CSV → CodProduto
  inicializarScannerInventario();

  checkMonthlyInventoryAlert();
  inicializarBoletosTab();
});


function loadInventoryForCurrentStore() {
  const savedItems = dbBridge.getInventarioLoja(currentStore);
  const now = new Date();
  const dToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  products = savedItems.map(item => {
    let daysRemaining = null;
    let validadeDate = item.validade ? new Date(item.validade) : null;
    if (validadeDate && !isNaN(validadeDate.getTime())) {
      const dVal = new Date(validadeDate.getFullYear(), validadeDate.getMonth(), validadeDate.getDate());
      const diffTime = dVal.getTime() - dToday.getTime();
      daysRemaining = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    }
    return {
      code: item.code,
      barras: item.barras || '',
      description: item.description || 'Produto',
      validade: validadeDate,
      daysRemaining: daysRemaining,
      countedQty: item.countedQty !== undefined ? item.countedQty : '',
      dataEntrada: item.dataEntrada || '',
      qtdEntradaUnidades: item.qtdEntradaUnidades || 0
    };
  });
}

// ==========================================================================
// SCANNER DO INVENTÁRIO DE ESTOQUE
// Usa a mesma regra de prioridade do resolverCodigoBipado:
//   1º) CodBarra (EAN lido da câmera)
//   2º) Fallback CSV: CodBarra → CodProd
//   3º) Fallback: CodProduto direto (etiqueta da caixa)
// ==========================================================================
function inicializarScannerInventario() {
  const btnToggle = document.getElementById('btn-toggle-scanner');
  const scannerContainer = document.getElementById('scanner-container');
  const scannerBtnText = document.getElementById('scanner-btn-text');

  if (!btnToggle || !scannerContainer) return;

  btnToggle.addEventListener('click', () => {
    if (scannerContainer.classList.contains('hidden')) {
      // Ativar câmera do inventário
      scannerContainer.classList.remove('hidden');
      if (scannerBtnText) scannerBtnText.textContent = 'Desativar Câmera';
      iniciarScannerInventario();
    } else {
      // Desativar câmera do inventário
      scannerContainer.classList.add('hidden');
      if (scannerBtnText) scannerBtnText.textContent = 'Ativar Câmera';
      pararScannerInventario();
    }
  });
}

function iniciarScannerInventario(cameraId = null) {
  if (typeof Html5Qrcode === 'undefined') {
    showToast('Biblioteca de leitura não carregada.', 'erro');
    return;
  }
  if (!window.isSecureContext) {
    showToast('Câmera requer conexão segura (HTTPS).', 'erro');
    return;
  }

  if (!html5QrCode) {
    html5QrCode = new Html5Qrcode('reader');
  }

  const config = { fps: 15, qrbox: { width: 300, height: 180 } };

  const startWith = cameraId
    ? html5QrCode.start({ deviceId: { exact: cameraId } }, config, onInventarioScanSuccess, () => {})
    : html5QrCode.start({ facingMode: 'environment' }, config, onInventarioScanSuccess, () => {});

  startWith.catch(err => {
    console.warn('[Inventário Scanner] Erro ao iniciar câmera:', err);
    // Fallback: lista câmeras e tenta a traseira
    Html5Qrcode.getCameras().then(cameras => {
      if (!cameras || cameras.length === 0) {
        showToast('Nenhuma câmera encontrada.', 'erro');
        return;
      }
      const traseira = cameras.find(c => {
        const l = c.label.toLowerCase();
        return l.includes('back') || l.includes('traseira') || l.includes('rear') || l.includes('environment');
      });
      const cam = traseira || cameras[cameras.length - 1];
      html5QrCode.start({ deviceId: { exact: cam.id } }, config, onInventarioScanSuccess, () => {})
        .catch(e => {
          console.error('[Inventário Scanner] Falha total:', e);
          showToast('Não foi possível acessar a câmera. Verifique as permissões.', 'erro');
        });
    }).catch(() => {
      showToast('Erro ao listar câmeras.', 'erro');
    });
  });
}

function pararScannerInventario() {
  if (html5QrCode && html5QrCode.isScanning) {
    html5QrCode.stop().catch(err => console.error('[Inventário Scanner] Erro ao parar:', err));
  }
}

/**
 * Callback chamado quando o scanner do Inventário lê um código com sucesso.
 * Prioridade de resolução:
 *   1º CodBarra (EAN) → 2º CSV CodBarra→CodProd → 3º CodProduto direto (etiqueta da caixa)
 * Se o produto não estiver no inventário atual, é adicionado automaticamente via CSV.
 */
function onInventarioScanSuccess(decodedText) {
  const cleanCode = decodedText.trim();

  const { produto: p, metodo } = resolverCodigoBipado(products, cleanCode);

  if (p) {
    if (navigator.vibrate) navigator.vibrate(150);
    playBeep('success');

    const atual = p.countedQty === '' ? 0 : Number(p.countedQty);
    p.countedQty = (atual + 1).toString();
    dbBridge.saveInventoryItem(currentStore, p);
    triggerInventoryStartedNotification();
    renderTable();

    setTimeout(() => {
      const rowInput = document.querySelector(`input.qty-input[data-code="${p.code}"]`);
      if (rowInput) {
        rowInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
        rowInput.focus();
        rowInput.select();
      }
    }, 100);

    const metodoLabel = metodo !== 'CodBarra' ? ` (via ${metodo})` : '';
    showToast(`✅ ${p.description}${metodoLabel} — Qtd: ${p.countedQty}`, 'sucesso');
  } else {
    // Produto não está no inventário: tenta adicionar automaticamente via CSV
    adicionarProdutoAoInventarioPorScan(cleanCode);
  }
}

/**
 * Adiciona um produto ao inventário mensal a partir de um código bipado não encontrado.
 * Resolve o produto pelo CSV (CodBarra→CodProd ou CodProd direto) e cria a entrada,
 * deixando validade e quantidade em branco para o operador preencher.
 */
function adicionarProdutoAoInventarioPorScan(cleanCode) {
  let codProd = null;
  let ean     = '';
  let desc    = null;

  // Tenta resolver como EAN (CodBarra → CodProd)
  if (codBarraParaCodProd[cleanCode]) {
    codProd = codBarraParaCodProd[cleanCode];
    ean     = cleanCode;
    desc    = codBarraParaDesc[cleanCode] || codProdParaDesc[codProd] || null;
  }
  // Tenta resolver como CodProduto direto (etiqueta da caixa)
  else if (codProdParaDesc[cleanCode]) {
    codProd = cleanCode;
    ean     = codProdParaCodBarra[cleanCode] || '';
    desc    = codProdParaDesc[cleanCode];
  }

  if (!codProd || !desc) {
    if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
    playBeep('error');
    showToast(`Código não cadastrado no sistema: ${cleanCode}`, 'erro');
    return;
  }

  // Previne duplicata por bipagem rápida (produto foi adicionado entre dois scans)
  const jaExiste = products.find(prod => prod.code === codProd);
  if (jaExiste) {
    const atual = jaExiste.countedQty === '' ? 0 : Number(jaExiste.countedQty);
    jaExiste.countedQty = (atual + 1).toString();
    dbBridge.saveInventoryItem(currentStore, jaExiste);
    renderTable();
    showToast(`✅ ${desc} — Qtd: ${jaExiste.countedQty}`, 'sucesso');
    return;
  }

  const novoProduto = {
    code: codProd,
    barras: ean,
    description: desc,
    validade: null,
    daysRemaining: null,
    countedQty: '',
    dataEntrada: '',
    qtdEntradaUnidades: 0
  };

  products.push(novoProduto);
  dbBridge.saveInventoryItem(currentStore, novoProduto);
  triggerInventoryStartedNotification();
  renderTable();

  if (navigator.vibrate) navigator.vibrate([50, 30, 50]);
  playBeep('success');
  showToast(`➕ ${desc} adicionado ao inventário. Preencha a validade e a quantidade.`, 'sucesso');

  // Rola até a linha recém-adicionada e foca o campo de validade
  setTimeout(() => {
    const qtyInput = document.querySelector(`input.qty-input[data-code="${codProd}"]`);
    if (qtyInput) {
      const row = qtyInput.closest('tr');
      const validadeInput = row ? row.querySelector('.validade-input') : null;
      const target = validadeInput || qtyInput;
      target.scrollIntoView({ behavior: 'smooth', block: 'center' });
      target.focus();
    }
  }, 150);
}



function formatDate(dateObj) {
  if (!dateObj || isNaN(dateObj.getTime())) return '';
  const day = String(dateObj.getDate()).padStart(2, '0');
  const month = String(dateObj.getMonth() + 1).padStart(2, '0');
  const year = dateObj.getFullYear();
  return `${day}/${month}/${year}`;
}

function dateToInputVal(dateObj) {
  if (!dateObj || isNaN(dateObj.getTime())) return '';
  const yyyy = dateObj.getFullYear();
  const mm = String(dateObj.getMonth() + 1).padStart(2, '0');
  const dd = String(dateObj.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function setFilter(filterType) {
  currentFilter = filterType;
  renderTable();
}

function playBeep(type = 'success') {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.connect(gain);
    gain.connect(ctx.destination);

    if (type === 'success') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      gain.gain.setValueAtTime(0.1, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.00001, ctx.currentTime + 0.15);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.15);
    } else if (type === 'error') {
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(220, ctx.currentTime);
      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.00001, ctx.currentTime + 0.3);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.3);
    }
  } catch (e) { }
}

function checkMonthlyInventoryAlert() {
  const currentDay = today.getDate();
  const currentMonth = today.toLocaleString('pt-BR', { month: 'long' });
  const capitalizedMonth = currentMonth.charAt(0).toUpperCase() + currentMonth.slice(1);

  const monthNameEl = document.getElementById('current-month-name');
  if (monthNameEl) monthNameEl.textContent = `${capitalizedMonth} / ${today.getFullYear()}`;

  const badgeEl = document.getElementById('monthly-deadline-badge');
  if (badgeEl) {
    if (currentDay > 25) {
      badgeEl.className = "px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-red-600 text-white animate-pulse shadow-md border border-red-500";
      badgeEl.textContent = "⚠️ ATENÇÃO: PRAZO DIA 25 EXCEDIDO!";
    } else if (currentDay >= 20) {
      badgeEl.className = "px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-orange-600 text-white animate-pulse shadow-md border border-orange-500";
      badgeEl.textContent = `⚠️ RETA FINAL (FALTA ${25 - currentDay} DIA(S))`;
    } else {
      badgeEl.className = "px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-brand-800 text-brand-200 border border-brand-700";
      badgeEl.textContent = "Prazo: Dia 25";
    }
  }
}

function handleNfFileUpload(event) {
  const files = Array.from(event.target.files);
  handleNfFiles(files);
}

function handleNfFiles(files) {
  if (!currentUser || (currentUser.role !== 'owner' && currentUser.role !== 'consultora_dashboard')) {
    showToast("Apenas o Líder de Operações ou Owner podem fazer importação de NF-e.", "erro");
    return;
  }
  if (!files || files.length === 0) return;

  const infoEl = document.getElementById('nf-file-info');
  const progressBar = document.getElementById('nf-progress-bar');
  const progressLabel = document.getElementById('nf-progress-label');
  if (infoEl) {
    infoEl.classList.remove('hidden');
    infoEl.className = "mt-3 text-xs text-brand-300 font-mono";
    if (progressLabel) progressLabel.textContent = `Processando ${files.length} arquivo(s)... 0%`;
    if (progressBar) progressBar.style.width = '0%';
  }

  let processedCount = 0;
  let successCount = 0;
  let duplicateCount = 0;
  let errorCount = 0;

  const onProcessed = (status) => {
    processedCount++;
    if (status === 'success') successCount++;
    else if (status === 'duplicate') duplicateCount++;
    else errorCount++;

    const percent = Math.round((processedCount / files.length) * 100);
    if (progressBar) progressBar.style.width = `${percent}%`;
    if (progressLabel) progressLabel.textContent = `Processando... ${percent}% (${processedCount}/${files.length})`;

    if (processedCount === files.length) {
      if (activeNfNumber && importedNfs[activeNfNumber] && importedNfs[activeNfNumber].info && importedNfs[activeNfNumber].info.targetStore) {
        nfGalleryStoreFilter = importedNfs[activeNfNumber].info.targetStore;
      } else {
        nfGalleryStoreFilter = 'todas';
      }
      renderNfCardsGallery();
      
      if (infoEl) {
        infoEl.innerHTML = `
          Importação concluída!<br>
          ✅ ${successCount} importada(s) com sucesso<br>
          ⚠️ ${duplicateCount} já existente(s) ignorada(s)<br>
          ❌ ${errorCount} erro(s) ou formato inválido
        `;
        if (errorCount > 0) {
          infoEl.className = "mt-3 text-xs text-red-400 font-mono bg-red-950/20 p-2.5 rounded-lg border border-red-900/40 text-left";
        } else if (successCount > 0) {
          infoEl.className = "mt-3 text-xs text-emerald-400 font-mono bg-emerald-950/20 p-2.5 rounded-lg border border-emerald-900/40 text-left";
        } else {
          infoEl.className = "mt-3 text-xs text-brand-300 font-mono bg-brand-800/20 p-2.5 rounded-lg border border-brand-700/40 text-left";
        }
      }

      if (errorCount === 0 && duplicateCount === 0 && successCount > 0) {
        showToast(`${successCount} Nota(s) Fiscal(is) importada(s) com sucesso!`, 'sucesso');
      } else if (successCount > 0 || duplicateCount > 0) {
        showToast(`Importação em lote concluída (${successCount} OK, ${duplicateCount} duplicados, ${errorCount} erros)`, 'info');
      } else if (errorCount > 0) {
        showToast(`Erro ao importar arquivos XML. Verifique o console ou detalhes.`, 'erro');
      }

      const nfFileEl = document.getElementById('nf-file');
      if (nfFileEl) nfFileEl.value = '';
    }
  };

  files.forEach(file => {
    const fileName = file.name.toLowerCase();
    if (fileName.endsWith('.xml')) {
      parseXmlNfe(file, onProcessed);
    } else if (fileName.endsWith('.xlsx') || fileName.endsWith('.xls')) {
      parseExcelNfe(file, onProcessed);
    } else {
      onProcessed('error');
    }
  });
}

function detectStoreFromRazaoSocial(razaoSocialText) {
  if (!razaoSocialText) return null;
  const text = razaoSocialText.toString().toUpperCase();
  if (text.includes('0001008688') || text.includes('IB MARIO COVAS') || text.includes('MARIO COVAS')) return '9201';
  if (text.includes('0001008056') || text.includes('IB ICOARACI') || text.includes('ICOARACI')) return '4304';
  if (text.includes('0001006495') || text.includes('IB COMERCIO DE DOCES CACAU LTDA') || text.includes('MARAMBAIA')) return '9175';
  return null;
}

function detectBoxMultiplier(detElement, xProdText) {
  const uCom = detElement.querySelector('uCom') ? detElement.querySelector('uCom').textContent.toUpperCase() : '';
  const qCom = detElement.querySelector('qCom') ? parseFloat(detElement.querySelector('qCom').textContent) : 1;
  const qTrib = detElement.querySelector('qTrib') ? parseFloat(detElement.querySelector('qTrib').textContent) : 1;

  if ((uCom.includes('CX') || uCom.includes('BOX') || uCom.includes('FD')) && qTrib > qCom && qCom > 0) {
    return Math.round(qTrib / qCom);
  }

  const desc = xProdText.toUpperCase();
  const matchRegex = /(?:CX|FD|C\/|BOX|DISP|DISPLAY)\s*(\d+)/i;
  const match = desc.match(matchRegex);
  if (match && match[1]) {
    const val = parseInt(match[1]);
    if (val > 1) return val;
  }
  return 1;
}

function isClientNfeDuplicate(nNF, targetStore, productsList) {
  const key = `${nNF}_${targetStore}`;
  const existing = importedNfs[key];
  if (!existing) return false;
  
  const p1 = existing.products || [];
  const p2 = productsList || [];
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
}

function parseXmlNfe(file, callback) {
  const reader = new FileReader();
  reader.onload = function (e) {
    const xmlText = e.target.result;
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlText, "text/xml");

    const nNF = xmlDoc.querySelector('nNF') ? xmlDoc.querySelector('nNF').textContent.trim() : `NF-${Date.now().toString().slice(-5)}`;
    const dhEmi = xmlDoc.querySelector('dhEmi') ? xmlDoc.querySelector('dhEmi').textContent : (xmlDoc.querySelector('dEmi') ? xmlDoc.querySelector('dEmi').textContent : '');
    const qVol = xmlDoc.querySelector('qVol') ? xmlDoc.querySelector('qVol').textContent : '1';
    const xNomeEmit = xmlDoc.querySelector('emit > xNome') ? xmlDoc.querySelector('emit > xNome').textContent : 'Cacau Show CD';
    const xNomeDest = xmlDoc.querySelector('dest > xNome') ? xmlDoc.querySelector('dest > xNome').textContent : '';
    const cnpjDest = xmlDoc.querySelector('dest > CNPJ') ? xmlDoc.querySelector('dest > CNPJ').textContent : '';

    const storeDetectada = detectStoreFromRazaoSocial(`${xNomeDest} ${cnpjDest}`);
    const targetStore = storeDetectada || currentStore;

    // Duplicatas/parcelas de cobrança da NF-e (grupo <cobr><dup>): cada parcela traz
    // Nº de Ordem (nDup), Vencimento (dVenc) e Valor (vDup) — usado na Auditoria de
    // Boletos para cruzar cada parcela individualmente (parcelamento = várias duplicatas).
    const duplicatas = [];
    xmlDoc.querySelectorAll('cobr > dup').forEach(dup => {
      const nDup = dup.querySelector('nDup') ? dup.querySelector('nDup').textContent.trim() : '';
      const dVencRaw = dup.querySelector('dVenc') ? dup.querySelector('dVenc').textContent.trim() : '';
      const vDupRaw = dup.querySelector('vDup') ? dup.querySelector('vDup').textContent.trim() : '';
      if (!nDup && !dVencRaw && !vDupRaw) return;

      let vencimentoFormatado = '';
      if (dVencRaw) {
        const dVencDate = new Date(dVencRaw + 'T12:00:00');
        vencimentoFormatado = !isNaN(dVencDate.getTime()) ? formatDate(dVencDate) : dVencRaw;
      }

      duplicatas.push({
        nDup: nDup,
        vencimento: vencimentoFormatado,
        valor: parseFloat(vDupRaw) || 0
      });
    });

    const vNFEl = xmlDoc.querySelector('total > ICMSTot > vNF') || xmlDoc.querySelector('vNF');
    const valorTotal = vNFEl ? parseFloat(vNFEl.textContent) : 0;

    let formattedDate = '-';
    if (dhEmi) {
      const d = new Date(dhEmi);
      if (!isNaN(d.getTime())) formattedDate = formatDate(d);
    }

    const info = {
      numero: nNF,
      emissao: formattedDate,
      rawEmissaoDate: dhEmi ? new Date(dhEmi) : new Date(),
      volumes: qVol,
      fornecedor: xNomeEmit,
      destinatario: xNomeDest,
      targetStore: targetStore,
      storeAutoDetectada: !!storeDetectada,
      valorTotal: valorTotal,
      duplicatas: duplicatas
    };

    if (!storeDetectada) {
      showToast(`NF-e Nº ${nNF}: loja de destino não identificada pelo destinatário/CNPJ. Alocada à Loja Ativa (${getLojaNomePorCodigo(currentStore)}) — confira antes de conferir.`, 'erro');
    }

    const detElements = xmlDoc.querySelectorAll('det');
    const productsList = [];

    detElements.forEach((det, idx) => {
      const cProd = det.querySelector('cProd') ? det.querySelector('cProd').textContent.trim() : `ITEM-${idx + 1}`;
      const cEAN = det.querySelector('cEAN') ? det.querySelector('cEAN').textContent.trim() : '';
      const xProd = det.querySelector('xProd') ? det.querySelector('xProd').textContent.trim() : 'Produto Desconhecido';
      const qCom = det.querySelector('qCom') ? parseFloat(det.querySelector('qCom').textContent) : 0;

      const boxMultiplier = detectBoxMultiplier(det, xProd);
      const totalUnitsFaturadas = Math.round(qCom * boxMultiplier);

      let expDate = null;
      const dVal = det.querySelector('dVal');
      if (dVal && dVal.textContent) expDate = new Date(dVal.textContent + 'T12:00:00');

      const savedQty = localStorage.getItem(`nfcnt_${targetStore}_${nNF}_${cProd}`);
      const savedValidade = localStorage.getItem(`nfval_${targetStore}_${nNF}_${cProd}`);

      let validadeDate = expDate;
      if (savedValidade) validadeDate = new Date(savedValidade);

      let daysRemaining = null;
      if (validadeDate) {
        const diffTime = validadeDate.getTime() - today.getTime();
        daysRemaining = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      }

      // Salvar vínculo do cProd (código de 7 dígitos da NF-e XML) com o produto para o inventário de estoque
      const cod7Digitos = cProd.replace(/\D/g, '').padStart(7, '0').slice(-7) || cProd;
      localStorage.setItem(`nfe_cprod_${cEAN}`, cod7Digitos);
      if (cProd) localStorage.setItem(`nfe_cprod_desc_${xProd.trim().toUpperCase()}`, cod7Digitos);

      productsList.push({
        code: cod7Digitos,
        barras: cEAN !== 'SEM GTIN' ? cEAN : '',
        description: xProd,
        nfQty: qCom,
        boxMultiplier: boxMultiplier,
        totalUnits: totalUnitsFaturadas,
        countedQty: savedQty !== null ? savedQty : '',
        validade: validadeDate,
        daysRemaining: daysRemaining
      });
    });

    const isDuplicate = isClientNfeDuplicate(nNF, targetStore, productsList);

    if (API_ONLINE) {
      fetch(`${API_BASE}/nfs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ numero: nNF, info, products: productsList })
      })
      .then(res => {
        if (res.status === 409) {
          importedNfs[nNF + '_' + targetStore] = { info, products: productsList };
          localStorage.setItem("cacaushow_imported_nfs", JSON.stringify(importedNfs));
          activeNfNumber = nNF + '_' + targetStore;
          if (callback) callback('duplicate');
          else showToast(`A NF-e Nº ${nNF} já consta no sistema e foi carregada na galeria.`, 'info');
          return null;
        }
        if (!res.ok) throw new Error('Erro ao salvar no servidor');
        return res.json();
      })
      .then(data => {
        if (data) {
          importedNfs[nNF + '_' + targetStore] = { info, products: productsList };
          localStorage.setItem("cacaushow_imported_nfs", JSON.stringify(importedNfs));
          activeNfNumber = nNF + '_' + targetStore;
          if (callback) callback('success');
          else showToast(`NF-e Nº ${nNF} importada com sucesso!`, 'sucesso');
          setTimeout(() => {
            if (window.carregarAuditoriaBoletos) {
              window.carregarAuditoriaBoletos();
            }
          }, 800);
        }
      })
      .catch(err => {
        console.error(err);
        if (callback) callback('error');
        else showToast('Erro ao sincronizar NF-e com o servidor.', 'erro');
      });
    } else {
      importedNfs[nNF + '_' + targetStore] = { info, products: productsList };
      localStorage.setItem("cacaushow_imported_nfs", JSON.stringify(importedNfs));
      activeNfNumber = nNF + '_' + targetStore;
      if (isDuplicate) {
        if (callback) callback('duplicate');
        else showToast(`A NF-e Nº ${nNF} já foi importada anteriormente e foi recarregada.`, 'info');
        return;
      }
      if (callback) callback('success');
      else showToast(`NF-e Nº ${nNF} importada localmente!`, 'sucesso');
    }
  };
  reader.readAsText(file);
}

function parseExcelNfe(file, callback) {
  const reader = new FileReader();
  reader.onload = function (e) {
    const data = new Uint8Array(e.target.result);
    const workbook = XLSX.read(data, { type: 'array' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rawRows = XLSX.utils.sheet_to_json(sheet, { header: 1 });

    let headerRowIndex = 0;
    let headers = [];

    for (let r = 0; r < Math.min(5, rawRows.length); r++) {
      const row = rawRows[r];
      if (row && row.some(val => typeof val === 'string' && (val.toLowerCase().includes('cód. produto') || val.toLowerCase().includes('código') || val.toLowerCase().includes('produto')))) {
        headerRowIndex = r;
        headers = row;
        break;
      }
    }

    const colMap = {};
    headers.forEach((h, idx) => {
      if (h) colMap[h.toString().trim()] = idx;
    });

    const getVal = (row, keys) => {
      for (let k of keys) {
        if (colMap[k] !== undefined) return row[colMap[k]];
      }
      return undefined;
    };

    const firstRow = rawRows[headerRowIndex + 1] || [];
    const numNF = getVal(firstRow, ['Nº Nota', 'Nota', 'NF', 'Nº NF']) || `NF-${Math.floor(Math.random() * 900000 + 100000)}`;
    const numNfStr = numNF.toString().trim();

    const info = {
      numero: numNfStr,
      emissao: formattedTodayStr,
      volumes: '1',
      fornecedor: 'Cacau Show CD',
      targetStore: currentStore,
      storeAutoDetectada: false
    };

    const productsList = [];
    for (let r = headerRowIndex + 1; r < rawRows.length; r++) {
      const row = rawRows[r];
      if (!row || row.length === 0) continue;

      const code = getVal(row, ['Cód. Produto', 'Código', 'Cod']);
      if (!code) continue;

      const desc = getVal(row, ['Desc. Produto', 'PRODUTO', 'Descrição']) || 'Item Nota';
      const barras = getVal(row, ['Barras', 'EAN']) || '';
      const qtdNota = getVal(row, ['Quantidade', 'QTD', 'Qtd Faturada', 'Qtd']) || 0;
      const codeStr = code.toString().trim();

      const savedQty = localStorage.getItem(`nfcnt_${currentStore}_${numNfStr}_${codeStr}`);
      productsList.push({
        code: codeStr,
        barras: barras ? barras.toString().trim() : '',
        description: desc.toString().trim(),
        nfQty: Number(qtdNota),
        countedQty: savedQty !== null ? savedQty : '',
        validade: null,
        daysRemaining: null
      });
    }

    const isDuplicate = isClientNfeDuplicate(numNfStr, currentStore, productsList);

    if (API_ONLINE) {
      fetch(`${API_BASE}/nfs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ numero: numNfStr, info, products: productsList })
      })
      .then(res => {
        if (res.status === 409) {
          importedNfs[numNfStr + '_' + currentStore] = { info, products: productsList };
          localStorage.setItem("cacaushow_imported_nfs", JSON.stringify(importedNfs));
          activeNfNumber = numNfStr + '_' + currentStore;
          if (callback) callback('duplicate');
          else showToast(`A NF-e Nº ${numNfStr} já consta no sistema e foi carregada na galeria.`, 'info');
          return null;
        }
        if (!res.ok) throw new Error('Erro ao salvar no servidor');
        return res.json();
      })
      .then(data => {
        if (data) {
          importedNfs[numNfStr + '_' + currentStore] = { info, products: productsList };
          localStorage.setItem("cacaushow_imported_nfs", JSON.stringify(importedNfs));
          activeNfNumber = numNfStr + '_' + currentStore;
          if (callback) callback('success');
          else showToast(`NF-e Nº ${numNfStr} importada com sucesso!`, 'sucesso');
        }
      })
      .catch(err => {
        console.error(err);
        if (callback) callback('error');
        else showToast('Erro ao sincronizar NF-e com o servidor.', 'erro');
      });
    } else {
      importedNfs[numNfStr + '_' + currentStore] = { info, products: productsList };
      localStorage.setItem("cacaushow_imported_nfs", JSON.stringify(importedNfs));
      activeNfNumber = numNfStr + '_' + currentStore;
      if (isDuplicate) {
        if (callback) callback('duplicate');
        else showToast(`A NF-e Nº ${numNfStr} já foi importada anteriormente e foi recarregada.`, 'info');
        return;
      }
      if (callback) callback('success');
      else showToast(`NF-e Nº ${numNfStr} importada localmente!`, 'sucesso');
    }
  };
  reader.readAsArrayBuffer(file);
}

function backToNfGallery() {
  document.getElementById('nf-work-area').classList.add('hidden');
  renderNfCardsGallery();
}

function renderNfCardsGallery() {
  const nfKeys = Object.keys(importedNfs);

  document.getElementById('nf-work-area').classList.add('hidden');
  document.getElementById('nf-cards-gallery-section').classList.remove('hidden');

  // Contagem de notas pendentes por loja, para os badges das abas
  const contagemPorLoja = { 'todas': nfKeys.length, '9175': 0, '4304': 0, '9201': 0 };
  nfKeys.forEach(numNF => {
    const nf = importedNfs[numNF];
    const loja = (nf && nf.info && nf.info.targetStore) ? nf.info.targetStore : currentStore;
    if (contagemPorLoja[loja] !== undefined) contagemPorLoja[loja]++;
    else contagemPorLoja[loja] = 1;
  });

  if (!nfGalleryStoreFilter) {
    nfGalleryStoreFilter = 'todas';
  }

  // Estiliza e sincroniza as abas de loja (separação física entre equipes)
  document.querySelectorAll('.nf-store-tab').forEach(tab => {
    const store = tab.dataset.store;
    const countEl = tab.querySelector('.nf-store-tab-count');
    if (countEl) countEl.textContent = `(${contagemPorLoja[store] !== undefined ? contagemPorLoja[store] : 0})`;

    if (store === nfGalleryStoreFilter) {
      tab.className = 'nf-store-tab px-4 py-2 rounded-xl text-xs font-bold transition border bg-brand-700 text-white border-brand-600 shadow-md';
    } else {
      tab.className = 'nf-store-tab px-4 py-2 rounded-xl text-xs font-bold transition border bg-brand-950 text-brand-300 border-brand-800/40 hover:bg-brand-800 hover:text-white';
    }

    if (!tab.dataset.listenerAdded) {
      tab.addEventListener('click', () => {
        nfGalleryStoreFilter = store;
        selectedNfNumbers = []; // Clear selection when switching stores
        updateNfSelectionUI();
        renderNfCardsGallery();
      });
      tab.dataset.listenerAdded = 'true';
    }
  });

  const grid = document.getElementById('nf-cards-grid');
  grid.innerHTML = '';

  const nfKeysDaLoja = nfKeys.filter(numNF => {
    if (nfGalleryStoreFilter === 'todas') return true;
    const storeOfNf = (importedNfs[numNF] && importedNfs[numNF].info && importedNfs[numNF].info.targetStore) ? importedNfs[numNF].info.targetStore : currentStore;
    return storeOfNf === nfGalleryStoreFilter;
  });

  if (nfKeysDaLoja.length === 0) {
    const msgLoja = nfGalleryStoreFilter === 'todas' ? 'qualquer loja' : getLojaNomePorCodigo(nfGalleryStoreFilter);
    grid.innerHTML = `
      <div class="col-span-full py-12 text-center text-brand-400 text-sm glass-card rounded-2xl border border-brand-900">
        <i class="fa-solid fa-boxes-packing text-4xl mb-3 block text-brand-600"></i>
        Nenhuma Nota Fiscal pendente para ${msgLoja}.
      </div>
    `;
    updateNfSelectionUI();
    return;
  }

  nfKeysDaLoja.forEach(numNF => {
    const nfData = importedNfs[numNF];
    const totalItens = nfData.products ? nfData.products.length : 0;
    let conferidosCount = 0;
    let faltasCount = 0;

    if (nfData.products) {
      nfData.products.forEach(p => {
        if (p.countedQty !== '') conferidosCount++;
        const counted = p.countedQty === '' ? 0 : Number(p.countedQty);
        if (counted < p.nfQty) faltasCount += (p.nfQty - counted);
      });
    }

    let statusText = 'Pendente';
    let cardBgClass = 'border-brand-800/40 bg-brand-950/40';
    let statusBadgeClass = 'bg-brand-900/80 text-brand-300 border-brand-800';

    if (conferidosCount === totalItens && totalItens > 0 && faltasCount === 0) {
      statusText = 'ENTRADA OK NO SISTEMA CACAU SHOW';
      cardBgClass = 'border-emerald-600/60 bg-emerald-950/30';
      statusBadgeClass = 'bg-emerald-600 text-white font-extrabold shadow-md';
    } else if (faltasCount > 0 && conferidosCount > 0) {
      statusText = `PENDÊNCIA (${faltasCount} Faltas)`;
      cardBgClass = 'border-orange-500/60 bg-orange-950/30';
      statusBadgeClass = 'bg-orange-600 text-white font-extrabold shadow-md animate-pulse';
    }

    const lojaCodigo = (nfData.info && nfData.info.targetStore) ? nfData.info.targetStore : currentStore;
    const lojaNome = getLojaNomePorCodigo(lojaCodigo);
    const lojaAutoDetectada = (nfData.info && nfData.info.storeAutoDetectada !== false);

    const lojaAlertaHtml = lojaAutoDetectada ? '' : `
      <div class="mb-4">
        <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold bg-orange-950/50 text-orange-400 border border-orange-800/50 animate-pulse" title="Loja não identificada na NF-e — confira antes de conferir">
          <i class="fa-solid fa-triangle-exclamation"></i> ${lojaNome} (${lojaCodigo}) — não confirmada
        </span>
      </div>
    `;

    const isSelected = selectedNfNumbers.includes(numNF);
    if (isSelected) {
      cardBgClass = 'border-brand-400 bg-brand-900/60 ring-2 ring-brand-500/50 scale-[1.01]';
    }

    const selectCheckHtml = isSelected
      ? `<span class="absolute top-4 right-4 text-emerald-400 text-lg"><i class="fa-solid fa-circle-check"></i></span>`
      : `<span class="absolute top-4 right-4 text-brand-500 opacity-30 text-lg hover:opacity-80"><i class="fa-regular fa-circle"></i></span>`;

    const card = document.createElement('div');
    card.className = `glass-card p-5 rounded-2xl border hover:scale-[1.02] transform transition-all cursor-pointer shadow-lg relative overflow-hidden ${cardBgClass}`;
    card.innerHTML = `
      ${selectCheckHtml}
      <div class="flex justify-between items-start mb-3">
        <span class="px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${statusBadgeClass}">${statusText}</span>
        <span class="text-xs text-brand-400 font-mono font-bold mr-6"><i class="fa-solid fa-box-archive"></i> ${nfData.info ? nfData.info.volumes : 1} CX</span>
      </div>
      <div class="${lojaAutoDetectada ? 'mb-3' : 'mb-2'}">
        <div class="text-[10px] text-brand-400 font-bold uppercase tracking-wider">Nota Fiscal <span class="text-white text-sm font-mono font-black normal-case">Nº ${nfData.info ? nfData.info.numero : numNF}</span></div>
        <div class="mt-1">
          <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-brand-900 text-brand-300 border border-brand-800/80">
            <i class="fa-solid fa-store text-brand-500"></i> ${lojaNome} (${lojaCodigo})
          </span>
        </div>
      </div>
      ${lojaAlertaHtml}
      <button type="button" class="btn-iniciar-direto mt-4 w-full py-2 bg-brand-700 hover:bg-brand-600 text-white font-bold rounded-xl text-xs text-center transition">
        <i class="fa-solid fa-camera mr-1"></i> Iniciar Conferência (Câmera Direct)
      </button>
    `;

    card.addEventListener('click', (e) => {
      // Toggle selection unless start button clicked
      if (e.target.closest('.btn-iniciar-direto')) return;
      toggleNfSelection(numNF);
    });

    const directBtn = card.querySelector('.btn-iniciar-direto');
    if (directBtn) {
      directBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        openNfConferenceDirectScanner(numNF);
      });
    }

    grid.appendChild(card);
  });

  updateNfSelectionUI();
}

function toggleNfSelection(numNF) {
  const index = selectedNfNumbers.indexOf(numNF);
  if (index > -1) {
    selectedNfNumbers.splice(index, 1);
  } else {
    selectedNfNumbers.push(numNF);
  }
  updateNfSelectionUI();
  
  // Re-render gallery cards to show selected checkmarks
  const nfKeys = Object.keys(importedNfs);
  const grid = document.getElementById('nf-cards-grid');
  const cards = grid.children;
  
  const nfKeysDaLoja = nfKeys.filter(n => {
    if (nfGalleryStoreFilter === 'todas') return true;
    const storeOfNf = (importedNfs[n] && importedNfs[n].info && importedNfs[n].info.targetStore) ? importedNfs[n].info.targetStore : currentStore;
    return storeOfNf === nfGalleryStoreFilter;
  });

  nfKeysDaLoja.forEach((nKey, idx) => {
    const cardEl = cards[idx];
    if (!cardEl) return;
    const isSelected = selectedNfNumbers.includes(nKey);
    const checkIcon = cardEl.querySelector('.absolute.top-4.right-4');
    if (checkIcon) {
      if (isSelected) {
        checkIcon.className = "absolute top-4 right-4 text-emerald-400 text-lg";
        checkIcon.innerHTML = `<i class="fa-solid fa-circle-check"></i>`;
        cardEl.className = cardEl.className.replace(/border-brand-800\/40 bg-brand-950\/40|border-emerald-600\/60 bg-emerald-950\/30|border-orange-500\/60 bg-orange-950\/30/g, 'border-brand-400 bg-brand-900/60 ring-2 ring-brand-500/50 scale-[1.01]');
      } else {
        checkIcon.className = "absolute top-4 right-4 text-brand-500 opacity-30 text-lg hover:opacity-80";
        checkIcon.innerHTML = `<i class="fa-regular fa-circle"></i>`;
        // Restore class based on status
        const nfData = importedNfs[nKey];
        const total = nfData.products ? nfData.products.length : 0;
        let conf = 0, faltas = 0;
        if (nfData.products) {
          nfData.products.forEach(p => {
            if (p.countedQty !== '') conf++;
            const counted = p.countedQty === '' ? 0 : Number(p.countedQty);
            if (counted < p.nfQty) faltas += (p.nfQty - counted);
          });
        }
        let restoreClass = 'border-brand-800/40 bg-brand-950/40';
        if (conf === total && total > 0 && faltas === 0) restoreClass = 'border-emerald-600/60 bg-emerald-950/30';
        else if (faltas > 0 && conf > 0) restoreClass = 'border-orange-500/60 bg-orange-950/30';
        
        cardEl.className = `glass-card p-5 rounded-2xl border hover:scale-[1.02] transform transition-all cursor-pointer shadow-lg relative overflow-hidden ${restoreClass}`;
      }
    }
  });
}

function updateNfSelectionUI() {
  const bar = document.getElementById('nf-selection-action-bar');
  const countEl = document.getElementById('nf-selected-count');
  if (!bar || !countEl) return;

  if (selectedNfNumbers.length > 0) {
    countEl.textContent = selectedNfNumbers.length;
    bar.classList.remove('hidden');
  } else {
    bar.classList.add('hidden');
  }
}

function openNfConferenceDirectScanner(numNF) {
  activeNfNumbers = Array.isArray(numNF) ? numNF : [numNF];
  activeNfNumber = activeNfNumbers[0];
  document.getElementById('nf-cards-gallery-section').classList.add('hidden');
  document.getElementById('nf-work-area').classList.remove('hidden');
  renderNfDashboard();

  // Notificar Bruno e Isabella (Push + Email) sobre início da conferência de cada uma
  activeNfNumbers.forEach(n => notificarGestaoConferencia('inicio', n));

  // Rede de segurança
  activeNfNumbers.forEach(n => {
    if (importedNfs[n]) {
      verificarPopupConclusaoNf(importedNfs[n], n);
    }
  });

  const scannerContainer = document.getElementById('nf-scanner-container');
  if (scannerContainer && scannerContainer.classList.contains('hidden')) {
    toggleNfScanner();
  }
}

function notificarGestaoConferencia(tipo, numNF) {
  if (!numNF || !importedNfs[numNF]) return;
  const nfData = importedNfs[numNF];
  const lojaNome = getLojaNomePorCodigo(nfData.info.targetStore || currentStore);
  const operador = currentUser ? currentUser.nome : 'Colaboradora';

  let totalItens = nfData.products ? nfData.products.length : 0;
  let conferidosCount = 0;
  let faltasCount = 0;

  if (nfData.products) {
    nfData.products.forEach(p => {
      if (p.countedQty !== '') conferidosCount++;
      const counted = p.countedQty === '' ? 0 : Number(p.countedQty);
      if (counted < p.nfQty) faltasCount += (p.nfQty - counted);
    });
  }

  let assunto = '';
  let mensagem = '';

  if (tipo === 'inicio') {
    assunto = `🚀 Início de Conferência de NF-e - Loja ${lojaNome}`;
    mensagem = `A colaboradora ${operador} iniciou a conferência física da NF Nº ${nfData.info.numero} (${nfData.info.fornecedor}) na Loja ${lojaNome}. Total de itens: ${totalItens}.`;
  } else if (tipo === 'conclusao') {
    const status = (conferidosCount === totalItens && totalItens > 0 && faltasCount === 0) ? '100% OK' : `PENDÊNCIA (${faltasCount} Faltas)`;
    assunto = `📋 Conferência de NF-e Finalizada (${status}) - Loja ${lojaNome}`;
    mensagem = `A conferência da NF Nº ${nfData.info.numero} na Loja ${lojaNome} foi concluída por ${operador}.\nStatus: ${status}.\nItens Conferidos: ${conferidosCount}/${totalItens}.`;
  }

  const destinatarios = getDestinatariosNotificacao('conferencia_nfe');
  if (destinatarios.length > 0) {
    const canal = getNotificationChannel('nfe', 'owner');
    sendNotification(destinatarios, assunto, mensagem, canal);
  }
}

function getLojaNomePorCodigo(codigo) {
  if (codigo === '9175') return 'Marambaia';
  if (codigo === '4304') return 'Icoaraci';
  if (codigo === '9201') return 'Mário Covas';
  return codigo || 'Marambaia';
}

function notificarWhatsappGestao() {
  let storeCode = currentStore;
  if (activeNfNumbers.length > 0 && importedNfs[activeNfNumbers[0]]) {
    storeCode = importedNfs[activeNfNumbers[0]].info.targetStore || currentStore;
  }
  const storeName = getLojaNomePorCodigo(storeCode);
  const linkGrupo = WHATSAPP_GRUPOS[storeName];

  if (!linkGrupo) {
    showToast(`Nenhum grupo de WhatsApp configurado para a Loja ${storeName}.`, 'erro');
    return;
  }

  let textoMsg = `*Aviso de Conferência de NF-e - Loja ${storeName}*\n`;
  if (activeNfNumbers.length > 0) {
    textoMsg += `Notas Fiscais: ${activeNfNumbers.map(n => n.split('_')[0]).join(', ')}\n`;
    textoMsg += `Operador: ${currentUser ? currentUser.nome : 'Colaboradora'}\n\n`;

    let pendentes = [];
    let divergencias = [];

    activeNfNumbers.forEach(numNF => {
      const nfData = importedNfs[numNF];
      if (nfData && nfData.products) {
        nfData.products.forEach(p => {
          if (p.countedQty === '') {
            pendentes.push({ p, nf: numNF.split('_')[0] });
          } else {
            const counted = Number(p.countedQty);
            if (counted !== p.nfQty) {
              divergencias.push({
                p: p,
                nf: numNF.split('_')[0],
                diferenca: counted - p.nfQty
              });
            }
          }
        });
      }
    });

    if (pendentes.length === 0 && divergencias.length === 0) {
      textoMsg += `*Status:* Conferência concluída 100% CONFORME (sem divergências ou pendências).\n`;
    } else {
      textoMsg += `*Status:* Conferência finalizada com pendências/divergências:\n`;
      if (pendentes.length > 0) {
        textoMsg += `\n*Itens não conferidos (Pendentes) (${pendentes.length}):*\n`;
        pendentes.forEach(item => {
          textoMsg += `- NF ${item.nf} | Cód ${item.p.code}: ${item.p.description} (Qtd Esperada: ${item.p.nfQty})\n`;
        });
      }
      if (divergencias.length > 0) {
        textoMsg += `\n*Divergências encontradas (${divergencias.length}):*\n`;
        divergencias.forEach(div => {
          const sinal = div.diferenca > 0 ? '+' : '';
          const tipo = div.diferenca > 0 ? 'Sobra' : 'Falta';
          textoMsg += `- NF ${div.nf} | Cód ${div.p.code}: ${div.p.description} (${tipo}: ${sinal}${div.diferenca} un | Esp: ${div.p.nfQty}, Cont: ${div.p.countedQty})\n`;
        });
      }
    }
  } else {
    textoMsg += `Conferências em andamento na loja.\n`;
  }

  const urlWhatsapp = `${linkGrupo}?text=${encodeURIComponent(textoMsg)}`;
  window.open(urlWhatsapp, '_blank');
}

function renderNfDashboard() {
  if (activeNfNumbers.length === 0) return;
  const shortNfs = activeNfNumbers.map(n => n.split('_')[0]);
  document.getElementById('nf-numero').textContent = shortNfs.join(', ');
  updateNfStats();
  renderNfTable();
}

function updateNfStats() {
  let faltasCount = 0;
  activeNfNumbers.forEach(numNF => {
    const currentNf = importedNfs[numNF];
    if (currentNf && currentNf.products) {
      currentNf.products.forEach(p => {
        const counted = p.countedQty === '' ? 0 : Number(p.countedQty);
        if (counted < p.nfQty) faltasCount += (p.nfQty - counted);
      });
    }
  });
  const el = document.getElementById('nf-faltas-count');
  if (el) el.textContent = faltasCount;
}

function toggleNfScanner() {
  const container = document.getElementById('nf-scanner-container');
  const btnText = document.getElementById('nf-scanner-btn-text');
  if (container.classList.contains('hidden')) {
    container.classList.remove('hidden');
    if (btnText) btnText.textContent = "Desativar Câmera";
    startNfScanner();
  } else {
    container.classList.add('hidden');
    if (btnText) btnText.textContent = "Ativar Câmera NF";
    stopNfScanner();
  }
}

function startNfScanner(selectedCameraId = null) {
  if (typeof Html5Qrcode === 'undefined') {
    showToast("Biblioteca de QR Code não carregada.", "erro");
    resetNfScannerUI();
    return;
  }

  // 1. Check secure context
  if (!window.isSecureContext) {
    showToast("Erro: Acesso à câmera requer conexão segura (HTTPS).", "erro");
    showModal("O acesso à câmera é bloqueado pelo navegador em conexões não seguras (HTTP). Por favor, acesse o sistema usando HTTPS ou pelo localhost.", {
      icon: "⚠️",
      title: "Conexão Não Segura",
      btnText: "Entendi"
    });
    resetNfScannerUI();
    return;
  }

  if (html5QrCodeNf === null) {
    html5QrCodeNf = new Html5Qrcode("nf-reader");
  }

  const config = { fps: 15, qrbox: { width: 300, height: 180 } };

  // If a specific camera ID was selected or passed, use it directly
  if (selectedCameraId) {
    html5QrCodeNf.start({ deviceId: { exact: selectedCameraId } }, config, onNfScanSuccess, () => { })
      .then(() => {
        // Scanner started successfully
      })
      .catch(err => {
        console.error("Erro ao iniciar com camera ID:", err);
        showToast("Erro ao abrir a câmera selecionada. Tentando outra...", "erro");
        fallbackToCameraList();
      });
    return;
  }

  // Otherwise, start with environment camera (rear camera)
  html5QrCodeNf.start({ facingMode: "environment" }, config, onNfScanSuccess, () => { })
    .then(() => {
      setupCameraDropdown();
    })
    .catch(err => {
      console.warn("Erro ao iniciar facingMode environment. Tentando listar câmeras...", err);
      fallbackToCameraList();
    });

  function fallbackToCameraList() {
    Html5Qrcode.getCameras()
      .then(cameras => {
        if (!cameras || cameras.length === 0) {
          showToast("Nenhuma câmera encontrada no aparelho.", "erro");
          resetNfScannerUI();
          return;
        }

        // Try to find a back camera
        let backCamera = cameras.find(c => {
          const lbl = c.label.toLowerCase();
          return lbl.includes("back") || lbl.includes("traseira") || lbl.includes("rear") || lbl.includes("ambiente") || lbl.includes("environment");
        });

        // Use back camera if found, otherwise use first camera
        const targetCam = backCamera || cameras[cameras.length - 1] || cameras[0];

        html5QrCodeNf.start({ deviceId: { exact: targetCam.id } }, config, onNfScanSuccess, () => { })
          .then(() => {
            setupCameraDropdown(cameras, targetCam.id);
          })
          .catch(e => {
            console.error("Falha total ao iniciar câmera:", e);
            showToast("Não foi possível acessar a câmera. Verifique as permissões.", "erro");
            resetNfScannerUI();
          });
      })
      .catch(e => {
        console.error("Erro ao listar câmeras:", e);
        showToast("Permissão negada ou erro ao acessar câmera.", "erro");
        resetNfScannerUI();
      });
  }

  function setupCameraDropdown(providedCameras = null, activeId = null) {
    const selectContainer = document.getElementById('nf-camera-select-container');
    const selectEl = document.getElementById('nf-camera-select');
    if (!selectContainer || !selectEl) return;

    const populate = (cameras) => {
      if (cameras.length <= 1) {
        selectContainer.classList.add('hidden');
        return;
      }

      selectEl.innerHTML = '';
      cameras.forEach(cam => {
        const opt = document.createElement('option');
        opt.value = cam.id;
        opt.textContent = cam.label || `Câmera ${cam.id.substring(0, 8)}`;
        if (activeId && cam.id === activeId) {
          opt.selected = true;
        }
        selectEl.appendChild(opt);
      });

      selectContainer.classList.remove('hidden');

      // Add change event listener if not already added
      if (!selectEl.dataset.listenerAdded) {
        selectEl.addEventListener('change', (e) => {
          const newCamId = e.target.value;
          if (html5QrCodeNf && html5QrCodeNf.isScanning) {
            html5QrCodeNf.stop()
              .then(() => {
                startNfScanner(newCamId);
              })
              .catch(err => {
                console.error("Erro ao parar para trocar câmera:", err);
                startNfScanner(newCamId);
              });
          } else {
            startNfScanner(newCamId);
          }
        });
        selectEl.dataset.listenerAdded = "true";
      }
    };

    if (providedCameras) {
      populate(providedCameras);
    } else {
      Html5Qrcode.getCameras()
        .then(cameras => {
          populate(cameras);
        })
        .catch(err => console.warn("Erro ao carregar câmeras para dropdown:", err));
    }
  }
}

function resetNfScannerUI() {
  const container = document.getElementById('nf-scanner-container');
  const selectContainer = document.getElementById('nf-camera-select-container');
  const btnText = document.getElementById('nf-scanner-btn-text');

  if (container) container.classList.add('hidden');
  if (selectContainer) selectContainer.classList.add('hidden');
  if (btnText) btnText.textContent = "Ativar Câmera NF";
}

function stopNfScanner() {
  const selectContainer = document.getElementById('nf-camera-select-container');
  if (selectContainer) selectContainer.classList.add('hidden');
  if (html5QrCodeNf && html5QrCodeNf.isScanning) {
    html5QrCodeNf.stop().catch(err => console.error(err));
  }
}

function onNfScanSuccess(decodedText) {
  const cleanCode = decodedText.trim();
  let p = null;
  let matchedNfNumber = null;

  // --- Etapa 1: Buscar nas NF-es ativas ---
  for (const numNF of activeNfNumbers) {
    const currentNf = importedNfs[numNF];
    if (currentNf) {
      const resultado = resolverCodigoBipado(currentNf.products, cleanCode);
      const tempP = resultado.produto;
      if (tempP) {
        // Priorizar item pendente
        const currentQty = tempP.countedQty === '' ? 0 : Number(tempP.countedQty);
        if (currentQty < tempP.nfQty) {
          p = tempP;
          matchedNfNumber = numNF;
          break;
        } else if (!p) {
          p = tempP;
          matchedNfNumber = numNF;
        }
      }
    }
  }

  // --- Etapa 2: Buscar em outras NF-es importadas (carga misturada) ---
  if (!p) {
    for (const numNF of Object.keys(importedNfs)) {
      if (!activeNfNumbers.includes(numNF)) {
        const { produto, metodo } = resolverCodigoBipado(importedNfs[numNF].products, cleanCode);
        if (produto) {
          p = produto;
          matchedNfNumber = numNF;
          activeNfNumbers = [numNF];
          activeNfNumber = numNF;
          renderNfDashboard();
          const metodoInfo = metodo !== 'CodBarra' ? ` (via ${metodo})` : '';
          showToast(`⚡ Carga Misturada: NF Nº ${numNF.split('_')[0]}${metodoInfo}`, "info");
          break;
        }
      }
    }
  }

  if (p && matchedNfNumber) {
    if (navigator.vibrate) navigator.vibrate(150);
    playBeep('success');
    const currentQty = p.countedQty === '' ? 0 : Number(p.countedQty);
    const newQty = currentQty + 1;
    saveNfQuantity(p.code, newQty.toString(), matchedNfNumber);

    // Focar no campo de quantidade inventariada do produto bipado
    setTimeout(() => {
      const rowInput = document.querySelector(`input.nf-qty-input[data-code="${p.code}"][data-nf="${matchedNfNumber}"]`)
                       || document.querySelector(`input.nf-qty-input[data-code="${p.code}"]`);
      if (rowInput) {
        rowInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
        rowInput.focus();
        rowInput.select();
      }
    }, 100);
  } else {
    if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
    playBeep('error');
    const nomeCSVNf = codBarraParaDesc[cleanCode] || codProdParaDesc[cleanCode] || null;
    const msgErroNf = nomeCSVNf
      ? `"${nomeCSVNf}" não está nas NF-es importadas. Tente o CodProduto da etiqueta da caixa.`
      : `Código não localizado nas NF-es: ${cleanCode}. Tente bipar o CodProduto da etiqueta da caixa.`;
    showToast(msgErroNf, 'erro');
  }
}

function montarMensagemConclusaoNfe(currentNf) {
  const numero = currentNf.info.numero;
  const itensComFalta = [];
  currentNf.products.forEach(p => {
    const counted = p.countedQty === '' ? 0 : Number(p.countedQty);
    if (counted < p.nfQty) {
      itensComFalta.push(`${p.description} (faltou ${p.nfQty - counted})`);
    }
  });

  if (itensComFalta.length === 0) {
    return `✅ Conferência da NF-e Nº ${numero} concluída — sem divergências.`;
  }

  const LIMITE_ITENS = 3;
  let listaResumo = itensComFalta.slice(0, LIMITE_ITENS).join('; ');
  if (itensComFalta.length > LIMITE_ITENS) {
    listaResumo += `; e mais ${itensComFalta.length - LIMITE_ITENS} item(ns)`;
  }

  return `⚠️ Conferência da NF-e Nº ${numero} concluída COM DIVERGÊNCIAS:\n${listaResumo}`;
}

function abrirPopupConclusaoNfe(currentNf, numNF) {
  abrirPopupConclusaoNfeMulti([numNF]);
}

function abrirPopupConclusaoNfeMulti(numNFs) {
  const modal = document.getElementById('modal-nf-conclusao');
  const statusTexto = document.getElementById('nf-conclusao-status-texto');
  const textarea = document.getElementById('nf-conclusao-texto');
  const btnCopiar = document.getElementById('btn-nf-conclusao-copiar');
  const btnWhatsapp = document.getElementById('btn-nf-conclusao-whatsapp');
  const btnEnviado = document.getElementById('btn-nf-conclusao-enviado');
  if (!modal) return;

  let temDivergencia = false;
  let storeName = 'Marambaia';

  numNFs.forEach(n => {
    const nf = importedNfs[n];
    if (nf) {
      storeName = getLojaNomePorCodigo(nf.info.targetStore || currentStore);
      if (nf.products) {
        nf.products.forEach(p => {
          const counted = p.countedQty === '' ? 0 : Number(p.countedQty);
          if (counted < p.nfQty) temDivergencia = true;
        });
      }
    }
  });

  statusTexto.textContent = temDivergencia ? 'Conferência concluída com divergências' : 'Conferência concluída';

  let textoMsg = `*Aviso de Conferência de NF-e - Loja ${storeName}*\n`;
  textoMsg += `Operador: ${currentUser ? currentUser.nome : 'Colaboradora'}\n`;
  textoMsg += `Notas Fiscais: ${numNFs.map(n => n.split('_')[0]).join(', ')}\n\n`;

  let pendentes = [];
  let divergencias = [];

  numNFs.forEach(n => {
    const nf = importedNfs[n];
    if (nf && nf.products) {
      nf.products.forEach(p => {
        const counted = p.countedQty === '' ? 0 : Number(p.countedQty);
        if (p.countedQty === '') {
          pendentes.push({ p, nf: n.split('_')[0] });
        } else if (counted !== p.nfQty) {
          divergencias.push({
            p: p,
            nf: n.split('_')[0],
            diferenca: counted - p.nfQty
          });
        }
      });
    }
  });

  if (pendentes.length === 0 && divergencias.length === 0) {
    textoMsg += `*Status:* Conferência concluída 100% CONFORME (sem divergências ou pendências).\n`;
  } else {
    textoMsg += `*Status:* Conferência finalizada com pendências/divergências:\n`;
    if (pendentes.length > 0) {
      textoMsg += `\n*Itens não conferidos (Pendentes) (${pendentes.length}):*\n`;
      pendentes.slice(0, 10).forEach(item => {
        textoMsg += `- NF ${item.nf} | Cód ${item.p.code}: ${item.p.description} (Qtd Esperada: ${item.p.nfQty})\n`;
      });
      if (pendentes.length > 10) {
        textoMsg += `- ... e mais ${pendentes.length - 10} itens pendentes.\n`;
      }
    }
    if (divergencias.length > 0) {
      textoMsg += `\n*Divergências encontradas (${divergencias.length}):*\n`;
      divergencias.slice(0, 10).forEach(div => {
        const sinal = div.diferenca > 0 ? '+' : '';
        const tipo = div.diferenca > 0 ? 'Sobra' : 'Falta';
        textoMsg += `- NF ${div.nf} | Cód ${div.p.code}: ${div.p.description} (${tipo}: ${sinal}${div.diferenca} un | Esp: ${div.p.nfQty}, Cont: ${div.p.countedQty})\n`;
      });
      if (divergencias.length > 10) {
        textoMsg += `- ... e mais ${divergencias.length - 10} divergências.\n`;
      }
    }
  }

  textarea.value = textoMsg;

  const linkGrupo = WHATSAPP_GRUPOS[storeName];
  btnWhatsapp.href = linkGrupo ? `${linkGrupo}?text=${encodeURIComponent(textoMsg)}` : `https://wa.me/?text=${encodeURIComponent(textoMsg)}`;

  btnCopiar.onclick = async () => {
    try {
      await navigator.clipboard.writeText(textarea.value);
      showToast('Mensagem copiada!', 'sucesso');
    } catch {
      textarea.select();
      document.execCommand('copy');
    }
  };

  btnEnviado.onclick = () => {
    numNFs.forEach(n => {
      const nf = importedNfs[n];
      if (nf) {
        nf._mensagemEnviada = true;
      }
    });
    localStorage.setItem("cacaushow_imported_nfs", JSON.stringify(importedNfs));
    
    // Sync each completed status to the backend
    numNFs.forEach(numNF => {
      const currentNf = importedNfs[numNF];
      if (currentNf && API_ONLINE) {
        fetch(`${API_BASE}/nfs/${numNF}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ info: currentNf.info, products: currentNf.products })
        }).catch(err => console.error('Erro ao sincronizar confirmação de envio:', err));
      }
    });

    modal.classList.add('hidden');
    showToast('Aviso de conclusão enviado. Retornando à galeria.', 'sucesso');
    backToNfGallery();
  };

  modal.classList.remove('hidden');
}

function verificarPopupConclusaoNf(currentNf, numNF) {
  // Manual conclude is now enforced, no automatic modal popup on every save
}

function saveNfQuantity(code, value, targetNfNumber = null) {
  const nfNum = targetNfNumber || (activeNfNumbers.length > 0 ? activeNfNumbers[0] : null);
  if (!nfNum || !importedNfs[nfNum]) return;
  const currentNf = importedNfs[nfNum];
  const p = currentNf.products.find(prod => prod.code === code);
  if (p) {
    p.countedQty = value;
    localStorage.setItem(`nfcnt_${currentStore}_${nfNum}_${code}`, value);
    
    // Quantity changed, update stats and table (DO NOT credit inventory until concluded)
    updateNfStats();
    renderNfTable();

    // Reset status flags since it has modified content
    currentNf.info.concluidaEm = null;
    currentNf._notificadoConclusao = false;
    currentNf._mensagemEnviada = false;

    localStorage.setItem("cacaushow_imported_nfs", JSON.stringify(importedNfs));

    // Sync quantities in real time with backend
    if (API_ONLINE) {
      fetch(`${API_BASE}/nfs/${nfNum}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          info: currentNf.info,
          products: currentNf.products
        })
      })
      .catch(err => console.error('Erro ao sincronizar quantidade da NF-e no servidor:', err));
    }
  }
}

function concluirConferenciaAtiva() {
  if (activeNfNumbers.length === 0) {
    showToast("Nenhuma conferência ativa.", "erro");
    return;
  }

  let totalItens = 0;
  let conferidosCount = 0;
  activeNfNumbers.forEach(numNF => {
    const nf = importedNfs[numNF];
    if (nf && nf.products) {
      totalItens += nf.products.length;
      nf.products.forEach(p => {
        if (p.countedQty !== '') conferidosCount++;
      });
    }
  });

  const msgConfirm = `Deseja concluir a conferência de ${activeNfNumbers.length} nota(s)? (${conferidosCount}/${totalItens} itens informados)`;
  if (!confirm(msgConfirm)) return;

  // Process and save each active NF
  activeNfNumbers.forEach(numNF => {
    const currentNf = importedNfs[numNF];
    if (!currentNf) return;

    // 1. Mark completed
    currentNf.info.concluidaEm = new Date().toISOString();
    
    // 2. Feed inventory with checked products
    if (currentNf.products) {
      currentNf.products.forEach(p => {
        autoCreditNfProductToInventory(currentNf.info, p);
      });
    }

    // 3. Notify management of completion
    if (!currentNf._notificadoConclusao) {
      currentNf._notificadoConclusao = true;
      notificarGestaoConferencia('conclusao', numNF);
    }
  });

  // Save changes locally
  localStorage.setItem("cacaushow_imported_nfs", JSON.stringify(importedNfs));

  // Open WhatsApp report modal
  abrirPopupConclusaoNfeMulti(activeNfNumbers);
}

function autoCreditNfProductToInventory(nfInfo, p) {
  const targetStore = nfInfo.targetStore || currentStore;
  const countedBoxes = p.countedQty !== '' ? Number(p.countedQty) : 0;
  if (countedBoxes <= 0) return;

  const totalUnits = Math.round(countedBoxes * (p.boxMultiplier || 1));
  let invProd = products.find(prod => prod.code === p.code);
  if (!invProd) {
    invProd = {
      code: p.code,
      barras: p.barras,
      description: p.description,
      validade: p.validade,
      daysRemaining: p.daysRemaining,
      countedQty: '',
      dataEntrada: nfInfo.emissao,
      qtdEntradaUnidades: totalUnits
    };
    products.push(invProd);
  } else {
    invProd.dataEntrada = nfInfo.emissao;
    invProd.qtdEntradaUnidades = totalUnits;
  }

  dbBridge.saveInventoryItem(targetStore, invProd);
  renderTable();
}

function renderNfTable() {
  const tbody = document.getElementById('nf-inventory-tbody');
  if (!tbody || activeNfNumbers.length === 0) return;
  tbody.innerHTML = '';

  activeNfNumbers.forEach(numNF => {
    const currentNf = importedNfs[numNF];
    if (!currentNf || !currentNf.products) return;

    currentNf.products.forEach(p => {
      const counted = p.countedQty === '' ? null : Number(p.countedQty);
      
      let statusText = 'Pendente';
      let statusColorClass = 'text-orange-500 font-extrabold bg-orange-950/40 px-2 py-1 rounded border border-orange-800';
      let rowBgClass = 'bg-orange-950/10 border-orange-900/20';

      if (counted !== null) {
        if (counted === p.nfQty) {
          statusText = 'Conforme';
          statusColorClass = 'text-emerald-400 font-extrabold bg-emerald-950/40 px-2 py-1 rounded border border-emerald-800';
          rowBgClass = 'bg-emerald-950/5 border-emerald-900/20';
        } else {
          statusText = counted < p.nfQty ? 'Falta' : 'Sobra';
          statusColorClass = 'text-rose-400 font-extrabold bg-rose-950/40 px-2 py-1 rounded border border-rose-800';
          rowBgClass = 'bg-rose-950/10 border-rose-900/20';
        }
      }

      const tr = document.createElement('tr');
      tr.className = `hover:bg-brand-900/30 transition-all border-b ${rowBgClass}`;
      
      const shortNf = numNF.split('_')[0];
      
      tr.innerHTML = `
        <td class="py-3 px-4">
          <div class="font-semibold text-brand-100 text-xs">${p.description}</div>
          <div class="text-[10px] text-brand-300 font-mono">Cód: ${p.code} ${p.barras ? `| EAN: ${p.barras}` : ''} | <span class="text-brand-200 font-bold bg-brand-900/50 px-1 py-0.5 rounded border border-brand-800">NF: ${shortNf}</span></div>
        </td>
        <td class="py-3 px-4 text-center text-xs text-brand-200">${p.validade ? formatDate(p.validade) : '-'}</td>
        <td class="py-3 px-4 text-center text-xs text-brand-300">${p.daysRemaining !== null ? `${p.daysRemaining}d` : '-'}</td>
        <td class="py-3 px-4 text-center font-bold text-xs text-brand-100">${p.nfQty}</td>
        <td class="py-3 px-4 text-center">
          <input type="number" value="${p.countedQty}" placeholder="0" data-code="${p.code}" data-nf="${numNF}" class="nf-qty-input w-16 text-center bg-brand-950 border border-brand-800 text-white rounded py-1 font-bold text-xs" />
        </td>
        <td class="py-3 px-4 text-center text-xs">
          <span class="${statusColorClass}">${statusText}</span>
        </td>
      `;
      const qtyInput = tr.querySelector('.nf-qty-input');
      qtyInput.addEventListener('input', (e) => saveNfQuantity(p.code, e.target.value, numNF));
      tbody.appendChild(tr);
    });
  });
}

function triggerInventoryStartedNotification() {
  const ano = new Date().getFullYear();
  const mes = new Date().getMonth();
  const storageKey = `inv_started_${ano}_${mes}_${currentStore}`;
  if (!localStorage.getItem(storageKey)) {
    localStorage.setItem(storageKey, "true");
    fetch('/api/notificar-gestao', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        destinatarios: ['Bruno', 'Isabella', 'Alexandra', 'LiderOP'],
        assunto: `📋 Inventário Iniciado - Loja ${getLojaNomePorCodigo(currentStore)}`,
        mensagem: `A colaboradora ${currentUser.nome} iniciou a contagem física do Inventário de Estoque na Loja ${getLojaNomePorCodigo(currentStore)}.`,
        operador: currentUser.nome
      })
    }).catch(err => console.error('Erro na notificação de início de inventário:', err));
  }
}

function renderTable() {
  const tbody = document.getElementById('inventory-tbody');
  if (!tbody) return;
  tbody.innerHTML = '';

  // Update top stats dynamically
  let totalCount = 0;
  let redCount = 0;
  let orangeCount = 0;
  let greenCount = 0;

  const now = new Date();
  const dToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  products.forEach(p => {
    if (p.validade && !isNaN(new Date(p.validade).getTime())) {
      const valDate = new Date(p.validade);
      const dVal = new Date(valDate.getFullYear(), valDate.getMonth(), valDate.getDate());
      const diffTime = dVal.getTime() - dToday.getTime();
      p.daysRemaining = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    } else {
      p.daysRemaining = null;
    }

    totalCount++;
    if (p.daysRemaining !== null) {
      if (p.daysRemaining <= 20) {
        redCount++;
      } else if (p.daysRemaining <= 40) {
        orangeCount++;
      } else {
        greenCount++;
      }
    } else {
      greenCount++;
    }
  });

  const statTotal = document.getElementById('stat-total-products');
  const statRed = document.getElementById('stat-red');
  const statOrange = document.getElementById('stat-orange');
  const statGreen = document.getElementById('stat-green');

  if (statTotal) statTotal.textContent = totalCount;
  if (statRed) statRed.textContent = redCount;
  if (statOrange) statOrange.textContent = orangeCount;
  if (statGreen) statGreen.textContent = greenCount;

  // Style active/inactive filter buttons
  const btnAll = document.getElementById('filter-all');
  const btnRed = document.getElementById('filter-red');
  const btnOrange = document.getElementById('filter-orange');
  const btnGreen = document.getElementById('filter-green');

  if (btnAll) {
    if (currentFilter === 'all') {
      btnAll.className = "px-3 py-2 rounded-xl text-xs font-bold transition bg-brand-700 text-white shadow-md";
    } else {
      btnAll.className = "px-3 py-2 rounded-xl text-xs font-bold transition bg-brand-950 text-brand-300 border border-brand-800/40 hover:bg-brand-800 hover:text-white";
    }
  }
  if (btnRed) {
    if (currentFilter === 'red') {
      btnRed.className = "px-3 py-2 rounded-xl text-xs font-bold transition bg-red-600 text-white border border-red-600 shadow-md shadow-red-600/30";
    } else {
      btnRed.className = "px-3 py-2 rounded-xl text-xs font-bold transition bg-red-950/40 text-red-400 border border-red-500/40 hover:bg-red-600 hover:text-white";
    }
  }
  if (btnOrange) {
    if (currentFilter === 'orange') {
      btnOrange.className = "px-3 py-2 rounded-xl text-xs font-bold transition bg-orange-500 text-white border border-orange-500 shadow-md shadow-orange-500/30";
    } else {
      btnOrange.className = "px-3 py-2 rounded-xl text-xs font-bold transition bg-orange-950/40 text-orange-400 border border-orange-500/40 hover:bg-orange-500 hover:text-white";
    }
  }
  if (btnGreen) {
    if (currentFilter === 'green') {
      btnGreen.className = "px-3 py-2 rounded-xl text-xs font-bold transition bg-green-600 text-white border border-green-600 shadow-md shadow-green-600/30";
    } else {
      btnGreen.className = "px-3 py-2 rounded-xl text-xs font-bold transition bg-green-950/40 text-green-400 border border-green-500/40 hover:bg-green-600 hover:text-white";
    }
  }

  products.sort((a, b) => {
    if (a.daysRemaining === null && b.daysRemaining === null) return 0;
    if (a.daysRemaining === null) return 1;
    if (b.daysRemaining === null) return -1;
    return a.daysRemaining - b.daysRemaining;
  });

  // Filter products based on search query and current filter
  const filteredProducts = products.filter(p => {
    const matchesSearch = !searchQuery || 
      (p.description && p.description.toLowerCase().includes(searchQuery)) ||
      (p.code && p.code.toLowerCase().includes(searchQuery)) ||
      (p.barras && p.barras.toLowerCase().includes(searchQuery));
      
    if (!matchesSearch) return false;

    if (currentFilter === 'all') return true;
    if (currentFilter === 'red') {
      return p.daysRemaining !== null && p.daysRemaining <= 20;
    } else if (currentFilter === 'orange' || currentFilter === 'yellow') {
      return p.daysRemaining !== null && p.daysRemaining > 20 && p.daysRemaining <= 40;
    } else if (currentFilter === 'green') {
      return p.daysRemaining === null || p.daysRemaining > 40;
    }
    return true;
  });

  filteredProducts.forEach(p => {
    let rowBorder = 'border-l-4 border-l-green-500 bg-green-950/5';
    let urgentSignal = '';

    if (p.daysRemaining !== null) {
      if (p.daysRemaining <= 20) {
        rowBorder = 'border-l-4 border-l-red-500 bg-red-950/30';
        urgentSignal = `<span class="ml-2 px-2 py-0.5 rounded-full text-[9px] font-black bg-red-600 text-white animate-pulse">Crítico</span>`;
      } else if (p.daysRemaining <= 40) {
        rowBorder = 'border-l-4 border-l-orange-500 bg-orange-950/20';
        urgentSignal = `<span class="ml-2 px-2 py-0.5 rounded-full text-[9px] font-black bg-orange-500 text-white">Alerta</span>`;
      } else {
        urgentSignal = `<span class="ml-2 px-2 py-0.5 rounded-full text-[9px] font-black bg-green-600 text-white">No Prazo</span>`;
      }
    } else {
      urgentSignal = `<span class="ml-2 px-2 py-0.5 rounded-full text-[9px] font-black bg-green-600/40 text-white/80">Sem Validade</span>`;
    }

    // Buscar o COD_PROD de 7 dígitos vindo dos XMLs das NF-e
    let rawCode = p.code || '';
    if (p.barras && localStorage.getItem(`nfe_cprod_${p.barras}`)) {
      rawCode = localStorage.getItem(`nfe_cprod_${p.barras}`);
    } else if (p.description && localStorage.getItem(`nfe_cprod_desc_${p.description.trim().toUpperCase()}`)) {
      rawCode = localStorage.getItem(`nfe_cprod_desc_${p.description.trim().toUpperCase()}`);
    }

    let cod7 = rawCode.toString().replace(/\D/g, '');
    if (cod7.length > 0 && cod7.length < 7) {
      cod7 = cod7.padStart(7, '0');
    } else if (cod7.length > 7) {
      cod7 = cod7.slice(-7);
    } else if (!cod7) {
      cod7 = (p.code || '0000000').toString().padStart(7, '0').slice(-7);
    }

    const tr = document.createElement('tr');
    tr.className = `hover:bg-brand-900/30 transition-all border-b border-brand-900/20 ${rowBorder}`;
    tr.innerHTML = `
      <td class="py-3 px-4">
        <div class="font-mono text-xs text-brand-300 font-extrabold tracking-wider">${cod7}</div>
      </td>
      <td class="py-3 px-4 text-brand-100 font-medium text-xs">${p.description}</td>
      <td class="py-3 px-4 text-center font-mono text-xs text-brand-300">${p.dataEntrada || '-'}</td>
      <td class="py-3 px-4 text-center font-bold text-xs text-brand-200">${p.qtdEntradaUnidades ? `${p.qtdEntradaUnidades} UN` : '-'}</td>
      <td class="py-3 px-4 text-center">
        <input type="date" value="${dateToInputVal(p.validade)}" class="validade-input bg-brand-950 border border-brand-900 rounded px-2 py-1 text-white text-xs" />
      </td>
      <td class="py-3 px-4 text-center text-xs font-bold">${p.daysRemaining !== null ? `${p.daysRemaining} dias` : 'N/A'} ${urgentSignal}</td>
      <td class="py-3 px-4 text-center">
        <input type="number" value="${p.countedQty}" data-code="${p.code}" placeholder="0" class="qty-input w-20 text-center bg-brand-950 border border-brand-900 rounded py-1 text-white font-bold text-sm focus:border-brand-400 focus:ring-2 focus:ring-brand-400/50 transition-all" />
      </td>
    `;

    const qtyInput = tr.querySelector('.qty-input');
    qtyInput.addEventListener('input', (e) => {
      p.countedQty = e.target.value;
      dbBridge.saveInventoryItem(currentStore, p);
      triggerInventoryStartedNotification();
    });

    const validadeInput = tr.querySelector('.validade-input');
    validadeInput.addEventListener('change', (e) => {
      const d = e.target.value ? new Date(e.target.value + 'T12:00:00') : null;
      p.validade = d;
      if (d) {
        const diffTime = d.getTime() - dToday.getTime();
        p.daysRemaining = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      } else {
        p.daysRemaining = null;
      }
      dbBridge.saveInventoryItem(currentStore, p);
      triggerInventoryStartedNotification();
      renderTable();
    });

    tbody.appendChild(tr);
  });
}

function exportExcel() {
  if (products.length === 0) {
    showToast("Nenhum produto cadastrado para exportação de inventário.", "warning");
    return;
  }

  // Padrão solicitado: 1 coluna "COD_PROD" (código de 7 dígitos) e 1 coluna "QTDE_INV" (quantidade inventariada)
  const header = ['COD_PROD', 'QTDE_INV'];
  const rows = [header];

  products.forEach(p => {
    // Buscar código de 7 dígitos extraído da NF-e (XML) por EAN/Barras ou Descrição do produto
    let rawCode = p.code || '';
    if (p.barras && localStorage.getItem(`nfe_cprod_${p.barras}`)) {
      rawCode = localStorage.getItem(`nfe_cprod_${p.barras}`);
    } else if (p.description && localStorage.getItem(`nfe_cprod_desc_${p.description.trim().toUpperCase()}`)) {
      rawCode = localStorage.getItem(`nfe_cprod_desc_${p.description.trim().toUpperCase()}`);
    }

    // Formatar código garantindo exatamente 7 dígitos numéricos
    let cod7 = rawCode.toString().replace(/\D/g, '');
    if (cod7.length > 0 && cod7.length < 7) {
      cod7 = cod7.padStart(7, '0');
    } else if (cod7.length > 7) {
      cod7 = cod7.slice(-7);
    } else if (!cod7) {
      cod7 = (p.code || '0000000').toString().padStart(7, '0').slice(-7);
    }

    const qtdeInv = p.countedQty === '' ? 0 : Number(p.countedQty);
    rows.push([cod7, qtdeInv]);
  });

  const worksheet = XLSX.utils.aoa_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "INVENTARIO");

  // Nome do arquivo conforme o padrão de 1 por loja (.xls / .xlsx)
  const filename = `INVENTARIO_LOJA_${currentStore}.xls`;
  XLSX.writeFile(workbook, filename);

  // Marcar conclusão do inventário da loja atual no localStorage
  const ano = new Date().getFullYear();
  const mes = new Date().getMonth();
  const storeKey = `inv_completed_${ano}_${mes}_${currentStore}`;
  localStorage.setItem(storeKey, JSON.stringify({
    concluidoEm: new Date().toISOString(),
    operador: currentUser.nome,
    loja: currentStore,
    totalItens: products.length
  }));

  const lojasRequeridas = ['9175', '4304', '9201'];
  const lojasConcluidas = lojasRequeridas.filter(lj => {
    return localStorage.getItem(`inv_completed_${ano}_${mes}_${lj}`) !== null;
  });

  showToast(`Inventário da Loja ${currentStore} concluído e exportado com sucesso!`, 'success');

  // Notificar conclusão da loja individual
  fetch('/api/notificar-gestao', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      destinatarios: ['Bruno', 'Isabella', 'Alexandra', 'LiderOP'],
      assunto: `🎉 Inventário Finalizado - Loja ${getLojaNomePorCodigo(currentStore)}`,
      mensagem: `O Inventário de Estoque da Loja ${getLojaNomePorCodigo(currentStore)} foi concluído e exportado por ${currentUser.nome}. Total de itens inventariados: ${products.length}.`,
      operador: currentUser.nome
    })
  }).catch(err => console.error('Erro na notificação de conclusão individual:', err));

  // Se TODAS as lojas concluírem o Inventário Mensal, notificar Bruno, Isabella e Alexandra
  if (lojasConcluidas.length === lojasRequeridas.length) {
    const notifTodasConcluidasKey = `inv_notif_todas_lojas_${ano}_${mes}`;
    if (!localStorage.getItem(notifTodasConcluidasKey)) {
      localStorage.setItem(notifTodasConcluidasKey, "true");

      const mesNome = new Date().toLocaleString('pt-BR', { month: 'long' });
      fetch('/api/notificar-gestao', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          destinatarios: ['Bruno', 'Isabella', 'Alexandra', 'LiderOP'],
          assunto: `🎉 INVENTÁRIO MENSAL CONCLUÍDO - TODAS AS LOJAS (${mesNome.toUpperCase()}/${ano})`,
          mensagem: `Todas as 3 lojas (Marambaia - 9175, Icoaraci - 4304 e Mário Covas - 9201) concluíram o Inventário Mensal Obrigatório! Os arquivos de exportação no padrão COD_PROD / QTDE_INV foram gerados com sucesso.`,
          operador: currentUser.nome
        })
      }).catch(err => console.error('Erro na notificação de conclusão total:', err));

      showModal(
        `🎉 PARABÉNS!\n\nTodas as lojas (Marambaia, Icoaraci e Mário Covas) concluíram o Inventário Mensal Obrigatório!\n\nNotificação enviada com sucesso para Bruno, Isabella, Alexandra e LiderOP.`,
        {
          icon: "🚀",
          title: "Inventário Mensal Finalizado",
          btnText: "Excelente",
          btnClass: "bg-emerald-600 hover:bg-emerald-500 text-white font-bold"
        }
      );
    }
  }
}

/* ==========================================================================
   MÓDULO DE GESTÃO DE BOLETOS
   ========================================================================== */

let boletos = [];
let boletosSelecionados = new Set();


function inicializarBoletosTab() {
  const fileInput = document.getElementById("boleto-pdf-file");
  if (fileInput) {
    fileInput.addEventListener("change", function(e) {
      const file = e.target.files[0];
      if (file) {
        parseBoletoPdf(file);
        fileInput.value = "";
      }
    });
  }

  const storeFilter = document.getElementById("boleto-store-filter");
  if (storeFilter) {
    storeFilter.addEventListener("change", () => renderBoletos());
  }

  const btnAll = document.getElementById("boleto-filter-all");
  const btnAberto = document.getElementById("boleto-filter-aberto");
  const btnPago = document.getElementById("boleto-filter-pago");

  let statusFilter = "all";

  if (btnAll) {
    btnAll.addEventListener("click", () => {
      statusFilter = "all";
      btnAll.className = "px-3 py-2 rounded-xl text-xs font-bold transition bg-brand-700 text-white shadow-md";
      if (btnAberto) btnAberto.className = "px-3 py-2 rounded-xl text-xs font-bold transition bg-brand-950 text-red-400 border border-red-900/40";
      if (btnPago) btnPago.className = "px-3 py-2 rounded-xl text-xs font-bold transition bg-brand-950 text-emerald-400 border border-emerald-900/40";
      renderBoletos(statusFilter);
    });
  }

  if (btnAberto) {
    btnAberto.addEventListener("click", () => {
      statusFilter = "Aberto";
      if (btnAll) btnAll.className = "px-3 py-2 rounded-xl text-xs font-bold transition bg-brand-950 text-white border border-brand-800/40";
      btnAberto.className = "px-3 py-2 rounded-xl text-xs font-bold transition bg-brand-700 text-white shadow-md";
      if (btnPago) btnPago.className = "px-3 py-2 rounded-xl text-xs font-bold transition bg-brand-950 text-emerald-400 border border-emerald-900/40";
      renderBoletos(statusFilter);
    });
  }

  if (btnPago) {
    btnPago.addEventListener("click", () => {
      statusFilter = "Pago";
      if (btnAll) btnAll.className = "px-3 py-2 rounded-xl text-xs font-bold transition bg-brand-950 text-white border border-brand-800/40";
      if (btnAberto) btnAberto.className = "px-3 py-2 rounded-xl text-xs font-bold transition bg-brand-950 text-red-400 border border-red-900/40";
      btnPago.className = "px-3 py-2 rounded-xl text-xs font-bold transition bg-brand-700 text-white shadow-md";
      renderBoletos(statusFilter);
    });
  }

  const btnBatchPagar = document.getElementById("btn-boleto-batch-pagar");
  if (btnBatchPagar) btnBatchPagar.addEventListener("click", () => window.marcarBoletosComoPagoEmLote());

  const btnBatchApagar = document.getElementById("btn-boleto-batch-apagar");
  if (btnBatchApagar) btnBatchApagar.addEventListener("click", () => window.excluirBoletosEmLote());

  const auditoriaStoreFilter = document.getElementById("auditoria-store-filter");
  if (auditoriaStoreFilter) {
    auditoriaStoreFilter.addEventListener("change", () => carregarAuditoriaBoletos());
  }

  const btnAtualizarAuditoria = document.getElementById("btn-atualizar-auditoria");
  if (btnAtualizarAuditoria) {
    btnAtualizarAuditoria.addEventListener("click", () => {
      carregarAuditoriaBoletos();
      showToast("Auditoria de Boletos atualizada!", "sucesso");
    });
  }

  renderBoletos();
}

async function parseBoletoPdf(file) {
  if (!currentUser || (currentUser.role !== 'owner' && currentUser.role !== 'consultora_dashboard')) {
    showToast("Apenas o Líder de Operações ou Owner podem fazer importação de Boletos.", "erro");
    return;
  }
  const fileInfo = document.getElementById("boleto-file-info");
  const progressBar = document.getElementById("boleto-progress-bar");
  const progressLabel = document.getElementById("boleto-progress-label");
  if (fileInfo) {
    fileInfo.classList.remove("hidden");
    if (progressLabel) progressLabel.textContent = `Processando: ${file.name}... 0%`;
    if (progressBar) progressBar.style.width = "0%";
  }

  const reader = new FileReader();
  reader.onload = async function(e) {
    try {
      const arrayBuffer = e.target.result;
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      const allItems = [];
      let fullText = "";
      
      for (let i = 1; i <= pdf.numPages; i++) {
        const percent = Math.round((i / pdf.numPages) * 100);
        if (progressBar) progressBar.style.width = `${percent}%`;
        if (progressLabel) progressLabel.textContent = `Lendo páginas... ${percent}% (${i}/${pdf.numPages})`;

        const page = await pdf.getPage(i);
        const text = await page.getTextContent();
        
        const pageItems = text.items
          .map(item => ({
            str: item.str,
            x: Math.round(item.transform[4] * 10) / 10,
            y: Math.round(item.transform[5] * 10) / 10,
            w: Math.round(item.width * 10) / 10,
            h: Math.round(item.height * 10) / 10,
            page: i
          }))
          .filter(item => item.str.trim() !== '');
          
        allItems.push(...pageItems);
        fullText += text.items.map(item => item.str).join(" ") + "\n";
      }

      const boletosExtraidos = extrairBoletosDoTexto(allItems, fullText);

      const semLojaDetectada = boletosExtraidos.filter(b => !b.lojaAutoDetectada).length;
      if (semLojaDetectada > 0) {
        showToast(`${semLojaDetectada} boleto(s) sem loja identificada no PDF — alocado(s) à Loja Ativa. Confira antes de conferir.`, 'erro');
      }

      if (boletosExtraidos.length > 0) {
        try {
          const res = await fetch("/api/boletos/import", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ boletos: boletosExtraidos })
          });
          if (res.ok) {
            const data = await res.json();
            const novosCount = data.insertedCount;
            const duplicadosCount = data.ignoredCount;

            await carregarBoletosServidor();

            if (novosCount > 0 && duplicadosCount > 0) {
              showToast(`${novosCount} boletos importados. ${duplicadosCount} duplicado(s) ignorado(s).`, "info");
              if (fileInfo) {
                fileInfo.textContent = `Importados: ${novosCount}. Duplicados ignorados: ${duplicadosCount}.`;
              }
            } else if (novosCount === 0 && duplicadosCount > 0) {
              showToast(`Nenhum boleto importado. Todos os ${duplicadosCount} boletos já foram importados anteriormente.`, "erro");
              if (fileInfo) {
                fileInfo.textContent = `Aviso: Todos os ${duplicadosCount} boletos já constavam no sistema.`;
              }
            } else {
              showToast(`${novosCount} boletos carregados!`, "sucesso");
              if (fileInfo) {
                fileInfo.textContent = `Sucesso: ${novosCount} boletos carregados.`;
              }
            }
          } else {
            showToast("Erro ao importar boletos no servidor.", "erro");
            if (fileInfo) fileInfo.textContent = "Erro na resposta do servidor.";
          }
        } catch (e) {
          console.error("Erro ao enviar boletos:", e);
          showToast("Erro de rede ao salvar boletos.", "erro");
          if (fileInfo) fileInfo.textContent = "Erro de conexão.";
        }
      } else {
        showToast("Não foi possível identificar boletos no formato do arquivo.", "erro");
        if (fileInfo) {
          fileInfo.textContent = "Erro: Formato de boleto não reconhecido.";
        }
      }
    } catch (err) {
      console.error("Erro PDF:", err);
      showToast("Erro ao decodificar arquivo PDF.", "erro");
      if (fileInfo) {
        fileInfo.textContent = "Erro no processamento.";
      }
    }
  };
  reader.readAsArrayBuffer(file);
}

function parseMoedaPdf(str) {
  if (!str) return 0;
  let clean = str.replace(/[^\d.,]/g, '');
  const lastDot = clean.lastIndexOf('.');
  const lastComma = clean.lastIndexOf(',');
  if (lastDot > lastComma) {
    clean = clean.replace(/,/g, '');
    return parseFloat(clean) || 0;
  } else if (lastComma > lastDot) {
    clean = clean.replace(/\./g, '').replace(',', '.');
    return parseFloat(clean) || 0;
  } else {
    return parseFloat(clean) || 0;
  }
}

// Varre um trecho de texto do relatório de boletos em busca de uma referência
// de loja: código 9175/4304/9201, nome da filial, fragmento de CNPJ (mesmos
// fragmentos usados em detectStoreFromRazaoSocial para a NF-e), ou o rótulo
// interno do portal "Consulta de Títulos" (filtro "Lojas"), retornando o
// código da loja encontrado ou null se não houver nenhuma referência.
function detectStoreFromBoletoLine(texto) {
  const upper = texto.toUpperCase();
  if (upper.includes('9201') || upper.includes('MARIO COVAS') || upper.includes('MÁRIO COVAS') || upper.includes('0001008688') || upper.includes('PA ANANIDEUA SUPER MIX MATEUS COQ')) return '9201';
  if (upper.includes('4304') || upper.includes('ICOARACI') || upper.includes('0001008056') || upper.includes('PA BELEM CRUZEIRO') || upper.includes('PA BELÉM CRUZEIRO')) return '4304';
  if (upper.includes('9175') || upper.includes('MARAMBAIA') || upper.includes('0001006495')) return '9175';
  return null;
}

// Extrai os boletos do texto do relatório de "Consulta de Títulos" (portal
// Cacau Digital). O relatório é uma página web impressa em PDF: o texto de
// uma mesma linha da tabela às vezes quebra em várias linhas internas (o
// valor "R$" fica separado do número, por exemplo) — por isso NÃO dá pra
// confiar em "uma linha de texto = um boleto". Em vez disso, cortamos o
// texto inteiro em blocos usando o "Número Doc." (10 dígitos + "-" + 3
// dígitos de sequência) como âncora, já que ele aparece de forma confiável
// no início de cada linha da tabela, e extraímos os campos de dentro de
// cada bloco (que pode ter quebras de linha no meio).
function extrairBoletosDoTexto(items, fullText) {
  const boletosExtraidos = [];
  const lojaDoRelatorio = detectStoreFromBoletoLine(fullText);

  // Group items by page
  const pages = [...new Set(items.map(item => item.page))];
  
  pages.forEach(pageNum => {
    const pageItems = items.filter(item => item.page === pageNum);

    // 1. Find all prefix items (document number prefixes: 9-10 digits, optionally ending with a hyphen, located at x between 38 and 46)
    const prefixItems = pageItems.filter(item => item.x >= 38 && item.x <= 46 && /^\d{9,10}-?$/.test(item.str));
    
    // Sort prefix items by Y descending
    prefixItems.sort((a, b) => b.y - a.y);

    // 2. Define rows based on prefix Y coordinates directly
    const rows = prefixItems.map((prefix, idx) => {
      // Top boundary: 20 units above prefix Y to cover any high elements in the row
      const topBoundary = prefix.y + 20.0;
      // Bottom boundary is exactly the next prefix's Y coordinate (or 0 for the last row)
      const bottomBoundary = (idx + 1 < prefixItems.length) ? prefixItems[idx + 1].y : 0.0;
      
      return {
        prefix,
        topBoundary,
        bottomBoundary,
        items: []
      };
    });

    // 3. Assign items to rows
    pageItems.forEach(item => {
      const row = rows.find(r => item.y > r.bottomBoundary && item.y <= r.topBoundary);
      if (row) {
        row.items.push(item);
      }
    });

    // 4. Process each row
    rows.forEach(row => {
      // Sort items horizontally
      row.items.sort((a, b) => a.x - b.x);

      const prefixItem = row.prefix;

      // Find suffix
      const suffixItem = row.items.find(item => item.x > prefixItem.x && item.x < 70 && (/^\d{3}$/.test(item.str) || /^[A-Z]{2,3}$/.test(item.str)));
      
      let documento = prefixItem.str;
      if (suffixItem) {
        const cleanPrefix = prefixItem.str.endsWith('-') ? prefixItem.str.slice(0, -1) : prefixItem.str;
        documento = `${cleanPrefix}-${suffixItem.str}`;
      }

      // Only process debits
      const isDebito = row.items.some(item => /d[eé]bito/i.test(item.str));
      if (!isDebito) return;

      // Find date
      const dateItem = row.items.find(item => /^\b\d{2}\/\d{2}\/\d{2,4}\b$/.test(item.str));
      if (!dateItem) return;
      
      let vencimento = dateItem.str;
      const dateParts = vencimento.split('/');
      if (dateParts[2].length === 2) {
        vencimento = `${dateParts[0]}/${dateParts[1]}/20${dateParts[2]}`;
      }

      // Find valor
      const valorItems = row.items.filter(item => item.x >= 480 && item.x <= 515);
      let valorStr = "";
      valorItems.forEach(vi => {
        valorStr += " " + vi.str;
      });
      valorStr = valorStr.trim();

      const valor = parseMoedaPdf(valorStr);
      if (!valor) return;

      // Find Doc. Faturamento
      const docFatPrefixItem = row.items.find(item => item.x >= 370 && item.x <= 395 && /^\d{6,9}-$/.test(item.str));
      let docFaturamento = null;
      if (docFatPrefixItem) {
        const docFatSuffixItem = row.items.find(item => item.x > docFatPrefixItem.x && item.x < 420 && /^\d{3}$/.test(item.str));
        if (docFatSuffixItem) {
          docFaturamento = `${docFatPrefixItem.str}${docFatSuffixItem.str}`;
        }
      }

      const parcelaItem = row.items.find(item => item.x >= 300 && item.x <= 330 && /^\d+\/\d+$/.test(item.str));
      const parcela = parcelaItem ? parcelaItem.str : "1/1";

      const rowText = row.items.map(item => item.str).join(" ");
      const lojaNoBloco = detectStoreFromBoletoLine(rowText);
      const loja = lojaNoBloco || lojaDoRelatorio || currentStore || "9175";
      const lojaAutoDetectada = !!(lojaNoBloco || lojaDoRelatorio);

      const descItems = row.items.filter(item => item.x >= 185 && item.x < 300);
      let descricao = descItems.map(item => item.str).join(" ").trim();
      if (!descricao) descricao = "Duplicata Cacau Show";

      boletosExtraidos.push({
        id: uid(),
        documento,
        docFaturamento,
        parcela,
        loja,
        lojaAutoDetectada,
        descricao,
        vencimento,
        valor,
        status: "Aberto"
      });
    });
  });

  return boletosExtraidos;
}

function renderBoletos(statusFilter = "all") {
  const storeFilter = document.getElementById("boleto-store-filter")?.value || "all";
  const tbody = document.getElementById("boletos-tbody");
  if (!tbody) return;

  tbody.innerHTML = "";

  let filtered = boletos.filter(b => {
    const matchStore = (storeFilter === "all" || b.loja === storeFilter);
    const matchStatus = (statusFilter === "all" || b.status === statusFilter);
    return matchStore && matchStatus;
  });

  // Ordenar por data de vencimento (do mais antigo para o mais novo)
  filtered.sort((a, b) => {
    const parseData = (dateStr) => {
      if (!dateStr) return new Date(0);
      const parts = dateStr.split('/');
      if (parts.length === 3) {
        return new Date(parseInt(parts[2], 10), parseInt(parts[1], 10) - 1, parseInt(parts[0], 10));
      }
      return new Date(dateStr);
    };
    return parseData(a.vencimento) - parseData(b.vencimento);
  });

  let totalAberto = 0;
  let totalAbertoAteHoje = 0;
  let totalPago = 0;
  let vencendoHoje = 0;
  
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const hojeStr = hoje.toLocaleDateString("pt-BR");

  const parseDataLocal = (dateStr) => {
    if (!dateStr) return new Date(0);
    const parts = dateStr.split('/');
    if (parts.length === 3) {
      return new Date(parseInt(parts[2], 10), parseInt(parts[1], 10) - 1, parseInt(parts[0], 10));
    }
    return new Date(dateStr);
  };

  boletos.forEach(b => {
    const matchStore = (storeFilter === "all" || b.loja === storeFilter);
    if (matchStore) {
      if (b.status === "Aberto") {
        totalAberto += b.valor;
        
        const dataVenc = parseDataLocal(b.vencimento);
        dataVenc.setHours(0, 0, 0, 0);
        if (dataVenc <= hoje) {
          totalAbertoAteHoje += b.valor;
        }
        
        if (b.vencimento === hojeStr) {
          vencendoHoje++;
        }
      } else if (b.status === "Pago") {
        totalPago += b.valor;
      }
    }
  });

  const statAberto = document.getElementById("stat-boletos-aberto-total");
  const statAbertoHoje = document.getElementById("stat-boletos-aberto-hoje");
  const statCount = document.getElementById("stat-boletos-count");
  const statVencendo = document.getElementById("stat-boletos-vencendo-hoje");
  const statPagos = document.getElementById("stat-boletos-pagos");

  if (statAberto) statAberto.textContent = formatBRL(totalAberto);
  if (statAbertoHoje) statAbertoHoje.textContent = formatBRL(totalAbertoAteHoje);
  if (statCount) statCount.textContent = filtered.length;
  if (statVencendo) statVencendo.textContent = vencendoHoje;
  if (statPagos) statPagos.textContent = formatBRL(totalPago);

  // Limpar seleção de boletos que não estão mais na lista filtrada
  const idsFiltrados = new Set(filtered.map(b => b.id));
  boletosSelecionados = new Set([...boletosSelecionados].filter(id => idsFiltrados.has(id)));

  if (filtered.length === 0) {
    tbody.innerHTML = `
      <tr class="text-brand-400 text-center">
        <td colspan="8" class="py-8">Nenhum boleto encontrado para os filtros selecionados.</td>
      </tr>
    `;
    atualizarBatchBarBoletos(filtered);
    return;
  }

  filtered.forEach(b => {
    const tr = document.createElement("tr");
    let statusClass = "status-aberto";
    if (b.status === "Pago") statusClass = "status-retirado";

    const storeLabel = b.loja === "9175" ? "Marambaia (9175)" : (b.loja === "4304" ? "Icoaraci (4304)" : "Mário Covas (9201)");

    let actionButtons = "";
    const isOwner = currentUser && (currentUser.nome === "Bruno" || currentUser.nome === "Isabella");

    if (b.status === "Aberto") {
      actionButtons += `<button class="btn-retirar" onclick="marcarBoletoComoPago('${b.id}')"><i class="fa-solid fa-check"></i> Pagar</button> `;
    }

    if (isOwner) {
      actionButtons += `<button class="btn-excluir" onclick="excluirBoleto('${b.id}')"><i class="fa-solid fa-trash"></i></button>`;
    }

    const isSelected = boletosSelecionados.has(b.id);
    if (isSelected) tr.classList.add("selected-row");

    tr.innerHTML = `
      <td class="py-3 px-4 text-center"><input type="checkbox" class="boleto-row-check" data-id="${b.id}" ${isSelected ? "checked" : ""}></td>
      <td class="py-3 px-4 font-mono font-bold">${b.documento}</td>
      <td class="py-3 px-4">${storeLabel}</td>
      <td class="py-3 px-4">${b.descricao}</td>
      <td class="py-3 px-4 text-center font-mono font-semibold">${b.vencimento}</td>
      <td class="py-3 px-4 text-right font-mono font-bold">${formatBRL(b.valor)}</td>
      <td class="py-3 px-4 text-center"><span class="status-pill ${statusClass}">${b.status}</span></td>
      <td class="py-3 px-4 text-center">${actionButtons || "—"}</td>
    `;
    tbody.appendChild(tr);
  });

  atualizarBatchBarBoletos(filtered);

  const selectAll = document.getElementById("boleto-select-all");
  if (selectAll) {
    selectAll.onclick = () => {
      if (selectAll.checked) {
        filtered.forEach(b => boletosSelecionados.add(b.id));
      } else {
        boletosSelecionados.clear();
      }
      renderBoletos(statusFilter);
    };
  }

  tbody.querySelectorAll(".boleto-row-check").forEach(chk => {
    chk.addEventListener("change", (e) => {
      e.stopPropagation();
      const id = chk.dataset.id;
      if (chk.checked) {
        boletosSelecionados.add(id);
      } else {
        boletosSelecionados.delete(id);
      }
      renderBoletos(statusFilter);
    });
  });
}

function atualizarBatchBarBoletos(filtrados) {
  const bar = document.getElementById("boleto-batch-actions");
  const countInfo = document.getElementById("boleto-batch-count-info");
  const selectAllCheckbox = document.getElementById("boleto-select-all");
  if (!bar) return;

  if (boletosSelecionados.size > 0) {
    bar.classList.remove("hidden");
    const selecionadosList = boletos.filter(b => boletosSelecionados.has(b.id));
    const totalValor = selecionadosList.reduce((s, b) => s + (Number(b.valor) || 0), 0);
    countInfo.textContent = `${boletosSelecionados.size} boleto(s) selecionado(s) (${formatBRL(totalValor)})`;
  } else {
    bar.classList.add("hidden");
  }

  if (selectAllCheckbox) {
    selectAllCheckbox.checked = filtrados.length > 0 && filtrados.every(b => boletosSelecionados.has(b.id));
    selectAllCheckbox.indeterminate = boletosSelecionados.size > 0 && !selectAllCheckbox.checked;
  }
}

window.marcarBoletosComoPagoEmLote = async function() {
  const ids = Array.from(boletosSelecionados);
  const selecionados = boletos.filter(b => ids.includes(b.id));
  const abertos = selecionados.filter(b => b.status === "Aberto");

  if (abertos.length === 0) {
    showToast("Nenhum boleto em aberto selecionado — os demais já estão pagos.", "info");
    return;
  }

  const totalValor = abertos.reduce((s, b) => s + (Number(b.valor) || 0), 0);
  const confirmado = await showConfirm(`Confirmar pagamento de ${abertos.length} boleto(s) selecionado(s), totalizando ${formatBRL(totalValor)}?`, {
    confirmText: "Confirmar Pagamento"
  });
  if (!confirmado) return;

  try {
    await Promise.all(abertos.map(b => fetch("/api/boletos/pago", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: b.id })
    })));
    boletosSelecionados.clear();
    await carregarBoletosServidor();
    showToast(`${abertos.length} boleto(s) marcado(s) como pago!`, "sucesso");
  } catch (err) {
    console.error(err);
    showToast("Erro de rede ao pagar boletos em lote.", "erro");
  }
};

window.excluirBoletosEmLote = async function() {
  const ids = Array.from(boletosSelecionados);
  if (ids.length === 0) return;

  const confirmado = await showConfirm(`Deseja realmente excluir ${ids.length} boleto(s) selecionado(s)? Esta ação não pode ser desfeita.`, {
    confirmText: "Excluir Selecionados",
    confirmClass: "btn-danger"
  });
  if (!confirmado) return;

  try {
    const resultados = await Promise.all(ids.map(id => fetch(`/api/boletos/${id}`, { method: "DELETE" })));
    const falhas = resultados.filter(r => !r.ok).length;
    boletosSelecionados.clear();
    await carregarBoletosServidor();
    if (falhas > 0) {
      showToast(`${ids.length - falhas} excluído(s). ${falhas} com erro.`, "info");
    } else {
      showToast(`${ids.length} boleto(s) excluído(s) com sucesso.`, "sucesso");
    }
  } catch (err) {
    console.error(err);
    showToast("Erro de rede ao excluir boletos em lote.", "erro");
  }
};

window.marcarBoletoComoPago = async function(id) {
  try {
    const res = await fetch("/api/boletos/pago", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id })
    });
    if (res.ok) {
      await carregarBoletosServidor();
      showToast("Boleto marcado como pago!", "sucesso");
    } else {
      showToast("Erro ao marcar boleto como pago.", "erro");
    }
  } catch (err) {
    console.error(err);
    showToast("Erro de rede ao marcar boleto.", "erro");
  }
};

window.excluirBoleto = async function(id) {
  const boleto = boletos.find(b => b.id === id);
  const info = boleto ? `do fornecedor "${boleto.descricao}" no valor de R$ ${boleto.valor.toFixed(2).replace('.', ',')} (Doc: ${boleto.documento})` : "este boleto";
  const confirm = await showConfirm(`Deseja realmente excluir o boleto ${info}? Esta ação não pode ser desfeita.`);
  if (confirm) {
    try {
      const res = await fetch(`/api/boletos/${id}`, {
        method: "DELETE"
      });
      if (res.ok) {
        await carregarBoletosServidor();
        showToast("Boleto excluído com sucesso.", "sucesso");
      } else {
        showToast("Erro ao excluir boleto.", "erro");
      }
    } catch (err) {
      console.error(err);
      showToast("Erro de rede ao excluir boleto.", "erro");
    }
  }
};

window.carregarAuditoriaBoletos = function() {
  const storeFilter = document.getElementById("auditoria-store-filter")?.value || "all";
  const tbody = document.getElementById("auditoria-tbody");
  if (!tbody) return;

  tbody.innerHTML = "";

  // 1. Group boletos by base document number and store (e.g. "123456" + "_" + "9175")
  // Prioriza "docFaturamento" (o número que realmente corresponde à NF-e no
  // relatório de títulos, ex.: "003902732-001" → "3902732"); boletos antigos,
  // importados antes desse campo existir, caem no comportamento anterior
  // (usar o próprio "documento").
  const boletosAgrupados = {};
  boletos.forEach(b => {
    let baseDoc;
    if (b.docFaturamento) {
      baseDoc = b.docFaturamento.split("-")[0].trim().replace(/^0+/, "") || "0";
    } else {
      baseDoc = b.documento.split("-")[0].trim();
    }
    const groupKey = `${baseDoc}_${b.loja}`;
    
    if (!boletosAgrupados[groupKey]) {
      boletosAgrupados[groupKey] = {
        baseDoc: baseDoc,
        groupKey: groupKey,
        documentosOriginais: [],
        lojas: new Set(),
        valorTotal: 0,
        boletosRef: []
      };
    }
    boletosAgrupados[groupKey].documentosOriginais.push(b.documento);
    boletosAgrupados[groupKey].lojas.add(b.loja);
    boletosAgrupados[groupKey].valorTotal += b.valor;
    boletosAgrupados[groupKey].boletosRef.push(b);
  });

  // 2. Correlate with importedNfs
  const auditMap = {};

  // Add from boletos
  Object.keys(boletosAgrupados).forEach(groupKey => {
    const group = boletosAgrupados[groupKey];
    const storeOfGroup = Array.from(group.lojas)[0] || "9175";
    
    let matchesStoreFilter = false;
    if (storeFilter === "all") {
      matchesStoreFilter = true;
    } else {
      matchesStoreFilter = (storeOfGroup === storeFilter);
    }

    if (!matchesStoreFilter) return;

    auditMap[groupKey] = {
      baseDoc: group.baseDoc,
      groupKey: groupKey,
      boletosGroup: group,
      nfeRef: null,
      loja: storeOfGroup
    };
  });

  // Add from importedNfs
  Object.keys(importedNfs).forEach(key => {
    const nf = importedNfs[key];
    const targetStore = nf.info.targetStore || "9175";
    const nNF = nf.info.numero;
    const groupKey = `${nNF}_${targetStore}`;
    
    if (storeFilter !== "all" && targetStore !== storeFilter) {
      return;
    }

    if (!auditMap[groupKey]) {
      auditMap[groupKey] = {
        baseDoc: nNF,
        groupKey: groupKey,
        boletosGroup: null,
        nfeRef: nf,
        loja: targetStore
      };
    } else {
      auditMap[groupKey].nfeRef = nf;
    }
  });

  const auditList = [];
  let totalNfeAuditado = 0;
  let totalBoletoAuditado = 0;
  let divergenciasCount = 0;

  Object.keys(auditMap).forEach(key => {
    const item = auditMap[key];
    const nfe = item.nfeRef;
    const bg = item.boletosGroup;

    let valorNfe = 0;
    let valorBoletos = 0;
    let statusText = "OK";
    let statusClass = "bg-emerald-950 text-emerald-400 border border-emerald-900/50";
    let isDivergent = false;
    let descDivergencia = "";

    if (nfe) {
      valorNfe = nfe.info.valorTotal || 0;
      totalNfeAuditado += valorNfe;
    }

    if (bg) {
      valorBoletos = bg.valorTotal;
      totalBoletoAuditado += valorBoletos;
    }

    if (nfe && bg) {
      const nfeStore = nfe.info.targetStore || "9175";
      const boletoStores = Array.from(bg.lojas);
      const storeMismatch = !boletoStores.includes(nfeStore);
      const duplicatas = nfe.info.duplicatas || [];

      if (storeMismatch) {
        isDivergent = true;
        divergenciasCount++;
        statusText = "Loja Divergente";
        descDivergencia = `NF-e na loja ${nfeStore}, Títulos na loja ${boletoStores.join(', ')}`;
        statusClass = "bg-orange-950 text-orange-400 border border-orange-900/40";
        notificarDivergenciaAuditoria(item.loja, nfe.info.numero, valorNfe, bg.documentosOriginais.join(", "), valorBoletos, descDivergencia);
      } else if (duplicatas.length > 0) {
        // Cruzamento por parcela: cada duplicata da NF-e (Nº de Ordem / Vencimento /
        // Valor) é pareada com um boleto do grupo. Cobre parcelamento (2+ duplicatas
        // com vencimentos e valores diferentes para a mesma NF-e) comparando cada
        // parcela individualmente, em vez de só bater o total.
        const boletosDisponiveis = bg.boletosRef.slice();
        const problemas = [];

        duplicatas.forEach(dup => {
          // 1ª tentativa: casar pelo sufixo do documento (Nº de Ordem / nDup)
          let idx = boletosDisponiveis.findIndex(b => {
            const sufixo = (b.documento.split("-")[1] || "").replace(/^0+/, "");
            const nDupLimpo = (dup.nDup || "").replace(/^0+/, "");
            return sufixo && nDupLimpo && sufixo === nDupLimpo;
          });

          // 2ª tentativa: casar pelo boleto de valor mais próximo ainda disponível
          if (idx === -1 && boletosDisponiveis.length > 0) {
            idx = boletosDisponiveis.reduce((melhorIdx, b, i) => {
              const diffAtual = Math.abs(b.valor - dup.valor);
              const diffMelhor = melhorIdx === -1 ? Infinity : Math.abs(boletosDisponiveis[melhorIdx].valor - dup.valor);
              return diffAtual < diffMelhor ? i : melhorIdx;
            }, -1);
          }

          if (idx === -1) {
            problemas.push(`Parcela ${dup.nDup || '—'} (Venc. ${dup.vencimento || '—'}, ${formatBRL(dup.valor)}): sem boleto correspondente`);
            return;
          }

          const boletoPareado = boletosDisponiveis[idx];
          boletosDisponiveis.splice(idx, 1);

          const valorDivergente = Math.abs(boletoPareado.valor - dup.valor) > 0.05;
          const vencDivergente = !!dup.vencimento && boletoPareado.vencimento !== dup.vencimento;

          if (valorDivergente || vencDivergente) {
            const partes = [];
            if (vencDivergente) partes.push(`vencimento NF-e ${dup.vencimento} ≠ boleto ${boletoPareado.vencimento}`);
            if (valorDivergente) partes.push(`valor NF-e ${formatBRL(dup.valor)} ≠ boleto ${formatBRL(boletoPareado.valor)}`);
            problemas.push(`Doc. ${boletoPareado.documento}: ${partes.join(' e ')}`);
          }
        });

        if (problemas.length > 0) {
          isDivergent = true;
          divergenciasCount++;
          statusText = duplicatas.length > 1 ? "Divergência de Parcela" : "Divergência de Valor";
          descDivergencia = problemas.join(' | ');
          statusClass = "bg-red-950 text-red-400 border border-red-900/40";
          notificarDivergenciaAuditoria(item.loja, nfe.info.numero, valorNfe, bg.documentosOriginais.join(", "), valorBoletos, descDivergencia);
        } else {
          statusText = "Conciliado";
          statusClass = "bg-emerald-950 text-emerald-400 border border-emerald-900/50";
        }
      } else {
        // Sem detalhe de duplicatas na NF-e (XML antigo ou importado via Excel):
        // volta à comparação por total, como antes.
        const diff = Math.abs(valorNfe - valorBoletos);
        if (diff > 0.05) {
          isDivergent = true;
          divergenciasCount++;
          statusText = "Divergência de Valor";
          descDivergencia = `Diferença de ${formatBRL(diff)}`;
          statusClass = "bg-red-950 text-red-400 border border-red-900/40";
          notificarDivergenciaAuditoria(item.loja, nfe.info.numero, valorNfe, bg.documentosOriginais.join(", "), valorBoletos, descDivergencia);
        } else {
          statusText = "Conciliado";
          statusClass = "bg-emerald-950 text-emerald-400 border border-emerald-900/50";
        }
      }
    } else if (bg && !nfe) {
      isDivergent = true;
      divergenciasCount++;
      statusText = "Sem NF-e";
      descDivergencia = "Nenhuma NF-e importada correspondente a este título";
      statusClass = "bg-amber-950 text-amber-400 border border-amber-900/40";
      notificarDivergenciaAuditoria(item.loja, "Não Importada", 0, bg.documentosOriginais.join(", "), valorBoletos, descDivergencia);
    } else if (nfe && !bg) {
      isDivergent = true;
      divergenciasCount++;
      statusText = "Sem Boleto";
      descDivergencia = "Nenhum boleto registrado para esta NF-e";
      statusClass = "bg-blue-950 text-blue-400 border border-blue-900/40";
      notificarDivergenciaAuditoria(item.loja, nfe.info.numero, valorNfe, "Não Encontrado", 0, descDivergencia);
    }

    auditList.push({
      loja: item.loja,
      nfeNumber: nfe ? nfe.info.numero : "—",
      valorNfe: valorNfe,
      documentoBoleto: bg ? bg.documentosOriginais.join(", ") : "—",
      valorBoletos: valorBoletos,
      statusText: statusText,
      statusClass: statusClass,
      descDivergencia: descDivergencia,
      isDivergent: isDivergent
    });
  });

  const statNfe = document.getElementById("stat-audit-nfe-total");
  const statBoleto = document.getElementById("stat-audit-boleto-total");
  const statDivergente = document.getElementById("stat-audit-divergente");
  const statStatus = document.getElementById("stat-audit-status");
  const iconDivergente = document.getElementById("icon-audit-divergente");

  if (statNfe) statNfe.textContent = formatBRL(totalNfeAuditado);
  if (statBoleto) statBoleto.textContent = formatBRL(totalBoletoAuditado);
  if (statDivergente) {
    statDivergente.textContent = divergenciasCount;
    statDivergente.className = divergenciasCount > 0 ? "text-2xl font-black text-red-500" : "text-2xl font-black text-white";
  }
  if (iconDivergente) {
    iconDivergente.className = divergenciasCount > 0 ? "w-12 h-12 rounded-xl bg-brand-950 flex items-center justify-center text-red-500 font-black text-xl animate-pulse" : "w-12 h-12 rounded-xl bg-brand-950 flex items-center justify-center text-brand-400 font-black text-xl";
  }

  if (statStatus) {
    if (divergenciasCount === 0) {
      statStatus.textContent = "100% OK";
      statStatus.className = "text-2xl font-black text-emerald-400";
    } else {
      statStatus.textContent = "Atenção";
      statStatus.className = "text-2xl font-black text-amber-500";
    }
  }

  if (auditList.length === 0) {
    tbody.innerHTML = `
      <tr class="text-brand-400 text-center">
        <td colspan="6" class="py-8">Nenhum dado encontrado para os filtros selecionados.</td>
      </tr>
    `;
    return;
  }

  auditList.sort((a, b) => b.isDivergent - a.isDivergent);

  auditList.forEach(item => {
    const tr = document.createElement("tr");
    const storeLabel = item.loja === "9175" ? "Marambaia (9175)" : (item.loja === "4304" ? "Icoaraci (4304)" : "Mário Covas (9201)");
    
    tr.innerHTML = `
      <td class="py-3 px-4 font-bold">${storeLabel}</td>
      <td class="py-3 px-4 font-mono font-bold">${item.nfeNumber}</td>
      <td class="py-3 px-4 text-right font-mono font-bold">${item.valorNfe > 0 ? formatBRL(item.valorNfe) : "—"}</td>
      <td class="py-3 px-4 font-mono">${item.documentoBoleto}</td>
      <td class="py-3 px-4 text-right font-mono font-bold">${item.valorBoletos > 0 ? formatBRL(item.valorBoletos) : "—"}</td>
      <td class="py-3 px-4 text-center">
        <span class="px-2.5 py-1 rounded-full text-[10px] font-extrabold uppercase tracking-wider ${item.statusClass}">${item.statusText}</span>
        ${item.descDivergencia ? `<div class="text-[10px] text-muted font-medium mt-1">${item.descDivergencia}</div>` : ""}
      </td>
    `;
    tbody.appendChild(tr);
  });
};

function notificarDivergenciaAuditoria(loja, nfeNumber, valorNfe, documentoBoleto, valorBoletos, detalheDivergencia) {
  const storeLabel = loja === "9175" ? "Marambaia (9175)" : (loja === "4304" ? "Icoaraci (4304)" : "Mário Covas (9201)");
  const key = `audit_notif_v3_${loja}_${nfeNumber}_${documentoBoleto}_${detalheDivergencia.replace(/\s+/g, '')}`;
  if (localStorage.getItem(key)) return;

  const assunto = `⚠️ DIVERGÊNCIA DETECTADA: Auditoria de Boletos - Loja ${storeLabel}`;
  const mensagem = `Atenção Bruno e Isabella,\n\nFoi identificada uma divergência na auditoria de boletos vs NF-e da Loja ${storeLabel}:\n\n` +
    `• Loja: ${storeLabel}\n` +
    `• Nota Fiscal (NF-e): ${nfeNumber} (Valor NF: ${formatBRL(valorNfe)})\n` +
    `• Documento/Boleto: ${documentoBoleto} (Valor Títulos: ${formatBRL(valorBoletos)})\n` +
    `• Detalhes da Divergência: ${detalheDivergencia}\n\n` +
    `👉 Ação Recomendada: Por favor, abram um SAF imediatamente no portal Cacau Show para contestar esta divergência.`;

  fetch('/api/notificar-gestao', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      destinatarios: ['Bruno', 'Isabella', 'Alexandra', 'LiderOP'],
      assunto: assunto,
      mensagem: mensagem,
      operador: currentUser ? currentUser.nome : 'Sistema'
    })
  })
  .then(() => {
    localStorage.setItem(key, "true");
    console.log(`Notificação de divergência enviada para Bruno, Isabella, Alexandra e LiderOP.`);
  })
  .catch(err => console.error("Erro ao enviar notificação de auditoria:", err));
}

// ==========================================================================
// CONFIGURAÇÕES: LÓGICA DE UI E EVENTOS
// ==========================================================================
function inicializarPainelConfiguracoes() {
  if (!currentUser) return;

  renderNotificationTable();

  // Atualizar informações do sobre
  const configUserInfo = document.getElementById("config-user-info");
  if (configUserInfo) {
    configUserInfo.textContent = `${currentUser.nome} (${currentUser.role === 'owner' ? 'Administrador' : 'Consultor'})`;
  }
  
  // Status da conexão
  const connBadge = document.getElementById("config-connection-badge");
  if (connBadge) {
    connBadge.textContent = API_ONLINE ? "Conectado" : "Modo Offline";
    connBadge.className = `px-3 py-1 rounded-full text-[10px] font-bold ${
      API_ONLINE ? 'bg-emerald-950 border border-emerald-800 text-emerald-400' : 'bg-red-950 border border-red-800 text-red-400'
    }`;
  }

  // Preencher campos
  const configTimeoutSelect = document.getElementById("config-timeout-select");
  if (configTimeoutSelect) configTimeoutSelect.value = config.sessionTimeout !== undefined ? config.sessionTimeout : "1800";

  // Mostrar aba do WhatsApp se for owner/administrador
  const cardWa = document.getElementById("config-card-whatsapp");
  if (currentUser.role === "owner") {
    if (cardWa) cardWa.classList.remove("hidden");
    
    // Renderizar inputs Cacau Show
    const containerCacau = document.getElementById("config-wa-cacau-inputs");
    if (containerCacau) {
      containerCacau.innerHTML = "";
      Object.keys(WHATSAPP_GRUPOS).forEach(loja => {
        const field = document.createElement("div");
        field.className = "field";
        field.innerHTML = `
          <label class="block text-[10px] text-muted font-semibold mb-1">${loja}</label>
          <input type="text" class="w-full bg-paper border border-border rounded-lg p-2 text-ink text-xs focus:outline-none focus:border-gold config-wa-cacau-input" data-loja="${loja}" value="${WHATSAPP_GRUPOS[loja] || ''}" placeholder="Link do grupo...">
        `;
        containerCacau.appendChild(field);
      });
    }

    // Renderizar inputs Faça Amigos
    const containerFa = document.getElementById("config-wa-fa-inputs");
    if (containerFa) {
      containerFa.innerHTML = "";
      Object.keys(WHATSAPP_GRUPOS_FA).forEach(loja => {
        const field = document.createElement("div");
        field.className = "field";
        field.innerHTML = `
          <label class="block text-[10px] text-muted font-semibold mb-1">${loja}</label>
          <input type="text" class="w-full bg-paper border border-border rounded-lg p-2 text-ink text-xs focus:outline-none focus:border-gold config-wa-fa-input" data-loja="${loja}" value="${WHATSAPP_GRUPOS_FA[loja] || ''}" placeholder="Link do grupo...">
        `;
        containerFa.appendChild(field);
      });
    }
  } else {
    if (cardWa) cardWa.classList.add("hidden");
  }

  // Cor de destaque ativa
  aplicarCorDestaque(config.accentColor || "#56707f");
}

// Configurações: Ouvir eventos após o carregamento da página
document.addEventListener("DOMContentLoaded", () => {
  // Alteração de Cor de Destaque
  document.querySelectorAll(".config-accent-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const color = btn.dataset.accent;
      aplicarCorDestaque(color);
      config.accentColor = color;
      localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
      showToast("Cor de destaque atualizada!", "sucesso");
    });
  });

  // Alteração do Timeout
  const timeoutSelect = document.getElementById("config-timeout-select");
  if (timeoutSelect) {
    timeoutSelect.addEventListener("change", (e) => {
      const val = parseInt(e.target.value);
      config.sessionTimeout = val;
      localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
      
      if (val === 0) {
        sessionTimeoutMs = 0;
      } else {
        sessionTimeoutMs = val * 1000;
      }
      resetSessionTimer();
      showToast("Tempo limite de sessão atualizado!", "sucesso");
    });
  }

  // Atalhos de Segurança
  const btnChangePin = document.getElementById("config-btn-change-pin");
  if (btnChangePin) {
    btnChangePin.addEventListener("click", () => {
      const btnTrocarPin = document.getElementById("btn-trocar-pin");
      if (btnTrocarPin) btnTrocarPin.click();
    });
  }

  const btnLogout = document.getElementById("config-btn-logout");
  if (btnLogout) {
    btnLogout.addEventListener("click", () => {
      const btnTrocarUser = document.getElementById("btn-trocar-usuario");
      if (btnTrocarUser) btnTrocarUser.click();
    });
  }

  // Salvar links do WhatsApp (Owner)
  const btnSaveWa = document.getElementById("config-btn-save-whatsapp");
  if (btnSaveWa) {
    btnSaveWa.addEventListener("click", () => {
      const cacauInputs = document.querySelectorAll(".config-wa-cacau-input");
      const faInputs = document.querySelectorAll(".config-wa-fa-input");
      
      config.whatsappGrupos = config.whatsappGrupos || {};
      cacauInputs.forEach(input => {
        const loja = input.dataset.loja;
        config.whatsappGrupos[loja] = input.value.trim();
        WHATSAPP_GRUPOS[loja] = input.value.trim();
      });

      config.whatsappGruposFa = config.whatsappGruposFa || {};
      faInputs.forEach(input => {
        const loja = input.dataset.loja;
        config.whatsappGruposFa[loja] = input.value.trim();
        WHATSAPP_GRUPOS_FA[loja] = input.value.trim();
      });

      localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
      showToast("Links de WhatsApp salvos com sucesso!", "sucesso");
    });
  }

  // Exportar Backup JSON
  const btnExport = document.getElementById("config-btn-export");
  if (btnExport) {
    btnExport.addEventListener("click", () => {
      try {
        const backupData = {};
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          backupData[key] = localStorage.getItem(key);
        }
        
        const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `backup_hub_operacoes_${new Date().toISOString().slice(0,10)}.json`;
        a.click();
        URL.revokeObjectURL(url);
        showToast("Backup exportado com sucesso!", "sucesso");
      } catch (e) {
        showToast("Erro ao exportar backup.", "erro");
      }
    });
  }

  // Importar Backup
  const btnImportTrigger = document.getElementById("config-btn-import-trigger");
  const importFile = document.getElementById("config-import-file");
  if (btnImportTrigger && importFile) {
    btnImportTrigger.addEventListener("click", () => importFile.click());
    importFile.addEventListener("change", (e) => {
      const file = e.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = async (event) => {
        try {
          const imported = JSON.parse(event.target.result);
          
          const confirmar = await showConfirm(
            "Isso substituirá os dados atuais do navegador pelos dados do arquivo. Deseja prosseguir?",
            { title: "Confirmar Importação", icon: "⚠️", confirmBtnText: "Importar", confirmBtnClass: "btn-primary" }
          );
          
          if (!confirmar) return;

          Object.keys(imported).forEach(key => {
            localStorage.setItem(key, imported[key]);
          });
          
          showToast("Dados importados! Reiniciando aplicação...", "sucesso");
          setTimeout(() => window.location.reload(), 1500);
        } catch (e) {
          showToast("Arquivo de backup inválido.", "erro");
        }
      };
      reader.readAsText(file);
    });
  }

  // Limpar Tudo (Reset)
  const btnClear = document.getElementById("config-btn-clear");
  if (btnClear) {
    btnClear.addEventListener("click", async () => {
      const confirm1 = await showConfirm(
        "Tem certeza que deseja limpar TODOS os dados locais deste dispositivo? Isso removerá PINs locais e preferências.",
        { title: "Limpeza de Cache Local", icon: "⚠️", confirmBtnText: "Sim, limpar", confirmBtnClass: "btn-danger" }
      );
      if (!confirm1) return;

      const confirm2 = await showConfirm(
        "Esta ação é irreversível no navegador atual. Deseja mesmo continuar?",
        { title: "ATENÇÃO - Ação Crítica", icon: "🔥", confirmBtnText: "Apagar tudo", confirmBtnClass: "btn-danger" }
      );
      if (!confirm2) return;

      localStorage.clear();
      showToast("Dados apagados! Reiniciando...", "sucesso");
      setTimeout(() => window.location.reload(), 1500);
    });
  }

  inicializarNotificacoesListeners();
  inicializarRhListeners();
});

// =========================================================================
// --- MÓDULO RH: GESTÃO DE PESSOAS & PERFIL DISC (EXCLUSIVO OWNER) ---
// =========================================================================

const DISC_PROFILES_KEY = "cacaushow_disc_profiles_v1";

const DEFAULT_DISC_PROFILES = {
  "Bruno": { userName: "Bruno", d: 85, i: 70, s: 40, c: 60, perfilPredominante: "Dominante", dataAtualizacao: "2026-07-22" },
  "Isabella": { userName: "Isabella", d: 60, i: 80, s: 65, c: 75, perfilPredominante: "Influenciador", dataAtualizacao: "2026-07-22" },
  "Alexandra": { userName: "Alexandra", d: 50, i: 75, s: 70, c: 80, perfilPredominante: "Conforme", dataAtualizacao: "2026-07-22" }
};

function loadDiscProfiles() {
  const saved = localStorage.getItem(DISC_PROFILES_KEY);
  if (!saved) return DEFAULT_DISC_PROFILES;
  try {
    return JSON.parse(saved);
  } catch (e) {
    return DEFAULT_DISC_PROFILES;
  }
}

function saveDiscProfiles(profiles) {
  localStorage.setItem(DISC_PROFILES_KEY, JSON.stringify(profiles));
  if (API_ONLINE) {
    salvarConfigAPI("disc_profiles_config", JSON.stringify(profiles)).catch(err => console.error("Erro ao salvar DISC na API:", err));
  }
}

function obterListaColaboradores() {
  if (Array.isArray(USERS) && USERS.length > 0) {
    return USERS;
  }
  return [
    { nome: "Alexandra", role: "consultora_dashboard" },
    { nome: "LiderOP", role: "consultora_dashboard" },
    { nome: "Bruno", role: "owner" },
    { nome: "Isabella", role: "owner" }
  ];
}

function renderRhModulo() {
  if (!currentUser || currentUser.role !== "owner") {
    showToast("Acesso restrito ao perfil Owner.", "erro");
    return;
  }

  const profiles = loadDiscProfiles();
  const colabs = obterListaColaboradores();

  // Preencher dropdown de seleção de colaboradores para o upload (apenas colaboradores ativos no RH)
  const selectUpload = document.getElementById("disc-upload-user-select");
  if (selectUpload) {
    const valorAtual = selectUpload.value;
    selectUpload.innerHTML = '<option value="">Detecção Automática ou Escolher Colaborador...</option>';
    colabs.filter(c => !(profiles[c.nome] && profiles[c.nome].excludedFromRh)).forEach(c => {
      const opt = document.createElement("option");
      opt.value = c.nome;
      opt.textContent = `${c.nome} (${c.role === 'owner' ? 'Owner' : c.role === 'consultora_dashboard' ? 'Líder Operacional' : 'Consultor(a)'})`;
      selectUpload.appendChild(opt);
    });
    if (valorAtual) selectUpload.value = valorAtual;
  }

  renderRhTable();
  renderRhDashboard();
  renderRhInsights();
}

function getStoreForColab(nome) {
  const profiles = loadDiscProfiles();
  if (profiles[nome] && profiles[nome].store) {
    return profiles[nome].store;
  }
  if (nome === "Bruno" || nome === "Isabella") return "all";
  if (nome === "Alexandra" || nome === "LiderOP") return "9201";
  return "9175";
}

function renderRhTable() {
  const profiles = loadDiscProfiles();
  const filterStore = document.getElementById("rh-store-filter")?.value || "all";
  const tbody = document.getElementById("rh-disc-table-body");
  if (!tbody) return;

  const colabs = obterListaColaboradores();
  let count = 0;
  tbody.innerHTML = "";

  colabs.forEach(c => {
    const prof = profiles[c.nome] || { d: 25, i: 25, s: 25, c: 25, perfilPredominante: "Equilibrado" };
    if (prof.excludedFromRh) return; // Ocultar do Módulo RH

    const store = getStoreForColab(c.nome);
    if (filterStore !== "all" && store !== "all" && store !== filterStore) {
      return;
    }

    count++;
    
    let badgeClass = "disc-badge-c";
    if (prof.perfilPredominante === "Dominante") badgeClass = "disc-badge-d";
    else if (prof.perfilPredominante === "Influenciador") badgeClass = "disc-badge-i";
    else if (prof.perfilPredominante === "Estável") badgeClass = "disc-badge-s";

    const tr = document.createElement("tr");
    tr.className = "hover:bg-brand-900/40 transition";
    tr.innerHTML = `
      <td class="py-3 px-4 font-bold text-brand-100 flex items-center gap-2">
        <i class="fa-solid fa-user-circle text-brand-400"></i> ${c.nome}
      </td>
      <td class="py-3 px-4">
        <select class="rh-colab-store-select bg-brand-900 text-brand-100 border border-brand-700 rounded px-2 py-1 text-[11px] font-bold focus:outline-none focus:border-indigo-500 cursor-pointer" data-user="${c.nome}">
          <option value="all" ${store === 'all' ? 'selected' : ''}>Todas as Lojas (Geral)</option>
          <optgroup label="Cacau Show">
            <option value="9175" ${store === '9175' ? 'selected' : ''}>9175 - Marambaia</option>
            <option value="9201" ${store === '9201' ? 'selected' : ''}>9201 - Mário Covas</option>
            <option value="4304" ${store === '4304' ? 'selected' : ''}>4304 - Icoaraci</option>
          </optgroup>
          <optgroup label="Faça Amigos">
            <option value="fa-parque" ${store === 'fa-parque' ? 'selected' : ''}>Faça Amigos - Parque</option>
            <option value="fa-playground" ${store === 'fa-playground' ? 'selected' : ''}>Faça Amigos - Playground</option>
            <option value="fa-grao-para" ${store === 'fa-grao-para' ? 'selected' : ''}>Faça Amigos - Grão-Pará</option>
          </optgroup>
        </select>
      </td>
      <td class="py-3 px-4 text-center">
        <span class="disc-badge ${badgeClass}">${prof.perfilPredominante}</span>
      </td>
      <td class="py-3 px-4 text-center font-mono font-bold text-red-400">${prof.d}%</td>
      <td class="py-3 px-4 text-center font-mono font-bold text-amber-400">${prof.i}%</td>
      <td class="py-3 px-4 text-center font-mono font-bold text-emerald-400">${prof.s}%</td>
      <td class="py-3 px-4 text-center font-mono font-bold text-indigo-400">${prof.c}%</td>
      <td class="py-3 px-4 text-right flex items-center justify-end gap-1.5">
        <a href="https://api.whatsapp.com/send?text=Voc%C3%AA%20foi%20convidado%20para%20preencher%20o%20seu%20invent%C3%A1rio%20comportamental,%20%C3%A9%20s%C3%B3%20clicar%20no%20link%20a%20seguir:%20https://disc.etalent.com.br/grpqlPC5VYC50_7gFdn8f5W9w" target="_blank" rel="noopener noreferrer" class="px-2 py-1 rounded bg-emerald-950 hover:bg-emerald-900 border border-emerald-800 text-emerald-300 text-[10px] font-bold inline-flex items-center gap-1" title="Enviar convite via WhatsApp">
          <i class="fa-brands fa-whatsapp"></i> Convidar
        </a>
        <button class="px-2 py-1 rounded bg-indigo-950 hover:bg-indigo-900 border border-indigo-800 text-indigo-300 text-[10px] font-bold btn-edit-disc" data-user="${c.nome}" title="Ajustar valores DISC">
          <i class="fa-solid fa-pen"></i> Ajustar
        </button>
        <button class="px-2 py-1 rounded bg-red-950 hover:bg-red-900 border border-red-800 text-red-300 text-[10px] font-bold btn-remove-rh-disc" data-user="${c.nome}" title="Desconsiderar colaborador do RH">
          <i class="fa-solid fa-trash-can"></i>
        </button>
      </td>
    `;
    tbody.appendChild(tr);
  });

  const countBadge = document.getElementById("rh-colab-count-badge");
  if (countBadge) countBadge.textContent = `${count} colaborador(es)`;

  // Opção de Restaurar Colaboradores Excluídos
  const excludedColabs = colabs.filter(c => profiles[c.nome] && profiles[c.nome].excludedFromRh);
  const containerRestaurar = document.getElementById("rh-restore-container");
  if (containerRestaurar) {
    if (excludedColabs.length > 0) {
      containerRestaurar.innerHTML = `
        <button id="btn-restore-rh-colab" class="px-2.5 py-1 rounded-lg bg-indigo-950 hover:bg-indigo-900 border border-indigo-800 text-indigo-300 text-xs font-bold transition">
          <i class="fa-solid fa-rotate-left"></i> Restaurar Removidos (${excludedColabs.length})
        </button>
      `;
      containerRestaurar.classList.remove("hidden");
      document.getElementById("btn-restore-rh-colab").addEventListener("click", async () => {
        const nomesExcluidos = excludedColabs.map(c => c.nome).join(", ");
        const selected = prompt(`Qual colaborador deseja restaurar no Módulo RH?\nOcultos no RH: ${nomesExcluidos}`, excludedColabs[0].nome);
        if (!selected) return;
        const target = excludedColabs.find(c => c.nome.toLowerCase() === selected.trim().toLowerCase());
        if (target) {
          profiles[target.nome].excludedFromRh = false;
          saveDiscProfiles(profiles);
          showToast(`${target.nome} restaurado(a) no Módulo RH!`, "sucesso");
          renderRhModulo();
        } else {
          showToast("Colaborador não encontrado na lista de removidos.", "erro");
        }
      });
    } else {
      containerRestaurar.innerHTML = "";
      containerRestaurar.classList.add("hidden");
    }
  }

  // Listeners para trocar a loja do colaborador
  document.querySelectorAll(".rh-colab-store-select").forEach(select => {
    select.addEventListener("change", (e) => {
      const userName = e.target.dataset.user;
      const newStore = e.target.value;
      const profiles = loadDiscProfiles();
      if (!profiles[userName]) {
        profiles[userName] = { userName, d: 25, i: 25, s: 25, c: 25, perfilPredominante: "Equilibrado", dataAtualizacao: new Date().toISOString().split("T")[0] };
      }
      profiles[userName].store = newStore;
      saveDiscProfiles(profiles);
      showToast(`Unidade/Loja de ${userName} atualizada!`, "sucesso");
      renderRhModulo();
    });
  });

  // Event Listeners para botões de ajuste manual
  document.querySelectorAll(".btn-edit-disc").forEach(btn => {
    btn.addEventListener("click", () => {
      const u = btn.dataset.user;
      abrirModalEditDisc(u);
    });
  });

  // Event Listeners para remoção do Módulo RH
  document.querySelectorAll(".btn-remove-rh-disc").forEach(btn => {
    btn.addEventListener("click", async () => {
      const userName = btn.dataset.user;
      const confirmRemove = await showConfirm(
        `Tem certeza que deseja desconsiderar ${userName} do Módulo RH? Isso removerá o perfil apenas dos relatórios de RH, sem afetar o cadastro geral ou registros de caixa do sistema.`,
        { title: "Remover Perfil do RH", icon: "⚠️", confirmBtnText: "Sim, remover", confirmBtnClass: "btn-danger" }
      );
      if (!confirmRemove) return;

      const profiles = loadDiscProfiles();
      if (!profiles[userName]) profiles[userName] = {};
      profiles[userName].excludedFromRh = true;
      saveDiscProfiles(profiles);

      showToast(`${userName} desconsiderado(a) do Módulo RH.`, "sucesso");
      renderRhModulo();
    });
  });
}

function renderRhDashboard() {
  const profiles = loadDiscProfiles();
  const filterStore = document.getElementById("rh-store-filter")?.value || "all";
  const colabs = obterListaColaboradores();

  let sumD = 0, sumI = 0, sumS = 0, sumC = 0, total = 0;

  colabs.forEach(c => {
    const prof = profiles[c.nome] || { d: 25, i: 25, s: 25, c: 25 };
    if (prof && prof.excludedFromRh) return; // Ignorar no Dashboard do RH

    const store = getStoreForColab(c.nome);
    if (filterStore !== "all" && store !== "all" && store !== filterStore) return;

    sumD += prof.d || 0;
    sumI += prof.i || 0;
    sumS += prof.s || 0;
    sumC += prof.c || 0;
    total++;
  });

  const avgD = total ? Math.round(sumD / total) : 0;
  const avgI = total ? Math.round(sumI / total) : 0;
  const avgS = total ? Math.round(sumS / total) : 0;
  const avgC = total ? Math.round(sumC / total) : 0;

  const elD = document.getElementById("stat-disc-d");
  const elI = document.getElementById("stat-disc-i");
  const elS = document.getElementById("stat-disc-s");
  const elC = document.getElementById("stat-disc-c");

  if (elD) elD.textContent = `${avgD}%`;
  if (elI) elI.textContent = `${avgI}%`;
  if (elS) elS.textContent = `${avgS}%`;
  if (elC) elC.textContent = `${avgC}%`;

  const containerBars = document.getElementById("rh-dashboard-bars-container");
  if (containerBars) {
    containerBars.innerHTML = `
      <div class="space-y-1">
        <div class="flex justify-between text-xs font-bold text-red-300">
          <span>Dominância (Execução & Decisão)</span>
          <span>${avgD}%</span>
        </div>
        <div class="w-full bg-brand-900 rounded-full h-3 overflow-hidden border border-brand-800">
          <div class="bg-red-500 h-3 rounded-full transition-all duration-500" style="width: ${avgD}%"></div>
        </div>
      </div>
      <div class="space-y-1">
        <div class="flex justify-between text-xs font-bold text-amber-300">
          <span>Influência (Comunicação & Vendas)</span>
          <span>${avgI}%</span>
        </div>
        <div class="w-full bg-brand-900 rounded-full h-3 overflow-hidden border border-brand-800">
          <div class="bg-amber-500 h-3 rounded-full transition-all duration-500" style="width: ${avgI}%"></div>
        </div>
      </div>
      <div class="space-y-1">
        <div class="flex justify-between text-xs font-bold text-emerald-300">
          <span>Estabilidade (Planejamento & Consistência)</span>
          <span>${avgS}%</span>
        </div>
        <div class="w-full bg-brand-900 rounded-full h-3 overflow-hidden border border-brand-800">
          <div class="bg-emerald-500 h-3 rounded-full transition-all duration-500" style="width: ${avgS}%"></div>
        </div>
      </div>
      <div class="space-y-1">
        <div class="flex justify-between text-xs font-bold text-indigo-300">
          <span>Conformidade (Processos & Rigor Técnico)</span>
          <span>${avgC}%</span>
        </div>
        <div class="w-full bg-brand-900 rounded-full h-3 overflow-hidden border border-brand-800">
          <div class="bg-indigo-500 h-3 rounded-full transition-all duration-500" style="width: ${avgC}%"></div>
        </div>
      </div>
    `;
  }
}

function renderRhInsights() {
  const container = document.getElementById("rh-insights-container");
  if (!container) return;

  const filterStore = document.getElementById("rh-store-filter")?.value || "all";

  let storeTitle = "Geral (Todas as Unidades)";
  if (filterStore === "9175") storeTitle = "Loja 9175 - Marambaia";
  else if (filterStore === "9201") storeTitle = "Loja 9201 - Mário Covas";
  else if (filterStore === "4304") storeTitle = "Loja 4304 - Icoaraci";
  else if (filterStore === "fa-parque") storeTitle = "Faça Amigos - Parque Circuito";
  else if (filterStore === "fa-playground") storeTitle = "Faça Amigos - Playground";
  else if (filterStore === "fa-grao-para") storeTitle = "Faça Amigos - Grão-Pará";

  container.innerHTML = `
    <!-- Card 1: Perfil da Equipe -->
    <div class="glass-card p-5 rounded-2xl border border-brand-800 bg-brand-950/70 space-y-3">
      <div class="flex items-center gap-2 text-indigo-400 font-bold text-sm">
        <i class="fa-solid fa-bullseye text-base"></i> Diagnóstico da Unidade
      </div>
      <div class="text-xs text-brand-200 font-bold">${storeTitle}</div>
      <p class="text-xs text-brand-300 leading-relaxed">
        A equipe apresenta forte traço de <strong>Influência (I)</strong> e <strong>Conformidade (C)</strong>. Excelente equilíbrio entre atendimento comunicativo ao cliente e atenção rigorosa ao caixa e inventário.
      </p>
      <div class="p-2.5 rounded-lg bg-emerald-950/40 border border-emerald-900/60 text-emerald-300 text-[11px]">
        <i class="fa-solid fa-circle-check"></i> **Ponto Forte:** Baixo índice de divergências e alta satisfação de atendimento.
      </div>
    </div>

    <!-- Card 2: Alertas de Formação de Time -->
    <div class="glass-card p-5 rounded-2xl border border-brand-800 bg-brand-950/70 space-y-3">
      <div class="flex items-center gap-2 text-amber-400 font-bold text-sm">
        <i class="fa-solid fa-triangle-exclamation text-base"></i> Oportunidade de Equilíbrio
      </div>
      <div class="text-xs text-brand-200 font-bold">Desenvolvimento & Liderança</div>
      <p class="text-xs text-brand-300 leading-relaxed">
        Recomenda-se incentivar a autonomia e tomada de decisão ágil <strong>(Dominância D)</strong> em horários de pico ou grandes campanhas promocionais.
      </p>
      <div class="p-2.5 rounded-lg bg-amber-950/40 border border-amber-900/60 text-amber-300 text-[11px]">
        <i class="fa-solid fa-lightbulb"></i> **Sugestão:** Treinamentos de liderança situacional para as consultoras de fechamento.
      </div>
    </div>

    <!-- Card 3: Perfil Ideal para Novas Contratações -->
    <div class="glass-card p-5 rounded-2xl border border-brand-800 bg-brand-950/70 space-y-3">
      <div class="flex items-center gap-2 text-emerald-400 font-bold text-sm">
        <i class="fa-solid fa-user-plus text-base"></i> Perfil para Próxima Vaga
      </div>
      <div class="text-xs text-brand-200 font-bold">Perfil Alvo para Seleção</div>
      <p class="text-xs text-brand-300 leading-relaxed">
        Para manter a equipe complementar nesta loja, priorize candidatas com alto traço <strong>I (Influenciador)</strong> para vendas proativas de adicionais e panetones/chocolates em datas comemorativas.
      </p>
      <div class="p-2.5 rounded-lg bg-indigo-950/40 border border-indigo-900/60 text-indigo-300 text-[11px]">
        <i class="fa-solid fa-award"></i> **Fit Cultural:** Foco em simpatia, extroversão e organização de balcão.
      </div>
    </div>
  `;
}

// Modal de edição manual de DISC
async function abrirModalEditDisc(userName) {
  const profiles = loadDiscProfiles();
  const prof = profiles[userName] || { d: 25, i: 25, s: 25, c: 25, perfilPredominante: "Dominante" };

  const promptD = prompt(`Dominância (D) para ${userName} (%):`, prof.d);
  if (promptD === null) return;
  const promptI = prompt(`Influência (I) para ${userName} (%):`, prof.i);
  if (promptI === null) return;
  const promptS = prompt(`Estabilidade (S) para ${userName} (%):`, prof.s);
  if (promptS === null) return;
  const promptC = prompt(`Conformidade (C) para ${userName} (%):`, prof.c);
  if (promptC === null) return;

  const d = parseInt(promptD) || 0;
  const i = parseInt(promptI) || 0;
  const s = parseInt(promptS) || 0;
  const c = parseInt(promptC) || 0;

  let perfilPredominante = "Dominante";
  let max = d;
  if (i > max) { max = i; perfilPredominante = "Influenciador"; }
  if (s > max) { max = s; perfilPredominante = "Estável"; }
  if (c > max) { max = c; perfilPredominante = "Conforme"; }

  profiles[userName] = {
    userName,
    d, i, s, c,
    perfilPredominante,
    dataAtualizacao: new Date().toISOString().split("T")[0]
  };

  saveDiscProfiles(profiles);
  showToast(`Perfil DISC de ${userName} atualizado!`, "sucesso");
  renderRhModulo();
}

// Processamento em lote ou individual de arquivos PDF DISC
async function handleDiscPdfs(files, selectedUser) {
  if (!files || files.length === 0) return;

  if (!window.pdfjsLib) {
    showToast("Biblioteca de PDF não carregada no navegador.", "erro");
    return;
  }

  const containerInfo = document.getElementById("disc-file-info");
  const progressBar = document.getElementById("disc-progress-bar");
  const progressLabel = document.getElementById("disc-progress-label");

  if (containerInfo) containerInfo.classList.remove("hidden");

  const colabs = obterListaColaboradores();
  const profiles = loadDiscProfiles();
  let processados = 0;

  for (let idx = 0; idx < files.length; idx++) {
    const file = files[idx];
    const pct = Math.round(((idx + 1) / files.length) * 100);
    if (progressBar) progressBar.style.width = `${pct}%`;
    if (progressLabel) progressLabel.textContent = `Processando arquivo ${idx + 1} de ${files.length}: ${file.name}`;

    try {
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await window.pdfjsLib.getDocument({ data: arrayBuffer }).promise;

      let textContent = "";
      for (let p = 1; p <= pdf.numPages; p++) {
        const page = await pdf.getPage(p);
        const content = await page.getTextContent();
        const pageText = content.items.map(item => item.str).join(" ");
        textContent += pageText + " ";
      }

      const textUpper = textContent.toUpperCase();
      const fileNameUpper = file.name.toUpperCase();

      // Tentar identificar o colaborador pelo nome no texto do PDF ou no nome do arquivo
      let targetUser = selectedUser;
      if (!targetUser || files.length > 1) {
        const colabEncontrado = colabs.find(c => {
          const cNome = c.nome.toUpperCase();
          return textUpper.includes(cNome) || fileNameUpper.includes(cNome);
        });
        if (colabEncontrado) targetUser = colabEncontrado.nome;
      }

      if (!targetUser) {
        if (files.length === 1 && selectedUser) {
          targetUser = selectedUser;
        } else {
          console.warn(`Não foi possível determinar o colaborador para o arquivo: ${file.name}`);
          continue;
        }
      }

      // Algoritmo de extração das pontuações D, I, S, C
      let d = 25, i = 25, s = 25, c = 25;

      const matchD = textUpper.match(/DOMINÂNCIA[^\d]*(\d{1,3})/i) || textUpper.match(/DOMINANTE[^\d]*(\d{1,3})/i);
      const matchI = textUpper.match(/INFLUÊNCIA[^\d]*(\d{1,3})/i) || textUpper.match(/INFLUENCIADOR[^\d]*(\d{1,3})/i);
      const matchS = textUpper.match(/ESTABILIDADE[^\d]*(\d{1,3})/i) || textUpper.match(/ESTÁVEL[^\d]*(\d{1,3})/i);
      const matchC = textUpper.match(/CONFORMIDADE[^\d]*(\d{1,3})/i) || textUpper.match(/CONFORME[^\d]*(\d{1,3})/i);

      if (matchD) d = parseInt(matchD[1]);
      if (matchI) i = parseInt(matchI[1]);
      if (matchS) s = parseInt(matchS[1]);
      if (matchC) c = parseInt(matchC[1]);

      let perfilPredominante = "Dominante";
      let max = d;
      if (i > max) { max = i; perfilPredominante = "Influenciador"; }
      if (s > max) { max = s; perfilPredominante = "Estável"; }
      if (c > max) { max = c; perfilPredominante = "Conforme"; }

      profiles[targetUser] = {
        userName: targetUser,
        d, i, s, c,
        perfilPredominante,
        dataAtualizacao: new Date().toISOString().split("T")[0]
      };

      processados++;
    } catch (err) {
      console.error(`Erro ao processar PDF ${file.name}:`, err);
    }
  }

  saveDiscProfiles(profiles);

  if (progressBar) progressBar.style.width = "100%";
  if (progressLabel) progressLabel.textContent = "Concluído!";

  setTimeout(() => {
    if (containerInfo) containerInfo.classList.add("hidden");
    if (processados > 0) {
      showToast(`Sucesso! ${processados} laudo(s) DISC em PDF processado(s) e salvo(s).`, "sucesso");
      renderRhModulo();
    } else {
      showToast("Nenhum laudo DISC foi associado. Selecione o colaborador ou insira o nome no arquivo.", "erro");
    }
  }, 600);
}

function inicializarRhListeners() {
  // Filtro de Loja
  const selectStoreFilter = document.getElementById("rh-store-filter");
  if (selectStoreFilter) {
    selectStoreFilter.addEventListener("change", () => {
      renderRhModulo();
    });
  }

  // Navegação de Sub-abas RH
  const btnPerfis = document.getElementById("rh-subtab-btn-perfis");
  const btnDashboard = document.getElementById("rh-subtab-btn-dashboard");
  const btnInsights = document.getElementById("rh-subtab-btn-insights");

  const panelPerfis = document.getElementById("rh-subtab-perfis");
  const panelDashboard = document.getElementById("rh-subtab-dashboard");
  const panelInsights = document.getElementById("rh-subtab-insights");

  if (btnPerfis && btnDashboard && btnInsights) {
    btnPerfis.addEventListener("click", () => {
      btnPerfis.className = "rh-subtab-btn active px-3 py-1.5 rounded-lg text-xs font-bold transition bg-indigo-700 text-white shadow";
      btnDashboard.className = "rh-subtab-btn px-3 py-1.5 rounded-lg text-xs font-bold transition bg-brand-950 text-brand-300 hover:text-white";
      btnInsights.className = "rh-subtab-btn px-3 py-1.5 rounded-lg text-xs font-bold transition bg-brand-950 text-brand-300 hover:text-white";

      panelPerfis.classList.remove("hidden");
      panelDashboard.classList.add("hidden");
      panelInsights.classList.add("hidden");
    });

    btnDashboard.addEventListener("click", () => {
      btnDashboard.className = "rh-subtab-btn active px-3 py-1.5 rounded-lg text-xs font-bold transition bg-indigo-700 text-white shadow";
      btnPerfis.className = "rh-subtab-btn px-3 py-1.5 rounded-lg text-xs font-bold transition bg-brand-950 text-brand-300 hover:text-white";
      btnInsights.className = "rh-subtab-btn px-3 py-1.5 rounded-lg text-xs font-bold transition bg-brand-950 text-brand-300 hover:text-white";

      panelDashboard.classList.remove("hidden");
      panelPerfis.classList.add("hidden");
      panelInsights.classList.add("hidden");
      renderRhDashboard();
    });

    btnInsights.addEventListener("click", () => {
      btnInsights.className = "rh-subtab-btn active px-3 py-1.5 rounded-lg text-xs font-bold transition bg-indigo-700 text-white shadow";
      btnPerfis.className = "rh-subtab-btn px-3 py-1.5 rounded-lg text-xs font-bold transition bg-brand-950 text-brand-300 hover:text-white";
      btnDashboard.className = "rh-subtab-btn px-3 py-1.5 rounded-lg text-xs font-bold transition bg-brand-950 text-brand-300 hover:text-white";

      panelInsights.classList.remove("hidden");
      panelPerfis.classList.add("hidden");
      panelDashboard.classList.add("hidden");
      renderRhInsights();
    });
  }

  // Upload PDF DISC Listener (Múltiplos ou Único)
  const discFileInput = document.getElementById("disc-pdf-file");
  const userSelect = document.getElementById("disc-upload-user-select");

  if (discFileInput) {
    discFileInput.addEventListener("change", (e) => {
      const files = Array.from(e.target.files);
      const userName = userSelect ? userSelect.value : "";
      if (!files || files.length === 0) return;
      handleDiscPdfs(files, userName);
      discFileInput.value = "";
    });
  }
}

// ==========================================================================
// MÓDULO DE CONTROLE DE PONTO PWA - CLT-COMPLIANT
// ==========================================================================

let pontoDb = null;
let pontoStream = null;
let pontoGpsCoords = null;
let pontoGpsAccuracy = null;
const LOJAS_GEOLOC = {
  "Marambaia": { lat: -1.4116, lng: -48.4418 },
  "Icoaraci": { lat: -1.3039, lng: -48.4878 },
  "Mário Covas": { lat: -1.3815, lng: -48.4115 }
};

function inicializarPontoDb() {
  if (pontoDb) return;
  pontoDb = new Dexie("PontoEletronicoDB");
  pontoDb.version(1).stores({
    time_records: "id, timestamp, tipo, syncStatus",
    offline_queue: "id, action, timestamp",
    attachments: "id"
  });
}

function inicializarAbaPonto() {
  inicializarPontoDb();
  
  // Setup listeners
  document.getElementById("btn-ponto-ativar-cam").onclick = ativarCameraPonto;
  document.getElementById("btn-ponto-entrada").onclick = () => registrarMarcacaoPonto("ENTRADA");
  document.getElementById("btn-ponto-saida-int").onclick = () => registrarMarcacaoPonto("SAIDA_INTERVALO");
  document.getElementById("btn-ponto-retorno-int").onclick = () => registrarMarcacaoPonto("RETORNO_INTERVALO");
  document.getElementById("btn-ponto-saida").onclick = () => registrarMarcacaoPonto("SAIDA");
  
  // Adjustment Form
  document.getElementById("form-ponto-ajuste").onsubmit = enviarSolicitacaoAjuste;
  
  // File input compression display
  const fileInput = document.getElementById("ponto-ajuste-file");
  if (fileInput) {
    fileInput.onchange = (e) => {
      const file = e.target.files[0];
      const filenameLabel = document.getElementById("ponto-ajuste-filename");
      if (file && filenameLabel) {
        filenameLabel.textContent = `${file.name} (${(file.size / 1024).toFixed(1)} KB)`;
      }
    };
  }

  // PDF report listener
  document.getElementById("btn-ponto-pdf").onclick = exportarEspelhoPontoPDF;

  // Start continuous GPS tracking
  ativarGPSPonto();

  // Load history from Dexie & Server
  atualizarHistoricoPonto();

  // Run initial sync worker
  processarFilaOfflinePonto();
  window.addEventListener("online", processarFilaOfflinePonto);
}

function ativarCameraPonto() {
  const video = document.getElementById("ponto-video");
  const placeholder = document.getElementById("ponto-camera-placeholder");
  const btn = document.getElementById("btn-ponto-ativar-cam");

  if (pontoStream) {
    // Desativar
    pontoStream.getTracks().forEach(track => track.stop());
    pontoStream = null;
    video.classList.add("hidden");
    placeholder.classList.remove("hidden");
    btn.innerHTML = `<i class="fa-solid fa-video mr-1"></i> Ativar Câmera`;
    return;
  }

  navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" } })
    .then(stream => {
      pontoStream = stream;
      video.srcObject = stream;
      video.classList.remove("hidden");
      placeholder.classList.add("hidden");
      btn.innerHTML = `<i class="fa-solid fa-video-slash mr-1"></i> Desativar Câmera`;
    })
    .catch(err => {
      console.error("Erro ao acessar câmera:", err);
      showToast("Não foi possível acessar a câmera do dispositivo.", "erro");
    });
}

function ativarGPSPonto() {
  const gpsStatus = document.getElementById("ponto-gps-status");
  const gpsCoords = document.getElementById("ponto-gps-coords");
  const gpsAcc = document.getElementById("ponto-gps-accuracy");
  const gpsDist = document.getElementById("ponto-gps-distance");

  if (!navigator.geolocation) {
    gpsStatus.innerHTML = `<i class="fa-solid fa-circle-xmark"></i> Insuportável`;
    return;
  }

  navigator.geolocation.watchPosition(
    (pos) => {
      pontoGpsCoords = pos.coords;
      pontoGpsAccuracy = pos.coords.accuracy;

      gpsCoords.textContent = `Coordenadas: ${pos.coords.latitude.toFixed(5)}, ${pos.coords.longitude.toFixed(5)}`;
      gpsAcc.textContent = `Precisão: ${pos.coords.accuracy.toFixed(1)}m`;

      // Check distance to active store
      const storeName = getLojaNomePorCodigo(currentStore);
      const storeLoc = LOJAS_GEOLOC[storeName] || LOJAS_GEOLOC["Marambaia"];
      const dist = calcularDistanciaHaversine(pos.coords.latitude, pos.coords.longitude, storeLoc.lat, storeLoc.lng);
      
      gpsDist.textContent = `Distância da Loja: ${dist.toFixed(1)}m`;

      if (pos.coords.accuracy > 30) {
        gpsStatus.className = "text-amber-500 font-black";
        gpsStatus.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i> Precisão Baixa`;
      } else if (dist > 50) {
        gpsStatus.className = "text-rose-500 font-black";
        gpsStatus.innerHTML = `<i class="fa-solid fa-circle-xmark"></i> Fora do Perímetro`;
      } else {
        gpsStatus.className = "text-emerald-500 font-black";
        gpsStatus.innerHTML = `<i class="fa-solid fa-circle-check"></i> OK`;
      }
    },
    (err) => {
      console.warn("Erro ao obter GPS:", err);
      gpsStatus.innerHTML = `<i class="fa-solid fa-circle-xmark"></i> Erro`;
    },
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
  );
}

function calcularDistanciaHaversine(lat1, lon1, lat2, lon2) {
  const R = 6371e3; // Earth radius in meters
  const phi1 = lat1 * Math.PI / 180;
  const phi2 = lat2 * Math.PI / 180;
  const deltaPhi = (lat2 - lat1) * Math.PI / 180;
  const deltaLambda = (lon2 - lon1) * Math.PI / 180;

  const a = Math.sin(deltaPhi/2) * Math.sin(deltaPhi/2) +
            Math.cos(phi1) * Math.cos(phi2) *
            Math.sin(deltaLambda/2) * Math.sin(deltaLambda/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

  return R * c; // in meters
}

async function registrarMarcacaoPonto(tipo) {
  if (!pontoGpsCoords) {
    showToast("Aguarde a obtenção da localização GPS antes de bater ponto.", "erro");
    return;
  }

  // Geofencing Check
  const storeName = getLojaNomePorCodigo(currentStore);
  const storeLoc = LOJAS_GEOLOC[storeName] || LOJAS_GEOLOC["Marambaia"];
  const dist = calcularDistanciaHaversine(pontoGpsCoords.latitude, pontoGpsCoords.longitude, storeLoc.lat, storeLoc.lng);
  
  if (pontoGpsAccuracy > 30) {
    showToast("Precisão do GPS insuficiente. Mova-se para um local aberto.", "erro");
    return;
  }
  
  if (dist > 50) {
    showToast(`Marcação bloqueada: você está fora da cerca virtual (Distância: ${dist.toFixed(0)}m).`, "erro");
    return;
  }

  // Photo Capture
  let photoBase64 = null;
  const video = document.getElementById("ponto-video");
  const canvas = document.getElementById("ponto-canvas");
  
  if (pontoStream && video && canvas) {
    const ctx = canvas.getContext("2d");
    canvas.width = Math.min(video.videoWidth, 640);
    canvas.height = Math.min(video.videoHeight, 480);
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    // Compress client side quality 80% WebP/JPEG
    photoBase64 = canvas.toDataURL("image/jpeg", 0.8);
  } else {
    showToast("A foto de identificação facial é obrigatória para bater ponto.", "erro");
    return;
  }

  // Chained Integrity Hash SHA-256
  const lastRecord = await pontoDb.time_records.orderBy("timestamp").last();
  const prevHash = lastRecord ? lastRecord.hash : "0000000000000000000000000000000000000000000000000000000000000000";
  const timestamp = new Date().toISOString();
  const rawString = `${currentUser.nome}_${timestamp}_${tipo}_${pontoGpsCoords.latitude}_${pontoGpsCoords.longitude}_${prevHash}`;
  const currentHash = await calcularHashSha256(rawString);

  const newRecord = {
    id: `${currentUser.nome}_${Date.now()}`,
    usuario: currentUser.nome,
    timestamp,
    tipo,
    gps: `${pontoGpsCoords.latitude.toFixed(5)},${pontoGpsCoords.longitude.toFixed(5)}`,
    accuracy: pontoGpsAccuracy,
    photo: photoBase64,
    hash: currentHash,
    syncStatus: "PENDING"
  };

  await pontoDb.time_records.put(newRecord);
  await pontoDb.offline_queue.put({
    id: newRecord.id,
    action: "SYNC_PUNCH",
    timestamp: Date.now()
  });

  showToast("Ponto registrado localmente com sucesso!", "sucesso");
  
  // Recalculate daily worked segments
  atualizarHistoricoPonto();
  processarFilaOfflinePonto();
}

async function calcularHashSha256(str) {
  const encoder = new TextEncoder();
  const data = encoder.encode(str);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

async function processarFilaOfflinePonto() {
  if (!navigator.onLine) {
    document.getElementById("ponto-offline-badge").classList.remove("hidden");
    return;
  }

  inicializarPontoDb();
  const pendingItems = await pontoDb.time_records.where("syncStatus").equals("PENDING").toArray();
  if (pendingItems.length === 0) {
    document.getElementById("ponto-offline-badge").classList.add("hidden");
    return;
  }

  document.getElementById("ponto-offline-badge").classList.remove("hidden");

  // Send batch to server
  fetch(`${API_BASE}/ponto/sync`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ records: pendingItems })
  })
  .then(res => res.json())
  .then(async (data) => {
    if (data.success) {
      for (const item of pendingItems) {
        await pontoDb.time_records.update(item.id, { syncStatus: "SYNCED" });
      }
      await pontoDb.offline_queue.clear();
      document.getElementById("ponto-offline-badge").classList.add("hidden");
      showToast("Fila de pontos offline sincronizada!", "sucesso");
      atualizarHistoricoPonto();
    }
  })
  .catch(err => {
    console.error("Erro na sincronização de ponto:", err);
  });
}

async function enviarSolicitacaoAjuste(e) {
  e.preventDefault();
  
  const data = document.getElementById("ponto-ajuste-data").value;
  const tipo = document.getElementById("ponto-ajuste-tipo").value;
  const motivo = document.getElementById("ponto-ajuste-motivo").value;
  const fileInput = document.getElementById("ponto-ajuste-file");
  
  let comprovanteBase64 = null;

  if (fileInput.files.length > 0) {
    const file = fileInput.files[0];
    comprovanteBase64 = await comprimirImagemClientSide(file);
  }

  const payload = {
    id: `${currentUser.nome}_ajuste_${Date.now()}`,
    usuario: currentUser.nome,
    data,
    tipo,
    motivo,
    comprovante: comprovanteBase64
  };

  fetch(`${API_BASE}/ponto/ajuste`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  })
  .then(res => res.json())
  .then(data => {
    if (data.success) {
      showToast("Solicitação de ajuste enviada com sucesso!", "sucesso");
      document.getElementById("form-ponto-ajuste").reset();
      document.getElementById("ponto-ajuste-filename").textContent = "Nenhum arquivo selecionado";
      atualizarHistoricoPonto();
    } else {
      showToast("Erro ao enviar solicitação.", "erro");
    }
  })
  .catch(err => {
    console.error(err);
    showToast("Erro de conexão ao enviar ajuste.", "erro");
  });
}

function comprimirImagemClientSide(file) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");

        const MAX_WIDTH = 1200;
        let width = img.width;
        let height = img.height;

        if (width > MAX_WIDTH) {
          height = Math.round((height * MAX_WIDTH) / width);
          width = MAX_WIDTH;
        }

        canvas.width = width;
        canvas.height = height;
        ctx.drawImage(img, 0, 0, width, height);

        // Compress WebP or JPEG to <300KB
        const compressed = canvas.toDataURL("image/jpeg", 0.8);
        resolve(compressed);
      };
      img.src = event.target.result;
    };
    reader.readAsDataURL(file);
  });
}

async function atualizarHistoricoPonto() {
  if (!currentUser) return;
  inicializarPontoDb();
  
  // Get local records from Dexie
  const localRecords = await pontoDb.time_records.where("usuario").equals(currentUser.nome).toArray();
  
  // Parse and display
  renderizarTabelaPonto(localRecords);

  // Fetch server records if online to update Dexie
  if (navigator.onLine) {
    fetch(`${API_BASE}/ponto/historico?usuario=${encodeURIComponent(currentUser.nome)}`)
      .then(res => res.json())
      .then(async (data) => {
        if (data && data.registros) {
          // Merge to Dexie
          for (const sRec of data.registros) {
            sRec.syncStatus = "SYNCED";
            await pontoDb.time_records.put(sRec);
          }
          const updatedLocal = await pontoDb.time_records.where("usuario").equals(currentUser.nome).toArray();
          renderizarTabelaPonto(updatedLocal);
        }
      })
      .catch(err => console.warn("Erro ao buscar histórico de ponto do servidor:", err));
  }
}

function renderizarTabelaPonto(records) {
  const tbody = document.getElementById("ponto-historico-tbody");
  if (!tbody) return;
  tbody.innerHTML = "";

  // Group records by date (YYYY-MM-DD)
  const grouped = {};
  records.forEach(r => {
    const dStr = r.timestamp.split("T")[0];
    if (!grouped[dStr]) grouped[dStr] = {};
    grouped[dStr][r.tipo] = r.timestamp;
  });

  const dates = Object.keys(grouped).sort((a, b) => b.localeCompare(a));
  
  let totalWorkedMsToday = 0;
  const dTodayStr = new Date().toISOString().split("T")[0];

  dates.forEach(d => {
    const day = grouped[d];
    const ent = day["ENTRADA"] ? new Date(day["ENTRADA"]) : null;
    const sInt = day["SAIDA_INTERVALO"] ? new Date(day["SAIDA_INTERVALO"]) : null;
    const rInt = day["RETORNO_INTERVALO"] ? new Date(day["RETORNO_INTERVALO"]) : null;
    const sai = day["SAIDA"] ? new Date(day["SAIDA"]) : null;

    let workedMs = 0;
    if (ent && sInt) workedMs += (sInt - ent);
    if (rInt && sai) workedMs += (sai - rInt);
    else if (rInt && !sai && d === dTodayStr) {
      workedMs += (new Date() - rInt);
    } else if (ent && !sInt && d === dTodayStr) {
      workedMs += (new Date() - ent);
    }

    if (d === dTodayStr) {
      totalWorkedMsToday = workedMs;
    }

    const tHours = Math.floor(workedMs / 3600000);
    const tMins = Math.floor((workedMs % 3600000) / 60000);
    const saldoText = `${tHours.toString().padStart(2, '0')}:${tMins.toString().padStart(2, '0')}`;

    const tr = document.createElement("tr");
    tr.className = "hover:bg-brand-900/30 transition-all border-b border-brand-900/20";
    tr.innerHTML = `
      <td class="py-3 px-4 font-mono font-bold">${formatDate(d)}</td>
      <td class="py-3 px-4 text-center font-semibold">${ent ? formatTime(ent) : "-"}</td>
      <td class="py-3 px-4 text-center text-brand-300">${sInt ? formatTime(sInt) : "-"}</td>
      <td class="py-3 px-4 text-center text-brand-300">${rInt ? formatTime(rInt) : "-"}</td>
      <td class="py-3 px-4 text-center font-semibold">${sai ? formatTime(sai) : "-"}</td>
      <td class="py-3 px-4 text-center font-mono font-bold ${workedMs > 28800000 ? 'text-emerald-400' : 'text-brand-300'}">${saldoText}</td>
    `;
    tbody.appendChild(tr);
  });

  // Update real time metrics
  const hToday = Math.floor(totalWorkedMsToday / 3600000);
  const mToday = Math.floor((totalWorkedMsToday % 3600000) / 60000);
  document.getElementById("ponto-balance-today").textContent = `${hToday}h ${mToday}m`;
  
  const pct = Math.min(100, (totalWorkedMsToday / 28800000) * 100);
  const bar = document.getElementById("ponto-balance-progress");
  if (bar) {
    bar.style.width = `${pct}%`;
    if (pct >= 100) bar.className = "bg-emerald-500 h-3.5 rounded-full transition-all duration-500";
    else bar.className = "bg-brand-500 h-3.5 rounded-full transition-all duration-500";
  }

  // CLT 2h overtime limit check
  const alertClt = document.getElementById("ponto-clt-alert");
  if (alertClt) {
    if (totalWorkedMsToday >= 36000000) { // 10 hours total (8h + 2h extras)
      alertClt.classList.remove("hidden");
    } else {
      alertClt.classList.add("hidden");
    }
  }
}

function formatTime(date) {
  return date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

async function exportarEspelhoPontoPDF() {
  if (!currentUser) return;
  const { jsPDF } = window.jspdf;
  
  inicializarPontoDb();
  const records = await pontoDb.time_records.where("usuario").equals(currentUser.nome).toArray();
  
  const doc = new jsPDF();
  
  // Colors & Styles
  doc.setFillColor(74, 18, 26); // Burgundy primary color
  doc.rect(0, 0, 210, 40, "F");
  
  doc.setTextColor(255, 255, 255);
  doc.setFont("Helvetica", "bold");
  doc.setFontSize(22);
  doc.text("ESPELHO DE PONTO ELETRÔNICO", 15, 18);
  
  doc.setFontSize(10);
  doc.setFont("Helvetica", "normal");
  doc.text(`Portaria 671/2021 MTP - Identificação e Controle de Jornada`, 15, 28);
  doc.text(`Emissão: ${new Date().toLocaleDateString("pt-BR")} ${new Date().toLocaleTimeString("pt-BR")}`, 150, 28);

  // Colaborador Info
  doc.setTextColor(51, 51, 51);
  doc.setFont("Helvetica", "bold");
  doc.setFontSize(12);
  doc.text("DADOS DO TRABALHADOR", 15, 52);
  
  doc.setFont("Helvetica", "normal");
  doc.setFontSize(10);
  doc.text(`Nome do Colaborador: ${currentUser.nome}`, 15, 60);
  doc.text(`Cargo / Função: ${currentUser.role.toUpperCase()}`, 15, 66);
  doc.text(`Operação / Loja Ativa: Loja ${getLojaNomePorCodigo(currentStore)}`, 15, 72);

  // Table header
  doc.setFillColor(240, 240, 240);
  doc.rect(15, 82, 180, 8, "F");
  doc.setFont("Helvetica", "bold");
  doc.text("Data", 17, 87);
  doc.text("Entrada", 52, 87);
  doc.text("Almoço", 82, 87);
  doc.text("Retorno", 112, 87);
  doc.text("Saída", 142, 87);
  doc.text("Saldo", 172, 87);

  // Group records by date
  const grouped = {};
  records.forEach(r => {
    const dStr = r.timestamp.split("T")[0];
    if (!grouped[dStr]) grouped[dStr] = {};
    grouped[dStr][r.tipo] = r.timestamp;
  });

  const dates = Object.keys(grouped).sort((a, b) => a.localeCompare(b));
  
  doc.setFont("Helvetica", "normal");
  let y = 96;
  
  dates.forEach(d => {
    if (y > 270) {
      doc.addPage();
      y = 20;
    }
    const day = grouped[d];
    const ent = day["ENTRADA"] ? new Date(day["ENTRADA"]) : null;
    const sInt = day["SAIDA_INTERVALO"] ? new Date(day["SAIDA_INTERVALO"]) : null;
    const rInt = day["RETORNO_INTERVALO"] ? new Date(day["RETORNO_INTERVALO"]) : null;
    const sai = day["SAIDA"] ? new Date(day["SAIDA"]) : null;

    let workedMs = 0;
    if (ent && sInt) workedMs += (sInt - ent);
    if (rInt && sai) workedMs += (sai - rInt);

    const tHours = Math.floor(workedMs / 3600000);
    const tMins = Math.floor((workedMs % 3600000) / 60000);
    const saldoText = `${tHours.toString().padStart(2, '0')}:${tMins.toString().padStart(2, '0')}`;

    doc.text(formatDate(d), 17, y);
    doc.text(ent ? formatTime(ent) : "-", 52, y);
    doc.text(sInt ? formatTime(sInt) : "-", 82, y);
    doc.text(rInt ? formatTime(rInt) : "-", 112, y);
    doc.text(sai ? formatTime(sai) : "-", 142, y);
    doc.text(saldoText, 172, y);

    // separator line
    doc.setDrawColor(230, 230, 230);
    doc.line(15, y+2, 195, y+2);
    y += 8;
  });

  // Footer & Signature conformidade Portaria 671
  if (y > 240) {
    doc.addPage();
    y = 30;
  }

  y += 10;
  doc.setFont("Helvetica", "bold");
  doc.text("ASSINATURA DO COLABORADOR E CERTIFICAÇÃO DIGITAL", 15, y);
  
  y += 8;
  doc.setFont("Helvetica", "normal");
  doc.setFontSize(8);
  const cryptoHash = await calcularHashSha256(records.map(r => r.hash).join(""));
  doc.text(`Hash de Integridade (Portaria 671): ${cryptoHash}`, 15, y);
  
  y += 20;
  doc.line(15, y, 100, y);
  doc.line(110, y, 195, y);
  y += 4;
  doc.text("Assinatura do Colaborador(a)", 40, y);
  doc.text("Assinatura Cacau Show / Gestor", 135, y);

  doc.save(`Espelho_Ponto_${currentUser.nome}_${new Date().getMonth() + 1}.pdf`);
}
