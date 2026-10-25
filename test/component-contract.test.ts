import test from 'node:test';
import assert from 'node:assert/strict';
import {
  componentContractSvg,
  solveComponentContract,
  type ComponentContractInput,
} from '../src/component-contract.js';

function fixture(): ComponentContractInput {
  return {
    id: 'message-row',
    platform: 'web',
    unit: 'css-px',
    stateRef: 'fixture:state-v1',
    contentRef: 'fixture:content-v1',
    viewport: { width: 390, height: 844, textScale: 1 },
    source: ['fixture:authored'],
    availableWidth: 320,
    border: 1,
    padding: { inline: 16, top: 10, bottom: 14 },
    gaps: { leading: 8, trailing: 12 },
    leading: {
      id: 'avatar',
      width: 40,
      height: 40,
      source: ['fixture:avatar'],
    },
    trailing: {
      id: 'action',
      width: 24,
      height: 24,
      source: ['fixture:action'],
    },
    text: {
      id: 'message',
      fontRef: 'fixture:font-sha256',
      minWidth: 100,
      measuredHeight: 32,
      source: ['fixture:text-policy'],
      measurement: {
        width: 202,
        unit: 'css-px',
        textScale: 1,
        measurementRef: 'fixture:receipt-v1',
        runtimeRef: 'fixture:renderer-v1',
        fontRef: 'fixture:font-sha256',
        stateRef: 'fixture:state-v1',
        contentRef: 'fixture:content-v1',
        source: ['fixture:synthetic-measurement'],
        baselines: [12, 28],
      },
      fontMetrics: {
        units: 'font-units',
        unitsPerEm: 1000,
        ascent: 800,
        descent: -200,
        lineGap: 0,
        capHeight: 700,
        xHeight: 500,
        fontRef: 'fixture:font-sha256',
        source: ['fixture:font-metrics'],
      },
    },
    minHitSize: 44,
    clipping: 'unknown',
    radius: {
      outerRadius: 20,
      innerInset: 4,
      source: ['fixture:concentric-design-binding'],
    },
  };
}

test('row equation closes exactly and preserves fixed slots without shrinking text', () => {
  const result = solveComponentContract(fixture());
  assert.equal(result.status, 'solved');
  assert.equal(result.topology, 'row');
  assert.equal(result.allocation.selectedTextWidth, 202);
  assert.deepEqual(result.dimensions, { width: 320, height: 66 });
  assert.equal(result.equations.width.residual, 0);
  assert.deepEqual(
    result.slots.map((slot) => slot.allocation.rect),
    [
      { x: 17, y: 11, width: 40, height: 40 },
      { x: 65, y: 15, width: 202, height: 32 },
      { x: 279, y: 19, width: 24, height: 24 },
    ],
  );
  assert.deepEqual(result.bounds.content.rect, {
    x: 17,
    y: 11,
    width: 286,
    height: 40,
  });
  assert.deepEqual(result.textEvidence.baselines.values, [27, 43]);
  assert.deepEqual(result.provenance.observed, [
    'fixture:synthetic-measurement',
  ]);
  assert.ok(result.pendingVerification.length > 0);
});

test('absent slots remove their gaps and exact text-minimum boundary remains row', () => {
  const request = fixture();
  request.leading = null;
  request.trailing = null;
  request.availableWidth = 134;
  request.text.measurement!.width = 100;
  const result = solveComponentContract(request);
  assert.equal(result.topology, 'row');
  assert.equal(result.status, 'solved');
  assert.equal(result.slots.length, 1);
  assert.equal(result.equations.width.terms.G1, 0);
  assert.equal(result.equations.width.terms.G2, 0);
  assert.equal(result.allocation.requiredRowWidth, 134);
  assert.equal(result.allocation.selectedTextWidth, 100);
});

test('a declared stack is chosen only when row minimum fails and requires width-specific remeasurement', () => {
  const request = fixture();
  request.availableWidth = 200;
  request.stack = {
    gap: 6,
    align: 'center',
    source: ['fixture:stack-variant'],
  };
  const stale = solveComponentContract(request);
  assert.equal(stale.topology, 'stack');
  assert.equal(stale.allocation.rowTextWidth, 82);
  assert.equal(stale.allocation.selectedTextWidth, 166);
  assert.equal(stale.status, 'needs-measurement');
  assert.equal(stale.dimensions.height, null);
  assert.ok(stale.slots.every((slot) => slot.allocation.rect === null));
  request.text.measurement!.width = 166;
  request.text.measuredHeight = 48;
  const result = solveComponentContract(request);
  assert.equal(result.status, 'solved');
  assert.equal(result.dimensions.height, 150);
  assert.deepEqual(
    result.slots.map((slot) => slot.allocation.rect),
    [
      { x: 80, y: 11, width: 40, height: 40 },
      { x: 17, y: 57, width: 166, height: 48 },
      { x: 88, y: 111, width: 24, height: 24 },
    ],
  );
  assert.equal(result.equations.width.residual, 0);
});

