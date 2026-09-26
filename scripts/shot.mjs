// Browser smoke test + screenshots. Requires a running dev/preview server.
// Usage: node scripts/shot.mjs [baseUrl] [outDir]
//   CHROMIUM=/path/to/chromium overrides the browser binary.
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';

const base = process.argv[2] ?? 'http://localhost:5173/';
const out = process.argv[3] ?? 'shots';
mkdirSync(out, { recursive: true });
const exe = process.env.CHROMIUM ?? 'chromium';

const browser = await chromium.launch({
  executablePath: exe,
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'],
});
const errors = [];

async function page(viewport, touch = false) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1, hasTouch: touch, isMobile: touch, locale: 'en-US' });
  const p = await ctx.newPage();
  p.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') errors.push(`[${m.type()}] ${m.text()}`);
  });
  p.on('pageerror', (e) => errors.push('[pageerror] ' + e.message + '\n' + e.stack));
  return p;
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// 1. Title screen with attract mode
{
  const p = await page({ width: 1440, height: 900 });
  await p.goto(base);
  await wait(2500);
  await p.screenshot({ path: `${out}/01-title.png` });
  // start a game via the UI
  await p.click('text=Light the Beacon');
  await wait(800);
  await p.screenshot({ path: `${out}/02-start.png` });
  // select arbalest (key 2) and place a few
  await p.keyboard.press('2');
  const box = await p.locator('#game').boundingBox();
  const W = box.width,
    H = box.height;
  await p.mouse.move(W * 0.4, H * 0.45);
  await wait(200);
  await p.screenshot({ path: `${out}/03-placing.png` });
  for (const [fx, fy] of [
    [0.4, 0.45],
    [0.6, 0.45],
    [0.5, 0.33],
  ]) {
    await p.mouse.click(W * fx, H * fy);
    await wait(100);
  }
  await p.keyboard.press('Escape');
  await p.mouse.click(W * 0.4, H * 0.45);
  await wait(300);
  await p.screenshot({ path: `${out}/04-selected.png` });
  await p.keyboard.press('Escape');
  await p.keyboard.press('n');
  await wait(4000);
  await p.screenshot({ path: `${out}/05-wave1.png` });
  await p.keyboard.press('Escape');
  await wait(300);
  await p.screenshot({ path: `${out}/06-menu.png` });
  await p.close();
}

// 2. Mid/late game via fast-forward bot
for (const [ff, name] of [
  [400, '07-mid'],
  [1100, '08-late'],
]) {
  const p = await page({ width: 1440, height: 900 });
  await p.goto(`${base}?autostart=normal&seed=1185&ff=${ff}&bot=1`);
  await wait(1500);
  // wait until a wave is running for action shots
  await p.keyboard.press('n');
  await wait(5000);
  await p.screenshot({ path: `${out}/${name}.png` });
  await p.close();
}

// 3. Mobile portrait & landscape
{
  const p = await page({ width: 390, height: 844 }, true);
  await p.goto(base);
  await wait(2000);
  await p.screenshot({ path: `${out}/09-mobile-title.png` });
  await p.goto(`${base}?autostart=normal&seed=77&ff=200&bot=1`);
  await wait(3000);
  await p.screenshot({ path: `${out}/10-mobile-game.png` });
  await p.close();
}
{
  const p = await page({ width: 844, height: 390 }, true);
  await p.goto(`${base}?autostart=normal&seed=77&ff=200&bot=1`);
  await wait(3000);
  await p.screenshot({ path: `${out}/11-mobile-land.png` });
  await p.close();
}

await browser.close();
console.log(errors.length ? 'ERRORS:\n' + [...new Set(errors)].join('\n') : 'no console errors');
