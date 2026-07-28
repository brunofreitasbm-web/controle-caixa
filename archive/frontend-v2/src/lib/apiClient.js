const API_BASE = import.meta.env.VITE_API_BASE || '';

async function request(path, { method = 'GET', body, params, isFormData } = {}) {
  const url = new URL(API_BASE + path, window.location.origin);
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        url.searchParams.set(key, value);
      }
    });
  }

  const res = await fetch(url.pathname + url.search, {
    method,
    headers: isFormData ? undefined : { 'Content-Type': 'application/json' },
    body: isFormData ? body : body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    let message = res.statusText;
    try {
      const data = await res.json();
      message = data.error || message;
    } catch {
      // corpo sem JSON, mantém statusText
    }
    throw new Error(message || `Erro ${res.status}`);
  }

  if (res.status === 204) return null;
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export const api = {
  get: (path, params) => request(path, { params }),
  post: (path, body, opts) => request(path, { method: 'POST', body, ...opts }),
  put: (path, body) => request(path, { method: 'PUT', body }),
  patch: (path, body) => request(path, { method: 'PATCH', body }),
  del: (path, params) => request(path, { method: 'DELETE', params }),
};
