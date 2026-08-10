// ==========================================================================
// FLUXO DE CAIXA (exclusivo Owner) — front-end
// ==========================================================================
// Espelha a "Planilha de Controle Financeiro - Cacau Show.xlsx". Renderiza
// as 5 sub-abas (fc-painel, fc-diario, fc-teto, fc-referencia,
// fc-diagnostico), chamadas por ativarFcSubTab() em app.js. Reaproveita
// iaSpinner/iaSelo/iaEscapar/iaMoeda (insights-ia.js), formatBRL/parseMoeda/
// opLabel/opCor/formatarMoedaInput e API_BASE/currentUser (app.js).
// ==========================================================================

const FC_LOJAS = ["Marambaia", "Icoaraci", "Mário Covas"];

// Toda rota de /api/fluxo-caixa e /api/ia/fluxo-caixa exige requireOwner no
// servidor — precisa do nome de quem está logado em toda chamada.
function fcActor() {
  return currentUser ? currentUser.nome : "";
}

async function fcBuscar(url) {
  const sep = url.includes("?") ? "&" : "?";
  const res = await fetch(`${API_BASE}${url}${sep}actorUsuario=${encodeURIComponent(fcActor())}`);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `Erro ${res.status}`);
  return body;
}

async function fcEnviar(url, method, dados) {
  const res = await fetch(`${API_BASE}${url}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...dados, actorUsuario: fcActor() })
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `Erro ${res.status}`);
  return body;
}

function fcMesAtual() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function fcCoberturaClasse(cobertura) {
  if (cobertura === null || cobertura === undefined) return "";
  if (cobertura < 0.9) return "ia-neg";
  if (cobertura < 1.0) return "ia-metrica-alerta";
  return "ia-pos";
}

// --------------------------------------------------------------------------
// SUB-ABA: PAINEL
// --------------------------------------------------------------------------
async function renderFcPainel() {
  const mesInput = document.getElementById("fc-painel-mes");
  if (!mesInput.value) mesInput.value = fcMesAtual();

  const cardsWrap = document.getElementById("fc-painel-cards");
  const redeWrap = document.getElementById("fc-painel-rede");
  cardsWrap.innerHTML = iaSpinner("Carregando painel...");
  redeWrap.innerHTML = "";

  try {
    const { lojas, rede } = await fcBuscar(`/fluxo-caixa/painel?mes=${mesInput.value}`);

    cardsWrap.innerHTML = "";
    lojas.forEach(l => {
      const card = document.createElement("div");
      card.className = "loja-card";
      card.style.setProperty("--op-cor", opCor(l.loja));
      card.innerHTML = `
        <h4>${opLabel(l.loja)}</h4>
        <div class="valor">${formatBRL(l.faturamentoMes)}</div>
        <div class="meta"><span>${l.diasAbertos} dia(s) aberto(s) · venda/dia ${formatBRL(l.vendaPorDia)}</span></div>
        <div class="meta ${fcCoberturaClasse(l.cobertura)}">
          <span>Cobertura do equilíbrio: ${l.cobertura !== null ? (l.cobertura * 100).toFixed(0) + "%" : "— (sem referência)"}</span>
        </div>
        <div class="meta"><span>Títulos: ${formatBRL(l.titulosAberto)} em aberto, ${formatBRL(l.titulosVencido)} vencido (${(l.percentualVencido * 100).toFixed(0)}%, atraso médio ${l.diasMediosAtraso}d)</span></div>
        <div class="fc-painel-form">
          <label>Saldo OPERAÇÃO<input type="text" class="fc-input-moeda" data-campo="saldoOperacao" value="${l.saldoOperacao !== null ? formatBRL(l.saldoOperacao) : ""}"></label>
          <label>Saldo IMPOSTO<input type="text" class="fc-input-moeda" data-campo="saldoImposto" value="${l.saldoImposto !== null ? formatBRL(l.saldoImposto) : ""}"></label>
          <label>Saldo RESERVA<input type="text" class="fc-input-moeda" data-campo="saldoReserva" value="${l.saldoReserva !== null ? formatBRL(l.saldoReserva) : ""}"></label>
          <label>Retirada dos sócios<input type="text" class="fc-input-moeda" data-campo="retiradaSocios" value="${l.retiradaSocios !== null ? formatBRL(l.retiradaSocios) : ""}"></label>
          <label>Observações<input type="text" data-campo="observacoes" value="${iaEscapar(l.observacoes || "")}"></label>
          <button type="button" class="btn-secondary btn-sm fc-salvar-painel">Salvar</button>
        </div>`;
      card.querySelectorAll(".fc-input-moeda").forEach(inp => inp.addEventListener("input", formatarMoedaInput));
      card.querySelector(".fc-salvar-painel").addEventListener("click", async () => {
        const campos = {};
        card.querySelectorAll("[data-campo]").forEach(inp => {
          campos[inp.dataset.campo] = inp.dataset.campo === "observacoes" ? inp.value : parseMoeda(inp.value);
        });
        try {
          await fcEnviar("/fluxo-caixa/painel", "PUT", { mesReferencia: mesInput.value, loja: l.loja, ...campos });
          showToast("Painel salvo.", "sucesso");
        } catch (err) {
          showToast(`Erro ao salvar: ${err.message}`, "erro");
        }
      });
      cardsWrap.appendChild(card);
    });

    redeWrap.innerHTML = `
      <h4>Rede</h4>
      <div class="ia-metricas">
        <div class="ia-metrica"><span class="ia-metrica-num">${formatBRL(rede.faturamentoMes)}</span><span class="ia-metrica-lbl">faturamento</span></div>
        <div class="ia-metrica"><span class="ia-metrica-num">${formatBRL(rede.titulosAberto)}</span><span class="ia-metrica-lbl">títulos em aberto</span></div>
        <div class="ia-metrica ${rede.titulosVencido > 0 ? "ia-metrica-alerta" : "ia-metrica-ok"}"><span class="ia-metrica-num">${formatBRL(rede.titulosVencido)}</span><span class="ia-metrica-lbl">títulos vencidos</span></div>
        <div class="ia-metrica"><span class="ia-metrica-num">${formatBRL(rede.retiradaSocios)}</span><span class="ia-metrica-lbl">retirada informada</span></div>
      </div>`;
  } catch (err) {
    cardsWrap.innerHTML = iaErro(`Não foi possível carregar o painel: ${err.message}`);
  }
}

// --------------------------------------------------------------------------
// SUB-ABA: DIÁRIO DO CAIXA
// --------------------------------------------------------------------------
async function renderFcDiario() {
  const mesInput = document.getElementById("fc-diario-mes");
  if (!mesInput.value) mesInput.value = fcMesAtual();

  const tbody = document.getElementById("fc-diario-tbody");
  tbody.innerHTML = `<tr><td colspan="5" class="py-8 text-center">${iaSpinner("Carregando...")}</td></tr>`;

  try {
    const { linhas } = await fcBuscar(`/fluxo-caixa/diario?mes=${mesInput.value}`);
    if (linhas.length === 0) {
      tbody.innerHTML = `<tr><td colspan="5" class="py-8 text-center text-ink-muted">Nenhum fechamento de caixa lançado neste mês ainda.</td></tr>`;
      return;
    }
    tbody.innerHTML = "";
    linhas.forEach(l => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td class="py-2 px-3">${l.data.split("-").reverse().join("/")}</td>
        <td class="py-2 px-3">${opChip(l.loja)}</td>
        <td class="py-2 px-3 text-right">${formatBRL(l.valor)}</td>
        <td class="py-2 px-3 text-right">${formatBRL(l.transferirImposto)}</td>
        <td class="py-2 px-3"><input type="text" class="fc-obs-diaria" value="${iaEscapar(l.observacao || "")}" placeholder="Observação"></td>`;
      const inputObs = tr.querySelector(".fc-obs-diaria");
      inputObs.addEventListener("change", async () => {
        try {
          await fcEnviar("/fluxo-caixa/diario/observacao", "PUT", { data: l.data, loja: l.loja, observacao: inputObs.value });
        } catch (err) {
          showToast(`Erro ao salvar observação: ${err.message}`, "erro");
        }
      });
      tbody.appendChild(tr);
    });
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="5">${iaErro(`Não foi possível carregar o diário: ${err.message}`)}</td></tr>`;
  }
}

// --------------------------------------------------------------------------
// SUB-ABA: TETO DE CAMPANHA
// --------------------------------------------------------------------------
async function renderFcTeto() {
  const lista = document.getElementById("fc-teto-lista");
  lista.innerHTML = iaSpinner("Carregando campanhas...");

  try {
    const campanhas = await fcBuscar("/fluxo-caixa/campanhas");
    if (campanhas.length === 0) {
      lista.innerHTML = `<p class="text-ink-muted">Nenhuma campanha cadastrada ainda.</p>`;
      return;
    }

    const porNome = {};
    campanhas.forEach(c => {
      if (!porNome[c.nome]) porNome[c.nome] = [];
      porNome[c.nome].push(c);
    });

    lista.innerHTML = Object.entries(porNome).map(([nome, linhas]) => `
      <div class="card" style="margin-bottom:16px;">
        <h3>${iaEscapar(nome)}</h3>
        <div class="table-wrap" style="overflow-x:auto;">
          <table class="w-full text-sm">
            <thead><tr><th class="py-2 px-3 text-left">Loja</th><th class="py-2 px-3 text-right">Teto</th><th class="py-2 px-3 text-right">Pedido</th><th class="py-2 px-3 text-right">Boleto estimado</th><th class="py-2 px-3 text-left">Veredito</th><th class="py-2 px-3"></th></tr></thead>
            <tbody>
              ${linhas.map(c => `
                <tr>
                  <td class="py-2 px-3">${opChip(c.loja)}</td>
                  <td class="py-2 px-3 text-right">${formatBRL(c.tetoCalculado)}</td>
                  <td class="py-2 px-3 text-right">${c.pedidoOferecido !== null ? formatBRL(c.pedidoOferecido) : "—"}</td>
                  <td class="py-2 px-3 text-right">${c.boletoEstimado !== null ? formatBRL(c.boletoEstimado) : "—"}</td>
                  <td class="py-2 px-3">${iaEscapar(c.veredito)}</td>
                  <td class="py-2 px-3"><button type="button" class="btn-secondary btn-sm fc-excluir-campanha" data-id="${c.id}"><i class="fa-solid fa-trash"></i></button></td>
                </tr>
                ${c.cronograma && c.cronograma.length > 0 ? `
                <tr><td colspan="6" class="py-2 px-3">
                  <details><summary>Cronograma de vencimento</summary>
                    <ul class="ia-lista">
                      ${c.cronograma.map(p => `<li>${p.descricao} — ${p.data.split("-").reverse().join("/")} — ${formatBRL(p.valor)}</li>`).join("")}
                    </ul>
                  </details>
                </td></tr>` : ""}
              `).join("")}
            </tbody>
          </table>
        </div>
      </div>`).join("");

    lista.querySelectorAll(".fc-excluir-campanha").forEach(btn => {
      btn.addEventListener("click", async () => {
        if (!confirm("Excluir esta linha de campanha?")) return;
        try {
          await fcEnviar(`/fluxo-caixa/campanhas/${btn.dataset.id}`, "DELETE", {});
          renderFcTeto();
        } catch (err) {
          showToast(`Erro ao excluir: ${err.message}`, "erro");
        }
      });
    });
  } catch (err) {
    lista.innerHTML = iaErro(`Não foi possível carregar as campanhas: ${err.message}`);
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("form-fc-campanha");
  if (!form) return;
  form.addEventListener("submit", async e => {
    e.preventDefault();
    const nome = document.getElementById("fc-campanha-nome").value.trim();
    const loja = document.getElementById("fc-campanha-loja").value;
    if (!nome || !loja) return;

    const dataComemorativa = document.getElementById("fc-campanha-data").value || null;
    const mesReferenciaFaturamento = document.getElementById("fc-campanha-mes-ref").value || null;
    const faturamentoAnteriorStr = document.getElementById("fc-campanha-faturamento-anterior").value;
    const pedidoStr = document.getElementById("fc-campanha-pedido").value;

    try {
      await fcEnviar("/fluxo-caixa/campanhas", "POST", {
        nome, loja, dataComemorativa, mesReferenciaFaturamento,
        faturamentoAnoAnterior: faturamentoAnteriorStr ? parseMoeda(faturamentoAnteriorStr) : undefined,
        pedidoOferecido: pedidoStr ? parseMoeda(pedidoStr) : undefined
      });
      document.getElementById("fc-campanha-pedido").value = "";
      document.getElementById("fc-campanha-faturamento-anterior").value = "";
      document.getElementById("fc-campanha-loja").value = "";
      renderFcTeto();
    } catch (err) {
      showToast(`Erro ao salvar campanha: ${err.message}`, "erro");
    }
  });

  ["fc-campanha-faturamento-anterior", "fc-campanha-pedido"].forEach(id => {
    document.getElementById(id).addEventListener("input", formatarMoedaInput);
  });

  document.getElementById("fc-painel-mes")?.addEventListener("change", renderFcPainel);
  document.getElementById("fc-diario-mes")?.addEventListener("change", renderFcDiario);
  document.getElementById("fc-diagnostico-atualizar")?.addEventListener("click", () => renderFcDiagnostico(true));
});

// --------------------------------------------------------------------------
// SUB-ABA: REFERÊNCIA
// --------------------------------------------------------------------------
const FC_MESES_LABEL = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

async function renderFcReferencia() {
  const tbodyRef = document.getElementById("fc-referencia-tbody");
  const tbodySaz = document.getElementById("fc-sazonal-tbody");
  tbodyRef.innerHTML = `<tr><td colspan="8" class="py-8 text-center">${iaSpinner("Carregando...")}</td></tr>`;
  tbodySaz.innerHTML = "";

  try {
    const { lojas, sazonal } = await fcBuscar("/fluxo-caixa/referencia");

    tbodyRef.innerHTML = "";
    FC_LOJAS.forEach(loja => {
      const r = lojas.find(l => l.loja === loja) || { loja };
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td class="py-2 px-3">${opChip(loja)}</td>
        <td class="py-2 px-3 text-right"><input type="text" class="fc-input-moeda" data-campo="faturamentoMes" value="${r.faturamentoMes != null ? formatBRL(r.faturamentoMes) : ""}"></td>
        <td class="py-2 px-3 text-right"><input type="text" class="fc-input-moeda" data-campo="despesaFixaMes" value="${r.despesaFixaMes != null ? formatBRL(r.despesaFixaMes) : ""}"></td>
        <td class="py-2 px-3 text-right"><input type="text" class="fc-input-moeda" data-campo="pontoEquilibrioMes" value="${r.pontoEquilibrioMes != null ? formatBRL(r.pontoEquilibrioMes) : ""}"></td>
        <td class="py-2 px-3 text-right"><input type="text" class="fc-input-moeda" data-campo="pontoEquilibrioDia" value="${r.pontoEquilibrioDia != null ? formatBRL(r.pontoEquilibrioDia) : ""}"></td>
        <td class="py-2 px-3 text-right"><input type="text" class="fc-input-moeda" data-campo="resultado10Meses" value="${r.resultado10Meses != null ? formatBRL(r.resultado10Meses) : ""}"></td>
        <td class="py-2 px-3 text-right"><input type="text" data-campo="aliquotaImposto" style="width:70px;" value="${r.aliquotaImposto != null ? (r.aliquotaImposto * 100).toFixed(1) : "8.2"}">%</td>
        <td class="py-2 px-3"><button type="button" class="btn-secondary btn-sm fc-salvar-referencia">Salvar</button></td>`;
      tr.querySelectorAll(".fc-input-moeda").forEach(inp => inp.addEventListener("input", formatarMoedaInput));
      tr.querySelector(".fc-salvar-referencia").addEventListener("click", async () => {
        const campos = {};
        tr.querySelectorAll("[data-campo]").forEach(inp => {
          campos[inp.dataset.campo] = inp.dataset.campo === "aliquotaImposto" ? (parseFloat(inp.value.replace(",", ".")) || 0) / 100 : parseMoeda(inp.value);
        });
        try {
          await fcEnviar(`/fluxo-caixa/referencia/${encodeURIComponent(loja)}`, "PUT", campos);
          showToast("Referência salva.", "sucesso");
        } catch (err) {
          showToast(`Erro ao salvar: ${err.message}`, "erro");
        }
      });
      tbodyRef.appendChild(tr);
    });

    tbodySaz.innerHTML = FC_MESES_LABEL.map((label, i) => {
      const mes = i + 1;
      const linha = FC_LOJAS.map(loja => {
        const s = sazonal.find(x => x.loja === loja && x.mes === mes);
        return `<td class="py-2 px-3 text-right">${s ? s.indice.toFixed(2) + "x" : "—"}</td>`;
      }).join("");
      const situacao = sazonal.find(x => x.mes === mes)?.situacao || "";
      return `<tr><td class="py-2 px-3">${label}</td>${linha}<td class="py-2 px-3">${iaEscapar(situacao)}</td></tr>`;
    }).join("");
  } catch (err) {
    tbodyRef.innerHTML = `<tr><td colspan="8">${iaErro(`Não foi possível carregar a referência: ${err.message}`)}</td></tr>`;
  }
}

