import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/apiClient.js';

// GET /api/logs — protegido no backend (routes/auth.js): só libera para
// bruno/isabella/alexandra/liderop (case-insensitive), exige ?usuario=.
// Devolve logs_auditoria ordenado por data desc, limit 100.
export function useAuditoriaLogs(usuario) {
  return useQuery({
    queryKey: ['auditoria', 'logs', usuario],
    queryFn: () => api.get('/api/logs', { usuario }),
    enabled: !!usuario,
  });
}
