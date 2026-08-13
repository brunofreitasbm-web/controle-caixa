
// --- Integração iFood ---

async function carregarStatusIfood() {
  const listContainer = document.getElementById('ifood-synced-list');
  if (!listContainer) return;

  try {
    const response = await apiFetch(`/api/ifood/sync-status?loja=${currentStore}`);
    const data = await response.json();

    if (data.length === 0) {
      listContainer.innerHTML = '<div class="text-center text-ink-muted text-sm py-4">Nenhum produto sincronizado recentemente.</div>';
      return;
    }

    listContainer.innerHTML = '';
    data.forEach(item => {
      const isAtivo = item.status_enviado === "AVAILABLE";
      const statusClass = isAtivo ? "bg-success" : "bg-ink-muted";
      const statusText = isAtivo ? "Ativo" : "Pausado";
      const opacityClass = isAtivo ? "" : "opacity-75";
      
      const itemHTML = `
        <div class="flex justify-between items-center bg-surface-1 p-3 rounded-xl border border-subtle ${opacityClass}">
          <div>
            <p class="text-sm font-bold text-ink">${item.descricao}</p>
            <p class="text-xs text-ink-muted">Cód Local: ${item.codProdutoLocal || '--'} | Cód iFood: ${item.codProdutoIfood}</p>
          </div>
          <label class="relative inline-flex items-center">
            <div class="w-11 h-6 bg-surface-3 rounded-full relative ${isAtivo ? 'bg-success' : ''}">
              <div class="absolute top-[2px] left-[2px] bg-paper border border-border rounded-full h-5 w-5 transition-all ${isAtivo ? 'translate-x-[20px] border-white' : ''}"></div>
            </div>
            <span class="ml-2 text-xs font-bold ${isAtivo ? 'text-ink' : 'text-ink-muted'}">${statusText}</span>
          </label>
        </div>
      `;
      listContainer.insertAdjacentHTML('beforeend', itemHTML);
    });

  } catch (err) {
    console.error('Erro ao carregar status do iFood:', err);
    listContainer.innerHTML = '<div class="text-center text-danger text-sm py-4">Erro ao carregar dados.</div>';
  }
}

const btnIfoodSync = document.getElementById("btn-ifood-sync");
if (btnIfoodSync) {
  btnIfoodSync.addEventListener("click", async () => {
    btnIfoodSync.disabled = true;
    const originalText = btnIfoodSync.innerHTML;
    btnIfoodSync.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Sincronizando...';
    
    try {
      const res = await apiFetch("/api/ifood/sync-force", {
        method: "POST",
        body: JSON.stringify({ loja: currentStore })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        showToast(`Sincronização concluída! ${data.count} itens emparelhados.`);
        carregarStatusIfood();
      } else {
        showToast(data.error || "Falha na sincronização.", "error");
      }
    } catch (err) {
      console.error(err);
      showToast("Erro de rede ao forçar sincronização.", "error");
    } finally {
      btnIfoodSync.disabled = false;
      btnIfoodSync.innerHTML = originalText;
    }
  });
}

// Escuta a troca de abas para carregar o status quando abrir a aba do iFood
document.addEventListener("tabAtivaAlterada", (e) => {
  if (e.detail.tab === "ifood") {
    carregarStatusIfood();
  }
});
