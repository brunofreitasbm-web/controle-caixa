/* ==========================================================================
   TEMPO REAL (SSE) — CLIENTE
   ==========================================================================
   Mantém uma conexão aberta com /api/events enquanto o app está em uso e
   entrega os eventos de escrita de TODOS os usuários logados: inventário,
   conferência de NF-e, registros de caixa, boletos, metas e ponto.

   Este arquivo é carregado ANTES do app.js e expõe apenas `window.RT`.
   Quem decide o que fazer com cada evento é o app.js (RT.on('tipo', fn)).
   ========================================================================== */
(function () {
  'use strict';

  var CLIENT_ID_KEY = 'cacaushow_client_id';
  var MAX_BACKOFF_MS = 30000;
  var FALLBACK_APOS_FALHAS = 3;
  var FALLBACK_INTERVALO_MS = 20000;
  var TEMPO_OCIOSO_PARA_FECHAR_MS = 5 * 60 * 1000;

  function gerarId() {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') {
      return window.crypto.randomUUID();
    }
    return 'c-' + Math.random().toString(36).slice(2) + '-' + Date.now().toString(36);
  }

  // Um id por ABA (sessionStorage, não localStorage): serve para o autor de uma
  // alteração ignorar o eco do próprio evento e não sobrescrever o que acabou
  // de digitar.
  var clientId = sessionStorage.getItem(CLIENT_ID_KEY);
  if (!clientId) {
    clientId = gerarId();
    sessionStorage.setItem(CLIENT_ID_KEY, clientId);
  }

  var handlers = {};
  var opcoes = {};
  var source = null;
  var falhasSeguidas = 0;
  var timerReconexao = null;
  var timerFallback = null;
  var timerOcioso = null;
  var modoFallback = false;
  var conectado = false;
  var indicador = null;

  // ---------------------------------------------------------------- eventos
  function on(tipo, fn) {
    if (!handlers[tipo]) handlers[tipo] = [];
    handlers[tipo].push(fn);
  }

  function emitir(tipo, payload, evento) {
    var lista = (handlers[tipo] || []).concat(handlers['*'] || []);
    for (var i = 0; i < lista.length; i++) {
      try {
        lista[i](payload, evento);
      } catch (e) {
        console.error('[RT] Erro no handler de "' + tipo + '":', e);
      }
    }
  }

  // ------------------------------------------------------------- indicador
  function criarIndicador() {
    if (indicador) return indicador;
    indicador = document.createElement('div');
    indicador.id = 'rt-indicator';
    indicador.title = 'Sincronização em tempo real';
    indicador.style.cssText = [
      'position:fixed', 'bottom:10px', 'left:10px', 'z-index:9998',
      'display:flex', 'align-items:center', 'gap:6px',
      'padding:4px 9px', 'border-radius:999px',
      'font-size:10px', 'font-weight:700', 'letter-spacing:.04em',
      'font-family:inherit', 'pointer-events:none',
      'background:rgba(0,0,0,.55)', 'backdrop-filter:blur(4px)',
      'transition:opacity .3s', 'opacity:.75'
    ].join(';');
    indicador.innerHTML = '<span class="rt-dot" style="width:7px;height:7px;border-radius:50%;background:#10b981;display:inline-block"></span><span class="rt-txt" style="color:#a7f3d0">AO VIVO</span>';
    document.body.appendChild(indicador);
    return indicador;
  }

  function atualizarIndicador(estado) {
    var el = criarIndicador();
    var dot = el.querySelector('.rt-dot');
    var txt = el.querySelector('.rt-txt');
    if (estado === 'ao-vivo') {
      dot.style.background = '#10b981';
      txt.style.color = '#a7f3d0';
      txt.textContent = 'AO VIVO';
      el.style.opacity = '.75';
    } else if (estado === 'fallback') {
      dot.style.background = '#f59e0b';
      txt.style.color = '#fde68a';
      txt.textContent = 'ATUALIZANDO A CADA 20s';
      el.style.opacity = '.9';
    } else {
      dot.style.background = '#ef4444';
      txt.style.color = '#fecaca';
      txt.textContent = 'RECONECTANDO...';
      el.style.opacity = '.9';
    }
    if (typeof opcoes.onStatus === 'function') opcoes.onStatus(estado);
  }

  // ------------------------------------------------------------- conexão
  function montarUrl() {
    var base = typeof opcoes.getApiBase === 'function' ? opcoes.getApiBase() : '/api';
    var usuario = typeof opcoes.getUsuario === 'function' ? (opcoes.getUsuario() || '') : '';
    var loja = typeof opcoes.getLoja === 'function' ? (opcoes.getLoja() || '') : '';
    return base + '/events?clientId=' + encodeURIComponent(clientId) +
      '&usuario=' + encodeURIComponent(usuario) +
      '&loja=' + encodeURIComponent(loja);
  }

  function conectar() {
    if (typeof window.EventSource === 'undefined') {
      console.warn('[RT] Navegador sem suporte a EventSource — usando atualização periódica.');
      entrarEmFallback();
      return;
    }

    fechar();
    clearTimeout(timerReconexao);

    try {
      source = new EventSource(montarUrl());
    } catch (e) {
      console.error('[RT] Falha ao abrir o canal:', e);
      agendarReconexao();
      return;
    }

    source.onopen = function () {
      falhasSeguidas = 0;
      conectado = true;
      sairDoFallback();
      atualizarIndicador('ao-vivo');
    };

    source.onmessage = function (e) {
      var evento;
      try {
        evento = JSON.parse(e.data);
      } catch (err) {
        return;
      }
      if (!evento || !evento.tipo) return;

      if (evento.tipo === 'conectado') {
        emitir('conectado', evento.payload, evento);
        return;
      }

      // Não reagir ao eco das próprias alterações: quem digitou já tem o valor
      // na tela, e reaplicar aqui atropelaria o campo em edição.
      if (evento.origem && evento.origem === clientId) return;

      emitir(evento.tipo, evento.payload, evento);
    };

    source.onerror = function () {
      conectado = false;
      // O EventSource tenta reconectar sozinho quando readyState === CONNECTING.
      // Só assumimos o controle quando ele desiste (CLOSED).
      if (source && source.readyState === 2) {
        falhasSeguidas++;
        agendarReconexao();
      } else {
        atualizarIndicador('reconectando');
      }
    };
  }

  function agendarReconexao() {
    atualizarIndicador('reconectando');
    if (falhasSeguidas >= FALLBACK_APOS_FALHAS) entrarEmFallback();

    var espera = Math.min(1000 * Math.pow(2, Math.max(0, falhasSeguidas - 1)), MAX_BACKOFF_MS);
    clearTimeout(timerReconexao);
    timerReconexao = setTimeout(conectar, espera);
  }

  // Se o canal não sobe (proxy antigo, rede corporativa, etc.), o app continua
  // atualizando — só que buscando os dados de tempos em tempos.
  function entrarEmFallback() {
    if (modoFallback) return;
    modoFallback = true;
    atualizarIndicador('fallback');
    clearInterval(timerFallback);
    timerFallback = setInterval(function () {
      if (document.hidden) return;
      if (typeof opcoes.onFallback === 'function') opcoes.onFallback();
    }, FALLBACK_INTERVALO_MS);
  }

  function sairDoFallback() {
    if (!modoFallback) return;
    modoFallback = false;
    clearInterval(timerFallback);
    timerFallback = null;
  }

  function fechar() {
    if (source) {
      try { source.close(); } catch (e) {}
      source = null;
    }
    conectado = false;
  }

  // Aba escondida por muito tempo (celular no bolso) não precisa segurar
  // conexão. Ao voltar, recarregamos tudo: o buffer do servidor pode ter
  // rolado e alguns eventos se perderiam.
  function tratarVisibilidade() {
    if (document.hidden) {
      clearTimeout(timerOcioso);
      timerOcioso = setTimeout(function () {
        fechar();
        clearTimeout(timerReconexao);
      }, TEMPO_OCIOSO_PARA_FECHAR_MS);
    } else {
      clearTimeout(timerOcioso);
      if (!source) {
        falhasSeguidas = 0;
        conectar();
        if (typeof opcoes.onReconectar === 'function') opcoes.onReconectar();
      }
    }
  }

  function iniciar(config) {
    opcoes = config || {};
    document.addEventListener('visibilitychange', tratarVisibilidade);
    window.addEventListener('online', function () {
      falhasSeguidas = 0;
      conectar();
    });
    window.addEventListener('beforeunload', fechar);
    conectar();
  }

  window.RT = {
    clientId: clientId,
    iniciar: iniciar,
    on: on,
    conectar: conectar,
    fechar: fechar,
    estaAoVivo: function () { return conectado; },
    emFallback: function () { return modoFallback; }
  };
})();