test('unavailable or impossible topology stays infeasible without clipping or shrinking controls', () => {
  const request = fixture();
  request.availableWidth = 200;
  assert.equal(solveComponentContract(request).status, 'infeasible');
  assert.equal(solveComponentContract(request).topology, null);
  request.stack = { gap: 4, align: 'start', source: ['fixture:stack'] };
  request.leading!.width = 180;
  const result = solveComponentContract(request);
  assert.equal(result.status, 'infeasible');
  assert.equal(result.slots[0]!.width, 180);
  assert.equal(result.bounds.border.rect, null);
});

test('measurement identity, unit, text scale and width bind the reported text height', () => {
  const changes: ((request: ComponentContractInput) => void)[] = [
    (request) => {
      request.stateRef = 'fixture:changed-state';
    },
    (request) => {
      request.contentRef = 'fixture:changed-content';
    },
    (request) => {
      request.text.fontRef = 'fixture:changed-font';
    },
    (request) => {
      request.viewport.textScale = 2;
    },
    (request) => {
      request.text.measurement!.unit = 'dp';
    },
    (request) => {
      request.text.measurement!.width = 201.999;
    },
  ];
  for (const change of changes) {
    const request = fixture();
    change(request);
    const result = solveComponentContract(request);
    assert.equal(result.status, 'needs-measurement');
    assert.equal(result.dimensions.height, null);
    assert.equal(result.textEvidence.baselines.values, null);
    assert.deepEqual(result.provenance.observed, []);
  }
  const missing = fixture();
  missing.text.measuredHeight = null;
  missing.text.measurement = null;
  assert.equal(solveComponentContract(missing).status, 'needs-measurement');
});

test('paint, ink and optical alignment are never inferred from border boxes or global font metrics', () => {
  const request = fixture();
  request.text.measurement!.baselines = null;
  const result = solveComponentContract(request);
  assert.equal(result.bounds.paint.kind, 'unknown');
  assert.equal(result.bounds.paint.rect, null);
  assert.equal(result.textEvidence.ink.kind, 'unknown');
  assert.equal(result.textEvidence.baselines.kind, 'unknown');
  assert.equal(result.textEvidence.fontMetrics!.units, 'font-units');
  assert.equal(result.bounds.clip.kind, 'unknown');
  request.clipping = 'none';
  assert.equal(
    solveComponentContract(request).bounds.clip.kind,
    'declared-none',
  );
  request.clipping = 'content';
  const clipped = solveComponentContract(request);
  assert.deepEqual(clipped.bounds.clip.rect, clipped.bounds.content.rect);
});

test('minimum hit dimensions propose centered expansion without changing layout or certifying events', () => {
  const request = fixture();
  request.minHitSize = 400;
  const result = solveComponentContract(request);
  assert.deepEqual(result.bounds.hit.rect, {
    x: -40,
    y: -167,
    width: 400,
    height: 400,
  });
  assert.deepEqual(result.dimensions, { width: 320, height: 66 });
  assert.match(result.bounds.hit.note, /unverified/);
  const svg = componentContractSvg(result);
  assert.match(svg, /viewBox="0 0 500 700"/);
  assert.ok(!svg.includes('NaN'));
});

test('concentric radius uses border plus inset, actual box caps and an explicit binding', () => {
  const request = fixture();
  const result = solveComponentContract(request);
  assert.equal(result.radius.kind, 'derived');
  assert.equal(result.radius.value!.uniformInset, 5);
  assert.equal(result.radius.value!.innerRadius, 15);
  assert.deepEqual(result.radius.value!.innerBox, {
    x: 5,
    y: 5,
    width: 310,
    height: 56,
  });
  request.radius!.outerRadius = 999;
  const capped = solveComponentContract(request);
  assert.equal(capped.radius.value!.effectiveOuter, 33);
  assert.equal(capped.radius.value!.innerRadius, 28);
  request.radius!.innerInset = 40;
  assert.equal(solveComponentContract(request).status, 'infeasible');
  request.radius = null;
  assert.equal(solveComponentContract(request).radius.kind, 'unknown');
});

test('contract references and technical drawing derive deterministically from the same values', () => {
  const result = solveComponentContract(fixture());
  assert.deepEqual(solveComponentContract(fixture()), result);
  const svg = componentContractSvg(result);
  assert.match(svg, /W = 320 css-px; H = 66/);
  assert.match(svg, /message: 202 × 32/);
  assert.match(svg, /B=1; P=16; I=40; G1=8; F=202; G2=12; A=24/);
  assert.match(svg, /rx="15"/);
  assert.ok(svg.includes(result.contractRef));
  result.request.id = '<script>alert(1)</script>';
  assert.ok(!componentContractSvg(result).includes('<script>'));
  const request = fixture();
  request.availableWidth = 321;
  assert.notEqual(
    solveComponentContract(request).contractRef,
    result.contractRef,
  );
});

test('invalid units, dimensions, duplicate slots and unsupported measurement claims are rejected', () => {
  assert.throws(() => solveComponentContract({ ...fixture(), unit: 'dp' }));
  assert.throws(() => solveComponentContract({ ...fixture(), border: -1 }));
  const duplicate = fixture();
  duplicate.leading!.id = duplicate.text.id;
  assert.throws(() => solveComponentContract(duplicate));
  const baseline = fixture();
  baseline.text.measurement!.baselines = [33];
  assert.throws(() => solveComponentContract(baseline));
  const incomplete = fixture();
  incomplete.text.measuredHeight = null;
  assert.throws(() => solveComponentContract(incomplete));
});
