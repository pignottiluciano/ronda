// Saved lists: pure state transitions, no DOM, no storage. Every function returns a new store.

export interface SavedList {
  id: string;
  name: string;
  names: string;
  groups: number;
}

export interface ListStore {
  activeId: string;
  lists: SavedList[];
}

export const MAX_NAME_LENGTH = 40;

const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

const clean = (name: string) => name.trim().slice(0, MAX_NAME_LENGTH);

export function createStore(name: string, names = '', groups = 1): ListStore {
  const list: SavedList = { id: newId(), name: clean(name), names, groups };
  return { activeId: list.id, lists: [list] };
}

export function activeList(store: ListStore): SavedList {
  return store.lists.find((list) => list.id === store.activeId) ?? store.lists[0]!;
}

export function setActive(store: ListStore, id: string): ListStore {
  return store.lists.some((list) => list.id === id) ? { ...store, activeId: id } : store;
}

/** Appends an empty list and makes it the active one. */
export function addList(store: ListStore, name: string): ListStore {
  const list: SavedList = { id: newId(), name: clean(name), names: '', groups: 1 };
  return { activeId: list.id, lists: [...store.lists, list] };
}

/** An empty name is ignored, so a list is never left unnamed. */
export function renameList(store: ListStore, id: string, name: string): ListStore {
  const next = clean(name);
  if (!next) return store;
  return { ...store, lists: store.lists.map((list) => (list.id === id ? { ...list, name: next } : list)) };
}

export function updateList(store: ListStore, id: string, patch: Partial<Pick<SavedList, 'names' | 'groups'>>): ListStore {
  return { ...store, lists: store.lists.map((list) => (list.id === id ? { ...list, ...patch } : list)) };
}

/** There is always at least one list: removing the last one leaves a fresh empty list named `fallbackName`. */
export function removeList(store: ListStore, id: string, fallbackName: string): ListStore {
  const lists = store.lists.filter((list) => list.id !== id);
  if (lists.length === 0) return createStore(fallbackName);
  const activeId = store.activeId === id ? lists[Math.max(0, store.lists.findIndex((l) => l.id === id) - 1)]!.id : store.activeId;
  return { activeId, lists };
}

/** Validates data read from storage. Returns null when it is not a usable store. */
export function parseStore(data: unknown): ListStore | null {
  if (typeof data !== 'object' || data === null) return null;
  const { activeId, lists } = data as Record<string, unknown>;
  if (typeof activeId !== 'string' || !Array.isArray(lists) || lists.length === 0) return null;
  const valid: SavedList[] = [];
  for (const item of lists) {
    if (typeof item !== 'object' || item === null) return null;
    const { id, name, names, groups } = item as Record<string, unknown>;
    if (typeof id !== 'string' || typeof name !== 'string' || !clean(name)) return null;
    if (typeof names !== 'string' || !Number.isInteger(groups) || (groups as number) < 1) return null;
    valid.push({ id, name: clean(name), names, groups: groups as number });
  }
  return { activeId: valid.some((l) => l.id === activeId) ? activeId : valid[0]!.id, lists: valid };
}
