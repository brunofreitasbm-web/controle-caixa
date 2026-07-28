import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/apiClient.js';

// GET /api/config devolve um único objeto { chave: valor } com TODAS as
// configurações salvas (chave/valor genérico) — cada card de Configurações
// lê as chaves que lhe interessam desse mesmo objeto.
export function useConfig() {
  return useQuery({
    queryKey: ['config'],
    queryFn: () => api.get('/api/config'),
    staleTime: 60_000,
  });
}

export function useSalvarConfig() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ chave, valor }) => api.post('/api/config', { chave, valor }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['config'] }),
  });
}

export function useColaboradores() {
  return useQuery({
    queryKey: ['colaboradores'],
    queryFn: () => api.get('/api/colaboradores'),
    staleTime: 60_000,
  });
}

// GET /api/pins retorna { usuario: '****' } para todo mundo que tem PIN
// cadastrado — nunca o PIN real.
export function usePins() {
  return useQuery({
    queryKey: ['pins'],
    queryFn: () => api.get('/api/pins'),
    staleTime: 30_000,
  });
}

export function useSalvarPin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ usuario, pin }) => api.post('/api/pins', { usuario, pin }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['pins'] }),
  });
}

export function useRemoverPin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (usuario) => api.del(`/api/pins/${encodeURIComponent(usuario)}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['pins'] }),
  });
}

export function useNotificarGestao() {
  return useMutation({
    mutationFn: ({ destinatarios, assunto, mensagem }) =>
      api.post('/api/notificar-gestao', { destinatarios, assunto, mensagem }),
  });
}

export function useBackupManual() {
  return useMutation({
    mutationFn: () => api.get('/api/cron/backup-mensal'),
  });
}
