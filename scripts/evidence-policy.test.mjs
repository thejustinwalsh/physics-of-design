import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assertFullVerification,
  assertVelaFlow,
  assertFlowXml,
  verificationStages,
  velaFlowActions,
  curatedCurrentEvidenceFiles,
} from './evidence-policy.mjs';

const verification = () => ({
  complete: true,
  passed: true,
  expectedStages: 18,
  results: verificationStages.map((name) => ({ name, code: 0 })),
});
const flow = () => ({
  passed: true,
  accessibilityCoverage: { verified: 8, unavailable: 2 },
  events: velaFlowActions.map((name, index) => ({
    action: 'tap',
    name,
    started: 1000 + index * 100,
    receiptObservedAt: 1050 + index * 100,
    tapBoundsPx: [20, 100, 220, 160],
    accessibilityOracle: ['Pause session', 'Finish session'].includes(name)
      ? {
          status: 'unavailable',
          reason: 'Live clock prevents idle hierarchy capture.',
        }
      : {
          status: 'verified',
          file: `${index}-accessibility.xml`,
          bounds: [20, 100, 220, 160],
          nativeBoundsErrorPx: 0.25,
        },
  })),
});
const xmlNode = (name, bounds = '[20,100][220,160]') =>
  `<node content-desc="${name}" clickable="true" bounds="${bounds}" />`;
const xml = (nodes) =>
  `<?xml version="1.0"?><hierarchy rotation="0">${nodes}</hierarchy>`;

test('exact complete eighteen-stage control passes; partial and failed lanes fail', () => {
  assert.doesNotThrow(() => assertFullVerification(verification()));
  for (const mutate of [
    (v) => {
      v.complete = false;
    },
    (v) => {
      v.passed = false;
    },
    (v) => {
      v.results.pop();
    },
    (v) => {
      v.results[4].code = 1;
    },
  ]) {
    const v = verification();
    mutate(v);
    assert.throws(() => assertFullVerification(v));
  }
});

test('repeated or reordered successful stages cannot masquerade as a full lane', () => {
  const repeated = verification();
  repeated.results[17] = repeated.results[0];
  assert.throws(() => assertFullVerification(repeated));
  const reordered = verification();
  reordered.results.reverse();
  assert.throws(() => assertFullVerification(reordered));
});

test('real-flow shape passes; all-unavailable downgrade and action reorder fail', () => {
  assert.doesNotThrow(() => assertVelaFlow(flow()));
  const downgraded = flow();
  downgraded.events.forEach((e) => {
    e.accessibilityOracle = { status: 'unavailable', reason: 'Missing' };
  });
  assert.throws(() => assertVelaFlow(downgraded));
  const reordered = flow();
  reordered.events.reverse();
  assert.throws(() => assertVelaFlow(reordered));
  const coverage = flow();
  coverage.accessibilityCoverage = { verified: 7, unavailable: 3 };
  assert.throws(() => assertVelaFlow(coverage));
});

test('XML files must be unique simple names and clock exceptions stay explicit', () => {
  for (const mutate of [
    (v) => {
      v.events[1].accessibilityOracle.file =
        v.events[0].accessibilityOracle.file;
    },
    (v) => {
      v.events[0].accessibilityOracle.file = '../0-accessibility.xml';
    },
    (v) => {
      v.events[2].accessibilityOracle = structuredClone(
        v.events[0].accessibilityOracle,
      );
    },
    (v) => {
      v.events[4].accessibilityOracle.reason = ' ';
    },
  ]) {
    const v = flow();
    mutate(v);
    assert.throws(() => assertVelaFlow(v));
  }
});

test('finite fresh delivery, real bounds, and bounded oracle errors are required', () => {
  for (const mutate of [
    (e) => {
      e.receiptObservedAt = e.started;
    },
    (e) => {
      e.started = -Infinity;
    },
    (e) => {
      e.accessibilityOracle.nativeBoundsErrorPx = NaN;
    },
    (e) => {
      e.accessibilityOracle.nativeBoundsErrorPx = 2.01;
    },
    (e) => {
      e.tapBoundsPx[2] = e.tapBoundsPx[0];
    },
    (e) => {
      e.tapBoundsPx[0] += 1;
    },
  ]) {
    const v = flow();
    mutate(v.events[0]);
    assert.throws(() => assertVelaFlow(v));
  }
});

test('saved XML requires complete hierarchy, unique clickable label, and exact tapped bounds', () => {
  const event = flow().events[0];
  assert.doesNotThrow(() => assertFlowXml(event, xml(xmlNode(event.name))));
  for (const input of [
    xmlNode(event.name),
    xml(xmlNode(event.name)).replace('</hierarchy>', ''),
    xml(xmlNode(event.name) + xmlNode(event.name)),
    xml(xmlNode('Another action')),
    xml(xmlNode(event.name, '[21,100][220,160]')),
    xml(xmlNode(event.name)).replace('clickable="true"', 'clickable="false"'),
  ])
    assert.throws(() => assertFlowXml(event, input));
});

test('XML labels decode entities without accepting external entity declarations', () => {
  const event = { ...flow().events[0], name: 'Start & go' };
  assert.doesNotThrow(() =>
    assertFlowXml(event, xml(xmlNode('Start &amp; go'))),
  );
  assert.throws(() =>
    assertFlowXml(
      event,
      '<!DOCTYPE x [<!ENTITY x SYSTEM "file:///secret">]>' +
        xml(xmlNode('&x;')),
    ),
  );
});

test('curated paths are sorted, unique, fixed, and exclude new bundles or model weights', () => {
  assert.deepEqual(
    [...curatedCurrentEvidenceFiles].sort(),
    curatedCurrentEvidenceFiles,
  );
  assert.equal(
    new Set(curatedCurrentEvidenceFiles).size,
    curatedCurrentEvidenceFiles.length,
  );
  for (const name of verificationStages)
    assert.ok(curatedCurrentEvidenceFiles.includes(`verification/${name}.log`));
  assert.ok(
    curatedCurrentEvidenceFiles.includes('verification/evidence-policy.log'),
  );
  assert.ok(
    curatedCurrentEvidenceFiles.includes(
      'review/vela-closure/measured-root-before/detail.png',
    ),
  );
  for (const name of [
    'verification/app.js',
    'verification/model.gguf',
    'review/vela-closure/app.js',
    'review/vela-closure/measured-root-after/weights.safetensors',
    'review/vela-closure/new-unreviewed.json',
  ])
    assert.ok(!curatedCurrentEvidenceFiles.includes(name));
  assert.ok(Object.isFrozen(curatedCurrentEvidenceFiles));
});
