// Headless balance simulation: runs the bot on many seeds and reports how far it gets.
// Usage: npm run sim -- [runs=8] [difficulty=normal] [maze=1] [skill=0.7]
import { Difficulty } from '../src/game/config';
import { Game } from '../src/game/game';
import { Bot } from '../src/game/bot';

const runs = Number(process.argv[2] ?? 8);
const diff = (process.argv[3] ?? 'normal') as Difficulty;
const maze = (process.argv[4] ?? '1') === '1';
const skill = Number(process.argv[5] ?? 0.7);
const verbose = process.argv.includes('-v');

const results: number[] = [];
const t0 = Date.now();
for (let r = 0; r < runs; r++) {
  const seed = 1000 + r * 37;
  const g = new Game(seed, diff);
  const bot = new Bot(g, { skill, maze });
  const dt = 1 / 60;
  let lastWave = 0;
  let steps = 0;
  const maxWave = Number(process.env.MAXW ?? 45);
  while (!g.over && g.wave <= maxWave && steps < 60 * 60 * 600) {
    bot.update(dt);
    g.step(dt);
    g.drainEvents();
    steps++;
    if (verbose && g.wave !== lastWave && g.phase === 'wave') {
      lastWave = g.wave;
      const towers = g.buildings.filter((b) => b.def.kind === 'tower').length;
      const walls = g.buildings.filter((b) => b.def.id === 'wall').length;
      console.log(
        `  seed ${seed} w${g.wave} money=${g.money | 0} core=${g.coreHp | 0}/${g.coreMaxHp} lvl=${g.coreLevel + 1} towers=${towers} walls=${walls} earned=${g.stats.earned}`,
      );
    }
    if (g.won && g.over) g.continueEndless();
  }
  const reached = g.wave;
  results.push(reached);
  console.log(`seed ${seed}: reached night ${reached} (core lvl ${g.coreLevel + 1}, kills ${g.stats.kills}, buildings ${g.buildings.length})`);
}
results.sort((a, b) => a - b);
const avg = results.reduce((a, b) => a + b, 0) / results.length;
console.log(`\n${diff} maze=${maze} skill=${skill}: avg ${avg.toFixed(1)}, median ${results[results.length >> 1]}, min ${results[0]}, max ${results[results.length - 1]}  (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
