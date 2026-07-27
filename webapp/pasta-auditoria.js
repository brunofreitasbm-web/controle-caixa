// ==========================================================================
// PASTA DE AUDITORIA — repositório de documentos legais/societários
// ==========================================================================
// Duas pastas independentes (Cacau Show / Faça Amigos), cada uma com CNPJ,
// contrato social, alvará, habite-se, seguro, contratos trabalhistas etc.
// Owner e consultoras da própria unidade podem enviar; só o Owner edita ou
// apaga (ver TABS_POR_ROLE e routes/auditoria-docs.js).
// ==========================================================================

const PASTA_AUDITORIA_UNIDADES = {
  "cacau-show": ["Marambaia", "Icoaraci", "Mário Covas", "Venda Direta"],
  "faca-amigos": ["Grão Pará", "ParqueShopping", "Parque Circuito"]
};

const pastaAuditoriaEstado = { editandoId: null };

function paEscapar(t) {
  const div = document.createElement("div");
  div.textContent = t == null ? "" : String(t);
  return div.innerHTML;
}

function paActorUsuario() {
  return currentUser ? currentUser.nome : "";
}

function paEhOwner() {
  return !!(currentUser && currentUser.role === "owner");
}

async function paFetch(url, opcoes = {}) {
  const res = await fetch(`${API_BASE}${url}`, opcoes);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `Erro ${res.status}`);
  return body;
}

function paSituacaoVencimento(dataVencimento) {
  if (!dataVencimento) return { texto: "—", classe: "" };
  const hoje = new Date().toISOString().slice(0, 10);
  const em30Dias = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  let classe = "";
  if (dataVencimento < hoje) classe = "color: #f87171; font-weight: 700;";
  else if (dataVencimento <= em30Dias) classe = "color: #fbbf24; font-weight: 700;";
  return { texto: formatarDataBr(dataVencimento), classe };
}

function paLinhaTabela(doc) {
  const situacao = paSituacaoVencimento(doc.dataVencimento);
  const categoria = doc.categoria === "Outro" && doc.categoriaOutro ? paEscapar(doc.categoriaOutro) : paEscapar(doc.categoria);
  const acoesOwner = paEhOwner() ? `
    <button type="button" class="text-brand-300 hover:text-white" data-pa-editar="${doc.id}" title="Editar"><i class="fa-solid fa-pen"></i></button>
    <button type="button" class="text-red-400 hover:text-red-300" data-pa-apagar="${doc.id}" title="Apagar"><i class="fa-solid fa-trash"></i></button>
  ` : "";

  return `
    <tr data-pa-id="${doc.id}">
      <td class="py-2.5 px-4">${paEscapar(doc.nomeArquivo || "(sem nome)")}</td>
      <td class="py-2.5 px-3">${categoria}</td>
      <td class="py-2.5 px-3">${paEscapar(doc.unidade || "Geral")}</td>
      <td class="py-2.5 px-3" style="${situacao.classe}">
        ${situacao.texto}
        ${doc.vencimentoSugeridoIA ? '<span title="Sugerido pela IA, confirme a data"><i class="fa-solid fa-wand-magic-sparkles" style="color:#a78bfa; margin-left:4px;"></i></span>' : ""}
      </td>
      <td class="py-2.5 px-3">${paEscapar(doc.enviadoPor || "—")}</td>
      <td class="py-2.5 px-4 text-center whitespace-nowrap">
        <button type="button" class="text-brand-300 hover:text-white" data-pa-baixar="${doc.id}" title="Baixar/Visualizar"><i class="fa-solid fa-download"></i></button>
        ${acoesOwner}
      </td>
    </tr>
  `;
}

