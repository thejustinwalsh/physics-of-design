import test from 'node:test';
import assert from 'node:assert/strict';
import {
  describeValidationPlan,
  checkValidation,
  createValidationActor,
} from '../src/validation-machine.js';
const digest = 'a'.repeat(64),
  other = 'b'.repeat(64);
const plan = () => ({
  version: 1,
  id: 'component-proof',
  designIdentity: digest,
  scenarios: [
    {
      id: 'phone',
      platform: 'web',
      width: 390,
      height: 844,
      textScale: 1,
      colorScheme: 'light',
      reducedMotion: false,
      contentId: 'original',
      source: 'Authored brief',
    },
    {
      id: 'ipad-large-text',
      platform: 'web',
      width: 834,
      height: 1194,
      textScale: 2,
      colorScheme: 'dark',
      reducedMotion: true,
      contentId: 'long-copy',
      source: 'Authored brief',
    },
  ],
  phases: [
    {
      id: 'geometry',
      purpose: 'Measure before progressing',
      requirements: [
        {
          id: 'phone-layout',
          scenario: 'phone',
          tool: 'layout measure',
          inputIdentity: digest,
          evidenceKind: 'deterministic',
          rationale: 'Preserve content',
        },
        {
          id: 'ipad-layout',
          scenario: 'ipad-large-text',
          tool: 'layout measure',
          inputIdentity: other,
          evidenceKind: 'deterministic',
          rationale: 'Large text dark reduced-motion case',
        },
      ],
    },
    {
      id: 'critique',
      purpose: 'Review the validated finalist',
      requirements: [
        {
          id: 'human-direction',
          scenario: 'phone',
          tool: 'human observation',
          inputIdentity: digest,
          evidenceKind: 'human-review',
          rationale: 'Requested art direction',
        },
      ],
    },
  ],
});
const receipts = () =>
  describeValidationPlan(plan()).requirements.map((r) => ({
    requirement: r.id,
    planIdentity: describeValidationPlan(plan()).identity,
    designIdentity: digest,
    inputIdentity: r.inputIdentity,
    tool: r.tool,
    evidenceKind: r.evidenceKind,
    outcome: 'pass',
    resultRef: `receipt:${r.id}`,
    observedAt: '2026-10-25T10:00:00.000Z',
    detail: 'Declared fixture; not real observation',
  }));
