import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyImport, createBackup, MAX_BACKUP_BYTES, parseBackup, planImport } from '../src/lib/backup.ts';
import { addList, createStore, setTurns } from '../src/lib/lists.ts';
import { emptyTurns } from '../src/lib/turns.ts';

const MIN = 60_000;
const session = (id, ms) => ({ id, endedAt: 1000, budgetMs: 5 * MIN, entries: [{ personId: 'p1', name: 'Ana', spokenMs: ms, absent: false }] });

function sample() {
  let store = createStore('Daily', ['Ana', 'Bruno'], 2);
  const a = store.activeId;
  store = addList(store, 'Tenis');
  const b = store.activeId;
  store = setTurns(store, a, true);
  const turns = {
    [a]: { ...emptyTurns(), absent: ['x'], sessions: [session('s1', MIN)], current: { startedAt: 1, budgetMs: 5 * MIN, order: [], spoken: {}, activeId: null, activeSince: null } },
  };
  return { store, turns, a, b };
}

const parsed = (text) => {
  const result = parseBackup(text);
  assert.equal(result.ok, true, JSON.stringify(result));
  return result.backup;
};

test('a backup survives a round trip and leaves out volatile state (the day in progress and absences)', () => {
  const { store, turns, a } = sample();
  const backup = parsed(JSON.stringify(createBackup(store, turns, 123)));
  assert.equal(backup.lists.length, 2);
  assert.deepEqual(backup.lists[0].people.map((p) => p.name), ['Ana', 'Bruno']);
  assert.equal(backup.lists[0].turns, true);
  assert.equal(backup.turns[a].sessions.length, 1);
  assert.equal(backup.turns[a].current, null);
  assert.deepEqual(backup.turns[a].absent, []);
  assert.equal(backup.exportedAt, 123);
});

test('the export names the app and a version', () => {
  const { store, turns } = sample();
  const data = createBackup(store, turns, 0);
  assert.deepEqual([data.app, data.version], ['ronda', 1]);
});

test('parsing rejects what is not a usable backup, with the reason', () => {
  const { store, turns } = sample();
  const ok = createBackup(store, turns, 0);
  const reason = (value) => parseBackup(typeof value === 'string' ? value : JSON.stringify(value)).error;
  assert.equal(reason('{nope'), 'json');
  assert.equal(reason({ ...ok, app: 'other' }), 'format');
  assert.equal(reason([]), 'format');
  assert.equal(reason({ ...ok, version: 2 }), 'version');
  assert.equal(reason({ ...ok, version: 0 }), 'format');
  assert.equal(reason({ ...ok, lists: [] }), 'format');
  assert.equal(reason({ ...ok, lists: [{ id: 'a', name: 'A', people: 'x', groups: 1 }] }), 'format');
  assert.equal(reason('x'.repeat(MAX_BACKUP_BYTES + 1)), 'size');
});

test('turn data of lists the backup does not have is dropped, and unknown fields are ignored', () => {
  const { store, turns } = sample();
  const data = { ...createBackup(store, turns, 0), extra: 1, turns: { ...createBackup(store, turns, 0).turns, ghost: emptyTurns() } };
  const backup = parsed(JSON.stringify(data));
  assert.deepEqual(Object.keys(backup.turns), [store.lists[0].id]);
});

test('the plan says which lists are replaced and which are added', () => {
  const { store, turns, a } = sample();
  const backup = parsed(JSON.stringify(createBackup(store, turns, 0)));
  const other = addList(createStore('Solo'), 'Nueva');
  const plan = planImport(other, {}, backup);
  assert.deepEqual([plan.replace, plan.add, plan.untouched], [[], ['Daily', 'Tenis'], 2]);
  const same = planImport(store, {}, backup);
  assert.deepEqual([same.replace, same.add, same.untouched], [['Daily', 'Tenis'], [], 0]);
  assert.ok(a);
});

test('importing replaces lists with the same id in place, appends the others and keeps the active list', () => {
  const { store: source, turns: sourceTurns, a } = sample();
  const backup = parsed(JSON.stringify(createBackup(source, sourceTurns, 0)));
  let current = createStore('Local', ['Zoe']);
  const localId = current.activeId;
  // the same list as in the backup, but edited here since
  current = { ...current, lists: [...current.lists, { ...source.lists[0], people: [{ id: 'q', name: 'Edited' }] }] };
  const { store, turns } = applyImport(current, { [a]: { ...emptyTurns(), minDays: 4 } }, backup);
  assert.deepEqual(store.lists.map((l) => l.id), [localId, a, source.lists[1].id]);
  assert.deepEqual(store.lists[1].people.map((p) => p.name), ['Ana', 'Bruno']);
  assert.equal(store.activeId, localId);
  assert.equal(turns[a].sessions.length, 1); // the backup's days won over the local ones
  assert.equal(turns[a].minDays, 1);
});

test('importing keeps the local turn data of a list the backup brings without any', () => {
  const { store: source, turns: sourceTurns } = sample();
  const backup = parsed(JSON.stringify(createBackup(source, sourceTurns, 0)));
  const b = source.lists[1].id; // Tenis came without turn data
  const local = { [b]: { ...emptyTurns(), sessions: [session('mine', MIN)] } };
  const { turns } = applyImport(source, local, backup);
  assert.equal(turns[b].sessions[0].id, 'mine');
});

test('importing into a browser that only has the empty default list replaces that list', () => {
  const { store: source, turns: sourceTurns } = sample();
  const backup = parsed(JSON.stringify(createBackup(source, sourceTurns, 0)));
  const fresh = createStore('Lista 1');
  assert.deepEqual([planImport(fresh, {}, backup).replace, planImport(fresh, {}, backup).add], [[], ['Daily', 'Tenis']]);
  const { store } = applyImport(fresh, {}, backup);
  assert.deepEqual(store.lists.map((l) => l.name), ['Daily', 'Tenis']);
  assert.equal(store.activeId, source.activeId);
});

test('a lone list with people, turns or saved days is never dropped by an import', () => {
  const { store: source, turns: sourceTurns } = sample();
  const backup = parsed(JSON.stringify(createBackup(source, sourceTurns, 0)));
  const real = createStore('Mine', ['Zoe']);
  assert.equal(applyImport(real, {}, backup).store.lists.length, 3);
  const withDays = createStore('Mine');
  const days = { [withDays.activeId]: { ...emptyTurns(), sessions: [session('s', MIN)] } };
  assert.equal(applyImport(withDays, days, backup).store.lists.length, 3);
});
