// "Install app" support. Chromium browsers let us trigger the real install prompt; Firefox (Android) and
// Safari (iOS / macOS) only install from their own menus, so for those we show the exact steps instead.

/** Chromium's install prompt event (not in the standard DOM typings). */
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export type InstallMode = 'prompt' | 'ios' | 'firefox-android' | 'mac-safari';

const FLAG = 'lumen.installed';
let deferred: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();

/** True when we're running as the installed app rather than in a browser tab. */
export function isStandalone(): boolean {
  const mm = (q: string) => typeof matchMedia !== 'undefined' && matchMedia(q).matches;
  const iosStandalone = (navigator as Navigator & { standalone?: boolean }).standalone === true;
  // fullscreen only counts on touch devices (on desktop it's usually just F11)
  return iosStandalone || mm('(display-mode: standalone)') || mm('(display-mode: minimal-ui)') || (mm('(display-mode: fullscreen)') && mm('(pointer: coarse)'));
}

function remember() {
  try {
    localStorage.setItem(FLAG, '1');
  } catch {
    /* ignore */
  }
}

function remembered(): boolean {
  try {
    return localStorage.getItem(FLAG) === '1';
  } catch {
    return false;
  }
}

export function initInstall(onInstalled: () => void) {
  if (isStandalone()) remember(); // shared storage (e.g. Firefox Android) lets the browser tab know later
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault(); // keep it for our own button instead of the browser's mini-infobar
    deferred = e as BeforeInstallPromptEvent;
    listeners.forEach((f) => f());
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    remember();
    listeners.forEach((f) => f());
    onInstalled();
  });
}

/** Called whenever install availability changes (the prompt becomes available or the app got installed). */
export function onInstallChange(f: () => void) {
  listeners.add(f);
}

/** How (and whether) to offer installation here; null = hide the button. */
export function installMode(): InstallMode | null {
  if (isStandalone()) return null;
  if (deferred) return 'prompt';
  if (remembered()) return null;
  const ua = navigator.userAgent;
  const iOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (iOS) return 'ios';
  if (/Android/.test(ua) && /Firefox\//.test(ua)) return 'firefox-android';
  const safariVer = /Version\/(\d+)/.exec(ua);
  if (/Macintosh/.test(ua) && /Safari\//.test(ua) && !/Chrome|Chromium|Edg|Firefox|OPR/.test(ua) && safariVer && +safariVer[1] >= 17) return 'mac-safari';
  return null; // e.g. desktop Firefox (can't install web apps) or Chromium that already has it installed
}

/** Show the browser's own install dialog (Chromium only). Resolves true if the player accepted. */
export async function promptInstall(): Promise<boolean> {
  const e = deferred;
  if (!e) return false;
  deferred = null;
  await e.prompt();
  const { outcome } = await e.userChoice;
  listeners.forEach((f) => f());
  return outcome === 'accepted';
}
