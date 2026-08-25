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
