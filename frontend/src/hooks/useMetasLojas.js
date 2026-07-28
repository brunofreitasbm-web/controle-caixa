import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/apiClient.js';
import { getClientId } from './useFinanceiro.js';

// ==========================================================================
// Metas diárias por loja (planilha "$ Meta Total") — alimenta o Meta Hora a
// Hora. Endpoint: POST /api/metas-lojas/importar { loja, linhas: [{data, valor, origem}] }
// ==========================================================================

export function useImportarMetasLojas() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ loja, linhas, usuario }) =>
      api.post('/api/metas-lojas/importar', { loja, linhas, clientId: getClientId() }, { params: { usuario } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['metas-lojas'] }),
  });
}

export function useMetaDiaLoja(loja, data) {
  return useQuery({
    queryKey: ['metas-lojas', 'dia', loja, data],
    queryFn: () => api.get('/api/metas-lojas/dia', { loja, data }),
    enabled: !!loja && !!data,
  });
}

// ==========================================================================
// Meta do Ano — meta anual/mensal por loja. Endpoint aceita payload já
// estruturado (routes/metas.js): { ano, loja, metaAnual, metaMensal, origem }
// ==========================================================================

export function useMetas({ ano, loja } = {}) {
  return useQuery({
    queryKey: ['metas', ano || null, loja || null],
    queryFn: () => api.get('/api/metas', { ano, loja }),
  });
}

export function useImportarMeta() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ ano, loja, metaAnual, metaMensal, origem, usuario }) =>
      api.post('/api/metas/importar', { ano, loja, metaAnual, metaMensal, origem }, { params: { clientId: getClientId(), usuario } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['metas'] }),
  });
}

export function useExcluirMeta() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, usuario }) => api.del(`/api/metas/${id}`, { clientId: getClientId(), usuario }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['metas'] }),
  });
}
