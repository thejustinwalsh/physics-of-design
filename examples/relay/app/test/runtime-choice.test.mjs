import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveRelayRuntimeChoice } from '../src/design/runtime-choice.mjs';

const fixture = () => ({
  resultIdentity: 'a'.repeat(64),
  workflowIdentity: 'b'.repeat(64),
  palette: 'plum',
  physics: {
    mass: 2,
    stiffness: 180,
    dampingRatio: 0.7,
    damping: 2 * 0.7 * Math.sqrt(180 * 2),
    roughness: 0.4,
    lightResponse: 8,
  },
});
test('runtime binding preserves selected physical dimensions and exact choice identity', () => {
  const result = resolveRelayRuntimeChoice(fixture());
  assert.equal(result.spring.mass, 2);
  assert.equal(result.spring.damping, 2 * 0.7 * Math.sqrt(360));
  assert.equal(result.roughness, 0.4);
  assert.equal(result.lightResponse, 8);
  assert.equal(result.resultIdentity, 'a'.repeat(64));
  assert.equal(resolveRelayRuntimeChoice({ resultIdentity: null }), null);
});
test('malformed or internally contradictory handoffs fail without historical fallback', () => {
  assert.throws(() => resolveRelayRuntimeChoice({}), /resultIdentity/);
  for (const [key, value] of [
    ['mass', 0],
    ['stiffness', Infinity],
    ['damping', 99],
    ['roughness', -0.1],
    ['lightResponse', 101],
    ['dampingRatio', NaN],
  ]) {
    const candidate = fixture();
    candidate.physics[key] = value;
    assert.throws(
      () => resolveRelayRuntimeChoice(candidate),
      /requires|domains|disagrees/,
    );
  }
});
