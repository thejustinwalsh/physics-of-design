import test from 'node:test';
import assert from 'node:assert/strict';
import { plotCursorX } from '../src/design/plot-geometry.mjs';
test('cursor uses actual bucket centers and preserves its stroke inside the plot', () => {
  const width = 300,
    count = 12,
    gap = 2,
    stroke = 2,
    bar = (width - gap * (count - 1)) / count;
  for (let i = 0; i < count; i++)
    assert.ok(
      Math.abs(
        plotCursorX(i / (count - 1), width, count, gap, stroke) -
          (bar / 2 + i * (bar + gap) - stroke / 2),
      ) < 1e-10,
    );
  for (const width of [128, 288, 810, 1120])
    for (const count of [3, 12, 48])
      for (let i = 0; i < count; i++) {
        const x = plotCursorX(i / (count - 1), width, count);
        assert.ok(x >= 0 && x + 2 <= width);
      }
});
test('unknown or overconstrained plot anatomy never supplies a fabricated cursor coordinate', () => {
  for (const args of [
    [0.5, NaN, 12],
    [0.5, 20, 48],
    [-1, 300, 12],
    [2, 300, 12],
    [0.5, 300, 1],
    [0.5, 300, 2.5],
  ])
    assert.equal(plotCursorX(...args), null);
});
