const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';
const TOKEN_KEY = 'saas_admin_token';

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

async function request(path, options = {}) {
  const token = getToken();
  const headers = { 'Content-Type': 'application/json', ...options.headers };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${API_URL}${path}`, { ...options, headers });
  const isJson = res.headers.get('content-type')?.includes('application/json');
  const body = isJson ? await res.json() : null;

  if (!res.ok) {
    throw new Error(body?.error || `Erro ${res.status} em ${path}`);
  }
  return body;
}

export const api = {
  login: (usuario, pin) => request('/api/auth/verify', { method: 'POST', body: JSON.stringify({ usuario, pin }) }),
  bootstrap: () => request('/api/tenant/bootstrap'),
  unidades: () => request('/api/tenant/unidades'),
  criarUnidade: (dados) => request('/api/tenant/unidades', { method: 'POST', body: JSON.stringify(dados) }),
  atualizarUnidade: (id, dados) => request(`/api/tenant/unidades/${id}`, { method: 'PUT', body: JSON.stringify(dados) }),
  desativarUnidade: (id) => request(`/api/tenant/unidades/${id}`, { method: 'DELETE' }),
  plano: () => request('/api/tenant/plano'),
  iaConfig: () => request('/api/tenant/ia-config'),
  salvarIaConfig: (chave, valor) => request('/api/tenant/ia-config', { method: 'PUT', body: JSON.stringify({ chave, valor }) }),
  alternarModulo: (chave, habilitado) => request(`/api/tenant/modules/${chave}`, { method: 'PUT', body: JSON.stringify({ habilitado }) }),
};
