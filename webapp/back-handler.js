// Botão/gesto "voltar" do celular dentro de uma SPA que troca de tela por
// estado (abas, modais, menu lateral). Sem isto, o histórico do navegador não
// conhece as subtelas e o voltar sai do site.
//
// BackHandler.create({ getDepth, onBack }) -> { sync, depth, back }
//   getDepth() = quantos passos de "voltar" internos existem agora (0 = raiz).
//   onBack()   = desfaz UM passo.
//   sync()     = avisa que o depth pode ter mudado (chame após mudar a tela).
//
// Mecanismo único: cada nível vira 1 entrada no histórico (pushState, mesma
// URL). Um único listener de popstate descobre qual entrada saiu e chama o
// onBack do dono dela (pilha global de donos). Na raiz (depth 0) nada é
// empilhado, então "voltar" sai do site normalmente.
// Mesma lógica do hook useBackHandler dos apps React (controle-de-estagiario,
// BioFIT), em JS puro.
(function (root) {
  "use strict";

  var MARK = "__backHandler";
  var owners = [];
  var entries = []; // pilha global: { id, owner }
  var suppress = 0; // popstates causados por nós (history.go) que devem ser ignorados
  var dirty = false;
  var suppressTimer = null;
  var seq = 0;
  var listening = false;

  function win() { return root.window || root; }
  function newId() { return Date.now() + "-" + (++seq); }
  function ownedBy(owner) {
    return entries.filter(function (e) { return e.owner === owner; }).length;
  }
  function currentMark() {
    var st = win().history.state;
    return st && st[MARK] != null ? st[MARK] : null;
  }

  function armSuppress() {
    suppress += 1;
    clearTimeout(suppressTimer);
    // Rede de segurança: se o navegador não emitir o popstate esperado, não travamos.
    suppressTimer = setTimeout(function () { suppress = 0; syncAll(); }, 500);
  }

  function consumeSuppress() {
    suppress -= 1;
    if (suppress > 0) return;
    suppress = 0;
    clearTimeout(suppressTimer);
    if (dirty) syncAll();
  }

  function shrink(owner, n) {
    // Só desempilha com history.go(-k) se ainda estamos na nossa entrada do topo;
    // se algo navegou por cima, as entradas só são esquecidas (sobras são puladas
    // pelo handlePopState).
    var atTop = entries.length > 0 && currentMark() === entries[entries.length - 1].id;
    var k = 0;
    while (k < n && entries[entries.length - 1 - k] && entries[entries.length - 1 - k].owner === owner) k += 1;
    if (k > 0) entries.splice(entries.length - k, k);
    if (!atTop) k = 0;
    var rest = n - k;
    for (var i = entries.length - 1; i >= 0 && rest > 0; i -= 1) {
      if (entries[i].owner === owner) { entries[i].owner = null; rest -= 1; }
    }
    if (k > 0) {
      armSuppress();
      win().history.go(-k);
    }
  }

  function syncAll() {
    if (suppress > 0) { dirty = true; return; }
    dirty = false;
    for (var j = 0; j < owners.length; j += 1) {
      var owner = owners[j];
      var depth = Math.max(0, owner.getDepth() | 0);
      var owned = ownedBy(owner);
      if (depth > owned) {
        for (var i = owned; i < depth; i += 1) {
          var id = newId();
          var base = win().history.state;
          var next = {};
          if (base && typeof base === "object") for (var key in base) next[key] = base[key];
          next[MARK] = id;
          win().history.pushState(next, "");
          entries.push({ id: id, owner: owner });
        }
      } else if (depth < owned) {
        shrink(owner, owned - depth);
        if (suppress > 0) { dirty = true; return; }
      }
    }
  }

  function handlePopState(event) {
    if (suppress > 0) { consumeSuppress(); return; }
    var dest = event.state && event.state[MARK] != null ? event.state[MARK] : null;
    var popCount;
    if (dest === null) {
      popCount = entries.length;
    } else {
      var idx = -1;
      for (var i = 0; i < entries.length; i += 1) if (entries[i].id === dest) { idx = i; break; }
      if (idx < 0) { win().history.back(); return; } // sobra de reload/"avançar"
      popCount = entries.length - 1 - idx;
    }
    if (popCount === 0) return;
    var popped = entries.splice(entries.length - popCount, popCount);
    var handler = null;
    for (var p = popped.length - 1; p >= 0; p -= 1) if (popped[p].owner) { handler = popped[p].owner; break; }
    try {
      if (handler) handler.onBack();
      else if (dest !== null) win().history.back();
    } finally {
      // Se o onBack não reduziu o depth (ou lançou erro), ressincroniza depois que a tela atualizar.
      setTimeout(syncAll, 0);
    }
  }

  function create(opts) {
    if (!listening) { win().addEventListener("popstate", handlePopState); listening = true; }
    var owner = { getDepth: opts.getDepth, onBack: opts.onBack };
    owners.push(owner);
    syncAll();
    return {
      sync: syncAll,
      depth: function () { return Math.max(0, owner.getDepth() | 0); },
      // Dispara o mesmo caminho do botão voltar do aparelho (se houver entrada).
      back: function () {
        if (ownedBy(owner) > 0) { win().history.back(); return true; }
        return false;
      },
    };
  }

  // Só para testes: zera o estado do módulo.
  function reset() {
    if (listening) win().removeEventListener("popstate", handlePopState);
    listening = false; owners = []; entries = []; suppress = 0; dirty = false;
    clearTimeout(suppressTimer);
  }

  var api = { create: create, _reset: reset };
  root.BackHandler = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
