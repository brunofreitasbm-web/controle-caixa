const puppeteer = require('puppeteer');
(async () => {
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();
  page.on('pageerror', error => console.log('PAGE ERROR:', error.message));
  await page.goto('http://localhost:5000', { waitUntil: 'load', timeout: 15000 });
  await new Promise(r => setTimeout(r, 1500));
  await page.screenshot({ path: 'screenshot.png' });
  const bodyText = await page.evaluate(() => document.body.innerText.slice(0, 200));
  console.log('BODY TEXT SAMPLE:', JSON.stringify(bodyText));
  const splashExists = await page.evaluate(() => !!document.getElementById('boot-splash'));
  console.log('SPLASH STILL PRESENT:', splashExists);
  await browser.close();
})();