test('missing responsive permutation blocks advance and lists the needed tool', () => {
  const r = checkValidation({
    plan: plan(),
    receipts: receipts().filter((r) => r.requirement !== 'ipad-layout'),
    advance: 16,
  });
  assert.equal(r.state, 'geometry');
  assert.equal(r.next[0]!.id, 'ipad-layout');
  assert.equal(r.next[0]!.tool, 'layout measure');
  assert.equal(r.complete, false);
});
test('current matching receipts permit ordered phase progression without inference', () => {
  const r = checkValidation({ plan: plan(), receipts: receipts(), advance: 2 });
  assert.equal(r.complete, true);
  assert.equal(r.neuralCalls, 0);
});
test('design, plan, input and rater provenance mismatches cannot reuse passes', () => {
  for (const patch of [
    { designIdentity: other },
    { planIdentity: other },
    { inputIdentity: other },
    { tool: 'wrong tool' },
    { evidenceKind: 'synthetic-review' },
  ]) {
    const data = receipts();
    data[0] = { ...data[0]!, ...patch };
    const r = checkValidation({ plan: plan(), receipts: data, advance: 2 });
    assert.equal(r.complete, false);
    assert.equal(r.state, 'geometry');
  }
});
test('changing a scenario invalidates old receipts rather than marking new permutations checked', () => {
  const changed = plan();
  changed.scenarios[0]!.width = 375;
  const r = checkValidation({
    plan: changed,
    receipts: receipts(),
    advance: 2,
  });
  assert.equal(r.complete, false);
  assert.equal(r.next[0]!.status, 'stale');
});
test('unsupported results block unless the brief explicitly records that limitation', () => {
  const p = plan(),
    data = receipts();
  data[0]!.outcome = 'unsupported';
  assert.equal(
    checkValidation({ plan: p, receipts: data, advance: 2 }).complete,
    false,
  );
  (p.phases[0]!.requirements[0] as any).unsupportedPolicy = 'record';
  const id = describeValidationPlan(p).identity;
  data.forEach((r) => (r.planIdentity = id));
  const r = checkValidation({ plan: p, receipts: data, advance: 2 });
  assert.equal(r.complete, true);
  assert.equal(r.recordedUnsupported.length, 1);
});
test('receipt replacement restarts a running actor and cannot retain a later-phase pass', () => {
  const { actor } = createValidationActor({
    plan: plan(),
    receipts: receipts(),
  });
  actor.start();
  actor.send({ type: 'ADVANCE' });
  assert.equal(actor.getSnapshot().value, 'phase1');
  const changed = receipts();
  changed[0]!.outcome = 'fail';
  actor.send({ type: 'RECEIPTS', receipts: changed as any });
  assert.equal(actor.getSnapshot().value, 'phase0');
  actor.send({ type: 'ADVANCE' });
  assert.equal(actor.getSnapshot().value, 'phase0');
  actor.stop();
});
test('duplicate, unknown and malformed evidence is rejected', () => {
  assert.throws(
    () =>
      checkValidation({
        plan: plan(),
        receipts: [...receipts(), receipts()[0]],
      }),
    /Duplicate/,
  );
  assert.throws(
    () =>
      checkValidation({
        plan: plan(),
        receipts: [{ ...receipts()[0], requirement: 'absent' }],
      }),
    /Unknown/,
  );
});
test('editing the returned plan cannot mutate the actor’s private guard definition', () => {
  const compiled = createValidationActor({ plan: plan(), receipts: [] });
  compiled.plan.phases[0]!.requirements = [];
  compiled.actor.start();
  compiled.actor.send({ type: 'ADVANCE' });
  assert.equal(compiled.actor.getSnapshot().value, 'phase0');
  compiled.actor.stop();
});
test('new evidence restarts validation after reaching completion', () => {
  const { actor } = createValidationActor({
    plan: plan(),
    receipts: receipts(),
  });
  actor.start();
  actor.send({ type: 'ADVANCE' });
  actor.send({ type: 'ADVANCE' });
  assert.equal(actor.getSnapshot().value, 'complete');
  actor.send({ type: 'RECEIPTS', receipts: [] });
  assert.equal(actor.getSnapshot().value, 'phase0');
  actor.send({ type: 'ADVANCE' });
  assert.equal(actor.getSnapshot().value, 'phase0');
  actor.stop();
});

test('live actor snapshots expose immutable context and receipts', () => {
  const compiled = createValidationActor({
    plan: plan(),
    receipts: receipts(),
  });
  compiled.actor.start();
  compiled.actor.send({ type: 'ADVANCE' });
  const context = compiled.actor.getSnapshot().context;
  assert.throws(() => {
    (context.receipts[0] as any).outcome = 'fail';
  }, TypeError);
  assert.throws(() => {
    (context as any).receipts = [];
  }, TypeError);
  assert.throws(() => {
    (context.receipts as any).push({});
  }, TypeError);
  compiled.actor.send({ type: 'ADVANCE' });
  assert.equal(compiled.actor.getSnapshot().value, 'complete');
  compiled.actor.stop();
});
test('invalid live updates clear old evidence, block and recover after correction', () => {
  const { actor } = createValidationActor({
    plan: plan(),
    receipts: receipts(),
  });
  actor.start();
  actor.send({ type: 'ADVANCE' });
  actor.send({
    type: 'RECEIPTS',
    receipts: [{ ...receipts()[0], requirement: 'missing' }] as any,
  });
  assert.equal(actor.getSnapshot().status, 'active');
  assert.equal(actor.getSnapshot().value, 'phase0');
  assert.match(actor.getSnapshot().context.receiptError!, /Unknown/);
  actor.send({ type: 'ADVANCE' });
  assert.equal(actor.getSnapshot().value, 'phase0');
  actor.send({ type: 'RECEIPTS', receipts: receipts() as any });
  assert.equal(actor.getSnapshot().context.receiptError, null);
  actor.send({ type: 'ADVANCE' });
  actor.send({ type: 'ADVANCE' });
  assert.equal(actor.getSnapshot().value, 'complete');
  actor.stop();
});
