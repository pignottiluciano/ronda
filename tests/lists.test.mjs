import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  activeList, addList, createStore, parseStore, removeList, renameList, setActive, updateList,
} from '../src/lib/lists.ts';

test('add makes the new list active and keeps the others', () => {
  const store = addList(createStore('Uno', 'Ana\nBruno', 2), 'Dos');
  assert.equal(store.lists.length, 2);
  assert.equal(activeList(store).name, 'Dos');
  assert.equal(store.lists[0].names, 'Ana\nBruno');
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
  const next = updateList(store, first, { names: 'Ana', groups: 3 });
  assert.deepEqual([next.lists[0].names, next.lists[0].groups], ['Ana', 3]);
  assert.deepEqual([next.lists[1].names, next.lists[1].groups], ['', 1]);
});

test('removing the active list activates a neighbour; the last one is replaced by an empty list', () => {
  let store = addList(addList(createStore('A'), 'B'), 'C');
  const [a, b, c] = store.lists.map((l) => l.id);
  store = setActive(store, b);
  store = removeList(store, b, 'Fresh');
  assert.deepEqual(store.lists.map((l) => l.id), [a, c]);
  assert.equal(store.activeId, a);
  const only = removeList(createStore('Solo', 'Ana', 2), createStore('x').activeId, 'Fresh');
  assert.equal(only.lists.length, 1);
  const wiped = removeList(only, only.activeId, 'Fresh');
  assert.deepEqual([activeList(wiped).name, activeList(wiped).names], ['Fresh', '']);
});

test('parseStore rejects bad data and repairs a missing active id', () => {
  assert.equal(parseStore(null), null);
  assert.equal(parseStore({ activeId: 'x', lists: [] }), null);
  assert.equal(parseStore({ activeId: 'x', lists: [{ id: 'a', name: 'A', names: 1, groups: 1 }] }), null);
  assert.equal(parseStore({ activeId: 'x', lists: [{ id: 'a', name: 'A', names: '', groups: 0 }] }), null);
  const ok = parseStore({ activeId: 'gone', lists: [{ id: 'a', name: 'A', names: 'Ana', groups: 2 }] });
  assert.equal(ok.activeId, 'a');
});