// --------------------------------------------------------------------------
// SUB-ABA: DIAGNÓSTICO
// --------------------------------------------------------------------------
async function renderFcDiagnostico(forcar = false) {
  const el = document.getElementById("fc-diagnostico-conteudo");
  el.innerHTML = iaSpinner("Apurando o diagnóstico...");

  try {
    const { dados, diagnostico } = await fcBuscar(`/ia/fluxo-caixa${forcar ? "?forcar=true" : ""}`);

    el.innerHTML = `
      ${iaSelo(diagnostico._fonte, diagnostico._cache)}
      <p class="ia-manchete">${iaEscapar(diagnostico.manchete)}</p>
      <div class="ia-lojas">${dados.lojas.map(l => `
        <div class="ia-loja-linha">
          <span class="ia-loja-nome">${iaEscapar(l.loja)}</span>
          <span class="ia-loja-valor">${l.situacao}</span>
        </div>`).join("")}</div>
      <h4 class="ia-subtitulo"><i class="fa-solid fa-store"></i> Situação por loja</h4>
      <ul class="ia-lista">${diagnostico.porLoja.map(p => `<li>${iaEscapar(p)}</li>`).join("")}</ul>
      <h4 class="ia-subtitulo"><i class="fa-solid fa-bell"></i> Alertas</h4>
      <ul class="ia-lista">${diagnostico.alertas.map(a => `<li>${iaEscapar(a)}</li>`).join("")}</ul>
      <h4 class="ia-subtitulo"><i class="fa-solid fa-list-check"></i> Recomendações</h4>
      <ol class="ia-lista ia-lista-num">${diagnostico.recomendacoes.map(r => `<li>${iaEscapar(r)}</li>`).join("")}</ol>
      ${diagnostico.fechamento ? `<p class="ia-fechamento">${iaEscapar(diagnostico.fechamento)}</p>` : ""} `;
  } catch (err) {
    el.innerHTML = iaErro(`Não foi possível gerar o diagnóstico: ${err.message}`);
  }
}

