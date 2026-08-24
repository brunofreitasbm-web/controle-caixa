import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api, getToken, setToken } from '../lib/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [bootstrap, setBootstrap] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const carregarBootstrap = useCallback(async () => {
    const dados = await api.bootstrap();
    setBootstrap(dados);
    return dados;
  }, []);

  useEffect(() => {
    (async () => {
      const token = getToken();
      if (!token) {
        setLoading(false);
        return;
      }
      try {
        await carregarBootstrap();
        setSession({ token, restaurada: true });
      } catch (e) {
        setToken(null);
      } finally {
        setLoading(false);
      }
    })();
  }, [carregarBootstrap]);

  const login = useCallback(async (usuario, pin) => {
    setError(null);
    const resp = await api.login(usuario, pin);
    if (!resp.valid) {
      const msg = resp.hasPin === false
        ? 'Usuário sem PIN cadastrado nesta organização.'
        : 'PIN incorreto.';
      setError(msg);
      throw new Error(msg);
    }
    if (!resp.token) {
      const msg = 'Login validado, mas a organização não emitiu sessão (role sem token).';
      setError(msg);
      throw new Error(msg);
    }
    setToken(resp.token);
    setSession({ token: resp.token, usuario, role: resp.role, organizationId: resp.organizationId, capacidades: resp.capacidades || [] });
    await carregarBootstrap();
  }, [carregarBootstrap]);

  const logout = useCallback(() => {
    setToken(null);
    setSession(null);
    setBootstrap(null);
  }, []);

  return (
    <AuthContext.Provider value={{ session, bootstrap, loading, error, login, logout, recarregar: carregarBootstrap }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth precisa estar dentro de <AuthProvider>');
  return ctx;
}
