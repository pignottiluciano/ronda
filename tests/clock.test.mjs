import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatClock, formatRemaining } from '../src/lib/clock.ts';

test('formatClock shows mm:ss and rounds down', () => {
  assert.equal(formatClock(0), '00:00');
  assert.equal(formatClock(999), '00:00');
  assert.equal(formatClock(61_000), '01:01');
  assert.equal(formatClock(5 * 60_000), '05:00');
  assert.equal(formatClock(125 * 60_000 + 59_999), '125:59');
});

test('formatClock never shows negative time', () => {
  assert.equal(formatClock(-5000), '00:00');
});

test('formatRemaining counts down, rounds the remainder up and turns into +mm:ss when over', () => {
  const budget = 5 * 60_000;
  assert.equal(formatRemaining(0, budget), '05:00');
  assert.equal(formatRemaining(1, budget), '05:00'); // not 04:59 until a full second has passed
  assert.equal(formatRemaining(1000, budget), '04:59');
  assert.equal(formatRemaining(budget - 1, budget), '00:01');
  assert.equal(formatRemaining(budget, budget), '00:00');
  assert.equal(formatRemaining(budget + 999, budget), '+00:00');
  assert.equal(formatRemaining(budget + 23_000, budget), '+00:23');
});
