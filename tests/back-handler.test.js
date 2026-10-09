// Testa o motor do botão "voltar" (webapp/back-handler.js) contra um histórico
// falso que imita o do navegador: pushState trunca o "avançar" e go()/back()
// disparam popstate de forma assíncrona. Não substitui um teste em celular real.
const test = require("node:test");
const assert = require("node:assert");

function criarJanela() {
  const stack = [{ state: null }];
  let idx = 0;
  const ouvintes = [];
  const w = {
    history: {
      get state() { return stack[idx].state; },
      get length() { return stack.length; },
      pushState(state) { stack.splice(idx + 1); stack.push({ state }); idx += 1; },
      go(n) {
        const alvo = idx + n;
        if (alvo < 0 || alvo >= stack.length) return;
        setTimeout(() => { idx = alvo; ouvintes.slice().forEach(f => { try { f({ state: stack[idx].state }); } catch (e) { w.errosListener.push(e); } }); }, 0);
      },
      back() { this.go(-1); },
    },
    addEventListener(tipo, f) { if (tipo === "popstate") ouvintes.push(f); },
    removeEventListener(tipo, f) { const i = ouvintes.indexOf(f); if (i >= 0) ouvintes.splice(i, 1); },
    errosListener: [],
    _idx: () => idx,
    _len: () => stack.length,
  };
  return w;
}

const esperar = (ms = 15) => new Promise(r => setTimeout(r, ms));
let BackHandler;
let w;

test.beforeEach(() => {
  w = criarJanela();
  globalThis.window = w;
  delete require.cache[require.resolve("../webapp/back-handler.js")];
  BackHandler = require("../webapp/back-handler.js");
  BackHandler._reset();
});

test("cada nível vira uma entrada e voltar desfaz um por vez", async () => {
  let niveis = 0;
  const h = BackHandler.create({ getDepth: () => niveis, onBack: () => { niveis -= 1; h.sync(); } });
  niveis = 2; h.sync();
  assert.strictEqual(w._len(), 3);
  w.history.back(); await esperar();
  assert.strictEqual(niveis, 1);
  w.history.back(); await esperar();
  assert.strictEqual(niveis, 0);
  assert.strictEqual(w._idx(), 0);
});

test("na raiz nada é empilhado", () => {
  const h = BackHandler.create({ getDepth: () => 0, onBack: () => {} });
  h.sync();
  assert.strictEqual(w._len(), 1);
});

test("fechar pela tela remove as entradas sem chamar onBack", async () => {
  let niveis = 0; let chamadas = 0;
  const h = BackHandler.create({ getDepth: () => niveis, onBack: () => { chamadas += 1; } });
  niveis = 2; h.sync();
  niveis = 0; h.sync(); await esperar(30);
  assert.strictEqual(chamadas, 0);
  assert.strictEqual(w._idx(), 0);
});

test("onBack que não reduz o depth repõe a entrada", async () => {
  let niveis = 1;
  const h = BackHandler.create({ getDepth: () => niveis, onBack: () => {} });
  h.sync();
  w.history.back(); await esperar(30);
  assert.strictEqual(w._idx(), 1, "entrada reposta");
});

test("se algo navegou por cima, não usa history.go para limpar", async () => {
  let niveis = 1;
  const h = BackHandler.create({ getDepth: () => niveis, onBack: () => {} });
  h.sync();
  w.history.pushState({ rota: "outra" });
  niveis = 0; h.sync(); await esperar(30);
  assert.deepStrictEqual(w.history.state, { rota: "outra" });
});

test("back() só age quando há entrada própria", async () => {
  let niveis = 0;
  const h = BackHandler.create({ getDepth: () => niveis, onBack: () => { niveis -= 1; h.sync(); } });
  assert.strictEqual(h.back(), false);
  niveis = 1; h.sync();
  assert.strictEqual(h.back(), true);
  await esperar();
  assert.strictEqual(niveis, 0);
});

test("preserva o state anterior ao empilhar", () => {
  w.history.pushState({ outro: 1 });
  const h = BackHandler.create({ getDepth: () => 1, onBack: () => {} });
  h.sync();
  assert.strictEqual(w.history.state.outro, 1);
  assert.ok(w.history.state.__backHandler);
});

test("onBack que lança erro ainda repõe a entrada (ressincroniza)", async () => {
  const h = BackHandler.create({ getDepth: () => 1, onBack: () => { throw new Error("falhou"); } });
  h.sync();
  w.history.back(); await esperar(40);
  assert.strictEqual(w._idx(), 1, "entrada reposta mesmo com erro");
  assert.strictEqual(w.errosListener.length, 1);
});
