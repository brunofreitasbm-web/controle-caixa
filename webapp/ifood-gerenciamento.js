// Painel de gerenciamento da integração iFood: visão geral por loja
// (configurada ou não, última sincronização), configuração de credenciais
// e histórico de itens pareados/sincronizados. Reaproveita os endpoints
// já existentes em routes/ifood-config.js e routes/ifood-sync.js.

const IFOOD_API_BASE = window.location.protocol === "file:"
  ? "http://localhost:5000/api"
  : "/api";

const IFOOD_LOJAS = [
  { valor: "marambaia", nome: "Marambaia" },
  { valor: "icoaraci", nome: "Icoaraci" },
  { valor: "mario-covas", nome: "Mário Covas" }
];

let ifoodOverviewPorLoja = new Map();
let ifoodLojaSelecionada = null;

function ifoodNomeLoja(valor) {
  const loja = IFOOD_LOJAS.find(l => l.valor === valor);
  return loja ? loja.nome : valor;
}

function ifoodFormatData(iso) {
  if (!iso) return "Nunca sincronizada";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("pt-BR");
}

function ifoodMostrarFeedback(elId, mensagem, tipo = "sucesso") {
  const el = document.getElementById(elId);
  if (!el) return;
  el.textContent = mensagem;
  el.className = `feedback ${tipo}`;
  el.style.display = "block";
  setTimeout(() => { el.style.display = "none"; }, 5000);
}

// ---------------------------------------------------------------------
// Visão geral (grid de lojas)
// ---------------------------------------------------------------------

async function carregarOverviewIfood() {
  const resumoEl = document.getElementById("resumo-geral");
  try {
    const res = await fetch(`${IFOOD_API_BASE}/ifood/overview`);
    const json = await res.json();
    const dados = (json.success && json.data) ? json.data : [];

    ifoodOverviewPorLoja = new Map(dados.map(d => [d.loja, d]));

    const configuradas = dados.filter(d => d.configurado).length;
    if (resumoEl) resumoEl.textContent = `${configuradas} de ${IFOOD_LOJAS.length} lojas configuradas`;
  } catch (err) {
    console.error("Erro ao carregar visão geral:", err);
    ifoodOverviewPorLoja = new Map();
    if (resumoEl) resumoEl.textContent = "Erro ao carregar visão geral. Exibindo lojas sem dados de sincronização.";
  }
  renderizarGridIfood();
  if (!ifoodLojaSelecionada && IFOOD_LOJAS.length > 0) {
    selecionarLojaIfood(IFOOD_LOJAS[0].valor, false);
  }
}

function renderizarGridIfood() {
  const grid = document.getElementById("grid-lojas");
  if (!grid) return;
  grid.innerHTML = "";

  IFOOD_LOJAS.forEach(loja => {
    const info = ifoodOverviewPorLoja.get(loja.valor);
    const configurado = Boolean(info && info.configurado);

    let badgeHtml;
    if (!configurado) {
      badgeHtml = `<span class="badge pendente">Não configurada</span>`;
    } else if (info.totalItens > 0) {
      badgeHtml = `<span class="badge ok">${info.itensAtivos}/${info.totalItens} ativos</span>`;
    } else {
      badgeHtml = `<span class="badge pausado">Sem sincronização</span>`;
    }

    const card = document.createElement("div");
    card.className = "card-loja" + (ifoodLojaSelecionada === loja.valor ? " selecionada" : "");
    card.innerHTML = `
      <div class="nome">${loja.nome}</div>
      ${badgeHtml}
      <div class="linha-info">
        <span><i class="fa-regular fa-clock"></i> ${ifoodFormatData(info ? info.ultimaSincronizacao : null)}</span>
      </div>
    `;
    card.addEventListener("click", () => selecionarLojaIfood(loja.valor, true));
    grid.appendChild(card);
  });
}

// ---------------------------------------------------------------------
// Seleção de loja / painel de detalhe
// ---------------------------------------------------------------------