// --------------------------------------------------------------------------
// BANNER DE SAZONALIDADE & ARMADILHAS DO CAIXA
// --------------------------------------------------------------------------
async function renderFcSazonalidadeBanner() {
  const container = document.getElementById("fc-sazonalidade-container");
  if (!container) return;

  try {
    const saz = await fcBuscar("/fluxo-caixa/sazonalidade");

    let corBg = "#eff6ff";
    let corBorder = "#bfdbfe";
    let corTexto = "#1e40af";
    let icone = "fa-compass";

    if (saz.estacao === "COLHER") {
      corBg = "#f0fdf4";
      corBorder = "#bbf7d0";
      corTexto = "#166534";
      icone = "fa-wheat-awn";
    } else if (saz.estacao === "PREPARAR") {
      corBg = "#fffbeb";
      corBorder = "#fde68a";
      corTexto = "#92400e";
      icone = "fa-seedling";
    }

    container.innerHTML = `
      <div style="background:${corBg}; border:1px solid ${corBorder}; color:${corTexto}; padding:16px; border-radius:12px; margin-bottom:12px;">
        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px; margin-bottom:8px;">
          <h3 style="margin:0; font-size:16px; font-weight:700; display:flex; align-items:center; gap:8px;">
            <i class="fa-solid ${icone}"></i> ${iaEscapar(saz.nomeEstacao)}
          </h3>
          <span style="background:rgba(255,255,255,0.8); border:1px solid ${corBorder}; padding:4px 10px; border-radius:20px; font-size:12px; font-weight:700;">
            Meta Reserva até 31/12: R$ 235.927
          </span>
        </div>
        <p style="margin:0 0 8px 0; font-size:13px; opacity:0.9;">${iaEscapar(saz.descricaoEstacao)}</p>
        <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap:10px; margin-top:10px; font-size:12px;">
          <div style="background:rgba(255,255,255,0.7); padding:10px; border-radius:8px;">
            <strong><i class="fa-solid fa-circle-check" style="color:#16a34a;"></i> O QUE FAZER:</strong><br>
            ${iaEscapar(saz.oQueFazer)}
          </div>
          <div style="background:rgba(255,255,255,0.7); padding:10px; border-radius:8px;">
            <strong><i class="fa-solid fa-circle-xmark" style="color:#dc2626;"></i> O QUE NÃO FAZER:</strong><br>
            ${iaEscapar(saz.oQueNaoFazer)}
          </div>
        </div>
      </div>

      ${saz.armadilhaDia15 ? `
        <div style="background:#fef2f2; border:1px solid #fecaca; color:#991b1b; padding:12px 16px; border-radius:12px; display:flex; align-items:flex-start; gap:12px;">
          <i class="fa-solid fa-triangle-exclamation" style="font-size:20px; color:#dc2626; margin-top:2px;"></i>
          <div>
            <strong style="font-size:14px;">ALERTA: A Armadilha do Meio do Mês (Dia 10 a 20)</strong>
            <p style="margin:4px 0 0 0; font-size:12px;">Olhar o saldo da conta neste período e achar que está bom é uma armadilha. Dentro deste saldo estão o imposto do dia 20, as despesas fixas do dia 8 e o boleto de campanha. Não decida compras ou retiradas com base no saldo de hoje!</p>
          </div>
        </div>
      ` : ""}
    `;
  } catch (err) {
    console.error("[Fluxo de Caixa] Erro ao renderizar sazonalidade:", err);
  }
}

