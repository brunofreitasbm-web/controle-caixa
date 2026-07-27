import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/apiClient.js';
import { getCurrentUser } from '../lib/auth.js';

// Registros de envelope do FaçaAmigos (tabela registros_fa) — endpoints
// paralelos aos do Cacau Show em routes/caixa.js.

export function useRegistrosFa() {
  return useQuery({
    queryKey: ['registros-fa'],
    queryFn: () => api.get('/api/registros-fa'),
  });
}

export function useFotoRegistroFa(id, enabled = true) {
  return useQuery({
    queryKey: ['registros-fa', id, 'foto'],
    queryFn: () => api.get(`/api/registros-fa/${id}/foto`),
    enabled: !!id && enabled,
    staleTime: Infinity,
  });
}

export function useCriarRegistroFa() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (registro) => {
      const usuario = getCurrentUser()?.nome || registro.consultor || '';
      return api.post('/api/registros-fa', registro, { params: { usuario } });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['registros-fa'] }),
  });
}

export function useAtualizarRegistroFa() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, dados }) => {
      const usuario = getCurrentUser()?.nome || '';
      return api.put(`/api/registros-fa/${id}?usuario=${encodeURIComponent(usuario)}`, dados);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['registros-fa'] }),
  });
}

export function useExcluirRegistroFa() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id) => {
      const usuario = getCurrentUser()?.nome || '';
      return api.del(`/api/registros-fa/${id}`, { usuario });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['registros-fa'] }),
  });
}

// Colaboradores — reaproveitado aqui para popular selects de consultora/FA
// (mesma fonte usada no login: GET /api/colaboradores).
export function useColaboradoresFa() {
  return useQuery({
    queryKey: ['colaboradores'],
    queryFn: () => api.get('/api/colaboradores'),
    select: (data) => (data || []).filter((c) => c.role === 'consultora_fa'),
  });
}
