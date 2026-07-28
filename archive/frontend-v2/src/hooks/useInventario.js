import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/apiClient.js';
import { getClientId } from './useFinanceiro.js';

export function useInventarioLoja(loja) {
  return useQuery({
    queryKey: ['inventario', loja],
    queryFn: () => api.get('/api/inventario', { loja }),
    enabled: !!loja,
  });
}

export function useSalvarItemInventario() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ loja, cod, item, usuario }) => {
      const qs = new URLSearchParams({ usuario: usuario || '', clientId: getClientId() || '' }).toString();
      return api.put(`/api/inventario/${encodeURIComponent(loja)}/${encodeURIComponent(cod)}?${qs}`, item);
    },
    onSuccess: (_data, variables) => qc.invalidateQueries({ queryKey: ['inventario', variables.loja] }),
  });
}

export function useSalvarItensInventarioEmLote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ loja, itens, usuario, origem }) =>
      api.post('/api/inventario/bulk', { loja, itens, usuario, clientId: getClientId(), origem }),
    onSuccess: (_data, variables) => qc.invalidateQueries({ queryKey: ['inventario', variables.loja] }),
  });
}

export function useExcluirItemInventario() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ loja, cod, usuario }) =>
      api.del(`/api/inventario/${encodeURIComponent(loja)}/${encodeURIComponent(cod)}`, { usuario, clientId: getClientId() }),
    onSuccess: (_data, variables) => qc.invalidateQueries({ queryKey: ['inventario', variables.loja] }),
  });
}

/**
 * Consulta de código de barras — GET /api/codbarra-consulta (fora de
 * qualquer router, montado direto no server.js). Devolve um CSV
 * (CodProd, Desc. Prod., CodBarra); aqui já convertido num mapa por barras.
 */
export function useCodBarraConsulta() {
  return useQuery({
    queryKey: ['codbarra-consulta'],
    queryFn: async () => {
      const csv = await api.get('/api/codbarra-consulta');
      const texto = typeof csv === 'string' ? csv : '';
      const linhas = texto.split(/\r?\n/).filter(Boolean);
      const mapa = {};
      for (let i = 1; i < linhas.length; i++) {
        const [codProd, desc, barras] = linhas[i].split(',');
        if (!barras) continue;
        mapa[barras.trim()] = { codProd: (codProd || '').trim(), descricao: (desc || '').trim() };
      }
      return mapa;
    },
    staleTime: 10 * 60_000,
  });
}
