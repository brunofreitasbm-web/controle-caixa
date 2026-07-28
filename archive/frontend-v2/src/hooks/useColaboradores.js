import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/apiClient.js';

export function useColaboradores() {
  return useQuery({
    queryKey: ['colaboradores'],
    queryFn: () => api.get('/api/colaboradores'),
  });
}

export function useSalvarColaborador() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload) => api.post('/api/colaboradores', payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['colaboradores'] });
    },
  });
}

export function useExcluirColaborador() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (nome) => api.del(`/api/colaboradores/${encodeURIComponent(nome)}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['colaboradores'] });
    },
  });
}

// Redefinição excepcional de biometria — exige `actorUsuario` (dono/owner)
// no corpo, checado pelo middleware requireOwner no backend.
export function useResetarBiometria() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ nome, actorUsuario }) =>
      api.post(`/api/colaboradores/${encodeURIComponent(nome)}/reset-biometria`, { actorUsuario }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['colaboradores'] });
    },
  });
}
