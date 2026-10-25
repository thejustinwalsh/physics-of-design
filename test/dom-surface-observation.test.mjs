import assert from 'node:assert/strict';
import test from 'node:test';
import { captureStaticDomSurface } from '../scripts/dom-surface-observation.mjs';

// A capture transport double, not browser/renderer evidence. The first sequence
// reproduces CI's observed prior-pose snapshot before the new composite arrives.
function captureSequence(values) {
  let captures = 0;
  return {
    evaluateHandle: async () => ({ dispose: async () => {} }),
    waitForFunction: async () => {},
    screenshot: async () => Buffer.from(values[captures++]),
    get captures() { return captures; },
  };
}

test('static capture discards a preceding pose and retains capture identities', async () => {
  const page = captureSequence(['previous pose', 'current pose', 'current pose']);
  const result = await captureStaticDomSurface(page);
  assert.equal(result.bytes.toString(), 'current pose');
  assert.equal(page.captures, 3);
  assert.equal(result.captureSha256.length, 3);
  assert.notEqual(result.captureSha256[0], result.captureSha256[1]);
  assert.equal(result.captureSha256[1], result.captureSha256[2]);
});

test('static capture rejects continuously changing output instead of choosing a frame', async () => {
  const page = captureSequence(['a', 'b', 'c', 'd', 'e']);
  await assert.rejects(captureStaticDomSurface(page), /did not settle in five captures/);
  assert.equal(page.captures, 5);
});

test('stable incorrect output is returned unchanged for the independent oracle to reject', async () => {
  const page = captureSequence(['incorrect pixels', 'incorrect pixels']);
  const result = await captureStaticDomSurface(page);
  assert.equal(result.bytes.toString(), 'incorrect pixels');
  assert.equal(page.captures, 2);
});
