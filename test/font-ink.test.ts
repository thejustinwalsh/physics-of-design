import test from 'node:test';
import assert from 'node:assert/strict';
import { shape } from '../src/fonts.js';
import { BlockSchema } from '../src/state.js';
const block = (text: string) =>
  BlockSchema.parse({
    id: 'ink',
    role: 'prose',
    text,
    font: { file: 'assets/fonts/Lato-Regular.ttf', family: 'Lato' },
    size: 32,
    weight: 400,
    trackingEm: 0,
    leading: 1.4,
    measure: 400,
  });
test('spaces have no ink rectangle, preserve advance and roundtrip without nonfinite JSON substitution', () => {
  const result = shape(block('A B'));
  const space = result.glyphs.find((g) => g.codepoints.includes(32))!;
  assert.equal(space.inkBounds, null);
  assert.ok(space.advance > 0);
  assert.ok(result.inkBounds && result.inkBounds.width > 0);
  assert.deepEqual(JSON.parse(JSON.stringify(result)), result);
  for (const glyph of result.glyphs)
    if (glyph.inkBounds)
      assert.ok(Object.values(glyph.inkBounds).every(Number.isFinite));
  const without = shape(block('AB'));
  assert.ok(result.advance > without.advance);
});
test('a run containing only non-outlining glyphs retains advances and has no aggregate ink', () => {
  const b = block('A');
  b.text = '   ';
  const result = shape(b);
  assert.equal(result.inkBounds, null);
  assert.ok(result.advance > 0);
  assert.ok(result.glyphs.every((g) => g.inkBounds === null));
  assert.deepEqual(JSON.parse(JSON.stringify(result)), result);
});
