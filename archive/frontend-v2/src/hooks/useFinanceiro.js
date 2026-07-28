import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/apiClient.js';

/**
 * Lojas Cacau Show com código interno (usado por NF-e/boletos/inventário,
 * que guardam a loja como código) e nome (usado por metas-lojas/metas, que
 * guardam a loja como nome). Mesma tabela usada pelo app antigo (webapp/app.js).
 */
export const LOJAS_CACAU_SHOW = [
  { codigo: '9175', nome: 'Marambaia' },
  { codigo: '4304', nome: 'Icoaraci' },
  { codigo: '9201', nome: 'Mário Covas' },
];

export function getLojaNomePorCodigo(codigo) {
  const loja = LOJAS_CACAU_SHOW.find((l) => l.codigo === codigo);
  return loja ? loja.nome : codigo || '—';
}

export function getLojaCodigoPorNome(nome) {
  const loja = LOJAS_CACAU_SHOW.find((l) => l.nome === nome);
  return loja ? loja.codigo : null;
}

/**
 * Detecta a loja a partir de um texto livre (razão social + CNPJ do
 * destinatário da NF-e, ou texto do relatório de títulos/boletos). Portado
 * de detectStoreFromRazaoSocial / detectStoreFromBoletoLine em webapp/app.js.
 */
export function detectStoreFromText(texto) {
  if (!texto) return null;
  const upper = texto.toString().toUpperCase();
  if (upper.includes('9201') || upper.includes('MARIO COVAS') || upper.includes('MÁRIO COVAS') || upper.includes('0001008688')) return '9201';
  if (upper.includes('4304') || upper.includes('ICOARACI') || upper.includes('0001008056')) return '4304';
  if (upper.includes('9175') || upper.includes('MARAMBAIA') || upper.includes('0001006495')) return '9175';
  return null;
}

const CLIENT_ID_KEY = 'hub_v2_client_id';

/** Mesma chave/estratégia usada por lib/realtime.jsx — permite reconhecer no
 * evento SSE que a própria aba foi a origem da escrita. */
export function getClientId() {
  try {
    let id = sessionStorage.getItem(CLIENT_ID_KEY);
    if (!id) {
      id = 'c-' + Math.random().toString(36).slice(2) + '-' + Date.now().toString(36);
      sessionStorage.setItem(CLIENT_ID_KEY, id);
    }
    return id;
  } catch {
    return undefined;
  }
}

// ==========================================================================
// NF-e
// ==========================================================================

export function useNfs() {
  return useQuery({ queryKey: ['nfs'], queryFn: () => api.get('/api/nfs') });
}

export function useImportarNfe() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ numero, info, products, usuario }) =>
      api.post('/api/nfs', { numero, info, products }, { params: { clientId: getClientId(), usuario } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['nfs'] }),
  });
}

export function useRegistrarItemNf() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ numero, code, countedQty, loja, usuario }) =>
      api.patch(`/api/nfs/${encodeURIComponent(numero)}/item/${encodeURIComponent(code)}`, {
        countedQty,
        loja,
        usuario,
        clientId: getClientId(),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['nfs'] }),
  });
}

export function useConcluirNf() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ numero, loja, usuario }) =>
      api.post(`/api/nfs/${encodeURIComponent(numero)}/concluir`, { loja, usuario, clientId: getClientId() }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['nfs'] }),
  });
}

// ==========================================================================
// Boletos
// ==========================================================================

export function useBoletos() {
  return useQuery({ queryKey: ['boletos'], queryFn: () => api.get('/api/boletos') });
}

export function useImportarBoletos() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ boletos, usuario }) =>
      api.post('/api/boletos/import', { boletos }, { params: { clientId: getClientId(), usuario } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['boletos'] }),
  });
}

export function useMarcarBoletoPago() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, usuario }) =>
      api.post(`/api/boletos/pago`, { id, clientId: getClientId() }, { params: { usuario } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['boletos'] }),
  });
}

export function useExcluirBoleto() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, usuario }) => api.del(`/api/boletos/${id}`, { clientId: getClientId(), usuario }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['boletos'] }),
  });
}
