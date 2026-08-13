// Painel de gerenciamento da integração iFood: visão geral por loja
// (configurada ou não, última sincronização), configuração de credenciais
// e histórico de itens pareados/sincronizados. Reaproveita os endpoints
// já existentes em routes/ifood-config.js e routes/ifood-sync.js.

const API_BASE = window.location.protocol === "file:"
  ? "http://localhost:5000/api"
  : "/api";

const LOJAS = [
  { valor: "marambaia", nome: "Marambaia" },
  { valor: "icoaraci", nome: "Icoaraci" },
  { valor: "mario-covas", nome: "Mário Covas" }
];

let overviewPorLoja = new Map();
let lojaSelecionada = null;

function nomeLoja(valor) {
  const loja = LOJAS.find(l => l.valor === valor);
  return loja ? loja.nome : valor;
}

function formatarData(iso) {
  if (!iso) return "Nunca sincronizada";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("pt-BR");
}

function mostrarFeedback(elId, mensagem, tipo = "sucesso") {
  const el = document.getElementById(elId);
  el.textContent = mensagem;
  el.className = `feedback ${tipo}`;
  setTimeout(() => { el.style.display = "none"; }, 5000);
}

// ---------------------------------------------------------------------
// Visão geral (grid de lojas)
// ---------------------------------------------------------------------

async function carregarOverview() {
  const resumoEl = document.getElementById("resumo-geral");
  try {
    const res = await fetch(`${API_BASE}/ifood/overview`);
    const json = await res.json();
    const dados = (json.success && json.data) ? json.data : [];

    overviewPorLoja = new Map(dados.map(d => [d.loja, d]));

    const configuradas = dados.filter(d => d.configurado).length;
    resumoEl.textContent = `${configuradas} de ${LOJAS.length} lojas configuradas`;
  } catch (err) {
    console.error("Erro ao carregar visão geral:", err);
    overviewPorLoja = new Map();
    resumoEl.textContent = "Erro ao carregar visão geral. Exibindo lojas sem dados de sincronização.";
  }
  renderizarGrid();
}

function renderizarGrid() {
  const grid = document.getElementById("grid-lojas");
  grid.innerHTML = "";

  LOJAS.forEach(loja => {
    const info = overviewPorLoja.get(loja.valor);
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
    card.className = "card-loja" + (lojaSelecionada === loja.valor ? " selecionada" : "");
    card.innerHTML = `
      <div class="nome">${loja.nome}</div>
      ${badgeHtml}
      <div class="linha-info">
        <span><i class="fa-regular fa-clock"></i> ${formatarData(info ? info.ultimaSincronizacao : null)}</span>
      </div>
    `;
    card.addEventListener("click", () => selecionarLoja(loja.valor));
    grid.appendChild(card);
  });
}

// ---------------------------------------------------------------------
// Seleção de loja / painel de detalhe
// ---------------------------------------------------------------------

function selecionarLoja(valor) {
  lojaSelecionada = valor;
  renderizarGrid();

  document.getElementById("painel-detalhe").style.display = "block";
  document.getElementById("detalhe-nome-loja").textContent = nomeLoja(valor);
  document.getElementById("painel-detalhe").scrollIntoView({ behavior: "smooth", block: "nearest" });

  carregarSyncStatus();
  carregarConfig();
}

function ligarAbas() {
  document.querySelectorAll("nav.abas button").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("nav.abas button").forEach(b => b.classList.remove("ativa"));
      document.querySelectorAll(".conteudo-aba").forEach(p => p.classList.remove("ativa"));
      btn.classList.add("ativa");
      document.getElementById(`aba-${btn.dataset.aba}`).classList.add("ativa");
    });
  });
}

// ---------------------------------------------------------------------
// Sincronização
// ---------------------------------------------------------------------

