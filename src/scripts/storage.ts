// Browser-only. Never import from Astro frontmatter: localStorage does not exist at build time.
import { parseParticipants } from '../lib/draw';
import { createStore, parseStore, type ListStore } from '../lib/lists';
import { parseTurnsStore, type TurnsStore } from '../lib/turns';

const KEY = 'ronda.lists.v1';
const LEGACY_KEY = 'ronda.preferences.v1'; // single list, before saved lists existed
const TURNS_KEY = 'ronda.turns.v1';

function readJson(key: string): unknown {
  const raw = localStorage.getItem(key);
  return raw === null ? null : JSON.parse(raw);
}

/**
 * Always returns a usable store: the saved one, the legacy single list moved into a first list,
 * or a fresh empty list named `defaultName` when nothing valid is stored or storage is blocked.
 */
export function readStore(defaultName: string): ListStore {
  try {
    const saved = parseStore(readJson(KEY));
    if (saved) return saved;
    const legacy = readJson(LEGACY_KEY);
    if (typeof legacy === 'object' && legacy !== null) {
      const { names, groups } = legacy as Record<string, unknown>;
      if (typeof names === 'string' && Number.isInteger(groups) && (groups as number) >= 1) {
        return createStore(defaultName, parseParticipants(names), groups as number);
      }
    }
  } catch {
    // Corrupt JSON or blocked storage: start fresh.
  }
  return createStore(defaultName);
}

/** Returns false when the browser refuses to store (private mode, quota, blocked site data). */
export function writeStore(store: ListStore): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(store));
    return true;
  } catch {
    return false;
  }
}

/** Turn data of the lists in `listIds`; anything unreadable, or of a list that no longer exists, is dropped. */
export function readTurns(listIds: readonly string[]): TurnsStore {
  try {
    return parseTurnsStore(readJson(TURNS_KEY), listIds);
  } catch {
    return {};
  }
}

/** Returns false when the browser refuses to store. */
export function writeTurns(turns: TurnsStore): boolean {
  try {
    localStorage.setItem(TURNS_KEY, JSON.stringify(turns));
    return true;
  } catch {
    return false;
  }
}
