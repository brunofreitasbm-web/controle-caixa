import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';

const CLIENT_ID_KEY = 'hub_v2_client_id';
const MAX_BACKOFF_MS = 30000;
const FALLBACK_APOS_FALHAS = 3;
const FALLBACK_INTERVALO_MS = 20000;
const TEMPO_OCIOSO_PARA_FECHAR_MS = 5 * 60 * 1000;

function gerarId() {
  if (window.crypto && typeof window.crypto.randomUUID === 'function') {
    return window.crypto.randomUUID();
  }
  return 'c-' + Math.random().toString(36).slice(2) + '-' + Date.now().toString(36);
}

function getClientId() {
  let id = sessionStorage.getItem(CLIENT_ID_KEY);
  if (!id) {
    id = gerarId();
    sessionStorage.setItem(CLIENT_ID_KEY, id);
  }
  return id;
}

const RealtimeContext = createContext(null);

export function RealtimeProvider({ usuario, loja, children }) {
  const clientId = useMemo(getClientId, []);
  const [status, setStatus] = useState('reconectando');
  const handlersRef = useRef(new Map());
  const sourceRef = useRef(null);
  const falhasRef = useRef(0);
  const reconexaoTimer = useRef(null);
  const fallbackTimer = useRef(null);
  const ociosoTimer = useRef(null);
  const modoFallbackRef = useRef(false);

  useEffect(() => {
    function emitir(tipo, payload, evento) {
      const lista = [...(handlersRef.current.get(tipo) || []), ...(handlersRef.current.get('*') || [])];
      lista.forEach((fn) => {
        try {
          fn(payload, evento);
        } catch (e) {
          console.error(`[RT] erro no handler de "${tipo}":`, e);
        }
      });
    }

    function montarUrl() {
      const params = new URLSearchParams({
        clientId,
        usuario: usuario || '',
        loja: loja || '',
      });
      return `/api/events?${params.toString()}`;
    }

    function fechar() {
      if (sourceRef.current) {
        try {
          sourceRef.current.close();
        } catch {
          // ignora
        }
        sourceRef.current = null;
      }
    }

    function entrarEmFallback() {
      if (modoFallbackRef.current) return;
      modoFallbackRef.current = true;
      setStatus('fallback');
      clearInterval(fallbackTimer.current);
      fallbackTimer.current = setInterval(() => {
        if (document.hidden) return;
        emitir('__fallback__', null, null);
      }, FALLBACK_INTERVALO_MS);
    }

    function sairDoFallback() {
      if (!modoFallbackRef.current) return;
      modoFallbackRef.current = false;
      clearInterval(fallbackTimer.current);
    }

    function agendarReconexao() {
      setStatus('reconectando');
      if (falhasRef.current >= FALLBACK_APOS_FALHAS) entrarEmFallback();
      const espera = Math.min(1000 * 2 ** Math.max(0, falhasRef.current - 1), MAX_BACKOFF_MS);
      clearTimeout(reconexaoTimer.current);
      reconexaoTimer.current = setTimeout(conectar, espera);
    }

    function conectar() {
      if (typeof window.EventSource === 'undefined') {
        entrarEmFallback();
        return;
      }
      fechar();
      clearTimeout(reconexaoTimer.current);

      const source = new EventSource(montarUrl());
      sourceRef.current = source;

      source.onopen = () => {
        falhasRef.current = 0;
        sairDoFallback();
        setStatus('ao-vivo');
      };

      source.onmessage = (e) => {
        let evento;
        try {
          evento = JSON.parse(e.data);
        } catch {
          return;
        }
        if (!evento || !evento.tipo) return;
        if (evento.tipo === 'conectado') return;
        if (evento.origem && evento.origem === clientId) return;
        emitir(evento.tipo, evento.payload, evento);
      };

      source.onerror = () => {
        if (source.readyState === 2) {
          falhasRef.current += 1;
          agendarReconexao();
        } else {
          setStatus('reconectando');
        }
      };
    }

    function tratarVisibilidade() {
      if (document.hidden) {
        clearTimeout(ociosoTimer.current);
        ociosoTimer.current = setTimeout(fechar, TEMPO_OCIOSO_PARA_FECHAR_MS);
      } else {
        clearTimeout(ociosoTimer.current);
        if (!sourceRef.current) {
          falhasRef.current = 0;
          conectar();
        }
      }
    }

    document.addEventListener('visibilitychange', tratarVisibilidade);
    window.addEventListener('online', conectar);
    conectar();

    return () => {
      document.removeEventListener('visibilitychange', tratarVisibilidade);
      window.removeEventListener('online', conectar);
      clearTimeout(reconexaoTimer.current);
      clearTimeout(ociosoTimer.current);
      clearInterval(fallbackTimer.current);
      fechar();
    };
  }, [clientId, usuario, loja]);

  const value = useMemo(
    () => ({
      status,
      clientId,
      subscribe(tipo, fn) {
        const map = handlersRef.current;
        if (!map.has(tipo)) map.set(tipo, []);
        map.get(tipo).push(fn);
        return () => {
          map.set(tipo, (map.get(tipo) || []).filter((f) => f !== fn));
        };
      },
    }),
    [status, clientId]
  );

  return <RealtimeContext.Provider value={value}>{children}</RealtimeContext.Provider>;
}

export function useRealtimeEvent(tipo, handler) {
  const ctx = useContext(RealtimeContext);
  useEffect(() => {
    if (!ctx) return undefined;
    return ctx.subscribe(tipo, handler);
  }, [ctx, tipo, handler]);
}

export function useRealtimeStatus() {
  const ctx = useContext(RealtimeContext);
  return ctx ? ctx.status : 'reconectando';
}
