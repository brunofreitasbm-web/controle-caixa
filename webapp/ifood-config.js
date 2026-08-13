document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('ifood-form');
  const lojaSelect = document.getElementById('loja');
  const inputMerchantId = document.getElementById('merchantId');
  const inputClientId = document.getElementById('clientId');
  const inputClientSecret = document.getElementById('clientSecret');
  const feedbackEl = document.getElementById('feedback-message');
  const btnSalvar = document.getElementById('btn-salvar');

  function showFeedback(message, type = 'success') {
    feedbackEl.textContent = message;
    feedbackEl.className = `p-4 mb-4 text-sm font-medium rounded-lg ${type === 'success' ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-red-50 text-red-800 border border-red-200'}`;
    feedbackEl.classList.remove('hidden');
    setTimeout(() => feedbackEl.classList.add('hidden'), 5000);
  }

  // Ao mudar de loja, busca as configurações atuais
  lojaSelect.addEventListener('change', async () => {
    const loja = lojaSelect.value;
    if (!loja) return;

    inputMerchantId.value = '';
    inputClientId.value = '';
    inputClientSecret.value = '';

    try {
      const res = await fetch(`/api/ifood-config?loja=${encodeURIComponent(loja)}`);
      const json = await res.json();
      
      if (json.success && json.data) {
        inputMerchantId.value = json.data.merchantId || '';
        inputClientId.value = json.data.clientId || '';
        // Secret não é retornado pelo backend por segurança
        inputClientSecret.placeholder = '•••••••• (Preenchido)';
      } else {
        inputClientSecret.placeholder = 'Seu Client Secret';
      }
    } catch (err) {
      console.error('Erro ao buscar configuração:', err);
    }
  });

  // Salvar configuração
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const loja = lojaSelect.value;
    const merchantId = inputMerchantId.value.trim();
    const clientId = inputClientId.value.trim();
    const clientSecret = inputClientSecret.value.trim();

    if (!loja || !merchantId || !clientId) {
      showFeedback('Preencha os campos obrigatórios.', 'error');
      return;
    }

    const btnOriginalHTML = btnSalvar.innerHTML;
    btnSalvar.disabled = true;
    btnSalvar.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Salvando...';

    try {
      const res = await fetch('/api/ifood-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ loja, merchantId, clientId, clientSecret })
      });

      const json = await res.json();
      
      if (json.success) {
        showFeedback('Configuração salva com sucesso!');
        inputClientSecret.value = ''; // Limpa o campo secret após salvar
        inputClientSecret.placeholder = '•••••••• (Preenchido)';
      } else {
        showFeedback(json.error || 'Erro ao salvar as configurações', 'error');
      }
    } catch (err) {
      console.error(err);
      showFeedback('Erro de conexão ao salvar.', 'error');
    } finally {
      btnSalvar.disabled = false;
      btnSalvar.innerHTML = btnOriginalHTML;
    }
  });
});
