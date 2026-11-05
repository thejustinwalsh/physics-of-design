import test from 'node:test';
import assert from 'node:assert/strict';
import { createBrowserElementInspector } from '../src/browser-inspection.js';

test('browser inspection can be imported headlessly and requires an actual document when started', () => {
  assert.throws(
    () =>
      createBrowserElementInspector({
        targetId: 'surface',
        context: { sourceIdentity: 'test', inputKey: 'current' },
      }),
    /live document/,
  );
});