async function carregarPastaAuditoria(negocio) {
  const tbody = document.getElementById(`pasta-auditoria-${negocio === "cacau-show" ? "cs" : "fa"}-tbody`);
  if (!tbody) return;
  tbody.innerHTML = `<tr class="text-brand-400 text-center"><td colspan="6" class="py-8">Carregando...</td></tr>`;

  const filtros = document.querySelectorAll(`[data-pasta-auditoria-filtro][data-negocio="${negocio}"]`);
  const params = new URLSearchParams({ actorUsuario: paActorUsuario(), negocio });
  filtros.forEach(sel => {
    if (sel.value) params.set(sel.dataset.pastaAuditoriaFiltro, sel.value);
  });

  try {
    const docs = await paFetch(`/auditoria-docs?${params.toString()}`);
    tbody.innerHTML = docs.length
      ? docs.map(paLinhaTabela).join("")
      : `<tr class="text-brand-400 text-center"><td colspan="6" class="py-8">Nenhum documento nesta pasta ainda.</td></tr>`;
  } catch (erro) {
    tbody.innerHTML = `<tr class="text-red-400 text-center"><td colspan="6" class="py-8">${paEscapar(erro.message)}</td></tr>`;
  }
}

async function paBaixarDocumento(id) {
  try {
    const dados = await paFetch(`/auditoria-docs/${id}/arquivo?actorUsuario=${encodeURIComponent(paActorUsuario())}`);
    if (!dados.conteudo) throw new Error("Arquivo vazio.");
    const resposta = await fetch(dados.conteudo);
    const blob = await resposta.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = dados.nomeArquivo || "documento";
    a.target = "_blank";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  } catch (erro) {
    alert(`Não foi possível abrir o documento: ${erro.message}`);
  }
}

async function paApagarDocumento(id, negocio) {
  if (!confirm("Apagar este documento definitivamente?")) return;
  try {
    await paFetch(`/auditoria-docs/${id}?actorUsuario=${encodeURIComponent(paActorUsuario())}`, { method: "DELETE" });
    carregarPastaAuditoria(negocio);
  } catch (erro) {
    alert(`Não foi possível apagar: ${erro.message}`);
  }
}

function paNegocioDoPainel(elemento) {
  const painel = elemento.closest(".tab-panel");
  return painel ? painel.dataset.negocio : null;
}

function paAbrirModalUpload(negocio, docParaEditar = null) {
  const modal = document.getElementById("modal-upload-pasta-auditoria");
  const selectUnidade = document.getElementById("pasta-auditoria-form-unidade");
  const selectCategoria = document.getElementById("pasta-auditoria-form-categoria");
  const inputArquivo = document.getElementById("pasta-auditoria-form-arquivo");
  const inputVencimento = document.getElementById("pasta-auditoria-form-vencimento");
  const inputObservacoes = document.getElementById("pasta-auditoria-form-observacoes");
  const inputCategoriaOutro = document.getElementById("pasta-auditoria-form-categoria-outro");

  document.getElementById("pasta-auditoria-form-negocio").value = negocio;
  selectUnidade.innerHTML = `<option value="">Geral (não específico de uma unidade)</option>` +
    PASTA_AUDITORIA_UNIDADES[negocio].map(u => `<option value="${paEscapar(u)}">${paEscapar(u)}</option>`).join("");

  pastaAuditoriaEstado.editandoId = docParaEditar ? docParaEditar.id : null;
  selectUnidade.value = docParaEditar ? (docParaEditar.unidade || "") : "";
  selectCategoria.value = docParaEditar ? docParaEditar.categoria : "CNPJ";
  inputCategoriaOutro.value = docParaEditar ? (docParaEditar.categoriaOutro || "") : "";
  inputVencimento.value = docParaEditar ? (docParaEditar.dataVencimento || "") : "";
  inputObservacoes.value = docParaEditar ? (docParaEditar.observacoes || "") : "";
  inputArquivo.required = !docParaEditar;
  inputArquivo.value = "";

  document.getElementById("pasta-auditoria-form-categoria-outro-wrap").classList.toggle("hidden", selectCategoria.value !== "Outro");
  document.getElementById("btn-salvar-upload-pasta-auditoria").textContent = docParaEditar ? "Salvar alterações" : "Enviar";

  modal.classList.remove("hidden");
}

function paFecharModalUpload() {
  document.getElementById("modal-upload-pasta-auditoria").classList.add("hidden");
  pastaAuditoriaEstado.editandoId = null;
}

