// ==========================================================================
// PAINEL INSIGHTS IA — visão gerencial concentrada
// ==========================================================================
// Reúne numa aba só o que a IA apura a partir dos dados que já estão no
// sistema. Restrito a Owner e Líder de Operações (ver TABS_POR_ROLE em
// app.js).
//
// Cada bloco é independente: um erro de rede em um cartão não derruba os
// outros. Todos os endpoints são de leitura — nada aqui altera boleto,
// bonificação, escala ou meta.
//
// Documentação da camada: docs/IA.md
// ==========================================================================

const IA_LOJAS_CACAU = ["Marambaia", "Icoaraci", "Mário Covas"];

// Guarda o que já foi carregado na sessão para não refazer a chamada a cada
// troca de aba — o cache do servidor também protege a cota, mas evitar o
// round-trip deixa a navegação instantânea.
const iaCarregado = {};

function iaCompetenciaAtual() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function iaEscapar(t) {
  const div = document.createElement("div");
  div.textContent = t == null ? "" : String(t);
  return div.innerHTML;
}

function iaSpinner(msg = "Consultando a IA...") {
  return `<div class="ia-loading"><i class="fa-solid fa-circle-notch fa-spin"></i> ${iaEscapar(msg)}</div>`;
}

function iaErro(msg) {
  return `<div class="ia-erro"><i class="fa-solid fa-triangle-exclamation"></i> ${iaEscapar(msg)}</div>`;
}

// Deixa explícito de onde veio o texto. Se a cota estourou e o conteúdo veio
// do fallback determinístico, quem lê precisa saber — um resumo mais seco não
// é um defeito, mas não pode se passar por análise da IA.
function iaSelo(fonte, cache) {
  if (fonte === "ia") {
    return `<span class="ia-selo ia-selo-ok"><i class="fa-solid fa-wand-magic-sparkles"></i> IA${cache ? " (em cache)" : ""}</span>`;
  }
  if (fonte === "fallback") {
    return `<span class="ia-selo ia-selo-alerta"><i class="fa-solid fa-calculator"></i> Resumo automático (IA indisponível)</span>`;
  }
  if (fonte === "dados-insuficientes") {
    return `<span class="ia-selo ia-selo-alerta"><i class="fa-solid fa-hourglass-half"></i> Dados insuficientes</span>`;
  }
  if (fonte === "sem-dados" || fonte === "sem-achados") {
    return `<span class="ia-selo ia-selo-neutro"><i class="fa-solid fa-circle-info"></i> Sem dados no período</span>`;
  }
  return "";
}

async function iaBuscar(url) {
  const res = await fetch(`${API_BASE}${url}`);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `Erro ${res.status}`);
  return body;
}

// --------------------------------------------------------------------------
// ITEM 2 — Briefing diário
// --------------------------------------------------------------------------
async function iaCarregarBriefing(forcar = false) {
  const el = document.getElementById("ia-briefing-conteudo");
  if (!el) return;
  el.innerHTML = iaSpinner("Montando o briefing do dia...");

  try {
    const { dados, briefing } = await iaBuscar(`/ia/briefing${forcar ? "?forcar=true" : ""}`);

    const lojas = dados.lojas.map(l => `
      <div class="ia-loja-linha">
        <span class="ia-loja-nome">${iaEscapar(l.loja)}</span>
        <span class="ia-loja-valor">${iaMoeda(l.faturamento)}</span>
        <span class="ia-loja-meta">${l.meta > 0 ? `de ${iaMoeda(l.meta)}` : "sem meta"}</span>
        <span class="ia-loja-pct ${l.atingimento !== null && l.atingimento >= 1 ? "ia-pos" : "ia-neg"}">
          ${l.atingimento !== null ? `${(l.atingimento * 100).toFixed(0)}%` : "—"}
        </span>
      </div>`).join("");

    el.innerHTML = `
      ${iaSelo(briefing._fonte, briefing._cache)}
      <p class="ia-manchete">${iaEscapar(briefing.manchete)}</p>
      <div class="ia-lojas">${lojas}</div>
      <p class="ia-texto">${iaEscapar(briefing.vendas)}</p>
      <h4 class="ia-subtitulo"><i class="fa-solid fa-bell"></i> Alertas</h4>
      <ul class="ia-lista">${briefing.alertas.map(a => `<li>${iaEscapar(a)}</li>`).join("")}</ul>
      <h4 class="ia-subtitulo"><i class="fa-solid fa-list-check"></i> Prioridades de hoje</h4>
      <ol class="ia-lista ia-lista-num">${briefing.prioridades.map(p => `<li>${iaEscapar(p)}</li>`).join("")}</ol>
      ${briefing.fechamento ? `<p class="ia-fechamento">${iaEscapar(briefing.fechamento)}</p>` : ""}`;
  } catch (err) {
    el.innerHTML = iaErro(`Não foi possível carregar o briefing: ${err.message}`);
  }
}