async function carregarSyncStatus() {
  const tbody = document.getElementById("tabela-sync-body");
  const vazioEl = document.getElementById("sync-vazio");
  const resumoEl = document.getElementById("sync-resumo");
  tbody.innerHTML = "";
  vazioEl.style.display = "none";
  resumoEl.textContent = "Carregando...";

  try {
    const res = await fetch(`${API_BASE}/ifood/sync-status?loja=${encodeURIComponent(lojaSelecionada)}`);
    const dados = await res.json();

    if (!Array.isArray(dados) || dados.length === 0) {
      vazioEl.style.display = "block";
      resumoEl.textContent = "Nenhum item sincronizado";
      return;
    }

    const ativos = dados.filter(i => i.status_enviado === "AVAILABLE").length;
    resumoEl.textContent = `${dados.length} itens pareados — ${ativos} ativos, ${dados.length - ativos} pausados`;

    dados.forEach(item => {
      const isAtivo = item.status_enviado === "AVAILABLE";
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${item.descricao || "--"}</td>
        <td>${item.codProdutoLocal || "--"}</td>
        <td>${item.codProdutoIfood || "--"}</td>
        <td><span class="badge ${isAtivo ? "ok" : "pausado"}">${isAtivo ? "Ativo" : "Pausado"}</span></td>
      `;
      tbody.appendChild(tr);
    });
  } catch (err) {
    console.error("Erro ao carregar status de sincronização:", err);
    resumoEl.textContent = "Erro ao carregar dados.";
  }
}

async function sincronizarAgora() {
  const btn = document.getElementById("btn-sincronizar");
  const originalHtml = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Sincronizando...';

  try {
    const res = await fetch(`${API_BASE}/ifood/sync-force`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ loja: lojaSelecionada })
    });
    const json = await res.json();

    if (res.ok && json.success) {
      mostrarFeedback("feedback-sync", `Sincronização concluída! ${json.count} itens pareados.`);
      await Promise.all([carregarSyncStatus(), carregarOverview()]);
    } else {
      mostrarFeedback("feedback-sync", json.error || "Falha na sincronização.", "erro");
    }
  } catch (err) {
    console.error(err);
    mostrarFeedback("feedback-sync", "Erro de conexão ao sincronizar.", "erro");
  } finally {
    btn.disabled = false;
    btn.innerHTML = originalHtml;
  }
}

// ---------------------------------------------------------------------
// Configuração
// ---------------------------------------------------------------------

async function carregarConfig() {
  const inputMerchantId = document.getElementById("input-merchant-id");
  const inputClientId = document.getElementById("input-client-id");
  const inputClientSecret = document.getElementById("input-client-secret");

  inputMerchantId.value = "";
  inputClientId.value = "";
  inputClientSecret.value = "";
  inputClientSecret.placeholder = "Seu Client Secret";

  try {
    const res = await fetch(`${API_BASE}/ifood-config?loja=${encodeURIComponent(lojaSelecionada)}`);
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

async function salvarConfig(e) {
  e.preventDefault();

  const merchantId = document.getElementById("input-merchant-id").value.trim();
  const clientId = document.getElementById("input-client-id").value.trim();
  const clientSecret = document.getElementById("input-client-secret").value.trim();

  if (!lojaSelecionada || !merchantId || !clientId) {
    mostrarFeedback("feedback-config", "Preencha os campos obrigatórios.", "erro");
    return;
  }

  const btn = document.getElementById("btn-salvar-config");
  const originalHtml = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Salvando...';

  try {
    const res = await fetch(`${API_BASE}/ifood-config`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ loja: lojaSelecionada, merchantId, clientId, clientSecret })
    });
    const json = await res.json();

    if (json.success) {
      mostrarFeedback("feedback-config", "Configuração salva com sucesso!");
      document.getElementById("input-client-secret").value = "";
      document.getElementById("input-client-secret").placeholder = "•••••••• (Preenchido)";
      await carregarOverview();
    } else {
      mostrarFeedback("feedback-config", json.error || "Erro ao salvar as configurações.", "erro");
    }
  } catch (err) {
    console.error(err);
    mostrarFeedback("feedback-config", "Erro de conexão ao salvar.", "erro");
  } finally {
    btn.disabled = false;
    btn.innerHTML = originalHtml;
  }
}

// ---------------------------------------------------------------------
// Inicialização
// ---------------------------------------------------------------------

document.addEventListener("DOMContentLoaded", () => {
  ligarAbas();
  document.getElementById("btn-sincronizar").addEventListener("click", sincronizarAgora);
  document.getElementById("form-config").addEventListener("submit", salvarConfig);
  carregarOverview();
});
