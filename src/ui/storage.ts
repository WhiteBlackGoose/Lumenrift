import { Difficulty } from '../game/config';

const KEY = 'lumen.best';

export function loadBest(): Partial<Record<Difficulty, number>> {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '{}');
  } catch {
    return {};
  }
}

/** Record a result; returns true if it's a new best. */
export function saveBest(d: Difficulty, night: number): boolean {
  const b = loadBest();
  if ((b[d] ?? 0) >= night) return false;
  b[d] = night;
  try {
    localStorage.setItem(KEY, JSON.stringify(b));
  } catch {
    /* storage unavailable */
  }
  return true;
}
