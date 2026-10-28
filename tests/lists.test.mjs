import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  activeList, addList, addPeople, clearPeople, createStore, MAX_PEOPLE, nameKey, parseStore, removeList,
  removePerson, renameList, renamePerson, setActive, updateList,
} from '../src/lib/lists.ts';

const names = (store) => activeList(store).people.map((p) => p.name);

test('add makes the new list active and keeps the others', () => {
  const store = addList(createStore('Uno', ['Ana', 'Bruno'], 2), 'Dos');
  assert.equal(store.lists.length, 2);
  assert.equal(activeList(store).name, 'Dos');
  assert.deepEqual(store.lists[0].people.map((p) => p.name), ['Ana', 'Bruno']);
});

test('rename trims, caps the length and ignores empty names', () => {
  const store = createStore('Uno');
  const id = store.activeId;
  assert.equal(activeList(renameList(store, id, '  Nueva  ')).name, 'Nueva');
  assert.equal(activeList(renameList(store, id, 'x'.repeat(100))).name.length, 40);
  assert.equal(activeList(renameList(store, id, '   ')).name, 'Uno');
});

test('update only touches the target list', () => {
  const store = addList(createStore('Uno'), 'Dos');
  const first = store.lists[0].id;
  const next = updateList(store, first, { groups: 3 });
  assert.deepEqual([next.lists[0].groups, next.lists[1].groups], [3, 1]);
});

test('removing the active list activates a neighbour; the last one is replaced by an empty list', () => {
  let store = addList(addList(createStore('A'), 'B'), 'C');
  const [a, b, c] = store.lists.map((l) => l.id);
  store = setActive(store, b);
  store = removeList(store, b, 'Fresh');
  assert.deepEqual(store.lists.map((l) => l.id), [a, c]);
  assert.equal(store.activeId, a);
  const only = removeList(createStore('Solo', ['Ana'], 2), createStore('x').activeId, 'Fresh');
  assert.equal(only.lists.length, 1);
  const wiped = removeList(only, only.activeId, 'Fresh');
  assert.deepEqual([activeList(wiped).name, activeList(wiped).people], ['Fresh', []]);
});

test('addPeople trims, skips empty and duplicate names (case-insensitive) and reports the skipped ones', () => {
  const store = createStore('L', ['Ana']);
  const { store: next, added, skipped } = addPeople(store, store.activeId, ['  bruno ', '', 'ANA', 'Bruno', 'Carla']);
  assert.deepEqual(names(next), ['Ana', 'bruno', 'Carla']);
  assert.deepEqual(added, ['bruno', 'Carla']);
  assert.deepEqual(skipped, ['ANA', 'Bruno']);
});

test('every person gets a distinct id and ids survive other edits', () => {
  const store = createStore('L', ['Ana', 'Bruno', 'Carla']);
  const ids = activeList(store).people.map((p) => p.id);
  assert.equal(new Set(ids).size, 3);
  const next = removePerson(store, store.activeId, ids[1]);
  assert.deepEqual(activeList(next).people.map((p) => p.id), [ids[0], ids[2]]);
});

test('names are capped at 40 characters and the list at MAX_PEOPLE', () => {
  const store = createStore('L');
  const long = addPeople(store, store.activeId, ['x'.repeat(100)]);
  assert.equal(names(long.store)[0].length, 40);
  const many = Array.from({ length: MAX_PEOPLE + 5 }, (_, i) => `p${i}`);
  const full = addPeople(store, store.activeId, many);
  assert.equal(activeList(full.store).people.length, MAX_PEOPLE);
  assert.equal(full.skipped.length, 5);
});

test('renamePerson keeps the id, allows a case change and rejects empty or taken names', () => {
  const store = createStore('L', ['Ana', 'Bruno']);
  const [ana, bruno] = activeList(store).people;
  const ok = renamePerson(store, store.activeId, ana.id, 'ana maría');
  assert.equal(ok.error, null);
  assert.equal(activeList(ok.store).people[0].id, ana.id);
  assert.equal(names(ok.store)[0], 'ana maría');
  assert.equal(renamePerson(store, store.activeId, ana.id, '  ').error, 'empty');
  const taken = renamePerson(store, store.activeId, ana.id, 'BRUNO');
  assert.equal(taken.error, 'duplicate');
  assert.equal(taken.store, store);
  assert.equal(renamePerson(store, store.activeId, bruno.id, 'BRUNO').error, null);
});

test('clearPeople empties only the target list', () => {
  const store = addList(createStore('A', ['Ana']), 'B');
  const [a, b] = store.lists.map((l) => l.id);
  const withB = addPeople(store, b, ['Luz']).store;
  const next = clearPeople(withB, a);
  assert.deepEqual([next.lists[0].people.length, next.lists[1].people.length], [0, 1]);
});

test('nameKey ignores case and surrounding spaces', () => {
  assert.equal(nameKey('  Ñandú '), nameKey('ñandú'));
});

test('parseStore rejects bad data and repairs a missing active id', () => {
  assert.equal(parseStore(null), null);
  assert.equal(parseStore({ activeId: 'x', lists: [] }), null);
  assert.equal(parseStore({ activeId: 'x', lists: [{ id: 'a', name: 'A', people: 1, groups: 1 }] }), null);
  assert.equal(parseStore({ activeId: 'x', lists: [{ id: 'a', name: 'A', people: [], groups: 0 }] }), null);
  assert.equal(parseStore({ activeId: 'x', lists: [{ id: 'a', name: 'A', people: [{ id: 1, name: 'Ana' }], groups: 1 }] }), null);
  const ok = parseStore({ activeId: 'gone', lists: [{ id: 'a', name: 'A', people: [{ id: 'p1', name: 'Ana' }], groups: 2 }] });
  assert.equal(ok.activeId, 'a');
  assert.deepEqual(ok.lists[0].people, [{ id: 'p1', name: 'Ana' }]);
});

test('parseStore migrates the old names string into people, dropping repeats', () => {
  const store = parseStore({ activeId: 'a', lists: [{ id: 'a', name: 'A', names: 'Ana\n\n Bruno \nana', groups: 2 }] });
  assert.deepEqual(names(store), ['Ana', 'Bruno']);
  assert.equal(activeList(store).groups, 2);
  assert.notEqual(activeList(store).people[0].id, activeList(store).people[1].id);
});

test('parseStore drops repeated stored people but keeps the first id', () => {
  const store = parseStore({
    activeId: 'a',
    lists: [{ id: 'a', name: 'A', groups: 1, people: [{ id: 'p1', name: 'Ana' }, { id: 'p2', name: 'ANA' }, { id: 'p3', name: 'Luz' }] }],
  });
  assert.deepEqual(activeList(store).people.map((p) => p.id), ['p1', 'p3']);
});
