// ==========================================================================
// MÓDULO: GERENCIAMENTO DE COLABORADORES & PINS (Acesso Bruno e Isabella)
// ==========================================================================

async function carregarColaboradores() {
  if (API_ONLINE) {
    try {
      const res = await fetch(`${API_BASE}/colaboradores`);
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        USERS = data.map(c => ({
          nome: c.nome,
          role: c.role,
          hasBiometricEnrolled: !!c.hasBiometricEnrolled,
          unidade: c.unidade || "",
          cpf: c.cpf || "",
          dataNascimento: c.dataNascimento || "",
          telefone: c.telefone || "",
          dataAdmissao: c.dataAdmissao || ""
        }));
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
          if (userDb) {
            currentUser.hasBiometricEnrolled = userDb.hasBiometricEnrolled;
            localStorage.setItem("session_user", JSON.stringify(currentUser));
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
    owner: "background: rgba(76, 175, 80, 0.12); color: var(--tone-success-ink);"
  };

  const unidadeLabels = {
    "9175": "🟣 9175 - Marambaia",
    "9201": "🟢 9201 - Mário Covas",
    "4304": "🔵 4304 - Icoaraci",
    "fa-parque": "🔴 FA - Parque Circuito",
    "fa-playground": "🟡 FA - ParqueShopping",
    "fa-grao-para": "🟤 FA - Grão-Pará",
    "all": "Todas as Lojas"
  };

  tbody.innerHTML = "";
  if (USERS.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding: 20px;">Nenhum colaborador encontrado.</td></tr>`;
    return;
  }

  USERS.forEach(u => {
    const tr = document.createElement("tr");
    const temPin = pins[u.nome] && pins[u.nome] !== '';
    const statusPinHtml = temPin
      ? `<span style="color: var(--tone-success-ink); font-weight: 500;">🔒 PIN Cadastrado</span>`
      : `<span style="color: var(--tone-danger-ink); font-weight: 500;">⚠️ Sem PIN (Cria no 1º login)</span>`;

    const labelRole = roleLabels[u.role] || u.role;
    const styleBadge = roleStyles[u.role] || "background: rgba(0,0,0,0.06); color: #333;";
    const labelUnidade = unidadeLabels[u.unidade] || "—";
    const btnResetarBiometriaHtml = u.hasBiometricEnrolled
      ? `<button class="btn-mini-outline btn-resetar-biometria" data-nome="${u.nome}" style="margin-right: 6px;">🧑‍💻 Resetar Biometria</button>`
      : "";

    tr.innerHTML = `
      <td><strong>${u.nome}</strong></td>
      <td><span style="padding: 4px 10px; border-radius: 12px; font-size: 0.82rem; font-weight: 600; display: inline-block; ${styleBadge}">${labelRole}</span></td>
      <td>${statusPinHtml}</td>
      <td>${labelUnidade}</td>
      <td style="text-align: right; white-space: nowrap;">
        <button class="btn-mini-outline btn-editar-colab" data-nome="${u.nome}" style="margin-right: 6px;">📝 Editar</button>
        <button class="btn-mini-outline btn-alterar-pin" data-nome="${u.nome}" style="margin-right: 6px;">✏️ Alterar PIN</button>
        ${btnResetarBiometriaHtml}
        <button class="btn-mini-outline btn-excluir-colab" data-nome="${u.nome}" style="color: var(--tone-danger-ink); border-color: var(--tone-danger-ink);">🗑️ Excluir</button>
      </td>
    `;
    tbody.appendChild(tr);
  });

  tbody.querySelectorAll(".btn-editar-colab").forEach(btn => {
    btn.onclick = () => preencherFormColaboradorParaEdicao(btn.dataset.nome);
  });

  tbody.querySelectorAll(".btn-alterar-pin").forEach(btn => {
    btn.onclick = () => abrirModalAdminPin(btn.dataset.nome);
  });

  tbody.querySelectorAll(".btn-resetar-biometria").forEach(btn => {
    btn.onclick = () => resetarBiometriaColaborador(btn.dataset.nome);
  });

  tbody.querySelectorAll(".btn-excluir-colab").forEach(btn => {
    btn.onclick = () => excluirColaborador(btn.dataset.nome);
  });
}

async function resetarBiometriaColaborador(nome) {
  if (!currentUser || currentUser.role !== "owner") {
    showToast("Apenas administradores podem resetar a biometria.", "erro");
    return;
  }
  const ok = await showModal(`Deseja resetar a biometria facial de "${nome}"? O colaborador precisará cadastrar o rosto novamente e as tentativas de bloqueio serão liberadas.`, {
    title: "Resetar Biometria",
    icon: "🧑‍💻",
    btnText: "Resetar Biometria",
    btnClass: "btn-danger"
  });
  if (!ok) return;

  try {
    const res = await fetch(`${API_BASE}/colaboradores/${encodeURIComponent(nome)}/reset-biometria`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ actorUsuario: currentUser.nome })
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    showToast(`Biometria de ${nome} resetada com sucesso.`, "sucesso");
    renderizarColaboradores();
  } catch (e) {
    console.error("Erro ao resetar biometria:", e);
    showToast("Não foi possível resetar a biometria.", "erro");
  }
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

// Nome original do colaborador em edição (null quando o form está em modo
// "cadastrar novo"). O backend faz upsert por nome via ON CONFLICT, então
// deixar o campo Nome editável durante a edição permitia digitar um nome
// diferente e criar sem querer um colaborador novo em vez de atualizar o
// existente. Travamos o campo enquanto em modo edição pra evitar isso.
let colabEditandoNomeOriginal = null;

function entrarModoEdicaoColaborador(nome) {
  colabEditandoNomeOriginal = nome;
  const inputNome = document.getElementById("colab-nome");
  inputNome.readOnly = true;
  inputNome.style.opacity = "0.7";
  document.getElementById("colab-edit-indicator").classList.remove("hidden");
  document.getElementById("colab-edit-indicator-nome").textContent = nome;
  document.getElementById("btn-salvar-colab").textContent = "Salvar Alterações";
}

function sairModoEdicaoColaborador() {
  colabEditandoNomeOriginal = null;
  const inputNome = document.getElementById("colab-nome");
  inputNome.readOnly = false;
  inputNome.style.opacity = "";
  document.getElementById("colab-edit-indicator").classList.add("hidden");
  document.getElementById("btn-salvar-colab").textContent = "Salvar Colaborador";
}

// Preenche o formulário com os dados de um colaborador já cadastrado —
// reaproveita o mesmo form de cadastro pra edição, mas trava o campo Nome
// (ver entrarModoEdicaoColaborador) pra garantir que "salvar" sempre
// atualiza o mesmo registro em vez de criar um colaborador novo.
function preencherFormColaboradorParaEdicao(nome) {
  const u = USERS.find(x => x.nome === nome);
  if (!u) return;
  document.getElementById("colab-nome").value = u.nome;
  document.getElementById("colab-cpf").value = u.cpf || "";
  document.getElementById("colab-nascimento").value = u.dataNascimento || "";
  document.getElementById("colab-telefone").value = u.telefone || "";
  document.getElementById("colab-role").value = u.role;
  document.getElementById("colab-unidade").value = u.unidade || "";
  document.getElementById("colab-admissao").value = u.dataAdmissao || "";
  document.getElementById("colab-pin").value = "";
  entrarModoEdicaoColaborador(nome);
  document.getElementById("form-cadastrar-colaborador").scrollIntoView({ behavior: "smooth", block: "start" });
  showToast(`Editando ${nome} — altere os campos e clique em "Salvar Alterações".`, "info");
}

const btnLimparFormColab = document.getElementById("btn-limpar-form-colab");
if (btnLimparFormColab) {
  btnLimparFormColab.onclick = () => {
    document.getElementById("form-cadastrar-colaborador").reset();
    sairModoEdicaoColaborador();
  };
}

const formCadastrarColab = document.getElementById("form-cadastrar-colaborador");
if (formCadastrarColab) {
  formCadastrarColab.onsubmit = async (e) => {
    e.preventDefault();
    // Em modo edição, usa o nome original travado (nunca o valor do input)
    // como trava extra contra criar um colaborador novo por engano.
    const nome = colabEditandoNomeOriginal || document.getElementById("colab-nome").value.trim();
    const role = document.getElementById("colab-role").value;
    const pin = document.getElementById("colab-pin").value.trim();
    const unidade = document.getElementById("colab-unidade").value;
    const cpf = document.getElementById("colab-cpf").value.trim();
    const dataNascimento = document.getElementById("colab-nascimento").value;
    const telefone = document.getElementById("colab-telefone").value.trim();
    const dataAdmissao = document.getElementById("colab-admissao").value;

    if (!nome) {
      showToast("Informe o nome do colaborador.", "erro");
      return;
    }

    if (pin && !pinValido(pin)) {
      showToast("Se informado, o PIN deve conter exatamente 4 dígitos.", "erro");
      return;
    }

    const payload = { nome, role, unidade, cpf, dataNascimento, telefone, dataAdmissao };

    if (API_ONLINE) {
      try {
        const res = await fetch(`${API_BASE}/colaboradores`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
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
      if (idx >= 0) Object.assign(USERS[idx], payload);
      else USERS.push(payload);
      localStorage.setItem("cacaushow_users_cache", JSON.stringify(USERS));
      if (pin) {
        pins[nome] = pin;
        localStorage.setItem(PIN_KEY, JSON.stringify(pins));
      }
    }

    showToast(`Colaborador "${nome}" salvo com sucesso!`, "sucesso");
    formCadastrarColab.reset();
    sairModoEdicaoColaborador();
    await renderizarColaboradores();
    await oferecerCadastroBiometriaColaborador(nome);
  };
}

const btnAtualizarColab = document.getElementById("btn-atualizar-colaboradores");
if (btnAtualizarColab) {
  btnAtualizarColab.onclick = async () => {
    await renderizarColaboradores();
    showToast("Lista de colaboradores atualizada.", "info");
  };
}
