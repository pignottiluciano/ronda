// Backup: what leaves the app as a JSON file and what comes back in. Pure, no DOM and no storage.
// The day in progress and today's absences are not exported: a backup holds history, not a running clock.
import { parseStore, type ListStore, type SavedList } from './lists.ts';
import { parseTurnsStore, type ListTurns, type TurnsStore } from './turns.ts';

export const BACKUP_VERSION = 1;
export const MAX_BACKUP_BYTES = 5 * 1024 * 1024;

export interface Backup {
  app: 'ronda';
  version: number;
  exportedAt: number;
  activeId: string;
  lists: SavedList[];
  turns: TurnsStore;
}

export type BackupError = 'json' | 'format' | 'version' | 'size';

export type ParsedBackup = { ok: true; backup: Backup; error?: undefined } | { ok: false; error: BackupError; backup?: undefined };

const withoutVolatile = (turns: ListTurns): ListTurns => ({ ...turns, current: null, absent: [] });

export function createBackup(store: ListStore, turns: TurnsStore, now: number): Backup {
  const ids = store.lists.map((list) => list.id);
  const kept = Object.entries(turns).filter(([id]) => ids.includes(id));
  return {
    app: 'ronda',
    version: BACKUP_VERSION,
    exportedAt: now,
    activeId: store.activeId,
    lists: store.lists,
    turns: Object.fromEntries(kept.map(([id, value]) => [id, withoutVolatile(value)])),
  };
}

/** Reads a backup file's text. Everything is validated with the same parsers as stored data. */
export function parseBackup(text: string): ParsedBackup {
  if (text.length > MAX_BACKUP_BYTES) return { ok: false, error: 'size' };
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, error: 'json' };
  }
  if (typeof data !== 'object' || data === null || Array.isArray(data)) return { ok: false, error: 'format' };
  const { app, version, exportedAt, activeId, lists, turns } = data as Record<string, unknown>;
  if (app !== 'ronda' || !Number.isInteger(version) || (version as number) < 1) return { ok: false, error: 'format' };
  if ((version as number) > BACKUP_VERSION) return { ok: false, error: 'version' };
  const store = parseStore({ activeId, lists });
  if (!store) return { ok: false, error: 'format' };
  const listIds = store.lists.map((list) => list.id);
  return {
    ok: true,
    backup: {
      app: 'ronda',
      version: BACKUP_VERSION,
      exportedAt: typeof exportedAt === 'number' ? exportedAt : 0,
      activeId: store.activeId,
      lists: store.lists,
      turns: parseTurnsStore(turns, listIds),
    },
  };
}

/** A lone list with nothing in it is what a new browser starts with; importing replaces it instead of keeping it. */
function isBlank(current: ListStore, turns: TurnsStore): boolean {
  const [only] = current.lists;
  return current.lists.length === 1 && only !== undefined && only.people.length === 0 && !only.turns && !(turns[only.id]?.sessions.length);
}

/** What an import would do, for the confirmation: lists with the same id are replaced, the rest are added, the others stay. */
export function planImport(current: ListStore, currentTurns: TurnsStore, backup: Backup) {
  const own = isBlank(current, currentTurns) ? [] : current.lists.map((list) => list.id);
  return {
    replace: backup.lists.filter((list) => own.includes(list.id)).map((list) => list.name),
    add: backup.lists.filter((list) => !own.includes(list.id)).map((list) => list.name),
    untouched: own.filter((id) => !backup.lists.some((list) => list.id === id)).length,
  };
}

/**
 * Lists with the same id become the backup's version, in the same place; the others are appended and nothing is
 * deleted. Turn data comes from the backup where it has some, so a list it brings without any keeps its own.
 */
export function applyImport(current: ListStore, currentTurns: TurnsStore, backup: Backup): { store: ListStore; turns: TurnsStore } {
  const blank = isBlank(current, currentTurns);
  const base = blank ? [] : current.lists;
  const incoming = new Map(backup.lists.map((list) => [list.id, list]));
  const lists = [...base.map((list) => incoming.get(list.id) ?? list), ...backup.lists.filter((list) => !base.some((own) => own.id === list.id))];
  return {
    store: { activeId: blank ? backup.activeId : current.activeId, lists },
    turns: { ...currentTurns, ...backup.turns },
  };
}
