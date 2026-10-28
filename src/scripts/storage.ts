// Browser-only. Never import from Astro frontmatter: localStorage does not exist at build time.
import { createStore, parseStore, type ListStore } from '../lib/lists';

const KEY = 'ronda.lists.v1';
const LEGACY_KEY = 'ronda.preferences.v1'; // single list, before saved lists existed

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
        return createStore(defaultName, names, groups as number);
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
