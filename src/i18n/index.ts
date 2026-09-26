import { de } from './de';
import { Dict, en, StringKey } from './en';
import { es } from './es';
import { fr } from './fr';
import { ru } from './ru';

export type { StringKey };
export type Lang = 'en' | 'de' | 'es' | 'fr' | 'ru';

export const LANGS: Record<Lang, Dict> = { en, de, es, fr, ru };
export const LANG_ORDER: Lang[] = ['en', 'de', 'es', 'fr', 'ru'];

const STORE_KEY = 'lumen.lang';
let current: Lang = detect();
const listeners = new Set<() => void>();

/** Stored choice first, then the browser/OS language list, then English. */
function detect(): Lang {
  try {
    const s = localStorage.getItem(STORE_KEY) as Lang | null;
    if (s && s in LANGS) return s;
  } catch {
    /* storage unavailable */
  }
  const prefs = typeof navigator !== 'undefined' ? (navigator.languages?.length ? navigator.languages : [navigator.language]) : [];
  for (const p of prefs) {
    const base = (p || '').toLowerCase().split('-')[0] as Lang;
    if (base in LANGS) return base;
  }
  return 'en';
}

export function lang(): Lang {
  return current;
}

export function setLang(l: Lang) {
  if (!(l in LANGS) || l === current) return;
  current = l;
  try {
    localStorage.setItem(STORE_KEY, l);
  } catch {
    /* ignore */
  }
  applyDocument();
  listeners.forEach((f) => f());
}

export function onLangChange(f: () => void) {
  listeners.add(f);
}

/** Translate a key, substituting {placeholders}. Falls back to English, then to the key itself. */
export function t(key: StringKey, vars?: Record<string, string | number>): string {
  let s = LANGS[current][key] ?? en[key] ?? key;
  if (vars) for (const k in vars) s = s.split('{' + k + '}').join(String(vars[k]));
  return s;
}

/** Keep <html lang> and the tab title in sync. */
export function applyDocument() {
  if (typeof document === 'undefined') return;
  document.documentElement.lang = current;
  document.title = t('meta.title');
}
