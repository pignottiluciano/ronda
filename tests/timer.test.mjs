import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  formatClock, fractionLeft, idle, parseTimer, pause, remainingMs, reset, setMinutes, settle, start,
} from '../src/lib/timer.ts';

const MIN = 60_000;

test('start, pause and resume keep the remaining time exact', () => {
  const running = start(idle(30), 1_000);
  assert.equal(running.endsAt, 1_000 + 30 * MIN);
  const paused = pause(running, 1_000 + 10 * MIN);
  assert.equal(remainingMs(paused, 999_999_999), 20 * MIN); // paused time does not move with the clock
  const resumed = start(paused, 5_000_000);
  assert.equal(resumed.endsAt, 5_000_000 + 20 * MIN);
});

test('settle turns an expired running timer into done, also after being away', () => {
  const running = start(idle(5), 0);
  assert.equal(settle(running, 5 * MIN - 1).status, 'running');
  assert.equal(settle(running, 5 * MIN).status, 'done');
  assert.equal(settle(running, 99 * MIN).status, 'done');
  assert.equal(remainingMs(settle(running, 99 * MIN), 99 * MIN), 0);
});

test('duration only changes while idle and must be a whole number from 1 to 180', () => {
  assert.equal(setMinutes(idle(30), 45).minutes, 45);
  for (const bad of [0, -5, 181, 1.5, Number.NaN]) assert.equal(setMinutes(idle(30), bad).minutes, 30);
  const running = start(idle(30), 0);
  assert.equal(setMinutes(running, 10), running);
});

test('reset goes back to idle with the same duration', () => {
  assert.deepEqual(reset(start(idle(15), 0)), { status: 'idle', minutes: 15 });
  assert.deepEqual(reset({ status: 'done', minutes: 15 }), { status: 'idle', minutes: 15 });
});

test('clock rounds up and fraction goes from 1 to 0', () => {
  assert.equal(formatClock(30 * MIN), '30:00');
  assert.equal(formatClock(1), '00:01');
  assert.equal(formatClock(61_000), '01:01');
  assert.equal(formatClock(0), '00:00');
  assert.equal(formatClock(120 * MIN), '120:00');
  const running = start(idle(10), 0);
  assert.equal(fractionLeft(running, 0), 1);
  assert.equal(fractionLeft(running, 5 * MIN), 0.5);
  assert.equal(fractionLeft(running, 50 * MIN), 0);
});

test('parseTimer rejects bad data', () => {
  assert.equal(parseTimer(null), null);
  assert.equal(parseTimer({ status: 'idle', minutes: 0 }), null);
  assert.equal(parseTimer({ status: 'running', minutes: 5 }), null);
  assert.equal(parseTimer({ status: 'paused', minutes: 5, remainingMs: 6 * MIN }), null);
  assert.equal(parseTimer({ status: 'wat', minutes: 5 }), null);
  assert.deepEqual(parseTimer({ status: 'running', minutes: 5, endsAt: 10 }), { status: 'running', minutes: 5, endsAt: 10 });
});
