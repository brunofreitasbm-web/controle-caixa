// ==========================================================================
// MÓDULO META HORA A HORA — meta diária real vem das planilhas importadas
// (Importações > Metas Diárias). Colaboradora confirma, por check-in, o
// valor vendido em cada intervalo de hora, numa janela que abre 5min antes
// e fecha 20min depois do horário.
// Não usa dados do Controle de Caixa/envelopes.
//
// Nota: só os utilitários/constantes auto-contidos deste módulo foram
// extraídos nesta leva. O restante da lógica da aba (inicializarMetaHoraHora
// e afins) ainda mora em app.js, mais adiante no arquivo, intercalado com os
// blocos de pós-visita/aniversários — não é uma faixa de linhas contígua,
// então fica para uma leva de extração futura dedicada.
// ==========================================================================
let metaOperacaoAtiva = null;
const META_JANELA_ABERTURA_ANTES_MIN = 5;
const META_JANELA_FECHAMENTO_DEPOIS_MIN = 20;

function minutosDoDiaPorHora(horaStr) {
  const [h, m] = (horaStr || "09:00").split(":").map(Number);
  return h * 60 + (m || 0);
}

function horaStrPorMinutos(min) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function amanhaStr(hojeStr) {
  const [y, m, d] = hojeStr.split("-").map(Number);
  const dt = new Date(y, m - 1, d + 1);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
}

async function buscarMetaDiaLoja(loja, data) {
  try {
    const res = await fetch(`${API_BASE}/metas-lojas/dia?loja=${encodeURIComponent(loja)}&data=${encodeURIComponent(data)}`);
    const json = await res.json();
    return json.meta || null;
  } catch (err) {
    console.error("Erro ao buscar meta diária da loja:", err);
    return null;
  }
}
