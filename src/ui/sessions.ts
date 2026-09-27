// Saved game sessions in localStorage: a small index for the title screen plus one blob per game.
import { Difficulty } from '../game/config';
import type { Game, SaveData } from '../game/game';

export interface SessionMeta {
  id: string;
  difficulty: Difficulty;
  night: number; // the night being fought, or the one coming up
  inNight: boolean; // saved in the middle of a night
  beacon: number; // Beacon health, 0..1
  kills: number;
  won: boolean;
  attempts: number;
  /** The Beacon fell; the session can be respawned from a checkpoint. */
  fallen: boolean;
  created: number;
  updated: number;
}

/** What's stored per session: the live game plus checkpoints from recent build phases (for respawning). */
export interface SessionBlob {
  v: 2;
  game: SaveData;
  checkpoints: SaveData[];
  /** Set when the Beacon fell on this night. */
  fallenNight?: number;
}

const INDEX = 'lumen.sessions';
const DATA = 'lumen.session.';
const MAX = 12;

function readIndex(): SessionMeta[] {
  try {
    const v = JSON.parse(localStorage.getItem(INDEX) || '[]');
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

function writeIndex(list: SessionMeta[]) {
  try {
    localStorage.setItem(INDEX, JSON.stringify(list));
  } catch {
    /* storage unavailable */
  }
}

/** Most recently played first. */
export function listSessions(): SessionMeta[] {
  return readIndex().sort((a, b) => b.updated - a.updated);
}

export function newSessionId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

export function saveSession(id: string, g: Game, created: number, checkpoints: SaveData[], fallenNight?: number): void {
  const meta: SessionMeta = {
    id,
    difficulty: g.difficulty,
    night: fallenNight ?? (g.phase === 'build' && !g.over ? g.wave + 1 : g.wave),
    inNight: g.phase === 'wave' && !fallenNight,
    beacon: Math.max(0, Math.min(1, g.coreHp / g.coreMaxHp)),
    kills: g.stats.kills,
    won: g.won,
    attempts: g.stats.attempts ?? 1,
    fallen: !!fallenNight,
    created,
    updated: Date.now(),
  };
  let list = readIndex().filter((s) => s.id !== id);
  list.unshift(meta);
  // keep the newest few; drop the data of anything pushed out
  list.sort((a, b) => b.updated - a.updated);
  for (const old of list.slice(MAX)) removeData(old.id);
  list = list.slice(0, MAX);
  const data: SessionBlob = { v: 2, game: g.toSave(), checkpoints, fallenNight };
  const blob = JSON.stringify(data);
  try {
    localStorage.setItem(DATA + id, blob);
  } catch {
    // quota: evict the oldest other sessions until it fits
    for (const old of [...list].reverse()) {
      if (old.id === id) continue;
      removeData(old.id);
      list = list.filter((s) => s.id !== old.id);
      try {
        localStorage.setItem(DATA + id, blob);
        break;
      } catch {
        /* keep evicting */
      }
    }
  }
  writeIndex(list);
}

export function loadSession(id: string): SessionBlob | null {
  try {
    const raw = localStorage.getItem(DATA + id);
    const d = raw ? JSON.parse(raw) : null;
    if (d?.v === 2) return d as SessionBlob;
    if (d?.v === 1) return { v: 2, game: d as SaveData, checkpoints: [] }; // older saves
    return null;
  } catch {
    return null;
  }
}

function removeData(id: string) {
  try {
    localStorage.removeItem(DATA + id);
  } catch {
    /* ignore */
  }
}

export function deleteSession(id: string): void {
  removeData(id);
  writeIndex(readIndex().filter((s) => s.id !== id));
}
