import test from 'node:test';
import assert from 'node:assert/strict';
import { ResultStore, summarizeResult } from '../src/mcp-context.js';

test('bounded result references preserve exact values, clone on read and reject prototype/malformed paths', () => {
  const store = new ResultStore(10000, 2);
  const first = store.put({ state: { size: 88 }, 'a/b': { '~x': 3 } })!;
  const ref = { $designRef: first, pointer: '/state' };
  const state = store.resolve(ref) as { size: number };
  state.size = 104;
  assert.deepEqual(store.resolve({ state: ref }), { state: { size: 88 } });
  assert.equal(store.resolve({ $designRef: first, pointer: '/a~1b/~0x' }), 3);
  for (const pointer of ['/constructor', '/__proto__', '/bad~2escape', 'state'])
    assert.throws(() => store.resolve({ $designRef: first, pointer }));
  assert.throws(() => store.resolve({ ...ref, extra: true }));
  store.put({ value: 2 });
  store.put({ value: 3 });
  assert.throws(() => store.resolve(ref), /evicted/);
  assert.equal(store.put('x'.repeat(10001)), null);
});

test('extension summaries preserve diagnostic facts without texture bytes, HTML or decision graphs', () => {
  const large = 'payload'.repeat(10000);
  for (const [command, value] of Object.entries({
    'wireframe inspect': {
      wireframe: { id: 'demo' },
      nodes: [{ id: 'a' }],
      relations: [],
      html: large,
      svg: large,
    },
    'surface textures': {
      width: 128,
      height: 128,
      normal: large,
      roughness: large,
      encoding: 'base64-rgba8',
    },
    'decision run': {
      status: 'proposed',
      statistics: { neuralCalls: 2 },
      stages: {
        a: {
          status: 'chosen',
          assignment: { size: 24 },
          alternatives: [{ graph: large }],
          evidence: { graph: large },
        },
      },
      recipe: { graph: large },
    },
    'motion dynamics': {
      initial: { energy: 1 },
      final: { energy: 0.5 },
      balanceResidual: 0,
      samples: [{ energy: 1 }],
      provenance: { kind: 'analytic' },
    },
    'motion timeline': {
      values: [0, 1],
      min: 0,
      max: 1,
      durationSeconds: 1,
      provenance: { kind: 'sampled' },
    },
    'typography inspect': {
      shaping: { glyphs: [large], glyphCount: 1, advance: 12 },
      renderer: {
        canvas: { lines: [large] },
        lines: [{ start: 0, end: 1, baseline: 12, attempts: [large] }],
        totalLines: 1,
        box: { width: 20, height: 24 },
      },
    },
    'typography axes': {
      axes: { wght: { min: 100, default: 400, max: 900 } },
      totalCandidates: 40,
      omittedCandidates: 0,
      results: Array.from({ length: 40 }, (_, i) => ({
        id: `candidate-${i}`,
        resolvedForFontkit: large,
        renderer: { lines: [large], totalLines: 2 },
        effect: { rendererHeightDelta: 4 },
      })),
    },
  })) {
    const result = summarizeResult(command, value, 'pod:1');
    assert.ok(JSON.stringify(result).length < 2500, command);
    assert.ok(!JSON.stringify(result).includes(large), command);
  }
  const d = summarizeResult(
    'motion dynamics',
    {
      initial: { energy: 1 },
      final: { energy: 0.5 },
      balanceResidual: 0,
      samples: [{}],
    },
    'pod:1',
  );
  assert.equal((d.summary as any).balanceResidual, 0);
  assert.equal((d.summary as any).sampleCount, 1);
});

test('measurement and candidate summaries retain decisions without duplicating raw content', () => {
  const state = {
    blocks: [
      {
        id: 'title',
        text: 'large repeated content',
        font: { family: 'Lato' },
        size: 88,
      },
    ],
    gaps: [24],
  };
  const measurement = {
    feasible: true,
    issues: [],
    blocks: [
      {
        id: 'title',
        box: { x: 0, y: 0, width: 100, height: 50 },
        lines: [{ text: 'large repeated content', end: 22 }],
      },
    ],
  };
  const full = {
    candidates: [
      {
        id: 'a',
        state,
        measurement,
        responsive: [measurement],
        viable: true,
        changes: ['/gaps/0'],
      },
    ],
    viableIds: ['a'],
  };
  const store = new ResultStore();
  const ref = store.put(full)!;
  const summary = summarizeResult('system relax', full, ref);
  assert.ok(!JSON.stringify(summary).includes('large repeated content'));
  assert.deepEqual(
    store.resolve({ $designRef: ref, pointer: '/candidates/0/state' }),
    state,
  );
  assert.ok(
    JSON.stringify(
      summarizeResult('layout measure', measurement, null),
    ).includes('lineEnds'),
  );
});

test('missing font coverage stays bounded in summaries and exact behind the result reference', () => {
  const missing = Array.from({ length: 4096 }, (_, i) => ({
    codepoint: `U+${(0x4e00 + i).toString(16)}`,
    character: String.fromCodePoint(0x4e00 + i),
  }));
  const value = {
    shaping: { missing },
    coverage: { missing, checked: 4096, fallbackFaces: null },
  };
  const store = new ResultStore();
  const ref = store.put(value)!;
  const summary: any = summarizeResult(
    'typography inspect',
    value,
    ref,
  ).summary;
  for (const facts of [summary.shaping, summary.coverage]) {
    assert.equal(facts.missing.length, 16);
    assert.equal(facts.missingCount, 4096);
    assert.equal(facts.omittedMissing, 4080);
  }
  assert.equal(summary.coverage.fallbackFaces, null);
  assert.ok(JSON.stringify(summary).length < 3000);
  assert.deepEqual(store.resolve({ $designRef: ref }), value);
  const font: any = summarizeResult(
    'font inspect',
    { glyphCoverage: { missing } },
    null,
  ).summary;
  assert.equal(font.glyphCoverage.missing.length, 16);
  assert.equal(font.glyphCoverage.omittedMissing, 4080);
});