function paLerArquivoComoDataUrl(arquivo) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => resolve(e.target.result);
    reader.onerror = reject;
    reader.readAsDataURL(arquivo);
  });
}

async function paSubmeterUpload(evento) {
  evento.preventDefault();
  const btn = document.getElementById("btn-salvar-upload-pasta-auditoria");
  const negocio = document.getElementById("pasta-auditoria-form-negocio").value;
  const categoria = document.getElementById("pasta-auditoria-form-categoria").value;
  const categoriaOutro = document.getElementById("pasta-auditoria-form-categoria-outro").value.trim();
  const unidade = document.getElementById("pasta-auditoria-form-unidade").value;
  const dataVencimento = document.getElementById("pasta-auditoria-form-vencimento").value;
  const observacoes = document.getElementById("pasta-auditoria-form-observacoes").value.trim();
  const arquivo = document.getElementById("pasta-auditoria-form-arquivo").files[0];
  const editandoId = pastaAuditoriaEstado.editandoId;

  btn.disabled = true;
  const textoOriginal = btn.textContent;
  btn.textContent = "Enviando...";

  try {
    const corpo = {
      actorUsuario: paActorUsuario(),
      negocio,
      unidade: unidade || null,
      categoria,
      categoriaOutro: categoria === "Outro" ? categoriaOutro : null,
      dataVencimento: dataVencimento || null,
      observacoes: observacoes || null
    };

    if (arquivo) {
      corpo.conteudo = await paLerArquivoComoDataUrl(arquivo);
      corpo.nomeArquivo = arquivo.name;
      corpo.mimeType = arquivo.type;
    }

    if (editandoId) {
      await paFetch(`/auditoria-docs/${editandoId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(corpo)
      });
    } else {
      corpo.id = uid();
      await paFetch(`/auditoria-docs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(corpo)
      });
    }

    paFecharModalUpload();
    carregarPastaAuditoria(negocio);
  } catch (erro) {
    alert(`Não foi possível salvar o documento: ${erro.message}`);
  } finally {
    btn.disabled = false;
    btn.textContent = textoOriginal;
  }
}

document.addEventListener("DOMContentLoaded", () => {
  document.querySelectorAll("[data-abrir-upload-pasta-auditoria]").forEach(btn => {
    btn.addEventListener("click", () => paAbrirModalUpload(btn.dataset.abrirUploadPastaAuditoria));
  });

  document.querySelectorAll("[data-pasta-auditoria-filtro]").forEach(sel => {
    sel.addEventListener("change", () => carregarPastaAuditoria(sel.dataset.negocio));
  });

  document.getElementById("btn-fechar-upload-pasta-auditoria").addEventListener("click", paFecharModalUpload);
  document.getElementById("form-upload-pasta-auditoria").addEventListener("submit", paSubmeterUpload);
  document.getElementById("pasta-auditoria-form-categoria").addEventListener("change", (e) => {
    document.getElementById("pasta-auditoria-form-categoria-outro-wrap").classList.toggle("hidden", e.target.value !== "Outro");
  });

  document.querySelectorAll("#tab-pasta-auditoria-cs, #tab-pasta-auditoria-fa").forEach(painel => {
    painel.addEventListener("click", (e) => {
      const btnBaixar = e.target.closest("[data-pa-baixar]");
      const btnEditar = e.target.closest("[data-pa-editar]");
      const btnApagar = e.target.closest("[data-pa-apagar]");
      if (btnBaixar) paBaixarDocumento(btnBaixar.dataset.paBaixar);
      if (btnEditar) {
        const negocio = paNegocioDoPainel(btnEditar);
        const linhaId = btnEditar.dataset.paEditar;
        paFetch(`/auditoria-docs?actorUsuario=${encodeURIComponent(paActorUsuario())}&negocio=${negocio}`)
          .then(docs => docs.find(d => d.id === linhaId))
          .then(doc => { if (doc) paAbrirModalUpload(negocio, doc); });
      }
      if (btnApagar) paApagarDocumento(btnApagar.dataset.paApagar, paNegocioDoPainel(btnApagar));
    });
  });
});
