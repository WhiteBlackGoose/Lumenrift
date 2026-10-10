import { Difficulty, Realm } from '../game/config';

const KEY = 'lumen.best';

const keyFor = (realm: Realm) => (realm === 'night' ? KEY : KEY + '.' + realm);

export function loadBest(realm: Realm = 'night'): Partial<Record<Difficulty, number>> {
  try {
    return JSON.parse(localStorage.getItem(keyFor(realm)) || '{}');
  } catch {
    return {};
  }
}

/** Record a result; returns true if it's a new best. */
export function saveBest(d: Difficulty, night: number, realm: Realm = 'night'): boolean {
  const b = loadBest(realm);
  if ((b[d] ?? 0) >= night) return false;
  b[d] = night;
  try {
    localStorage.setItem(keyFor(realm), JSON.stringify(b));
  } catch {
    /* storage unavailable */
  }
  return true;
}
