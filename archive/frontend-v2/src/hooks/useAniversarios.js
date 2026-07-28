import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/apiClient.js';
import { gerarMensagemAniversario } from '../features/aniversarios/templates.js';

export const ANIVERSARIOS_QUERY_KEY = ['aniversarios'];

export function useHojeAniversarios() {
  return useQuery({
    queryKey: [...ANIVERSARIOS_QUERY_KEY, 'hoje'],
    queryFn: () => api.get('/api/aniversarios/hoje'),
  });
}

export function useCadastradosAniversarios() {
  return useQuery({
    queryKey: [...ANIVERSARIOS_QUERY_KEY, 'cadastrados'],
    queryFn: () => api.get('/api/aniversarios/cadastrados'),
    select: (data) => data?.registros || [],
  });
}

export function useImportarPdfAniversarios() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (arquivo) => {
      const formData = new FormData();
      formData.append('arquivo', arquivo);
      return api.post('/api/aniversarios/importar-pdf', formData, { isFormData: true });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ANIVERSARIOS_QUERY_KEY }),
  });
}

export function useMarcarEnviadoAniversario() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id) => api.post('/api/aniversarios/marcar-enviado', { id }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ANIVERSARIOS_QUERY_KEY }),
  });
}

// Tenta a mensagem personalizada por IA (POST /api/ia/mensagem); se a IA não
// estiver habilitada, falhar ou não devolver texto, cai no sorteio local de
// template (templates.js) — mesmo contrato descrito em routes/ia.js.
export async function gerarMensagemAniversarioComIA({ nomeResponsavel, nomeCrianca, idade }) {
  try {
    const res = await api.post('/api/ia/mensagem', {
      tipo: 'aniversario',
      nomeResponsavel,
      nomeCrianca,
      idade,
    });
    if (res?.mensagem) return { texto: res.mensagem, fonte: 'ia' };
  } catch {
    // silencioso de propósito: sem IA, segue com o template sorteado
  }
  return { texto: gerarMensagemAniversario(nomeResponsavel, nomeCrianca, idade), fonte: 'fallback' };
}
