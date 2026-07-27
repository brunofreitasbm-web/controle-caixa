import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/apiClient.js';

// Os dados de IA já são cacheados no backend (tabela ia_cache), então o
// staleTime aqui é alto de propósito: não precisamos bater na API a cada
// foco de janela, só quando o usuário pedir explicitamente ("Gerar
// novamente") ou trocar os parâmetros da consulta.
const STALE_TIME_IA = 10 * 60_000;

export function useIAStatus() {
  return useQuery({
    queryKey: ['ia', 'status'],
    queryFn: () => api.get('/api/ia/status'),
    staleTime: 5 * 60_000,
    retry: false,
  });
}

// --------------------------------------------------------------------------
// Briefing diário
// --------------------------------------------------------------------------
export function useIABriefing({ data } = {}) {
  return useQuery({
    queryKey: ['ia', 'briefing', data || 'hoje'],
    queryFn: () => api.get('/api/ia/briefing', { data: data || undefined }),
    staleTime: STALE_TIME_IA,
    retry: false,
  });
}

export function useIABriefingRefresh() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data) => api.get('/api/ia/briefing', { data: data || undefined, forcar: 'true' }),
    onSuccess: (resultado, data) => {
      queryClient.setQueryData(['ia', 'briefing', data || 'hoje'], resultado);
    },
  });
}

// --------------------------------------------------------------------------
// Coach de conversão por colaboradora (FaçaAmigos)
// --------------------------------------------------------------------------
export function useIACoach({ usuario, unidade, competencia }, { enabled = true } = {}) {
  return useQuery({
    queryKey: ['ia', 'coach', usuario, unidade || 'todas', competencia],
    queryFn: () => api.get('/api/ia/coach', { usuario, unidade: unidade || undefined, competencia }),
    enabled: enabled && !!usuario && !!competencia,
    staleTime: STALE_TIME_IA,
    retry: false,
  });
}

export function useIACoachRefresh() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ usuario, unidade, competencia }) =>
      api.get('/api/ia/coach', { usuario, unidade: unidade || undefined, competencia, forcar: 'true' }),
    onSuccess: (resultado, { usuario, unidade, competencia }) => {
      queryClient.setQueryData(['ia', 'coach', usuario, unidade || 'todas', competencia], resultado);
    },
  });
}

// --------------------------------------------------------------------------
// Escala inteligente
// --------------------------------------------------------------------------
export function useIAEscala({ loja, data, janela }, { enabled = true } = {}) {
  return useQuery({
    queryKey: ['ia', 'escala', loja, data || 'hoje', janela || 60],
    queryFn: () => api.get('/api/ia/escala', { loja, data: data || undefined, janela: janela || undefined }),
    enabled: enabled && !!loja,
    staleTime: STALE_TIME_IA,
    retry: false,
  });
}

export function useIAEscalaRefresh() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ loja, data, janela }) =>
      api.get('/api/ia/escala', { loja, data: data || undefined, janela: janela || undefined, forcar: 'true' }),
    onSuccess: (resultado, { loja, data, janela }) => {
      queryClient.setQueryData(['ia', 'escala', loja, data || 'hoje', janela || 60], resultado);
    },
  });
}
