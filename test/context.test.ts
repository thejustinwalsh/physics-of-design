import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
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

test('design contract and DOM recipe summaries omit large authored payloads while preserving exact references', () => {
  const store = new ResultStore();
  const large = 'unabridged authored content '.repeat(2500);
  const value = {
    status: 'found',
    file: 'DESIGN.md',
    sha256: 'a'.repeat(64),
    content: large,
    sections: Array.from({ length: 64 }, (_, i) => ({
      title: large,
      line: i + 1,
      level: 2,
    })),
    totalSections: 80,
    omittedSections: 16,
  };
  const ref = store.put(value)!;
  const summary: any = summarizeResult('context inspect', value, ref).summary;
  assert.equal(summary.sha256, value.sha256);
  assert.equal(summary.sections.length, 32);
  assert.equal(summary.sections[0].title.length, 160);
  assert.equal(summary.sections[0].titleCharacters, large.length);
  assert.ok(!JSON.stringify(summary).includes(large));
  assert.deepEqual(store.resolve({ $designRef: ref }), value);
  const surface = {
    css: large,
    cssVariables: { payload: large },
    material: 'paper',
    descriptors: { roughness: 0.8 },
  };
  const surfaceRef = store.put(surface)!;
  const surfaceSummary: any = summarizeResult(
    'surface css',
    surface,
    surfaceRef,
  ).summary;
  assert.equal(surfaceSummary.material, 'paper');
  assert.ok(!JSON.stringify(surfaceSummary).includes(large));
  assert.deepEqual(store.resolve(surfaceSummary.recipe), surface);
});

test('real field summaries retain identities, selector counts and exact recipe without measurement grids or graphs', async () => {
  const artifact = JSON.parse(
    await readFile('examples/design-field/gallery-session.json', 'utf8'),
  );
  const measurements = JSON.parse(
    await readFile('examples/design-field/measurements.json', 'utf8'),
  );
  const measureSummary: any = summarizeResult(
    'field measure',
    measurements,
    null,
  ).summary;
  assert.equal(measureSummary.identity, measurements.identity);
  assert.equal(measureSummary.cells, 252);
  assert.equal(measureSummary.rows, undefined);
  const value = {
    identity: artifact.identity,
    tokens: artifact.tokens,
    measurements,
    rendererVerification: 'pending',
    workflow: {
      status: 'proposed',
      statistics: artifact.statistics,
      stages: {
        reading: {
          status: 'chosen',
          assignment: { titleSize: 80 },
          alternatives: Array(6).fill({ graph: 'unbounded-graph' }),
        },
      },
      recipe: { identity: artifact.identity, graph: 'unbounded-graph' },
    },
    ledger: artifact.ledger,
  };
  const store = new ResultStore();
  const ref = store.put(value)!;
  const summary: any = summarizeResult('field run', value, ref).summary;
  assert.equal(summary.rendererVerification, 'pending');
  assert.equal(summary.measurement.identity, measurements.identity);
  assert.equal(summary.workflow.statistics.neuralCalls, 2);
  assert.equal(summary.workflow.stages.reading.alternatives, 6);
  assert.ok(!JSON.stringify(summary).includes('unbounded-graph'));
  assert.ok(Buffer.byteLength(JSON.stringify(summary)) < 10000);
  assert.deepEqual(store.resolve(summary.recipe), value.workflow.recipe);
});

test('caller supplied selection metadata cannot expand a compact field replay summary', () => {
  const payload = 'arbitrary recipe notes'.repeat(20000);
  const selection = {
    selected: 'alternative-0',
    notes: payload,
    policy: payload,
    modelCalled: false,
    provenance: {
      profile: payload,
      model: { source: payload, unknown: payload },
    },
  };
  const value = { workflow: { stages: { reading: { selection } } } };
  const summary: any = summarizeResult('field run', value, 'pod:1').summary;
  assert.equal(
    summary.workflow.stages.reading.selection.selected,
    'alternative-0',
  );
  assert.equal(summary.workflow.stages.reading.selection.modelCalled, false);
  assert.equal(summary.workflow.stages.reading.selection.notes, undefined);
  assert.ok(JSON.stringify(summary).length < 2000);
});

test('compact diagnostics retain unreachable targets and lookahead outcomes without caller graphs', () => {
  const huge = 'untrusted-evidence'.repeat(20000);
  const evidence = {
    search: {
      retention: {
        policy: 'pareto-diverse',
        admissibleAssignments: 100,
        preferenceProfiles: 10,
        jointlySatisfiedAssignments: 0,
        paretoComplete: false,
        fallback: huge,
        scope: huge,
        preferences: Array(20).fill({
          id: huge,
          scenario: 'phone',
          satisfiedAssignments: 0,
          observedRange: [1, 2],
          minimumResidual: 1,
          arbitrary: huge,
        }),
      },
    },
    lookahead: {
      engine: 'direct-successor-lookahead-v1',
      scope: huge,
      policy: { completion: 'require', arbitrary: huge },
      uncoveredParents: [huge],
      branches: [
        {
          parent: { id: 'candidate-0', graph: huge },
          completion: 'unknown',
          jointlySatisfied: false,
          successors: [
            {
              stage: 'appearance',
              outcome: 'unknown',
              search: {
                statistics: { complete: false },
                witness: { id: 'child-0', factors: huge },
              },
            },
          ],
        },
      ],
    },
  };
  const summary: any = summarizeResult(
    'decision run',
    { stages: { type: { evidence } } },
    null,
  ).summary;
  const compact = summary.stages.type.evidence;
  assert.equal(compact.retention.individuallyUnreachableCount, 20);
  assert.equal(compact.retention.individuallyUnreachable.length, 8);
  assert.equal(compact.retention.paretoComplete, false);
  assert.equal(compact.lookahead.branches[0].completion, 'unknown');
  assert.equal(compact.lookahead.branches[0].successors[0].complete, false);
  assert.ok(JSON.stringify(summary).length < 6000);
  assert.ok(!JSON.stringify(summary).includes(huge));
});

test('session references bound expanded clones as well as stored bytes', () => {
  const store = new ResultStore(),
    reference = store.put({ data: 'x'.repeat(2 * 1024 * 1024) })!;
  assert.throws(
    () => store.resolve(Array(20).fill({ $designRef: reference })),
    /Expanded request exceeds 32 MiB/,
  );
  let deep: unknown = null;
  for (let i = 0; i < 66; i++) deep = [deep];
  const deepReference = store.put(deep)!;
  assert.throws(
    () => store.resolve({ $designRef: deepReference }),
    /64 nesting/,
  );
});
