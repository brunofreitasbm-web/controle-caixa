import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/apiClient.js';
import { parseRegraFaBonificacao } from '../features/facaAmigos/constants.js';

// Bonificação do FaçaAmigos (routes/fa-bonificacao.js) — diária, mês,
// mês-todas, regras (conversão) e regras-locacoes (Parque Circuito).

export function useRegraBonificacao(competencia) {
  return useQuery({
    queryKey: ['fa-bonificacao-regras', competencia],
    queryFn: async () => {
      const data = await api.get('/api/fa-bonificacao/regras', { competencia });
      return { regra: parseRegraFaBonificacao(data.regra), origem: data.origem };
    },
    enabled: !!competencia,
  });
}

export function useRegraLocacoes(competencia) {
  return useQuery({
    queryKey: ['fa-regras-locacoes', competencia],
    queryFn: () => api.get('/api/fa-bonificacao/regras-locacoes', { competencia }),
    enabled: !!competencia,
  });
}

export function useLancamentosMes(usuario, unidade, competencia) {
  return useQuery({
    queryKey: ['fa-bonificacao-mes', usuario, unidade, competencia],
    queryFn: async () => {
      const data = await api.get('/api/fa-bonificacao/mes', { usuario, unidade, competencia });
      return data.lancamentos || [];
    },
    enabled: !!usuario && !!competencia,
  });
}

export function useLancamentosMesTodas(unidade, competencia) {
  return useQuery({
    queryKey: ['fa-bonificacao-mes-todas', unidade, competencia],
    queryFn: async () => {
      const data = await api.get('/api/fa-bonificacao/mes-todas', { unidade, competencia });
      return data.lancamentos || [];
    },
    enabled: !!competencia,
  });
}

export function useSalvarDiaria() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body) => api.post('/api/fa-bonificacao/diaria', body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fa-bonificacao-mes'] });
      queryClient.invalidateQueries({ queryKey: ['fa-bonificacao-mes-todas'] });
    },
  });
}

export function useSalvarRegrasBonificacao() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body) => api.post('/api/fa-bonificacao/regras', body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['fa-bonificacao-regras'] }),
  });
}

export function useSalvarRegrasLocacoes() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body) => api.post('/api/fa-bonificacao/regras-locacoes', body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['fa-regras-locacoes'] }),
  });
}
