import { test } from 'node:test';
import assert from 'node:assert/strict';
import { distribute, draw, formatResult, parseParticipants, validateDraw } from '../src/lib/draw.ts';

test('parse trims lines, drops empty ones and keeps duplicates', () => {
  assert.deepEqual(parseParticipants('  Ana \n\n Bruno\n   \nAna\nÑandú <b>'), ['Ana', 'Bruno', 'Ana', 'Ñandú <b>']);
});

test('10 participants in 3 groups gives sizes 4, 3, 3', () => {
  assert.deepEqual(distribute([...'abcdefghij'], 3).map((g) => g.length), [4, 3, 3]);
});

test('every participant appears exactly once', () => {
  const list = Array.from({ length: 17 }, (_, i) => `p${i}`);
  for (const groups of [1, 2, 5, 17]) {
    const flat = draw(list, groups).flat();
    assert.deepEqual([...flat].sort(), [...list].sort());
  }
});

test('one group keeps a single ordered list', () => {
  const result = draw(['a', 'b', 'c'], 1);
  assert.equal(result.length, 1);
  assert.equal(result[0].length, 3);
});

test('validation', () => {
  assert.equal(validateDraw(1, 1), 'min');
  assert.equal(validateDraw(3, 0), 'integer');
  assert.equal(validateDraw(3, 1.5), 'integer');
  assert.equal(validateDraw(3, Number.NaN), 'integer');
  assert.equal(validateDraw(3, 4), 'max');
  assert.equal(validateDraw(3, 3), null);
});

test('share text', () => {
  const label = (n) => `Grupo ${n}`;
  assert.equal(formatResult([['Ana', 'Bruno']], label), '1. Ana\n2. Bruno');
  assert.equal(formatResult([['Ana'], ['Bruno']], label), 'Grupo 1\n- Ana\n\nGrupo 2\n- Bruno');
});
