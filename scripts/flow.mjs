// Flow tests: game over, victory, touch placement, wall painting, perf under load.
// Usage: CHROMIUM=... node scripts/flow.mjs [baseUrl] [outDir]
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';

const base = process.argv[2] ?? 'http://localhost:5173/';
const out = process.argv[3] ?? 'shots';
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? 'chromium', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const errors = [];
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function page(viewport, touch = false) {
  const ctx = await browser.newContext({ viewport, hasTouch: touch, isMobile: touch, locale: 'en-US' });
  const p = await ctx.newPage();
  p.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  p.on('pageerror', (e) => errors.push('[pageerror] ' + e.message + '\n' + e.stack));
  return p;
}
const results = {};

// Game over
{
  const p = await page({ width: 1280, height: 800 });
  await p.goto(`${base}?autostart=nightmare&seed=5&ff=2000&bot=1`);
  await wait(4500);
  results.gameOver = await p.locator('text=The Light Fades').count();
  await p.screenshot({ path: `${out}/20-gameover.png` });
  await p.close();
}
// Victory
{
  const p = await page({ width: 1280, height: 800 });
  await p.goto(`${base}?autostart=casual&seed=1185&ff=5000&bot=1`);
  await wait(4500);
  results.victory = await p.locator('text=Dawn Breaks').count();
  results.lost = await p.locator('text=The Light Fades').count();
  await p.screenshot({ path: `${out}/21-victory.png` });
  await p.close();
}
// Wall painting with mouse drag
{
  const p = await page({ width: 1280, height: 800 });
  await p.goto(`${base}?autostart=normal&seed=42`);
  await wait(800);
  await p.keyboard.press('1');
  const b = await p.locator('#game').boundingBox();
  await p.mouse.move(b.width * 0.3, b.height * 0.25);
  await p.mouse.down();
  for (let i = 0; i <= 12; i++) await p.mouse.move(b.width * (0.3 + i * 0.02), b.height * 0.25, { steps: 2 });
  await p.mouse.up();
  await wait(300);
  results.moneyAfterWalls = await p.locator('.money').innerText();
  await p.screenshot({ path: `${out}/22-walls.png` });
  await p.close();
}
// Touch: tap-tap placement
{
  const p = await page({ width: 844, height: 390 }, true);
  await p.goto(`${base}?autostart=normal&seed=42`);
  await wait(800);
  await p.locator('.bbtn').nth(1).tap();
  const b = await p.locator('#game').boundingBox();
  const before = await p.locator('.money').innerText();
  await p.touchscreen.tap(b.width * 0.42, b.height * 0.45);
  await wait(200);
  await p.touchscreen.tap(b.width * 0.42, b.height * 0.45);
  await wait(300);
  results.touchMoney = before + ' -> ' + (await p.locator('.money').innerText());
  await p.screenshot({ path: `${out}/23-touch.png` });
  await p.close();
}
// Perf: late game, 3x speed
{
  const p = await page({ width: 1440, height: 900 });
  await p.goto(`${base}?autostart=normal&seed=1185&ff=1500&bot=1`);
  await wait(1000);
  await p.keyboard.press('n');
  await p.keyboard.press('f');
  await p.keyboard.press('f');
  await wait(1500);
  results.perf = await p.evaluate(
    () =>
      new Promise((res) => {
        const ts = [];
        const f = (t) => {
          ts.push(t);
          if (ts.length < 120) requestAnimationFrame(f);
          else {
            const d = ts.slice(1).map((t, i) => t - ts[i]);
            d.sort((a, b) => a - b);
            res({ median: d[d.length >> 1].toFixed(1), p95: d[Math.floor(d.length * 0.95)].toFixed(1) });
          }
        };
        requestAnimationFrame(f);
      }),
  );
  await p.screenshot({ path: `${out}/24-perf.png` });
  await p.close();
}
await browser.close();
console.log(JSON.stringify(results, null, 1));
console.log(errors.length ? 'ERRORS:\n' + [...new Set(errors)].join('\n') : 'no console errors');
