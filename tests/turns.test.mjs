import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  cancelSession, emptyTurns, finish, handOver, nextId, parseTurnsStore, pause, queue, ranking, removeSession, resetSessions,
  setAbsent, setBudgetMinutes, setMinDays, speak, spokenMs, startSession, syncPeople,
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

test('handing over stops the previous clock and gives the floor without starting the next one', () => {
  let t = speak(started(), 'a', 0);
  t = handOver(t, 'b', 2 * MIN);
  assert.equal(spokenMs(t, 'a', 9 * MIN), 2 * MIN);
  assert.equal(t.current.activeId, 'b');
  assert.equal(t.current.activeSince, null);
  assert.equal(spokenMs(t, 'b', 9 * MIN), 0); // nothing runs until someone starts it
  assert.equal(nextId(t, ids), 'c');
  assert.equal(handOver(t, 'b', 3 * MIN), t); // already theirs
  assert.equal(handOver(setAbsent(t, 'c', true, 0), 'c', 3 * MIN).current.activeId, 'b'); // absent: refused
  assert.equal(speak(t, 'b', 4 * MIN).current.activeSince, 4 * MIN); // the second click starts it
});

// ---- Ranking ----
const day = (id, budgetMin, entries) => ({ id, endedAt: 0, budgetMs: budgetMin * MIN, entries });
const e = (personId, name, ms, absent = false) => ({ personId, name, spokenMs: ms, absent });
const withDays = (...sessions) => ({ ...emptyTurns(), sessions });
const ab = [{ id: 'a', name: 'Ana' }, { id: 'b', name: 'Bruno' }];
const pct = (row) => Math.round(row.score * 100);

test('ranking averages the share of the budget over the days each person was there', () => {
  const t = withDays(
    day('1', 5, [e('a', 'Ana', 2 * MIN), e('b', 'Bruno', 2.5 * MIN)]),
    day('2', 5, [e('a', 'Ana', 1 * MIN), e('b', 'Bruno', 0, true)]),
  );
  const { rows, fewData } = ranking(t, ab);
  assert.deepEqual(rows.map((r) => [r.name, pct(r), r.days, r.position]), [['Ana', 30, 2, 1], ['Bruno', 50, 1, 2]]);
  assert.deepEqual(fewData, []);
});

test('an absent day counts for nobody, but being present and silent counts as 0%', () => {
  const t = withDays(day('1', 5, [e('a', 'Ana', 0), e('b', 'Bruno', 0, true)]));
  const { rows } = ranking(t, [...ab, { id: 'c', name: 'Carla' }]);
  assert.deepEqual(rows.map((r) => [r.name, pct(r), r.days]), [['Ana', 0, 1]]); // Carla was never there: not listed
});

test('days with a different budget are weighed by their budget', () => {
  const t = withDays(day('1', 5, [e('a', 'Ana', 5 * MIN)]), day('2', 10, [e('a', 'Ana', 0)]));
  assert.equal(Math.round(ranking(t, ab).rows[0].score * 1000), 333);
});

test('going over the budget counts the real time', () => {
  const t = withDays(day('1', 5, [e('a', 'Ana', 6 * MIN)]));
  assert.equal(pct(ranking(t, ab).rows[0]), 120);
});

test('ties share a position and the next one skips', () => {
  const people = [{ id: 'a', name: 'Ana' }, { id: 'b', name: 'Bruno' }, { id: 'c', name: 'Carla' }];
  const t = withDays(day('1', 10, [e('a', 'Ana', 5 * MIN), e('b', 'Bruno', 4 * MIN), e('c', 'Carla', 4 * MIN)]));
  assert.deepEqual(ranking(t, people).rows.map((r) => [r.name, r.position]), [['Bruno', 1], ['Carla', 1], ['Ana', 3]]);
});

test('people below the minimum days go to fewData and the minimum can be raised', () => {
  const t = withDays(
    day('1', 5, [e('a', 'Ana', MIN), e('b', 'Bruno', MIN)]),
    day('2', 5, [e('a', 'Ana', MIN), e('b', 'Bruno', 0, true)]),
  );
  const { rows, fewData } = ranking(t, ab, 2);
  assert.deepEqual(rows.map((r) => r.name), ['Ana']);
  assert.deepEqual(fewData.map((r) => [r.name, r.days]), [['Bruno', 1]]);
});

test('ranking uses the names on the list now and skips people who left it, keeping their days', () => {
  const t = withDays(day('1', 5, [e('a', 'Old name', MIN), e('b', 'Bruno', MIN)]));
  assert.deepEqual(ranking(t, [{ id: 'a', name: 'New name' }]).rows.map((r) => r.name), ['New name']);
  assert.equal(t.sessions.length, 1);
});

test('removing a day or resetting only touches the days; the minimum is validated', () => {
  const t = { ...withDays(day('1', 5, []), day('2', 5, [])), minDays: 3, budgetMs: 7 * MIN };
  assert.deepEqual(removeSession(t, '1').sessions.map((s) => s.id), ['2']);
  const reset = resetSessions(t);
  assert.deepEqual([reset.sessions.length, reset.minDays, reset.budgetMs], [0, 3, 7 * MIN]);
  assert.equal(setMinDays(t, 2).minDays, 2);
  for (const bad of [0, 100, 1.5, NaN]) assert.equal(setMinDays(t, bad), t);
});
