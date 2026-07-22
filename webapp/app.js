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
  owner: ["registro", "dashboard", "historico", "mensal", "auditoria", "faca-amigos", "colaboradores", "conferencia-nfe", "inventario-estoque", "boletos", "auditoria-boletos", "configuracoes"],
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

      // Carregar lista de colaboradores cadastrados
      await carregarColaboradores();

      // Carregar NF-es do servidor
      try {
        const resNfs = await fetch(`${API_BASE}/nfs`);
        if (resNfs.ok) {
          const dataNfs = await resNfs.json();
          const serverNfs = {};
          dataNfs.forEach(nf => {
            if (nf.info && nf.info.rawEmissaoDate) {
              nf.info.rawEmissaoDate = new Date(nf.info.rawEmissaoDate);
            }
            if (nf.products) {
              nf.products.forEach(p => {
                if (p.validade) p.validade = new Date(p.validade);
              });
            }
            serverNfs[nf.numero + '_' + (nf.info.targetStore || currentStore)] = { info: nf.info, products: nf.products };
          });
          importedNfs = serverNfs;
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
function aplicarTema(theme) {
  let temaReal = theme;
  if (theme === "auto") {
    temaReal = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  document.documentElement.setAttribute("data-theme", temaReal);
  const themeSelect = document.getElementById("config-theme-select");
  if (themeSelect) themeSelect.value = theme;
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

// Escutar mudanças de tema do sistema operacional se configurado como auto
window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
  if (config.theme === "auto" || !config.theme) {
    aplicarTema("auto");
  }
});

function carregarConfiguracoes() {
  config = carregarJSON(CONFIG_KEY, {
    linkGrupo: "",
    theme: "auto",
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

  // Aplicar Tema
  aplicarTema(config.theme || "auto");

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

document.getElementById("btn-tema").addEventListener("click", () => {
  const atual = document.documentElement.getAttribute("data-theme") ||
    (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  const novo = atual === "dark" ? "light" : "dark";
  aplicarTema(novo);
  config.theme = novo;
  localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
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

  inscreverPushNotificacoes();

  // Interceptar login de owner para mostrar a seleção de módulos
  if (currentUser.role === "owner") {
    // Configurar o botão da topbar
    const btnTopbar = document.getElementById("btn-topbar-trocar-modulo");
    if (btnTopbar) btnTopbar.classList.remove("hidden");

    const ultimoModulo = localStorage.getItem("ultimoModuloOwner");
    if (ultimoModulo) {
      iniciarModuloBase(ultimoModulo);
    } else {
      document.getElementById("module-selection-overlay").classList.remove("hidden");
      appEl.classList.add("hidden");
    }
    return;
  } else {
    const btnTopbar = document.getElementById("btn-topbar-trocar-modulo");
    if (btnTopbar) btnTopbar.classList.add("hidden");
  }

  // Para outros perfis, prossegue normalmente
  iniciarModuloBase();
}

function iniciarModuloBase(moduloOpcional) {
  document.getElementById("module-selection-overlay").classList.add("hidden");
  appEl.classList.remove("hidden");

  document.getElementById("user-badge").textContent = currentUser.nome;

  let tabsPermitidas = [...TABS_POR_ROLE[currentUser.role]];

  // Se for owner, sobrescrever as abas permitidas de acordo com o módulo escolhido
  if (currentUser.role === "owner" && moduloOpcional) {
    localStorage.setItem("ultimoModuloOwner", moduloOpcional);
    if (moduloOpcional === "cacau-show") {
      tabsPermitidas = ["registro", "dashboard", "historico", "mensal", "conferencia-nfe", "inventario-estoque", "boletos", "auditoria", "colaboradores", "auditoria-boletos", "configuracoes"];
      document.getElementById("btn-trocar-modulo").classList.remove("hidden");
    } else if (moduloOpcional === "faca-amigos") {
      tabsPermitidas = ["faca-amigos", "configuracoes"];
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
  const PANELS_HIDDEN_BY_DEFAULT = ["auditoria", "faca-amigos", "conferencia-nfe", "inventario-estoque", "auditoria-boletos", "configuracoes"];

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
  activeBtn.classList.add("active");
  activeBtn.setAttribute("aria-selected", "true");
  activeBtn.setAttribute("tabindex", "0");

  const activePanel = document.getElementById("tab-" + tabName);
  activePanel.classList.remove("hidden"); // ← garante que hidden seja removido
  activePanel.classList.add("active");

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
  if (tabName === "boletos") carregarBoletosServidor();
  if (tabName === "auditoria-boletos") carregarBoletosServidor();
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
  const loginSelect = document.getElementById("login-select");
  if (!loginSelect) return;
  const valAnterior = loginSelect.value;
  loginSelect.innerHTML = `<option value="" disabled selected>Selecione seu nome...</option>`;
  USERS.forEach(u => {
    const opt = document.createElement("option");
    opt.value = u.nome;
    opt.textContent = u.nome;
    loginSelect.appendChild(opt);
  });
  if (valAnterior) loginSelect.value = valAnterior;

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
let nfSearchQuery = '';
let html5QrCodeNf = null;
let currentStore = '9175';
const today = new Date();
const formattedTodayStr = today.toLocaleDateString('pt-BR');

function inicializarImportedNfs() {
  const salvas = carregarJSON("cacaushow_imported_nfs", {});
  const agora = new Date().getTime();
  const limpas = {};
  
  for (const numNF in salvas) {
    const nf = salvas[numNF];
    if (nf.info && nf.info.concluidaEm) {
      const tempoConclusao = new Date(nf.info.concluidaEm).getTime();
      if (agora - tempoConclusao > 24 * 60 * 60 * 1000) {
        continue;
      }
    }
    if (nf.products) {
      nf.products.forEach(p => {
        if (p.validade) p.validade = new Date(p.validade);
      });
    }
    if (nf.info && nf.info.rawEmissaoDate) {
      nf.info.rawEmissaoDate = new Date(nf.info.rawEmissaoDate);
    }
    limpas[numNF] = nf;
  }
  
  importedNfs = limpas;
  localStorage.setItem("cacaushow_imported_nfs", JSON.stringify(importedNfs));
  
  const keys = Object.keys(importedNfs);
  if (keys.length > 0 && !activeNfNumber) {
    activeNfNumber = keys[0];
  }
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

function saveNotificationPrefs(prefs) {
  localStorage.setItem(NOTIF_PREFS_KEY, JSON.stringify(prefs));
  showToast("Preferências de notificações salvas com sucesso!", "sucesso");
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

  if (canal === "push") {
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
      canal: canal
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
  const dis = !isOwner ? "disabled" : "";
  const fade = !isOwner ? "opacity: 0.5;" : "";
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
        <label class="flex items-center gap-1">
          <input type="radio" name="notif-${notifType}-${role}-channel" value="push" class="notif-channel" data-type="${notifType}" data-role="${role}" ${dis} style="${fade}" />
          <span style="font-size: 0.68rem;">Push</span>
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
    "divergencia": { title: "Divergência de Fundo de Caixa", desc: "Aviso de diferença no fechamento/abertura" }
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

      const channel = prefs[notifType][`${role}_ch`] || "email";
      const radio = document.querySelector(`input.notif-channel[name="notif-${notifType}-${role}-channel"][value="${channel}"]`);
      if (radio) radio.checked = true;
    });
  });
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

    // Ler todos os checkboxes e montar o objeto de preferências
    Object.keys(DEFAULT_NOTIF_PREFS).forEach(notifType => {
      const colab = document.getElementById(`notif-${notifType}-colab`);
      const lider = document.getElementById(`notif-${notifType}-lider`);
      const owner = document.getElementById(`notif-${notifType}-owner`);

      prefs[notifType] = {
        colab: colab ? colab.checked : true,
        lider: lider ? lider.checked : true,
        owner: owner ? owner.checked : true
      };
    });

    saveNotificationPrefs(prefs);
  });
}

document.addEventListener('DOMContentLoaded', () => {
  inicializarAutosaveForm();
  registrarLimparErroAoDigitar();
  inicializarImportedNfs();
  inicializarBoletos();
  renderNotificationTable();
  setupNotificationEvents();
  
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
  if (!files || files.length === 0) return;

  const infoEl = document.getElementById('nf-file-info');
  if (infoEl) {
    infoEl.classList.remove('hidden');
    infoEl.textContent = `Processando ${files.length} arquivo(s)...`;
    infoEl.className = "mt-3 text-xs text-brand-300 font-mono";
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

    if (processedCount === files.length) {
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

    const targetStore = detectStoreFromRazaoSocial(`${xNomeDest} ${cnpjDest}`) || currentStore;

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
      valorTotal: valorTotal
    };

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
          if (callback) callback('duplicate');
          else showToast(`A NF-e Nº ${nNF} já foi importada anteriormente e foi ignorada.`, 'erro');
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
      if (isDuplicate) {
        if (callback) callback('duplicate');
        else showToast(`A NF-e Nº ${nNF} já foi importada anteriormente e foi ignorada.`, 'erro');
        return;
      }
      importedNfs[nNF + '_' + targetStore] = { info, products: productsList };
      localStorage.setItem("cacaushow_imported_nfs", JSON.stringify(importedNfs));
      activeNfNumber = nNF + '_' + targetStore;
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
      targetStore: currentStore
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
          if (callback) callback('duplicate');
          else showToast(`A NF-e Nº ${numNfStr} já foi importada anteriormente e foi ignorada.`, 'erro');
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
      if (isDuplicate) {
        if (callback) callback('duplicate');
        else showToast(`A NF-e Nº ${numNfStr} já foi importada anteriormente e foi ignorada.`, 'erro');
        return;
      }
      importedNfs[numNfStr + '_' + currentStore] = { info, products: productsList };
      localStorage.setItem("cacaushow_imported_nfs", JSON.stringify(importedNfs));
      activeNfNumber = numNfStr + '_' + currentStore;
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
  if (nfKeys.length === 0) return;

  document.getElementById('nf-work-area').classList.add('hidden');
  document.getElementById('nf-cards-gallery-section').classList.remove('hidden');

  const grid = document.getElementById('nf-cards-grid');
  grid.innerHTML = '';

  nfKeys.forEach(numNF => {
    const nfData = importedNfs[numNF];
    const totalItens = nfData.products.length;
    let conferidosCount = 0;
    let faltasCount = 0;

    nfData.products.forEach(p => {
      if (p.countedQty !== '') conferidosCount++;
      const counted = p.countedQty === '' ? 0 : Number(p.countedQty);
      if (counted < p.nfQty) faltasCount += (p.nfQty - counted);
    });

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

    const card = document.createElement('div');
    card.className = `glass-card p-5 rounded-2xl border hover:scale-[1.02] transform transition-all cursor-pointer shadow-lg relative overflow-hidden ${cardBgClass}`;
    card.innerHTML = `
      <div class="flex justify-between items-start mb-3">
        <span class="px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${statusBadgeClass}">${statusText}</span>
        <span class="text-xs text-brand-400 font-mono font-bold"><i class="fa-solid fa-box-archive"></i> ${nfData.info.volumes} CX</span>
      </div>
      <div class="mb-4">
        <div class="text-[10px] text-brand-400 font-bold uppercase tracking-wider">Nota Fiscal</div>
        <div class="text-2xl font-black text-white font-mono">Nº ${nfData.info.numero}</div>
        <div class="text-xs text-brand-300 mt-1 truncate">${nfData.info.fornecedor}</div>
      </div>
      <div class="mt-4 w-full py-2 bg-brand-700 hover:bg-brand-600 text-white font-bold rounded-xl text-xs text-center transition">
        <i class="fa-solid fa-camera mr-1"></i> Iniciar Conferência (Câmera Direct)
      </div>
    `;
    card.addEventListener('click', () => openNfConferenceDirectScanner(numNF));
    grid.appendChild(card);
  });
}

function openNfConferenceDirectScanner(numNF) {
  activeNfNumber = numNF;
  document.getElementById('nf-cards-gallery-section').classList.add('hidden');
  document.getElementById('nf-work-area').classList.remove('hidden');
  renderNfDashboard();

  // Notificar Bruno e Isabella (Push + Email) sobre início da conferência
  notificarGestaoConferencia('inicio', numNF);

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

  let totalItens = nfData.products.length;
  let conferidosCount = 0;
  let faltasCount = 0;

  nfData.products.forEach(p => {
    if (p.countedQty !== '') conferidosCount++;
    const counted = p.countedQty === '' ? 0 : Number(p.countedQty);
    if (counted < p.nfQty) faltasCount += (p.nfQty - counted);
  });

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

  // Notificação via backend API respeitando preferências de canal (Email ou Push)
  const destinatarios = getDestinatariosNotificacao('conferencia_nfe');
  if (destinatarios.length > 0) {
    // Determinar canal de preferência (pega do primeiro destinatário que é owner)
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
  if (activeNfNumber && importedNfs[activeNfNumber]) {
    storeCode = importedNfs[activeNfNumber].info.targetStore || currentStore;
  }
  const storeName = getLojaNomePorCodigo(storeCode);
  const linkGrupo = WHATSAPP_GRUPOS[storeName];

  if (!linkGrupo) {
    showToast(`Nenhum grupo de WhatsApp configurado para a Loja ${storeName}.`, 'erro');
    return;
  }

  let textoMsg = `*Aviso de Conferência de NF-e - Loja ${storeName}*\n`;
  if (activeNfNumber && importedNfs[activeNfNumber]) {
    const nfData = importedNfs[activeNfNumber];
    textoMsg += `NF Nº: ${nfData.info.numero}\n`;
    textoMsg += `Fornecedor: ${nfData.info.fornecedor}\n`;
    textoMsg += `Operador: ${currentUser ? currentUser.nome : 'Colaboradora'}\n\n`;
    
    // Analisar pendências e divergências
    let pendentes = [];
    let divergencias = [];
    
    nfData.products.forEach(p => {
      if (p.countedQty === '') {
        pendentes.push(p);
      } else {
        const counted = Number(p.countedQty);
        if (counted !== p.nfQty) {
          divergencias.push({
            p: p,
            diferenca: counted - p.nfQty
          });
        }
      }
    });

    if (pendentes.length === 0 && divergencias.length === 0) {
      textoMsg += `*Status:* Conferência concluída 100% CONFORME (sem divergências ou pendências).\n`;
    } else {
      textoMsg += `*Status:* Conferência finalizada com pendências/divergências:\n`;
      if (pendentes.length > 0) {
        textoMsg += `\n*Itens não conferidos (Pendentes) (${pendentes.length}):*\n`;
        pendentes.forEach(item => {
          textoMsg += `- Cód ${item.code}: ${item.description} (Qtd Esperada: ${item.nfQty})\n`;
        });
      }
      if (divergencias.length > 0) {
        textoMsg += `\n*Divergências encontradas (${divergencias.length}):*\n`;
        divergencias.forEach(div => {
          const sinal = div.diferenca > 0 ? '+' : '';
          const tipo = div.diferenca > 0 ? 'Sobra' : 'Falta';
          textoMsg += `- Cód ${div.p.code}: ${div.p.description} (${tipo}: ${sinal}${div.diferenca} unidades | Esperado: ${div.p.nfQty}, Contado: ${div.p.countedQty})\n`;
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
  if (!activeNfNumber || !importedNfs[activeNfNumber]) return;
  const currentNf = importedNfs[activeNfNumber];
  document.getElementById('nf-numero').textContent = currentNf.info.numero;
  updateNfStats();
  renderNfTable();
}

function updateNfStats() {
  if (!activeNfNumber || !importedNfs[activeNfNumber]) return;
  const currentNf = importedNfs[activeNfNumber];
  let faltasCount = 0;
  currentNf.products.forEach(p => {
    const counted = p.countedQty === '' ? 0 : Number(p.countedQty);
    if (counted < p.nfQty) faltasCount += (p.nfQty - counted);
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
  if (typeof Html5QrCode === 'undefined') {
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
    html5QrCodeNf = new Html5QrCode("nf-reader");
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
    Html5QrCode.getCameras()
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
      Html5QrCode.getCameras()
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
  let targetNfNumber = activeNfNumber;
  let currentNf = importedNfs[targetNfNumber];
  let p = currentNf ? currentNf.products.find(prod => prod.barras === cleanCode || prod.code === cleanCode) : null;

  if (!p) {
    for (const numNF of Object.keys(importedNfs)) {
      if (numNF !== activeNfNumber) {
        const found = importedNfs[numNF].products.find(prod => prod.barras === cleanCode || prod.code === cleanCode);
        if (found) {
          p = found;
          activeNfNumber = numNF;
          showToast(`⚡ Carga Misturada: NF Nº ${numNF}`, "info");
          break;
        }
      }
    }
  }

  if (p) {
    if (navigator.vibrate) navigator.vibrate(150);
    playBeep('success');
    const currentQty = p.countedQty === '' ? 0 : Number(p.countedQty);
    const newQty = currentQty + 1;
    saveNfQuantity(p.code, newQty.toString());
    
    // Focar no campo de quantidade inventariada do produto bipado
    setTimeout(() => {
      const rowInput = document.querySelector(`input.qty-input[data-code="${p.code}"]`) || document.querySelector('.qty-input');
      if (rowInput) {
        rowInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
        rowInput.focus();
        rowInput.select();
      }
    }, 100);
  } else {
    if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
    playBeep('error');
  }
}

function saveNfQuantity(code, value) {
  if (!activeNfNumber || !importedNfs[activeNfNumber]) return;
  const currentNf = importedNfs[activeNfNumber];
  const p = currentNf.products.find(prod => prod.code === code);
  if (p) {
    p.countedQty = value;
    localStorage.setItem(`nfcnt_${currentStore}_${activeNfNumber}_${code}`, value);
    autoCreditNfProductToInventory(currentNf.info, p);
    updateNfStats();
    renderNfTable();

    // Checar se a conferência desta NF foi totalmente concluída
    let conferidosCount = 0;
    let totalItens = currentNf.products.length;
    currentNf.products.forEach(item => {
      if (item.countedQty !== '') conferidosCount++;
    });
    if (conferidosCount === totalItens && totalItens > 0) {
      if (!currentNf.info.concluidaEm) {
        currentNf.info.concluidaEm = new Date().toISOString();
      }
      if (!currentNf._notificadoConclusao) {
        currentNf._notificadoConclusao = true;
        notificarGestaoConferencia('conclusao', activeNfNumber);
      }
    } else {
      currentNf.info.concluidaEm = null;
      currentNf._notificadoConclusao = false;
    }
    localStorage.setItem("cacaushow_imported_nfs", JSON.stringify(importedNfs));

    // Sincronizar quantidade com o servidor central
    if (API_ONLINE) {
      fetch(`${API_BASE}/nfs/${activeNfNumber}`, {
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
  if (!tbody || !activeNfNumber || !importedNfs[activeNfNumber]) return;
  tbody.innerHTML = '';

  const currentNf = importedNfs[activeNfNumber];
  currentNf.products.forEach(p => {
    const counted = p.countedQty === '' ? null : Number(p.countedQty);
    
    // Determinar status e estilo
    let statusText = 'Pendente';
    let statusColorClass = 'text-orange-500 font-extrabold bg-orange-950/40 px-2 py-1 rounded border border-orange-800'; // Laranja para Pendente (não conferido)
    let rowBgClass = 'bg-orange-950/10 border-orange-900/20';

    if (counted !== null) {
      if (counted === p.nfQty) {
        statusText = 'Conforme';
        statusColorClass = 'text-emerald-400 font-extrabold bg-emerald-950/40 px-2 py-1 rounded border border-emerald-800'; // Verde para Conforme
        rowBgClass = 'bg-emerald-950/5 border-emerald-900/20';
      } else {
        statusText = counted < p.nfQty ? 'Falta' : 'Sobra';
        statusColorClass = 'text-rose-400 font-extrabold bg-rose-950/40 px-2 py-1 rounded border border-rose-800'; // Vermelho para Falta/Sobra (Divergente)
        rowBgClass = 'bg-rose-950/10 border-rose-900/20';
      }
    }

    const tr = document.createElement('tr');
    tr.className = `hover:bg-brand-900/30 transition-all border-b ${rowBgClass}`;
    tr.innerHTML = `
      <td class="py-3 px-4">
        <div class="font-semibold text-brand-100 text-xs">${p.description}</div>
        <div class="text-[10px] text-brand-300 font-mono">Cód: ${p.code} ${p.barras ? `| EAN: ${p.barras}` : ''}</div>
      </td>
      <td class="py-3 px-4 text-center text-xs text-brand-200">${p.validade ? formatDate(p.validade) : '-'}</td>
      <td class="py-3 px-4 text-center text-xs text-brand-300">${p.daysRemaining !== null ? `${p.daysRemaining}d` : '-'}</td>
      <td class="py-3 px-4 text-center font-bold text-xs text-brand-100">${p.nfQty}</td>
      <td class="py-3 px-4 text-center">
        <input type="number" value="${p.countedQty}" placeholder="0" class="nf-qty-input w-16 text-center bg-brand-950 border border-brand-800 text-white rounded py-1 font-bold text-xs" />
      </td>
      <td class="py-3 px-4 text-center text-xs">
        <span class="${statusColorClass}">${statusText}</span>
      </td>
    `;
    const qtyInput = tr.querySelector('.nf-qty-input');
    qtyInput.addEventListener('input', (e) => saveNfQuantity(p.code, e.target.value));
    tbody.appendChild(tr);
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
  const fileInfo = document.getElementById("boleto-file-info");
  if (fileInfo) {
    fileInfo.textContent = `Processando: ${file.name}...`;
    fileInfo.classList.remove("hidden");
  }

  const reader = new FileReader();
  reader.onload = async function(e) {
    try {
      const arrayBuffer = e.target.result;
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      let textContent = "";
      
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const text = await page.getTextContent();
        
        const items = text.items;
        const linesMap = {};
        
        items.forEach(item => {
          const y = Math.round(item.transform[5] * 10) / 10;
          let foundY = Object.keys(linesMap).find(key => Math.abs(parseFloat(key) - y) < 4);
          if (!foundY) {
            foundY = y;
            linesMap[foundY] = [];
          }
          linesMap[foundY].push(item);
        });

        const sortedY = Object.keys(linesMap).sort((a, b) => parseFloat(b) - parseFloat(a));
        sortedY.forEach(y => {
          const lineItems = linesMap[y].sort((a, b) => a.transform[4] - b.transform[4]);
          textContent += lineItems.map(item => item.str).join(" ") + "\n";
        });
      }

      const boletosExtraidos = extrairBoletosDoTexto(textContent);
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

function extrairBoletosDoTexto(text) {
  const boletosExtraidos = [];
  const lines = text.split('\n');

  lines.forEach(line => {
    const cleanLine = line.replace(/\s+/g, ' ').trim();
    if (!cleanLine) return;

    // Apenas extrair linhas relacionadas a Débito/Debito
    if (!cleanLine.toLowerCase().includes("debito") && !cleanLine.toLowerCase().includes("débito")) {
      return;
    }

    const dateRegex = /\b(\d{2})\/(\d{2})\/(\d{2,4})\b/;
    const dateMatch = cleanLine.match(dateRegex);
    
    const valueRegex = /\b\d{1,3}(?:[.,]\d{3})*[.,]\d{2}\b/;
    const valueMatch = cleanLine.match(valueRegex);

    if (dateMatch && valueMatch) {
      let vencimento = dateMatch[0];
      if (dateMatch[3].length === 2) {
        vencimento = `${dateMatch[1]}/${dateMatch[2]}/20${dateMatch[3]}`;
      }

      const valor = parseMoedaPdf(valueMatch[0]);

      const docRegex = /\b(\d{6,12}\s*-\s*[a-zA-Z0-9]{2,3})\b/i;
      const docMatch = cleanLine.match(docRegex);
      const documento = docMatch ? docMatch[1].replace(/\s+/g, '') : Math.floor(100000 + Math.random() * 900000).toString() + "-001";

      let descricao = "Duplicata Cacau Show";
      const descMatch = cleanLine.match(/(?:MATRIZ|MANAUS|LTDA|COMUNICACAO)\s+(.*?)\s+\b\d\/\d\b/i);
      if (descMatch && descMatch[1]) {
        descricao = descMatch[1].trim();
      } else {
        const codeTextMatch = cleanLine.match(/\b\d{7,10}-\s*[A-Z_0-9]+/i);
        if (codeTextMatch) {
          descricao = codeTextMatch[0].replace(/\s+/g, '');
        }
      }

      let loja = "9175";
      if (cleanLine.includes("4304") || cleanLine.toLowerCase().includes("icoaraci")) {
        loja = "4304";
      } else if (cleanLine.includes("9201") || cleanLine.toLowerCase().includes("mario") || cleanLine.toLowerCase().includes("mário")) {
        loja = "9201";
      }

      boletosExtraidos.push({
        id: uid(),
        documento,
        loja,
        descricao,
        vencimento,
        valor,
        status: "Aberto"
      });
    }
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

  if (filtered.length === 0) {
    tbody.innerHTML = `
      <tr class="text-brand-400 text-center">
        <td colspan="7" class="py-8">Nenhum boleto encontrado para os filtros selecionados.</td>
      </tr>
    `;
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

    tr.innerHTML = `
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
}

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
  const boletosAgrupados = {};
  boletos.forEach(b => {
    const parts = b.documento.split("-");
    const baseDoc = parts[0].trim();
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
      const diff = Math.abs(valorNfe - valorBoletos);
      
      const nfeStore = nfe.info.targetStore || "9175";
      const boletoStores = Array.from(bg.lojas);
      const storeMismatch = !boletoStores.includes(nfeStore);

      if (diff > 0.05) {
        isDivergent = true;
        divergenciasCount++;
        statusText = `Divergência de Valor`;
        descDivergencia = `Diferença de ${formatBRL(diff)}`;
        statusClass = "bg-red-950 text-red-400 border border-red-900/40";
        notificarDivergenciaAuditoria(item.loja, nfe.info.numero, valorNfe, bg.documentosOriginais.join(", "), valorBoletos, descDivergencia);
      } else if (storeMismatch) {
        isDivergent = true;
        divergenciasCount++;
        statusText = "Loja Divergente";
        descDivergencia = `NF-e na loja ${nfeStore}, Títulos na loja ${boletoStores.join(', ')}`;
        statusClass = "bg-orange-950 text-orange-400 border border-orange-900/40";
        notificarDivergenciaAuditoria(item.loja, nfe.info.numero, valorNfe, bg.documentosOriginais.join(", "), valorBoletos, descDivergencia);
      } else {
        statusText = "Conciliado";
        statusClass = "bg-emerald-950 text-emerald-400 border border-emerald-900/50";
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
  const configThemeSelect = document.getElementById("config-theme-select");
  if (configThemeSelect) configThemeSelect.value = config.theme || "auto";
  
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
  // Alteração de Tema no Painel
  const themeSelect = document.getElementById("config-theme-select");
  if (themeSelect) {
    themeSelect.addEventListener("change", (e) => {
      const val = e.target.value;
      aplicarTema(val);
      config.theme = val;
      localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
      showToast("Tema atualizado com sucesso!", "sucesso");
    });
  }

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
});
