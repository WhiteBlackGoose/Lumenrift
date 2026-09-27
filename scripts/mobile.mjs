// Mobile layout audit: screenshots + automatic overlap/overflow detection on several phone sizes.
// Usage: CHROMIUM=... node scripts/mobile.mjs [baseUrl] [outDir]
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';

const base = process.argv[2] ?? 'http://localhost:5173/';
const out = process.argv[3] ?? 'shots/mobile';
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? 'chromium' });
const DEVICES = [
  ['se', 375, 667],
  ['pixel', 412, 915],
  ['small', 360, 640],
  ['pixel-land', 915, 412],
  ['se-land', 667, 375],
];
const problems = [];
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/** Report overlapping visible HUD elements and anything wider than the viewport. */
async function audit(p, tag) {
  const res = await p.evaluate(() => {
    const vis = (e) => {
      const r = e.getBoundingClientRect();
      const s = getComputedStyle(e);
      return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' && s.opacity !== '0';
    };
    const out = [];
    const W = innerWidth, H = innerHeight;
    if (document.documentElement.scrollWidth > W + 1) out.push(`page scrolls horizontally (${document.documentElement.scrollWidth} > ${W})`);
    const groups = [
      '#hud-top > *:not(.spacer)',
      '#hud-top .btn-group > *',
      '#preview, #boss-bar, #panel, #hud-bottom > *',
      '#hud-top, #panel, #hud-bottom, #preview',
    ];
    for (const sel of groups) {
      const els = [...document.querySelectorAll(sel)].filter(vis);
      for (let i = 0; i < els.length; i++)
        for (let j = i + 1; j < els.length; j++) {
          const a = els[i].getBoundingClientRect(), b = els[j].getBoundingClientRect();
          const ox = Math.min(a.right, b.right) - Math.max(a.left, b.left);
          const oy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
          if (ox > 2 && oy > 2) out.push(`overlap: ${els[i].id || els[i].className} × ${els[j].id || els[j].className}`);
        }
    }
    for (const e of document.querySelectorAll('#ui *')) {
      if (!vis(e)) continue;
      const r = e.getBoundingClientRect();
      if ((r.right > W + 1 || r.left < -1) && !e.closest('#build-bar')) out.push(`off-screen: ${e.tagName}.${e.className} [${Math.round(r.left)}..${Math.round(r.right)}]`);
      const s = getComputedStyle(e);
      if (e.scrollWidth > e.clientWidth + 2 && s.overflowX !== 'visible' && !e.closest('#build-bar') && e.id !== 'build-bar' && e.tagName !== 'SELECT')
        out.push(`h-scroll: ${e.tagName}.${e.className} ${e.scrollWidth}>${e.clientWidth}`);
      if ((s.whiteSpace === 'nowrap' || e.classList.contains('lbl')) && e.scrollWidth > e.clientWidth + 2 && s.overflow === 'visible' && e.children.length === 0)
        out.push(`text clipped/overflowing: ${e.className} "${e.textContent.slice(0, 30)}"`);
    }
    // children spilling out of their (visible-overflow) parents inside the HUD bars and panels
    for (const e of document.querySelectorAll('#hud-top *, #panel *, #hud-bottom *, .screen .card *')) {
      if (!vis(e) || !e.parentElement || e.closest('#build-bar') || e.classList.contains('gem')) continue;
      const r = e.getBoundingClientRect(), pr = e.parentElement.getBoundingClientRect();
      if (r.left < pr.left - 2 || r.right > pr.right + 2 || r.top < pr.top - 2 || r.bottom > pr.bottom + 2)
        out.push(`spills out of parent: ${e.tagName}.${e.className} in .${e.parentElement.className}`);
    }
    // stat values should stay on one line
    for (const e of document.querySelectorAll('.stats dd')) {
      if (vis(e) && e.getBoundingClientRect().height > parseFloat(getComputedStyle(e).lineHeight || '18') * 1.6 + 2) out.push(`wrapped stat: "${e.textContent}"`);
    }
    return [...new Set(out)];
  });
  for (const r of res) problems.push(`[${tag}] ${r}`);
}

for (const [name, w, h] of DEVICES) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, locale: process.env.LOCALE ?? 'en-US' });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => problems.push(`[${name}] pageerror ${e.message}`));
  await p.goto(base);
  await wait(1800);
  await p.screenshot({ path: `${out}/${name}-1-title.png` });
  await audit(p, name + ' title');
  // start the game via the UI
  await p.locator('.big-btn').first().tap();
  await wait(900);
  await p.screenshot({ path: `${out}/${name}-2-start.png` });
  await audit(p, name + ' start');
  // mid game with a bot, then select a tower and the beacon
  await p.goto(base + '?autostart=normal&seed=1185&ff=700&bot=1');
  await wait(1500);
  await p.evaluate(() => (window.lumenrift.game.callWaveNow(), 0));
  await wait(2500);
  await p.screenshot({ path: `${out}/${name}-3-wave.png` });
  await audit(p, name + ' wave');
  await p.evaluate(() => { const a = window.lumenrift; a.selected = a.game.buildings.find((b) => b.def.id === 'arbalest'); a.paused = true; });
  await wait(300);
  await p.screenshot({ path: `${out}/${name}-4-panel.png` });
  await audit(p, name + ' panel');
  await p.evaluate(() => { const a = window.lumenrift; a.selected = null; a.selectCore(); });
  await wait(300);
  await p.screenshot({ path: `${out}/${name}-5-beacon.png` });
  await audit(p, name + ' beacon');
  // sandbox via the title screen: pick the Sandbox card, start, step the night picker
  await p.goto(base);
  await wait(1500);
  await p.locator('.diff').nth(3).tap();
  await p.locator('.big-btn').first().tap();
  await wait(700);
  for (let i = 0; i < 3; i++) { await p.locator('.pick-btn').nth(2).tap(); await wait(120); }
  await wait(300);
  const sb = await p.evaluate(() => ({ next: window.lumenrift.game.nextPlan.wave, money: document.querySelector('.money').textContent }));
  if (sb.next !== 4 || !sb.money.includes('∞')) problems.push(`[${name}] sandbox picker/money wrong: ${JSON.stringify(sb)}`);
  await p.screenshot({ path: `${out}/${name}-6-sandbox.png` });
  await audit(p, name + ' sandbox');
  await ctx.close();
}
await browser.close();
console.log(problems.length ? problems.join('\n') : 'no layout problems found');