function iaMoeda(v) {
  return `R$ ${Number(v || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// --------------------------------------------------------------------------
// ITEM 1 — Coach de conversão
// --------------------------------------------------------------------------
async function iaCarregarCoach(forcar = false) {
  const el = document.getElementById("ia-coach-conteudo");
  const sel = document.getElementById("ia-coach-colaboradora");
  if (!el || !sel || !sel.value) return;

  el.innerHTML = iaSpinner("Analisando a conversão...");

  try {
    const competencia = iaCompetenciaAtual();
    const { metricas, coach } = await iaBuscar(
      `/ia/coach?usuario=${encodeURIComponent(sel.value)}&competencia=${competencia}${forcar ? "&forcar=true" : ""}`
    );

    el.innerHTML = `
      ${iaSelo(coach._fonte, coach._cache)}
      <div class="ia-metricas">
        <div class="ia-metrica"><span class="ia-metrica-num">${(metricas.pctConversaoMensal * 100).toFixed(1)}%</span><span class="ia-metrica-lbl">conversão</span></div>
        <div class="ia-metrica"><span class="ia-metrica-num">${metricas.totalAtend}</span><span class="ia-metrica-lbl">atendimentos</span></div>
        <div class="ia-metrica"><span class="ia-metrica-num">${iaEscapar(metricas.tierNome || "—")}</span><span class="ia-metrica-lbl">faixa atual</span></div>
        <div class="ia-metrica ia-metrica-ok"><span class="ia-metrica-num">${iaMoeda(metricas.totalEstimado)}</span><span class="ia-metrica-lbl">bonificação estimada</span></div>
      </div>
      <p class="ia-manchete">${iaEscapar(coach.resumo)}</p>
      ${coach.destaque ? `<p class="ia-texto ia-destaque"><i class="fa-solid fa-star"></i> ${iaEscapar(coach.destaque)}</p>` : ""}
      ${coach.atencao ? `<p class="ia-texto ia-atencao"><i class="fa-solid fa-circle-exclamation"></i> ${iaEscapar(coach.atencao)}</p>` : ""}
      <h4 class="ia-subtitulo"><i class="fa-solid fa-list-check"></i> Ações sugeridas</h4>
      <ul class="ia-lista">${(coach.acoes || []).map(a => `<li>${iaEscapar(a)}</li>`).join("")}</ul>
      ${coach.fechamento ? `<p class="ia-fechamento">${iaEscapar(coach.fechamento)}</p>` : ""}`;
  } catch (err) {
    el.innerHTML = iaErro(`Não foi possível gerar o coach: ${err.message}`);
  }
}

// --------------------------------------------------------------------------
// ITEM 4 — Escala inteligente
// --------------------------------------------------------------------------
async function iaCarregarEscala(forcar = false) {
  const el = document.getElementById("ia-escala-conteudo");
  const sel = document.getElementById("ia-escala-loja");
  if (!el || !sel) return;

  el.innerHTML = iaSpinner("Analisando o perfil de movimento...");

  try {
    const { analise, escala } = await iaBuscar(
      `/ia/escala?loja=${encodeURIComponent(sel.value)}${forcar ? "&forcar=true" : ""}`
    );

    // Quando a trava de dados mínimos está ativa, o painel mostra o que
    // falta em vez de uma recomendação sem lastro.
    if (escala._fonte === "dados-insuficientes") {
      el.innerHTML = `
        ${iaSelo(escala._fonte)}
        <p class="ia-manchete">${iaEscapar(escala.resumo)}</p>
        <ul class="ia-lista">${escala.recomendacoes.map(r => `<li>${iaEscapar(r)}</li>`).join("")}</ul>
        <p class="ia-rodape-aviso"><i class="fa-solid fa-shield-halved"></i> ${iaEscapar(escala.ressalvas)}</p>`;
      return;
    }

    el.innerHTML = `
      ${iaSelo(escala._fonte, escala._cache)}
      <div class="ia-metricas">
        <div class="ia-metrica"><span class="ia-metrica-num">${analise.diasComDados}</span><span class="ia-metrica-lbl">dias analisados</span></div>
        <div class="ia-metrica"><span class="ia-metrica-num">${iaMoeda(analise.faturamentoPeriodo)}</span><span class="ia-metrica-lbl">no período</span></div>
      </div>
      <p class="ia-manchete">${iaEscapar(escala.resumo)}</p>
      <p class="ia-texto ia-destaque"><i class="fa-solid fa-arrow-trend-up"></i> ${iaEscapar(escala.picos)}</p>
      <p class="ia-texto ia-atencao"><i class="fa-solid fa-arrow-trend-down"></i> ${iaEscapar(escala.ociosos)}</p>
      <h4 class="ia-subtitulo"><i class="fa-solid fa-users-gear"></i> Recomendações</h4>
      <ul class="ia-lista">${(escala.recomendacoes || []).map(r => `<li>${iaEscapar(r)}</li>`).join("")}</ul>
      <p class="ia-rodape-aviso"><i class="fa-solid fa-circle-info"></i> ${iaEscapar(escala.ressalvas)}</p>`;
  } catch (err) {
    el.innerHTML = iaErro(`Não foi possível analisar a escala: ${err.message}`);
  }
}

// --------------------------------------------------------------------------
// ITEM 6 — Copiloto Meta Hora a Hora
// --------------------------------------------------------------------------
async function iaCarregarCopiloto() {
  const el = document.getElementById("ia-copiloto-conteudo");
  const selLoja = document.getElementById("ia-copiloto-loja");
  const selHora = document.getElementById("ia-copiloto-hora");
  if (!el || !selLoja || !selHora) return;

  el.innerHTML = iaSpinner("Lendo o ritmo do dia...");

  try {
    const { texto, fonte, ritmo } = await iaBuscar(
      `/ia/copiloto?loja=${encodeURIComponent(selLoja.value)}&horaSlot=${encodeURIComponent(selHora.value)}`
    );

    const metricas = ritmo ? `
      <div class="ia-metricas">
        <div class="ia-metrica"><span class="ia-metrica-num">${iaMoeda(ritmo.vendido)}</span><span class="ia-metrica-lbl">vendido hoje</span></div>
        <div class="ia-metrica"><span class="ia-metrica-num">${ritmo.temMeta ? iaMoeda(ritmo.meta) : "—"}</span><span class="ia-metrica-lbl">meta do dia</span></div>
        <div class="ia-metrica ${ritmo.falta > 0 ? "ia-metrica-alerta" : "ia-metrica-ok"}"><span class="ia-metrica-num">${iaMoeda(ritmo.falta)}</span><span class="ia-metrica-lbl">falta</span></div>
        <div class="ia-metrica"><span class="ia-metrica-num">${iaMoeda(ritmo.ritmoNecessario)}</span><span class="ia-metrica-lbl">por hora restante</span></div>
      </div>` : "";

    el.innerHTML = `
      ${iaSelo(fonte)}
      ${metricas}
      <div class="ia-push-preview">
        <div class="ia-push-titulo"><i class="fa-solid fa-bell"></i> Meta ${iaEscapar(selHora.value)} — ${iaEscapar(selLoja.value)}</div>
        <div class="ia-push-corpo">${iaEscapar(texto)}</div>
      </div>
      <p class="ia-rodape-aviso"><i class="fa-solid fa-clock"></i> Este é o aviso que a consultora recebe automaticamente 10 minutos antes de cada intervalo.</p>`;
  } catch (err) {
    el.innerHTML = iaErro(`Não foi possível consultar o copiloto: ${err.message}`);
  }
}

// --------------------------------------------------------------------------
// Inicialização — chamada por ativarTab("insights-ia") em app.js
// --------------------------------------------------------------------------
function inicializarInsightsIA() {
  // Estado da chave/provedor: sem isso, um painel vazio parece defeito do app
  // quando na verdade é a chave que não está configurada no servidor.
  const statusEl = document.getElementById("ia-status-linha");
  if (statusEl && !iaCarregado.status) {
    iaBuscar("/ia/status").then(s => {
      iaCarregado.status = true;
      statusEl.innerHTML = s.habilitada
        ? `<span class="ia-selo ia-selo-ok"><i class="fa-solid fa-plug-circle-check"></i> IA ativa — ${iaEscapar(s.provedor)} / ${iaEscapar(s.modelo || "")}</span>`
        : `<span class="ia-selo ia-selo-alerta"><i class="fa-solid fa-plug-circle-xmark"></i> IA desativada no servidor. Os painéis mostram o resumo automático.</span>`;
    }).catch(() => {});
  }

  // Selects de loja
  ["ia-escala-loja", "ia-copiloto-loja"].forEach(id => {
    const sel = document.getElementById(id);
    if (sel && !sel.dataset.populado) {
      sel.innerHTML = IA_LOJAS_CACAU.map(l => `<option value="${iaEscapar(l)}">${iaEscapar(typeof opLabel === "function" ? opLabel(l) : l)}</option>`).join("");
      sel.dataset.populado = "1";
      if (typeof aplicarCorOperacaoSelect === "function") {
        aplicarCorOperacaoSelect(sel);
        if (!sel.dataset.corLigada) {
          sel.addEventListener("change", () => aplicarCorOperacaoSelect(sel));
          sel.dataset.corLigada = "1";
        }
      }
    }
  });

  // Horários de checkpoint (a loja abre 09/10h e fecha 22h)
  const selHora = document.getElementById("ia-copiloto-hora");
  if (selHora && !selHora.dataset.populado) {
    const horas = [];
    for (let h = 10; h <= 22; h++) horas.push(`${String(h).padStart(2, "0")}:00`);
    selHora.innerHTML = horas.map(h => `<option value="${h}">${h}</option>`).join("");
    const agora = new Date().getHours();
    selHora.value = horas.includes(`${String(agora).padStart(2, "0")}:00`) ? `${String(agora).padStart(2, "0")}:00` : "10:00";
    selHora.dataset.populado = "1";
  }

  // Colaboradoras do FaçaAmigos, para o coach
  const selColab = document.getElementById("ia-coach-colaboradora");
  if (selColab && !selColab.dataset.populado && typeof USERS !== "undefined") {
    const fa = USERS.filter(u => u.role === "consultora_fa").map(u => u.nome);
    selColab.innerHTML = fa.map(n => `<option value="${iaEscapar(n)}">${iaEscapar(n)}</option>`).join("");
    selColab.dataset.populado = "1";
  }

  // O briefing é o cartão principal e carrega sozinho. Os demais são sob
  // demanda: cada um é uma chamada à IA, e a cota gratuita é limitada — abrir
  // a aba não deve gastar seis requisições de uma vez.
  if (!iaCarregado.briefing) {
    iaCarregado.briefing = true;
    iaCarregarBriefing();
  }
}

// --------------------------------------------------------------------------
// Ligação dos botões (uma vez só, no carregamento da página)
// --------------------------------------------------------------------------
document.addEventListener("DOMContentLoaded", () => {
  const liga = (id, fn) => {
    const el = document.getElementById(id);
    if (el) el.addEventListener("click", fn);
  };

  liga("ia-briefing-atualizar", () => iaCarregarBriefing(true));
  liga("ia-coach-carregar", () => iaCarregarCoach(false));
  liga("ia-coach-atualizar", () => iaCarregarCoach(true));
  liga("ia-escala-carregar", () => iaCarregarEscala(false));
  liga("ia-copiloto-carregar", () => iaCarregarCopiloto());
});
