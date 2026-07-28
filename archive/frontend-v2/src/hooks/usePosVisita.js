import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/apiClient.js';
import { gerarMensagemPosVisita } from '../features/posVisita/templates.js';

export const POS_VISITA_QUERY_KEY = ['pos-visita'];

export function usePendentesPosVisita() {
  return useQuery({
    queryKey: [...POS_VISITA_QUERY_KEY, 'pendentes'],
    queryFn: () => api.get('/api/pos-visita/pendentes'),
    select: (data) => data?.registros || [],
  });
}

export function useRelatorioPosVisita(mes) {
  return useQuery({
    queryKey: [...POS_VISITA_QUERY_KEY, 'relatorio', mes || 'atual'],
    queryFn: () => api.get('/api/pos-visita/relatorio', mes ? { mes } : undefined),
  });
}

export function useImportarCsvPosVisita() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ arquivo, dataSessao }) => {
      const formData = new FormData();
      formData.append('arquivo', arquivo);
      formData.append('dataSessao', dataSessao);
      return api.post('/api/pos-visita/importar-csv', formData, { isFormData: true });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: POS_VISITA_QUERY_KEY }),
  });
}

export function useMarcarEnviadaPosVisita() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id) => api.post('/api/pos-visita/marcar-enviada', { id }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: POS_VISITA_QUERY_KEY }),
  });
}

// Tenta a mensagem personalizada por IA (POST /api/ia/mensagem); se a IA não
// estiver habilitada, falhar ou não devolver texto, cai no sorteio local de
// template (templates.js) — mesmo contrato descrito em routes/ia.js.
export async function gerarMensagemPosVisitaComIA({ nomeResponsavel, nomeCrianca, tempoTotalMinutos, jaContactadoAntes }) {
  try {
    const res = await api.post('/api/ia/mensagem', {
      tipo: 'pos-visita',
      nomeResponsavel,
      nomeCrianca,
      tempoTotalMinutos,
      jaContactadoAntes: !!jaContactadoAntes,
    });
    if (res?.mensagem) return { texto: res.mensagem, fonte: 'ia' };
  } catch {
    // silencioso de propósito: sem IA, segue com o template sorteado
  }
  return { texto: gerarMensagemPosVisita(nomeResponsavel, nomeCrianca), fonte: 'fallback' };
}
