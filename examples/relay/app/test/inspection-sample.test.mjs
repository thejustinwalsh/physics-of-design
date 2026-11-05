import test from 'node:test';
import assert from 'node:assert/strict';
import { preserveInspectionSample } from '../src/inspection-sample.mjs';
const sample = () => ({
  provider: 'native-ios',
  foreground: true,
  status: 'measured',
  targetId: 'relay-toolbar',
  coordinateSpace: 'native-host-coordinates',
  context: { sourceIdentity: 'source-a', inputKey: 'input-a' },
  box: { x: 0, y: 20, width: 390, height: 88, computed: null },
  observedAt: '2026-11-05T01:00:00.000Z',
});
test('equivalent invalidations preserve the original sample and observation time', () => {
  const old = sample(),
    next = {
      ...sample(),
      observedAt: '2026-11-05T01:00:01.000Z',
      context: { inputKey: 'input-a', sourceIdentity: 'source-a' },
    };
  assert.equal(preserveInspectionSample(old, next), old);
  assert.equal(preserveInspectionSample(null, next), next);
  assert.equal(preserveInspectionSample(old, null), null);
});
test('geometry, provider, target, source, input, missing and foreground changes remain observable', () => {
  const old = sample();
  const changes = [
    { box: { ...old.box, height: 89 } },
    { provider: 'native-android' },
    { targetId: 'relay-workspace' },
    { context: { ...old.context, sourceIdentity: 'source-b' } },
    { context: { ...old.context, inputKey: 'input-b' } },
    { status: 'missing', box: null },
    { foreground: false },
  ];
  for (const change of changes) {
    const next = {
      ...sample(),
      ...change,
      observedAt: '2026-11-05T01:00:01.000Z',
    };
    assert.equal(preserveInspectionSample(old, next), next);
  }
});
