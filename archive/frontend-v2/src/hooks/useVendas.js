import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/apiClient.js';

// --- Meta do dia da loja (routes/metas-lojas.js — só leitura/lançamento manual aqui) ---

export function useMetaDoDia(loja, data) {
  return useQuery({
    queryKey: ['metas-lojas', 'dia', loja, data],
    queryFn: () => api.get('/api/metas-lojas/dia', { loja, data }),
    enabled: !!loja && !!data,
  });
}

export function useDefinirMetaDoDia() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ loja, data, valor, origem = 'manual' }) =>
      api.post('/api/metas-lojas/importar', { loja, linhas: [{ data, valor, origem }] }),
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ['metas-lojas', 'dia', vars.loja, vars.data] });
    },
  });
}

// --- Checkpoints Meta Hora a Hora (routes/vendas.js) ---

export function useVendasHoje(operacao, data) {
  return useQuery({
    queryKey: ['vendas', 'hoje', operacao, data],
    queryFn: () => api.get('/api/vendas/hoje', { operacao, data }),
    enabled: !!operacao && !!data,
  });
}

export function useConfirmarCheckIn() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload) => api.post('/api/vendas/registrar', payload),
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ['vendas', 'hoje', vars.operacao, vars.data] });
    },
  });
}

// --- Vendas horárias: lançamento paralelo de venda acumulada por hora (routes/metas.js) ---

export function useVendasHorarias(loja, data) {
  return useQuery({
    queryKey: ['vendas-horarias', loja, data],
    queryFn: () => api.get('/api/vendas-horarias', { loja, data }),
    enabled: !!loja && !!data,
  });
}

export function useLancarVendaHoraria() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload) => api.post('/api/vendas-horarias', payload),
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ['vendas-horarias', vars.loja, vars.data] });
    },
  });
}
