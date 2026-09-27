// Respawn flow: fall on night 7 → respawn at night 4 (attempt 2) → fall again → quit → respawn from the title (attempt 3).
// Usage: CHROMIUM=... node scripts/respawn.mjs [baseUrl] [outDir]
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';

const base = process.argv[2] ?? 'http://localhost:5173/';
const out = process.argv[3] ?? 'shots/respawn';
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? 'chromium' });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const fails = [];
const check = (cond, msg) => (cond ? console.log('ok   ', msg) : (fails.push(msg), console.log('FAIL ', msg)));

const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: 'en-US' });
const p = await ctx.newPage();
p.on('pageerror', (e) => fails.push('pageerror ' + e.message));
await p.goto(base);
await wait(1000);
await p.locator('.big-btn').first().click();
await wait(400);

/** Fast-forward whole nights, one per animation frame so the app sees each night end. */
const playNights = (n) =>
  p.evaluate(async (n) => {
    const g = window.lumenrift.game;
    for (let i = 0; i < n; i++) {
      g.coreHp = g.coreMaxHp; // survive the leaks
      g.callWaveNow();
      let guard = 0;
      while (g.phase === 'wave' && guard++ < 60 * 600) g.step(1 / 60);
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    }
    return g.wave;
  }, n);
/** Start the next night and let the Beacon fall. */
const fall = () =>
  p.evaluate(async () => {
    const g = window.lumenrift.game;
    g.callWaveNow();
    g.coreHp = 1;
    let guard = 0;
    while (!g.over && guard++ < 60 * 600) g.step(1 / 60);
    return g.wave;
  });

check((await playNights(6)) === 6, 'survived six nights');
const died = await fall();
check(died === 7, `fell on night ${died}`);
await wait(2600);
const btn = p.locator('.big-btn.respawn');
check((await btn.count()) === 1, 'defeat screen offers respawn');
check((await btn.innerText()).includes('night 4'), `respawn button targets night 4: "${await btn.innerText()}"`);
await p.screenshot({ path: `${out}/defeat.png` });
await btn.click();
await wait(500);
let s = await p.evaluate(() => { const g = window.lumenrift.game; return { wave: g.wave, phase: g.phase, attempts: g.stats.attempts, over: g.over }; });
check(s.wave === 3 && s.phase === 'build' && s.attempts === 2 && !s.over, `respawned before night 4, attempt 2: ${JSON.stringify(s)}`);
await p.screenshot({ path: `${out}/respawned.png` });

// fall again right away, then quit to the title without choosing
await playNights(2);
const died2 = await fall();
await wait(2600);
await p.locator('.big-btn.alt', { hasText: 'Title' }).click();
await wait(800);
const row = p.locator('.save-row').first();
const rowText = await row.innerText();
check(rowText.includes('Attempt 2') && rowText.includes(`fell on night ${died2}`), `title shows the fallen save: "${rowText.replace(/\n/g, ' | ')}"`);
await p.screenshot({ path: `${out}/title-fallen.png` });
await row.locator('.save-go').click();
await wait(600);
s = await p.evaluate(() => { const g = window.lumenrift.game; return { wave: g.wave, phase: g.phase, attempts: g.stats.attempts }; });
check(s.attempts === 3 && s.phase === 'build' && s.wave + 1 <= Math.max(1, died2 - 3) + 0 + 3, `respawned from title, attempt 3: ${JSON.stringify(s)}`);

await browser.close();
console.log(fails.length ? `\n${fails.length} FAILED:\n` + fails.join('\n') : '\nall respawn checks passed');