function selecionarLojaIfood(valor, userAction = false) {
  ifoodLojaSelecionada = valor;
  renderizarGridIfood();

  const painelDetalhe = document.getElementById("painel-detalhe");
  const detalheNome = document.getElementById("detalhe-nome-loja");
  if (painelDetalhe) painelDetalhe.style.display = "block";
  if (detalheNome) detalheNome.textContent = ifoodNomeLoja(valor);
  if (userAction && painelDetalhe) {
    painelDetalhe.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  carregarSyncStatusIfood();
  carregarConfigIfood();
}

function ligarAbasIfood() {
  document.querySelectorAll("nav.abas-ifood button, nav.abas button").forEach(btn => {
    if (btn.dataset.boundTab) return;
    btn.dataset.boundTab = "true";
    btn.addEventListener("click", () => {
      document.querySelectorAll("nav.abas-ifood button, nav.abas button").forEach(b => b.classList.remove("ativa"));
      document.querySelectorAll(".conteudo-aba").forEach(p => p.classList.remove("ativa"));
      btn.classList.add("ativa");
      const alvoAba = document.getElementById(`aba-${btn.dataset.aba}`);
      if (alvoAba) alvoAba.classList.add("ativa");
    });
  });
}

// ---------------------------------------------------------------------
// Sincronização
// ---------------------------------------------------------------------

async function carregarSyncStatusIfood() {
  const tbody = document.getElementById("tabela-sync-body");
  const vazioEl = document.getElementById("sync-vazio");
  const resumoEl = document.getElementById("sync-resumo");
  if (!tbody || !vazioEl || !resumoEl) return;

  tbody.innerHTML = "";
  vazioEl.style.display = "none";
  resumoEl.textContent = "Carregando...";

  try {
    const res = await fetch(`${IFOOD_API_BASE}/ifood/sync-status?loja=${encodeURIComponent(ifoodLojaSelecionada)}`);
    const json = await res.json();

    if (!res.ok || (json && json.error)) {
      resumoEl.textContent = "Erro ao carregar dados";
      vazioEl.style.display = "block";
      vazioEl.textContent = (json && json.error) ? json.error : "Erro de resposta da API.";
      return;
    }

    const dados = Array.isArray(json) ? json : (json.data || []);

    if (!Array.isArray(dados) || dados.length === 0) {
      vazioEl.style.display = "block";
      vazioEl.textContent = "Nenhuma sincronização registrada para esta loja ainda.";
      resumoEl.textContent = "Nenhum item sincronizado";
      return;
    }

    const ativos = dados.filter(i => i.status_enviado === "AVAILABLE").length;
    resumoEl.textContent = `${dados.length} itens pareados — ${ativos} ativos, ${dados.length - ativos} pausados`;

    dados.forEach(item => {
      const isAtivo = item.status_enviado === "AVAILABLE";
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td class="p-3">${item.descricao || "--"}</td>
        <td class="p-3">${item.codProdutoLocal || "--"}</td>
        <td class="p-3">${item.codProdutoIfood || "--"}</td>
        <td class="p-3"><span class="badge ${isAtivo ? "ok" : "pausado"}">${isAtivo ? "Ativo" : "Pausado"}</span></td>
      `;
      tbody.appendChild(tr);
    });
  } catch (err) {
    console.error("Erro ao carregar status de sincronização:", err);
    resumoEl.textContent = "Erro ao carregar dados.";
    vazioEl.style.display = "block";
    vazioEl.textContent = "Erro de conexão ao buscar status de sincronização.";
  }
}

async function sincronizarAgoraIfood() {
  const btn = document.getElementById("btn-sincronizar");
  if (!btn) return;
  const originalHtml = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Sincronizando...';

  try {
    const res = await fetch(`${IFOOD_API_BASE}/ifood/sync-force`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ loja: ifoodLojaSelecionada })
    });
    const json = await res.json();

    if (res.ok && json.success) {
      ifoodMostrarFeedback("feedback-sync", `Sincronização concluída! ${json.count} itens pareados.`);
      await Promise.all([carregarSyncStatusIfood(), carregarOverviewIfood()]);
    } else {
      ifoodMostrarFeedback("feedback-sync", json.error || "Falha na sincronização.", "erro");
    }
  } catch (err) {
    console.error(err);
    ifoodMostrarFeedback("feedback-sync", "Erro de conexão ao sincronizar.", "erro");
  } finally {
    btn.disabled = false;
    btn.innerHTML = originalHtml;
  }
}

// ---------------------------------------------------------------------
// Configuração
// ---------------------------------------------------------------------

async function carregarConfigIfood() {
  const inputMerchantId = document.getElementById("input-merchant-id");
  const inputClientId = document.getElementById("input-client-id");
  const inputClientSecret = document.getElementById("input-client-secret");

  if (!inputMerchantId || !inputClientId || !inputClientSecret) return;

  inputMerchantId.value = "";
  inputClientId.value = "";
  inputClientSecret.value = "";
  inputClientSecret.placeholder = "Seu Client Secret";

  try {
    const res = await fetch(`${IFOOD_API_BASE}/ifood-config?loja=${encodeURIComponent(ifoodLojaSelecionada)}`);
    const json = await res.json();

    if (json.success && json.data) {
      inputMerchantId.value = json.data.merchantId || "";
      inputClientId.value = json.data.clientId || "";
      inputClientSecret.placeholder = "•••••••• (Preenchido)";
    }
  } catch (err) {
    console.error("Erro ao buscar configuração:", err);
  }
}

async function salvarConfigIfood(e) {
  e.preventDefault();

  const merchantId = document.getElementById("input-merchant-id").value.trim();
  const clientId = document.getElementById("input-client-id").value.trim();
  const clientSecret = document.getElementById("input-client-secret").value.trim();

  if (!ifoodLojaSelecionada || !merchantId || !clientId) {
    ifoodMostrarFeedback("feedback-config", "Preencha os campos obrigatórios.", "erro");
    return;
  }

  const btn = document.getElementById("btn-salvar-config");
  if (!btn) return;
  const originalHtml = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Salvando...';

  try {
    const res = await fetch(`${IFOOD_API_BASE}/ifood-config`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ loja: ifoodLojaSelecionada, merchantId, clientId, clientSecret })
    });
    const json = await res.json();

    if (json.success) {
      ifoodMostrarFeedback("feedback-config", "Configuração salva com sucesso!");
      document.getElementById("input-client-secret").value = "";
      document.getElementById("input-client-secret").placeholder = "•••••••• (Preenchido)";
      await carregarOverviewIfood();
    } else {
      ifoodMostrarFeedback("feedback-config", json.error || "Erro ao salvar as configurações.", "erro");
    }
  } catch (err) {
    console.error(err);
    ifoodMostrarFeedback("feedback-config", "Erro de conexão ao salvar.", "erro");
  } finally {
    btn.disabled = false;
    btn.innerHTML = originalHtml;
  }
}

// ---------------------------------------------------------------------
// Inicialização
// ---------------------------------------------------------------------

function inicializarIfoodGerenciamento() {
  ligarAbasIfood();
  const btnSync = document.getElementById("btn-sincronizar");
  if (btnSync && !btnSync.dataset.bound) {
    btnSync.dataset.bound = "true";
    btnSync.addEventListener("click", sincronizarAgoraIfood);
  }
  const formCfg = document.getElementById("form-config");
  if (formCfg && !formCfg.dataset.bound) {
    formCfg.dataset.bound = "true";
    formCfg.addEventListener("submit", salvarConfigIfood);
  }
  carregarOverviewIfood();
}

document.addEventListener("DOMContentLoaded", () => {
  inicializarIfoodGerenciamento();
});
