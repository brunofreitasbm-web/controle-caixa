import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/apiClient.js';
import { formatBRL, formatDateTime } from '../lib/format.js';

// Lojas do Cacau Show (mesma lista usada no webapp/app.js — const LOJAS).
export const LOJAS_CACAU_SHOW = ['Marambaia', 'Icoaraci', 'Mário Covas', 'Venda Direta'];

// Além das lojas ativas, o histórico legado também guarda registros de uma
// loja descontinuada ("Desligado") — mantido só como opção de filtro.
export const LOJAS_FILTRO_HISTORICO = [...LOJAS_CACAU_SHOW, 'Desligado'];

export const STATUS_LABELS = {
  aberto: 'Aberto',
  aguardando_retirada: 'Aguardando retirada',
  retirado: 'Retirado',
};

export const STATUS_BADGE = {
  aberto: 'info',
  aguardando_retirada: 'atencao',
  retirado: 'pago',
};

// Nomes que podem confirmar retirada de envelope (routes/caixa.js não impõe essa
// regra no backend, é uma regra de UI replicada do webapp/app.js — RETIRADA_PERMITIDA).
export const RETIRADA_PERMITIDA = ['Bruno', 'Isabella', 'Alexandra', 'LiderOP'];

// Dias aguardando retirada a partir dos quais o envelope é sinalizado como risco
// (webapp/app.js — RISCO_DIAS).
export const RISCO_DIAS = 2;

export const REGISTROS_QUERY_KEY = ['caixa', 'registros'];

export function useRegistros() {
  return useQuery({
    queryKey: REGISTROS_QUERY_KEY,
    queryFn: () => api.get('/api/registros'),
  });
}

export function useCriarRegistro() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ registro, usuario }) => api.post('/api/registros', registro, { params: { usuario } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: REGISTROS_QUERY_KEY }),
  });
}

export function useAtualizarRegistro() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, campos, usuario }) => {
      const query = usuario ? `?usuario=${encodeURIComponent(usuario)}` : '';
      return api.put(`/api/registros/${id}${query}`, campos);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: REGISTROS_QUERY_KEY }),
  });
}

export function useExcluirRegistro() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, usuario }) => api.del(`/api/registros/${id}`, { usuario }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: REGISTROS_QUERY_KEY }),
  });
}

// Notificação (por e-mail, silenciosa) de divergência de fundo de caixa entre a
// abertura atual e o último fechamento da loja — POST /api/divergencia.
export function useEnviarDivergencia() {
  return useMutation({
    mutationFn: (payload) => api.post('/api/divergencia', payload),
  });
}

// Busca a foto (base64) de um registro sob demanda — GET /api/registros/:id/foto.
export function useFotoRegistro() {
  return useMutation({
    mutationFn: (id) => api.get(`/api/registros/${id}/foto`),
  });
}

export function useColaboradores() {
  return useQuery({
    queryKey: ['colaboradores'],
    queryFn: () => api.get('/api/colaboradores'),
    staleTime: 5 * 60_000,
  });
}

// --- utilidades de data/valor replicadas do webapp/app.js ---

export function diffDias(iso) {
  const ms = Date.now() - new Date(iso).getTime();
  return Math.max(0, Math.floor(ms / (1000 * 60 * 60 * 24)));
}

export function mesmoDia(isoA, isoB) {
  const a = new Date(isoA);
  const b = new Date(isoB);
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function mesKey(iso) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function mesLabel(chave) {
  const [ano, mes] = String(chave).split('-');
  const nomes = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
  return `${nomes[Number(mes) - 1] || mes}/${ano}`;
}

export function toDatetimeLocal(date = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

// Mensagem de aviso de abertura/fechamento para colar no WhatsApp do grupo da
// loja — mesmo formato do gerador do webapp/app.js (mensagemAviso).
export function montarMensagemAviso(registro) {
  if (!registro) return '';
  if (registro.tipoOperacao === 'Abertura') {
    return (
      `🔔 Abertura de Caixa - Cacau Show\n` +
      `Loja: ${registro.loja}\n` +
      `Consultor: ${registro.consultor}\n` +
      `Data: ${formatDateTime(registro.dataOperacao)}\n` +
      `Fundo de Caixa: ${formatBRL(registro.fundoCaixa)}`
    );
  }
  return (
    `🔔 Fechamento de Caixa - Cacau Show\n` +
    `Loja: ${registro.loja}\n` +
    `Consultor: ${registro.consultor}\n` +
    `Data: ${formatDateTime(registro.dataOperacao)}\n` +
    `Fundo de Caixa: ${formatBRL(registro.fundoCaixa)}\n` +
    `Valor do Envelope: ${formatBRL(registro.valorEnvelope)}\n` +
    `Valor Faturado: ${formatBRL(registro.valorFaturado)}\n` +
    (registro.sangria ? `Sangria: ${formatBRL(registro.sangria)}\n` : '')
  );
}
