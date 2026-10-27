// Browser-only. Never import from Astro frontmatter: localStorage does not exist at build time.

const KEY = 'ronda.preferences.v1';

export interface Preferences {
  names: string;
  groups: number;
}

/** Returns null when nothing is saved, the data is invalid, or storage is blocked. */
export function readPreferences(): Preferences | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw === null) return null;
    const data: unknown = JSON.parse(raw);
    if (typeof data !== 'object' || data === null) return null;
    const { names, groups } = data as Record<string, unknown>;
    if (typeof names !== 'string' || !Number.isInteger(groups) || (groups as number) < 1) return null;
    return { names, groups: groups as number };
  } catch {
    return null;
  }
}

/** Returns false when the browser refuses to store (private mode, quota, blocked site data). */
export function writePreferences(preferences: Preferences): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(preferences));
    return true;
  } catch {
    return false;
  }
}
