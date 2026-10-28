// Saved lists: pure state transitions, no DOM, no storage. Every function returns a new store.

export interface Person {
  id: string;
  name: string;
}

export interface SavedList {
  id: string;
  name: string;
  people: Person[];
  groups: number;
}

export interface ListStore {
  activeId: string;
  lists: SavedList[];
}

export const MAX_NAME_LENGTH = 40;
export const MAX_PEOPLE = 200;

const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

const clean = (name: string) => name.trim().slice(0, MAX_NAME_LENGTH);

/** Two people are the same when their cleaned names match ignoring case. */
export const nameKey = (name: string) => clean(name).toLocaleLowerCase();

/**
 * Adds `names` after `people`, skipping empty ones (silently), repeats and whatever exceeds MAX_PEOPLE
 * (both reported in `skipped`, as typed).
 */
function merge(people: readonly Person[], names: readonly string[]) {
  const seen = new Set(people.map((p) => nameKey(p.name)));
  const added: Person[] = [];
  const skipped: string[] = [];
  for (const raw of names) {
    const name = clean(raw);
    if (!name) continue;
    const key = nameKey(name);
    if (seen.has(key) || people.length + added.length >= MAX_PEOPLE) {
      skipped.push(raw.trim());
      continue;
    }
    seen.add(key);
    added.push({ id: newId(), name });
  }
  return { people: [...people, ...added], added, skipped };
}

export function createStore(name: string, names: readonly string[] = [], groups = 1): ListStore {
  const list: SavedList = { id: newId(), name: clean(name), people: merge([], names).people, groups };
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
  const list: SavedList = { id: newId(), name: clean(name), people: [], groups: 1 };
  return { activeId: list.id, lists: [...store.lists, list] };
}

/** An empty name is ignored, so a list is never left unnamed. */
export function renameList(store: ListStore, id: string, name: string): ListStore {
  const next = clean(name);
  if (!next) return store;
  return { ...store, lists: store.lists.map((list) => (list.id === id ? { ...list, name: next } : list)) };
}

export function updateList(store: ListStore, id: string, patch: Partial<Pick<SavedList, 'groups'>>): ListStore {
  return { ...store, lists: store.lists.map((list) => (list.id === id ? { ...list, ...patch } : list)) };
}

const mapList = (store: ListStore, id: string, change: (list: SavedList) => SavedList): ListStore => ({
  ...store,
  lists: store.lists.map((list) => (list.id === id ? change(list) : list)),
});

export function addPeople(store: ListStore, listId: string, names: readonly string[]) {
  const target = store.lists.find((list) => list.id === listId);
  if (!target) return { store, added: [] as string[], skipped: [] as string[] };
  const { people, added, skipped } = merge(target.people, names);
  return { store: mapList(store, listId, (list) => ({ ...list, people })), added: added.map((p) => p.name), skipped };
}

export function removePerson(store: ListStore, listId: string, personId: string): ListStore {
  return mapList(store, listId, (list) => ({ ...list, people: list.people.filter((p) => p.id !== personId) }));
}

export function clearPeople(store: ListStore, listId: string): ListStore {
  return mapList(store, listId, (list) => ({ ...list, people: [] }));
}

export type RenameError = 'empty' | 'duplicate';

/** The id stays, so anything keyed on it keeps working. Changing only the case of a name is allowed. */
export function renamePerson(store: ListStore, listId: string, personId: string, name: string) {
  const target = store.lists.find((list) => list.id === listId);
  const next = clean(name);
  const reject = (error: RenameError) => ({ store, error });
  if (!target) return reject('empty');
  if (!next) return reject('empty');
  if (target.people.some((p) => p.id !== personId && nameKey(p.name) === nameKey(next))) return reject('duplicate');
  const renamed = mapList(store, listId, (list) => ({
    ...list,
    people: list.people.map((p) => (p.id === personId ? { ...p, name: next } : p)),
  }));
  return { store: renamed, error: null as RenameError | null };
}

/** There is always at least one list: removing the last one leaves a fresh empty list named `fallbackName`. */
export function removeList(store: ListStore, id: string, fallbackName: string): ListStore {
  const lists = store.lists.filter((list) => list.id !== id);
  if (lists.length === 0) return createStore(fallbackName);
  const activeId = store.activeId === id ? lists[Math.max(0, store.lists.findIndex((l) => l.id === id) - 1)]!.id : store.activeId;
  return { activeId, lists };
}

function parsePeople(item: Record<string, unknown>): Person[] | null {
  const { people, names } = item;
  if (typeof names === 'string' && people === undefined) return merge([], names.split('\n')).people; // before badges
  if (!Array.isArray(people)) return null;
  const seen = new Set<string>();
  const valid: Person[] = [];
  for (const p of people) {
    if (typeof p !== 'object' || p === null) return null;
    const { id, name } = p as Record<string, unknown>;
    if (typeof id !== 'string' || typeof name !== 'string') return null;
    const key = nameKey(name);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    valid.push({ id, name: clean(name) });
  }
  return valid;
}

/** Validates data read from storage. Returns null when it is not a usable store. */
export function parseStore(data: unknown): ListStore | null {
  if (typeof data !== 'object' || data === null) return null;
  const { activeId, lists } = data as Record<string, unknown>;
  if (typeof activeId !== 'string' || !Array.isArray(lists) || lists.length === 0) return null;
  const valid: SavedList[] = [];
  for (const item of lists) {
    if (typeof item !== 'object' || item === null) return null;
    const { id, name, groups } = item as Record<string, unknown>;
    if (typeof id !== 'string' || typeof name !== 'string' || !clean(name)) return null;
    if (!Number.isInteger(groups) || (groups as number) < 1) return null;
    const people = parsePeople(item as Record<string, unknown>);
    if (!people) return null;
    valid.push({ id, name: clean(name), people, groups: groups as number });
  }
  return { activeId: valid.some((l) => l.id === activeId) ? activeId : valid[0]!.id, lists: valid };
}
