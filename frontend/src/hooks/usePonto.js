import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/apiClient.js';
import { ROLES } from '../lib/auth.js';

// Operações Cacau Show / Faça Amigos — mesmos rótulos do app antigo
// (webapp/app.js: LOJAS / LOJAS_FA). Usadas como fallback de nome de loja e
// como chave dos objetos de geolocalização/horário salvos em /api/config.
export const OPERACOES_CACAU_SHOW = ['Marambaia', 'Icoaraci', 'Mário Covas', 'Venda Direta'];
export const OPERACOES_FACA_AMIGOS = ['Grão Pará', 'ParqueShopping', 'Parque Circuito'];

// Coordenadas padrão (mesmo fallback do webapp) — usadas só enquanto a
// operação não tiver coordenadas próprias salvas em Configurações.
const DEFAULT_GEOLOC = {
  Marambaia: { lat: -1.4116, lng: -48.4418 },
  Icoaraci: { lat: -1.3039, lng: -48.4878 },
  'Mário Covas': { lat: -1.3815, lng: -48.4115 },
  'Grão Pará': { lat: 0, lng: 0 },
  ParqueShopping: { lat: 0, lng: 0 },
  'Parque Circuito': { lat: 0, lng: 0 },
};

export function getOperacoesParaUsuario(user) {
  if (!user) return OPERACOES_CACAU_SHOW;
  if (user.role === ROLES.CONSULTORA_FA) return OPERACOES_FACA_AMIGOS;
  if (user.role === ROLES.OWNER) return [...OPERACOES_CACAU_SHOW, ...OPERACOES_FACA_AMIGOS];
  return OPERACOES_CACAU_SHOW;
}

// GET /api/config é a mesma configuração genérica editada na tela de
// Configurações (outro agente cuida da UI de edição) — aqui só lemos as
// chaves de geofencing/horário/contador que interessam ao Ponto.
export function useConfigGeral() {
  return useQuery({
    queryKey: ['config'],
    queryFn: () => api.get('/api/config'),
    staleTime: 60_000,
  });
}

export function parseConfigOperacoes(config) {
  const raio = config?.geofenceRaioMetros !== undefined ? parseInt(config.geofenceRaioMetros, 10) || 50 : 50;
  let geoloc = {};
  let horarios = {};
  try {
    geoloc = config?.operacoesGeoloc ? JSON.parse(config.operacoesGeoloc) : {};
  } catch {
    geoloc = {};
  }
  try {
    horarios = config?.operacoesConfig ? JSON.parse(config.operacoesConfig) : {};
  } catch {
    horarios = {};
  }
  return { raio, geoloc: { ...DEFAULT_GEOLOC, ...geoloc }, horarios };
}

export function useHistoricoPonto(usuario) {
  return useQuery({
    queryKey: ['ponto', 'historico', usuario],
    queryFn: () => api.get('/api/ponto/historico', { usuario }),
    enabled: !!usuario,
  });
}

export function useRelatorioPonto(operacao) {
  return useQuery({
    queryKey: ['ponto', 'relatorio', operacao],
    queryFn: () => api.get('/api/ponto/relatorio', { operacao }),
  });
}

export function useSincronizarPonto() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (record) => api.post('/api/ponto/sync', { records: [record] }),
    onSuccess: (_data, record) => {
      queryClient.invalidateQueries({ queryKey: ['ponto', 'historico', record.usuario] });
      queryClient.invalidateQueries({ queryKey: ['ponto', 'relatorio'] });
    },
  });
}

export function useSolicitarAjustePonto() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload) => api.post('/api/ponto/ajuste', payload),
    onSuccess: (_data, payload) => {
      queryClient.invalidateQueries({ queryKey: ['ponto', 'historico', payload.usuario] });
    },
  });
}

export function useEnviarFolhaPontoEmail() {
  return useMutation({
    mutationFn: (payload) => api.post('/api/ponto/folha-email', payload),
  });
}

export function useBiometriaSalva(usuario) {
  return useQuery({
    queryKey: ['ponto', 'biometria', usuario],
    queryFn: () => api.get(`/api/ponto/biometria/${encodeURIComponent(usuario)}`),
    enabled: !!usuario,
    staleTime: 30_000,
  });
}