// --------------------------------------------------------------------------
// SUB-ABA: ROTINA & AÇÕES (CALENDÁRIO DO MÊS)
// --------------------------------------------------------------------------
async function renderFcRotina() {
  const el = document.getElementById("fc-rotina-conteudo");
  if (!el) return;

  el.innerHTML = `
    <div class="card" style="margin-bottom:16px;">
      <h3><i class="fa-solid fa-calendar-days" style="color:#16a34a;"></i> O Calendário do Mês — Seis Momentos</h3>
      <p class="section-sub">Nenhum momento leva mais de 15 minutos. É a rotina diária e mensal que sustenta o caixa saudável.</p>
    </div>

    <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap:16px;">
      
      <!-- Todo Dia -->
      <div class="card" style="border-left: 4px solid #16a34a;">
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <h4 style="margin:0; color:#16a34a;"><i class="fa-solid fa-sun"></i> Todo Dia (Fechamento)</h4>
          <span class="badge" style="background:#dcfce7; color:#15803d;">5 minutos</span>
        </div>
        <p style="font-size:13px; margin:8px 0; color:#374151;">
          <strong>O que fazer:</strong> No fechamento do caixa, separar e transferir <strong>8,2%</strong> do faturamento bruto do dia para a <strong>Conta Imposto</strong>.
        </p>
        <p style="font-size:12px; color:#6b7280; margin-bottom:12px;">
          <em>Por quê:</em> É o hábito que sustenta tudo. O dinheiro do imposto do dia 20 já estará guardado sem esforço.
        </p>
        <button type="button" class="btn-secondary btn-sm" onclick="ativarFcSubTab('fc-diario')" style="width:100%;">
          <i class="fa-solid fa-arrow-right"></i> Ir para Diário do Caixa (Conferir 8,2%)
        </button>
      </div>

      <!-- Dia 1 -->
      <div class="card" style="border-left: 4px solid #2563eb;">
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <h4 style="margin:0; color:#2563eb;"><i class="fa-solid fa-1"></i> Dia 1 do Mês</h4>
          <span class="badge" style="background:#dbeafe; color:#1e40af;">15 minutos</span>
        </div>
        <p style="font-size:13px; margin:8px 0; color:#374151;">
          <strong>O que fazer:</strong> Anotar os 4 números do mês: (1) Venda do mês anterior, (2) Saldo das 3 contas, (3) Total de boletos em aberto e (4) Quanto está vencido.
        </p>
        <p style="font-size:12px; color:#6b7280; margin-bottom:12px;">
          <em>Por quê:</em> São os 4 números que dizem se o mês foi bom. Sem eles vocês navegam no escuro.
        </p>
        <button type="button" class="btn-secondary btn-sm" onclick="ativarFcSubTab('fc-painel')" style="width:100%;">
          <i class="fa-solid fa-pen-to-square"></i> Registrar Números no Painel Mensal
        </button>
      </div>

      <!-- Dia 5 -->
      <div class="card" style="border-left: 4px solid #d97706;">
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <h4 style="margin:0; color:#d97706;"><i class="fa-solid fa-5"></i> Dia 5 do Mês</h4>
          <span class="badge" style="background:#fef3c7; color:#b45309;">10 minutos</span>
        </div>
        <p style="font-size:13px; margin:8px 0; color:#374151;">
          <strong>O que fazer:</strong> Conferir se a Conta de Operação tem o valor total da despesa fixa que vence no dia 8.
        </p>
        <p style="font-size:12px; color:#6b7280; margin-bottom:12px;">
          <em>Por quê:</em> Três dias de antecedência resolvem quase tudo. Três horas, não.
        </p>
      </div>

      <!-- Dia 8 -->
      <div class="card" style="border-left: 4px solid #dc2626;">
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <h4 style="margin:0; color:#dc2626;"><i class="fa-solid fa-8"></i> Dia 8 do Mês</h4>
          <span class="badge" style="background:#fee2e2; color:#b91c1c;">Pagamento</span>
        </div>
        <p style="font-size:13px; margin:8px 0; color:#374151;">
          <strong>O que fazer:</strong> Pagar a despesa fixa das lojas (aluguel, fornecedores, folha, sistemas).
        </p>
        <p style="font-size:12px; color:#6b7280; margin-bottom:12px;">
          <em>Por quê:</em> Data fixa, valor conhecido. Nunca deveria ser surpresa.
        </p>
      </div>

      <!-- Dia 20 -->
      <div class="card" style="border-left: 4px solid #7c3aed;">
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <h4 style="margin:0; color:#7c3aed;"><i class="fa-solid fa-building-columns"></i> Dia 20 do Mês</h4>
          <span class="badge" style="background:#f3e8ff; color:#6d28d9;">Imposto</span>
        </div>
        <p style="font-size:13px; margin:8px 0; color:#374151;">
          <strong>O que fazer:</strong> Pagar o imposto (DAS) utilizando exclusivamente o dinheiro acumulado na <strong>Conta Imposto</strong>.
        </p>
        <p style="font-size:12px; color:#6b7280; margin-bottom:12px;">
          <em>Por quê:</em> Se a Regra 1 (8,2% todo dia) foi cumprida, o dinheiro estará 100% lá.
        </p>
      </div>

      <!-- Último Dia -->
      <div class="card" style="border-left: 4px solid #059669;">
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <h4 style="margin:0; color:#059669;"><i class="fa-solid fa-flag-checkered"></i> Último Dia do Mês</h4>
          <span class="badge" style="background:#ecfdf5; color:#047857;">Fechamento</span>
        </div>
        <p style="font-size:13px; margin:8px 0; color:#374151;">
          <strong>O que fazer:</strong> Se o mês foi de Colheita (Março, Abril, Dezembro), transferir a sobra inteira para a <strong>Conta Reserva</strong> ANTES da virada do mês.
        </p>
        <p style="font-size:12px; color:#6b7280; margin-bottom:12px;">
          <em>Por quê:</em> Dinheiro que passa da virada na conta de operação vira gasto ilícito/desnecessário.
        </p>
      </div>

    </div>
  `;
}

