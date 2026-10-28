import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  cancelSession, emptyTurns, finish, nextId, parseTurnsStore, pause, queue, setAbsent, setBudgetMinutes, speak,
  spokenMs, startSession, syncPeople,
} from '../src/lib/turns.ts';

const MIN = 60_000;
const ids = ['a', 'b', 'c', 'd'];
const people = [{ id: 'a', name: 'Ana' }, { id: 'b', name: 'Bruno' }, { id: 'c', name: 'Carla' }, { id: 'd', name: 'Diego' }];
const started = (order) => startSession(emptyTurns(), ids, 0, order);

test('the default budget is 5 minutes and can only change outside a session, within 1 to 60', () => {
  const t = emptyTurns();
  assert.equal(t.budgetMs, 5 * MIN);
  assert.equal(setBudgetMinutes(t, 10).budgetMs, 10 * MIN);
  for (const bad of [0, 61, 2.5, NaN]) assert.equal(setBudgetMinutes(t, bad), t);
  const running = startSession(t, ids, 0);
  assert.equal(setBudgetMinutes(running, 10), running);
});

test('starting snapshots the budget and uses the draw order for the people who exist', () => {
  const t = startSession(setBudgetMinutes(emptyTurns(), 3), ids, 1000, ['c', 'zzz', 'a']);
  assert.equal(t.current.budgetMs, 3 * MIN);
  assert.equal(t.current.startedAt, 1000);
  assert.deepEqual(queue(t, ids), ['c', 'a', 'b', 'd']);
  assert.equal(startSession(t, ids, 2000), t); // already running: unchanged
});

test('speaking accumulates the previous speaker; pausing stops the clock; resuming continues', () => {
  let t = started();
  t = speak(t, 'a', 0);
  t = speak(t, 'b', 90_000);
  assert.equal(spokenMs(t, 'a', 200_000), 90_000);
  assert.equal(spokenMs(t, 'b', 100_000), 10_000);
  t = pause(t, 100_000);
  assert.equal(spokenMs(t, 'b', 500_000), 10_000);
  t = speak(t, 'b', 500_000);
  assert.equal(spokenMs(t, 'b', 530_000), 40_000);
});

test('speaking the person who already has the floor changes nothing', () => {
  let t = speak(started(), 'a', 0);
  assert.equal(speak(t, 'a', 50_000), t);
});

test('a running turn survives a reload: time comes from the stored start, not a counter', () => {
  const t = speak(started(), 'a', 1000);
  const reloaded = parseTurnsStore(JSON.parse(JSON.stringify({ L: t })), ['L']).L;
  assert.equal(spokenMs(reloaded, 'a', 1000 + 7 * MIN), 7 * MIN);
});

test('a clock that goes backwards never gives negative time', () => {
  const t = speak(started(), 'a', 10_000);
  assert.equal(spokenMs(t, 'a', 5000), 0);
  assert.equal(spokenMs(pause(t, 5000), 'a', 9000), 0);
});

test('marking the speaker absent stops the clock; an absent person cannot get the floor', () => {
  let t = speak(started(), 'a', 0);
  t = setAbsent(t, 'a', true, 30_000);
  assert.equal(t.current.activeSince, null);
  assert.deepEqual(t.absent, ['a']);
  assert.equal(speak(t, 'a', 40_000), t);
  assert.deepEqual(queue(t, ids), ['b', 'c', 'd']);
  assert.deepEqual(setAbsent(t, 'a', false, 50_000).absent, []);
});

test('absence can be set before the session starts and is kept when it does', () => {
  let t = setAbsent(emptyTurns(), 'b', true, 0);
  t = startSession(t, ids, 0);
  assert.deepEqual(queue(t, ids), ['a', 'c', 'd']);
});

test('next is the following present person who has not spoken, wrapping around', () => {
  let t = started();
  assert.equal(nextId(t, ids), 'a'); // nobody has the floor yet
  t = speak(t, 'a', 0);
  t = speak(t, 'b', MIN);
  t = setAbsent(t, 'c', true, 2 * MIN);
  assert.equal(nextId(t, ids), 'd');
  t = speak(t, 'd', 2 * MIN);
  assert.equal(nextId(t, ids), null); // a and b spoke, c is absent
});

test('finishing saves one entry per person, counts absence, clears the day and the absences', () => {
  let t = started();
  t = speak(t, 'a', 0);
  t = speak(t, 'b', 3 * MIN);
  t = setAbsent(t, 'd', true, 3 * MIN);
  t = finish(t, people, 4 * MIN);
  assert.equal(t.current, null);
  assert.deepEqual(t.absent, []);
  assert.equal(t.sessions.length, 1);
  const s = t.sessions[0];
  assert.equal(s.endedAt, 4 * MIN);
  assert.equal(s.budgetMs, 5 * MIN);
  assert.deepEqual(s.entries.map((e) => [e.personId, e.name, e.spokenMs, e.absent]), [
    ['a', 'Ana', 3 * MIN, false], ['b', 'Bruno', MIN, false], ['c', 'Carla', 0, false], ['d', 'Diego', 0, true],
  ]);
  assert.equal(finish(t, people, 5 * MIN), t); // nothing running
});

test('cancelling drops the day without saving it', () => {
  const t = cancelSession(speak(started(), 'a', 0));
  assert.equal(t.current, null);
  assert.equal(t.sessions.length, 0);
});

test('people removed from the list leave the day and the absences', () => {
  let t = speak(setAbsent(started(), 'c', true, 0), 'a', 0);
  t = syncPeople(t, ['b', 'd'], 10_000);
  assert.deepEqual(queue(t, ['b', 'd']), ['b', 'd']);
  assert.equal(t.current.activeId, null);
  assert.deepEqual(t.absent, []);
});

test('parsing keeps valid lists, drops broken ones and ids that no list has any more', () => {
  const good = finish(speak(started(), 'a', 0), people, MIN);
  const data = JSON.parse(JSON.stringify({ L1: good, L2: { ...good, budgetMs: -1 }, gone: good, L3: 'x', L4: { ...good, sessions: [{ id: 1 }] } }));
  const parsed = parseTurnsStore(data, ['L1', 'L2', 'L3', 'L4']);
  assert.deepEqual(Object.keys(parsed), ['L1']);
  assert.equal(parsed.L1.sessions.length, 1);
  assert.deepEqual(parseTurnsStore(null, []), {});
  assert.deepEqual(parseTurnsStore([], []), {});
});
