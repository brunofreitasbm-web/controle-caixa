const puppeteer = require('puppeteer');
(async () => {
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('PAGE ERROR: ' + e.message));
  page.on('console', msg => { if (msg.type() === 'error') errors.push('CONSOLE ERROR: ' + msg.text()); });
  await page.goto('http://localhost:5000', { waitUntil: 'load', timeout: 15000 });
  await new Promise(r => setTimeout(r, 3000));
  console.log('ERRORS:', JSON.stringify(errors, null, 2));
  await browser.close();
})();
