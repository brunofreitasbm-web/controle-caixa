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
  assert.ok(msg.includes('&lt;b&gt;t&lt;/b&gt;') && msg.includes('a &amp; b'));
  assert.strictEqual(await tg.enviarTelegram('y'.repeat(5000)), true);
  assert.strictEqual(body.text.length, 4096);
  global.fetch = async () => { throw new Error('rede'); };
  assert.strictEqual(await tg.enviarTelegram('z'), false);
  global.fetch = orig;
});