// --------------------------------------------------------------------------
// SUB-ABA: PRÓXIMOS 30 DIAS (CHECKLIST OPERACIONAL)
// --------------------------------------------------------------------------
async function renderFcChecklist() {
  const el = document.getElementById("fc-checklist-conteudo");
  if (!el) return;

  el.innerHTML = iaSpinner("Carregando checklist dos 30 dias...");

  try {
    const items = await fcBuscar("/fluxo-caixa/checklist");

    const total = items.length;
    const concluidos = items.filter(i => i.concluido).length;
    const pct = total > 0 ? Math.round((concluidos / total) * 100) : 0;

    let html = `
      <div class="card" style="margin-bottom:16px;">
        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px;">
          <div>
            <h3><i class="fa-solid fa-list-check" style="color:#2563eb;"></i> Plano dos Próximos 30 Dias (Ordem de Execução)</h3>
            <p class="section-sub" style="margin:0;">Não pule etapas e não tente fazer tudo no mesmo dia. Siga a ordem recomendada.</p>
          </div>
          <div style="text-align:right;">
            <div style="font-size:14px; font-weight:700; color:#1e293b;">Progresso: ${concluidos}/${total} (${pct}%)</div>
            <div style="width:160px; height:8px; background:#e2e8f0; border-radius:4px; overflow:hidden; margin-top:4px;">
              <div style="width:${pct}%; height:100%; background:#2563eb; transition:width 0.3s;"></div>
            </div>
          </div>
        </div>
      </div>

      <div style="display:flex; flex-direction:column; gap:12px;">
    `;

    items.forEach(item => {
      const isDone = Boolean(item.concluido);
      html += `
        <div class="card" style="display:flex; align-items:flex-start; gap:14px; opacity:${isDone ? "0.75" : "1"}; background:${isDone ? "#f8fafc" : "#ffffff"}; border-left:4px solid ${isDone ? "#16a34a" : "#cbd5e1"};">
          <input type="checkbox" id="chk-item-${item.id}" ${isDone ? "checked" : ""} onchange="salvarFcChecklist('${item.id}', this.checked)" style="width:20px; height:20px; margin-top:3px; cursor:pointer;">
          <div style="flex:1;">
            <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
              <label for="chk-item-${item.id}" style="font-weight:700; font-size:15px; cursor:pointer; ${isDone ? "text-decoration:line-through; color:#64748b;" : "color:#0f172a;"}">
                #${item.ordem} · ${iaEscapar(item.titulo)}
              </label>
              <div style="display:flex; gap:6px;">
                <span class="badge" style="background:#e0f2fe; color:#0369a1; font-weight:600;">${iaEscapar(item.quando)}</span>
                <span class="badge" style="background:#f1f5f9; color:#475569; font-weight:600;"><i class="fa-solid fa-user"></i> ${iaEscapar(item.quem)}</span>
              </div>
            </div>
            <p style="margin:6px 0 0 0; font-size:13px; color:#475569;">${iaEscapar(item.descricao || "")}</p>
            ${isDone && item.concluidoEm ? `<div style="font-size:11px; color:#16a34a; margin-top:4px;"><i class="fa-solid fa-circle-check"></i> Concluído em ${new Date(item.concluidoEm).toLocaleDateString("pt-BR")}</div>` : ""}
          </div>
        </div>
      `;
    });

    html += `</div>`;
    el.innerHTML = html;
  } catch (err) {
    el.innerHTML = iaErro(`Não foi possível carregar o checklist: ${err.message}`);
  }
}

async function salvarFcChecklist(id, concluido) {
  try {
    await fcEnviar(`/fluxo-caixa/checklist/${id}`, "PUT", { concluido });
    renderFcChecklist();
  } catch (err) {
    alert(`Erro ao salvar checklist: ${err.message}`);
  }
}
