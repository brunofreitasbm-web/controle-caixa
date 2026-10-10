const test = require('node:test');
const assert = require('node:assert');
const tg = require('../services/telegram');

test('no-op sem variáveis de ambiente', async () => {
  delete process.env.TELEGRAM_BOT_TOKEN;
  delete process.env.TELEGRAM_CHAT_ID;
  assert.strictEqual(await tg.enviarTelegram('x'), false);
});

test('escapa HTML e trunca em 4096; não lança em erro de rede', async () => {
  process.env.TELEGRAM_BOT_TOKEN = 'T';
  process.env.TELEGRAM_CHAT_ID = '-1';
  const orig = global.fetch;
  let body;
  global.fetch = async (url, init) => { body = JSON.parse(init.body); return { ok: true, status: 200 }; };
  const msg = tg.formatarMensagem('<b>t</b>', 'a & b');
  assert.ok(msg.includes('&lt;/B&gt;') && !msg.includes('</B>') && msg.includes('a &amp; b'));
  assert.strictEqual(await tg.enviarTelegram('y'.repeat(5000)), true);
  assert.strictEqual(body.text.length, 4096);
  global.fetch = async () => { throw new Error('rede'); };
  assert.strictEqual(await tg.enviarTelegram('z'), false);
  global.fetch = orig;
});

test('formatarEvento: categoria, hashtags, itens numerados e horário', () => {
  const m = tg.formatarEvento({
    tipo: 'fechamento_unidade', loja: 'Mário Covas', sistema: 'Cacau Show',
    campos: [['Responsável', 'Débora'], ['Faturado', 'R$ 10,00'], ['Obs', null], ['Envelope', 'R$ 0,00']]
  });
  assert.ok(m.startsWith('🔒 <b>FECHAMENTO DE CAIXA</b>'));
  assert.ok(m.includes('#Caixa #Fechamento #MarioCovas'));
  assert.ok(m.includes('📍 <b>Mário Covas</b> · Cacau Show'));
  assert.ok(m.includes('1️⃣') && m.includes('2️⃣') && m.includes('3️⃣') && !m.includes('4️⃣'));
  assert.ok(/🕐 \d{2}\/\d{2} · \d{2}:\d{2}/.test(m));
});

test('formatarMensagem: lista de lojas vira itens numerados e tipo desconhecido cai em Gestão', () => {
  const m = tg.formatarMensagem('⛔ Metas', 'Intro:\n\n- Marambaia: 10:00\n- Icoaraci: 11:00', 'meta_atraso');
  assert.ok(m.includes('1️⃣ 📍 Marambaia: <b>10:00</b>') && m.includes('2️⃣ 📍 Icoaraci'));
  const g = tg.formatarMensagem('Aviso - Loja Icoaraci', 'texto <x>', 'qualquer');
  assert.ok(g.includes('📣 Gestão') && g.includes('#Icoaraci') && g.includes('&lt;x&gt;'));
});
