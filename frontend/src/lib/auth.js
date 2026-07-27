const USER_KEY = 'hub_v2_current_user';
const MODULO_KEY = 'hub_v2_modulo_atual';

export const ROLES = {
  OWNER: 'owner',
  CONSULTORA: 'consultora',
  CONSULTORA_DASHBOARD: 'consultora_dashboard',
  CONSULTORA_FA: 'consultora_fa',
};

export function getCurrentUser() {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function setCurrentUser(user) {
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function clearCurrentUser() {
  localStorage.removeItem(USER_KEY);
  localStorage.removeItem(MODULO_KEY);
}

export function getModuloAtual() {
  return localStorage.getItem(MODULO_KEY) || null;
}

export function setModuloAtual(modulo) {
  localStorage.setItem(MODULO_KEY, modulo);
}

export function isOwner(user) {
  return !!user && user.role === ROLES.OWNER;
}

export function isCacauShow(user) {
  return !!user && [ROLES.OWNER, ROLES.CONSULTORA, ROLES.CONSULTORA_DASHBOARD].includes(user.role);
}

export function isFacaAmigos(user) {
  return !!user && [ROLES.OWNER, ROLES.CONSULTORA_FA].includes(user.role);
}

export function isLiderOperacao(user) {
  return !!user && user.role === ROLES.CONSULTORA_DASHBOARD;
}

const NOMES_AUDITORIA = ['bruno', 'isabella', 'alexandra', 'liderop'];
export function podeVerAuditoria(user) {
  return !!user && NOMES_AUDITORIA.includes((user.nome || '').trim().toLowerCase());
}
