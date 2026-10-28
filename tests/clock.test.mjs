import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatClock } from '../src/lib/clock.ts';

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
