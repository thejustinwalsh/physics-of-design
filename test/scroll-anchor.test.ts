import test from 'node:test';
import assert from 'node:assert/strict';
import { projectScrollAnchor } from '../src/scroll-anchor.js';

test('anchor projection compensates committed displacement without double-applying browser anchoring', () => {
  assert.equal(
    projectScrollAnchor({
      offset: 100,
      before: 200,
      after: 250,
      extent: 1000,
      viewport: 400,
    }).offset,
    150,
  );
  assert.equal(
    projectScrollAnchor({
      offset: 150,
      before: 200,
      after: 200,
      extent: 1000,
      viewport: 400,
    }).offset,
    150,
  );
  const clamped = projectScrollAnchor({
    offset: 500,
    before: 200,
    after: 250,
    extent: 600,
    viewport: 400,
  });
  assert.deepEqual(clamped, {
    offset: 200,
    requestedOffset: 550,
    maximumOffset: 200,
    clamped: true,
  });
  assert.equal(
    projectScrollAnchor({
      offset: 0,
      before: 200,
      after: 100,
      extent: 200,
      viewport: 400,
    }).offset,
    0,
  );
  for (const bad of [NaN, Infinity])
    assert.throws(
      () =>
        projectScrollAnchor({
          offset: bad,
          before: 0,
          after: 0,
          extent: 100,
          viewport: 40,
        }),
      /finite/,
    );
  assert.throws(
    () =>
      projectScrollAnchor({
        offset: 0,
        before: 0,
        after: 0,
        extent: 100,
        viewport: 0,
      }),
    /positive/,
  );
});
