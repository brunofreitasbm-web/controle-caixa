import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/apiClient.js';
import { getCurrentUser } from '../lib/auth.js';

// Documentos legais/societários da Pasta de Auditoria, separados por negócio
// ("cacau-show" | "faca-amigos" — ver NEGOCIOS_VALIDOS em routes/auditoria-docs.js).
// O backend já filtra por querystring (negocio obrigatório; unidade/categoria/
// vencimento opcionais), então os filtros vão direto nos params da query.

export function auditoriaDocsQueryKey(negocio) {
  return ['auditoria-docs', negocio];
}

export function useAuditoriaDocs(negocio, filtros = {}) {
  const actorUsuario = getCurrentUser()?.nome || '';
  return useQuery({
    queryKey: [...auditoriaDocsQueryKey(negocio), filtros],
    queryFn: () => api.get('/api/auditoria-docs', { actorUsuario, negocio, ...filtros }),
    enabled: !!negocio && !!actorUsuario,
  });
}

export function useCriarDocumentoAuditoria(negocio) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload) => api.post('/api/auditoria-docs', payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: auditoriaDocsQueryKey(negocio) }),
  });
}

export function useEditarDocumentoAuditoria(negocio) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...payload }) => api.put(`/api/auditoria-docs/${id}`, payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: auditoriaDocsQueryKey(negocio) }),
  });
}

export function useApagarDocumentoAuditoria(negocio) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id) => api.del(`/api/auditoria-docs/${id}`, { actorUsuario: getCurrentUser()?.nome || '' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: auditoriaDocsQueryKey(negocio) }),
  });
}

// Busca o arquivo (data URL base64) sob demanda e dispara o download no
// navegador — o conteúdo pesado nunca vem na listagem (ver semConteudo em
// routes/auditoria-docs.js).
export async function baixarDocumentoAuditoria(doc) {
  const actorUsuario = getCurrentUser()?.nome || '';
  const dados = await api.get(`/api/auditoria-docs/${doc.id}/arquivo`, { actorUsuario });
  if (!dados?.conteudo) throw new Error('Arquivo vazio.');
  const resposta = await fetch(dados.conteudo);
  const blob = await resposta.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = dados.nomeArquivo || 'documento';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

export function lerArquivoComoDataUrl(arquivo) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target.result);
    reader.onerror = reject;
    reader.readAsDataURL(arquivo);
  });
}
