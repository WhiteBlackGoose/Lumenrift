// Saved-session flow: play, leave mid-night, come back, resume, verify state, delete.
// Usage: CHROMIUM=... node scripts/sessions.mjs [baseUrl] [outDir]
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';

const base = process.argv[2] ?? 'http://localhost:5173/';
const out = process.argv[3] ?? 'shots/sessions';
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? 'chromium' });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const fails = [];
const check = (cond, msg) => (cond ? console.log('ok   ', msg) : (fails.push(msg), console.log('FAIL ', msg)));

for (const [name, viewport, mobile] of [['desktop', { width: 1280, height: 800 }, false], ['phone', { width: 390, height: 844 }, true]]) {
  const ctx = await browser.newContext({ viewport, isMobile: mobile, hasTouch: mobile, locale: 'en-US' });
  let p = await ctx.newPage();
  p.on('pageerror', (e) => fails.push(`${name} pageerror ${e.message}`));
  await p.goto(base);
  await wait(1200);
  check((await p.locator('.save-row').count()) === 0, `${name}: no saves on first visit`);
  await p.locator('.big-btn').first().click();
  await wait(500);
  // build a few towers through the game API, then start the night and let it run a bit
  const before = await p.evaluate(async () => {
    const a = window.lumenrift, g = a.game;
    let placed = 0;
    for (let y = 8; y < 15 && placed < 4; y++) for (let x = 13; x < 24 && placed < 4; x++) if (g.canPlace('arbalest', x, y).ok) { g.place('arbalest', x, y); placed++; }
    g.callWaveNow();
    await new Promise((r) => setTimeout(r, 5000));
    a.paused = true;
    return { wave: g.wave, phase: g.phase, buildings: g.buildings.length, money: Math.floor(g.money), enemies: g.enemies.length, kills: g.stats.kills };
  });
  // leave: close the page entirely (pagehide saves), then come back in a new tab
  await p.close({ runBeforeUnload: true });
  p = await ctx.newPage();
  p.on('pageerror', (e) => fails.push(`${name} pageerror ${e.message}`));
  await p.goto(base);
  await wait(1200);
  const rows = await p.locator('.save-row').count();
  check(rows === 1, `${name}: title offers the saved game (${rows} row)`);
  const txt = await p.locator('.save-row').first().innerText();
  check(txt.includes(`Night ${before.wave}`), `${name}: save shows night ${before.wave}: "${txt.replace(/\n/g, ' | ')}"`);
  await p.screenshot({ path: `${out}/${name}-title.png` });
  await p.locator('.save-go').first().click();
  await wait(600);
  const after = await p.evaluate(() => { const g = window.lumenrift.game; return { wave: g.wave, phase: g.phase, buildings: g.buildings.length, money: Math.floor(g.money), enemies: g.enemies.length, kills: g.stats.kills, paused: window.lumenrift.paused }; });
  check(after.wave === before.wave && after.phase === before.phase && after.buildings === before.buildings, `${name}: restored night/phase/buildings ${JSON.stringify(after)}`);
  check(Math.abs(after.enemies - before.enemies) <= 2 && after.kills >= before.kills - 1, `${name}: restored enemies mid-night (${before.enemies} → ${after.enemies})`);
  check(after.paused, `${name}: resumes paused`);
  await p.screenshot({ path: `${out}/${name}-resumed.png` });
  // back to title; start a second game so there are two saves, then delete one
  await p.evaluate(() => window.lumenrift.toTitle());
  await wait(500);
  await p.locator('.big-btn').last().click();
  await wait(500);
  await p.evaluate(() => window.lumenrift.toTitle());
  await wait(500);
  check((await p.locator('.save-row').count()) === 2, `${name}: two saves listed`);
  await p.screenshot({ path: `${out}/${name}-two.png` });
  await p.locator('.save-del').first().click();
  await wait(200);
  await p.screenshot({ path: `${out}/${name}-confirm.png` });
  await p.locator('.save-go.danger').click();
  await wait(300);
  check((await p.locator('.save-row').count()) === 1, `${name}: deleted one save`);
  await ctx.close();
}
await browser.close();
console.log(fails.length ? `\n${fails.length} FAILED:\n` + fails.join('\n') : '\nall session checks passed');
