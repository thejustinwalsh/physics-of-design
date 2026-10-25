import { hash } from '../src/identity.js';
import { resolveLayout } from '../src/responsive.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseState } from '../src/state.js';
import {
  interval,
  compatibility,
  makeCurve,
  rhythm,
  intervalCandidates,
} from '../src/intervals.js';
import { invalidated, perturb, graph } from '../src/graph.js';
import { inspectFont, shape } from '../src/fonts.js';
import { couple, frontier } from '../src/search.js';
import { policy } from '../src/factors.js';
import { fontIssues } from '../src/measurement.js';
import { nativeMapping } from '../src/emission.js';
import { evaluate, wilson } from '../src/evaluation.js';
const hero = () =>
  parseState(JSON.parse(readFileSync('examples/hero.json', 'utf8')));

test('log interval additivity, reversibility, scale invariance and rejection of invalid dimensions', () => {
  for (const [a, b, c] of [
    [16, 24, 72],
    [0.1, 1.2, 9],
    [12, 18, 30],
  ]) {
    assert.ok(
      Math.abs(interval(a!, c!) - interval(a!, b!) - interval(b!, c!)) < 1e-12,
    );
    assert.ok(Math.abs(interval(a! * 10, b! * 10) - interval(a!, b!)) < 1e-12);
    assert.equal(interval(a!, b!), -interval(b!, a!));
  }
  for (const bad of [0, -1, NaN, Infinity])
    assert.throws(() => interval(bad, 1));
});
test('multi-peak curves retain several maxima and off-scale alternatives', () => {
  const curve = {
    kind: 'hypothesis' as const,
    source: 'test',
    peaks: [
      { ratio: 1.25, sigma: 0.015, weight: 1, label: 'a' },
      { ratio: 1.5, sigma: 0.015, weight: 1, label: 'b' },
    ],
  };
  assert.ok(compatibility(1.25, curve) > compatibility(1.38, curve));
  assert.ok(compatibility(1.5, curve) > compatibility(1.38, curve));
  const candidates = intervalCandidates(16, 1.1, 2, 'musical');
  assert.ok(
    candidates.candidates.some(
      (c) =>
        !candidates.curve.peaks.some((p) => Math.abs(p.ratio - c.ratio) < 1e-8),
    ),
  );
  assert.throws(() =>
    compatibility(1, {
      ...curve,
      peaks: [{ ratio: 1, weight: 0, sigma: 0.1, label: 'invalid' }],
    }),
  );
  assert.equal(makeCurve(2).kind, 'heuristic');
});
test('zero gaps, motif order and entropy are descriptive; surprise needs an observed source', () => {
  const a = rhythm([8, 16, 8, 16, 8, 16]);
  assert.ok(a.motifs.length > 0);
  assert.equal(a.surpriseBits, null);
  assert.equal(
    rhythm([8, 8, 16, 16]).entropyBits,
    rhythm([8, 16, 8, 16]).entropyBits,
  );
  assert.notDeepEqual(
    rhythm([8, 8, 16, 16]).intervalSequence,
    rhythm([8, 16, 8, 16]).intervalSequence,
  );
  assert.ok(Number.isFinite(rhythm([0, 0, 0]).entropyBits));
  assert.deepEqual(
    rhythm([8], 0.25, { counts: { '0': 4 }, source: 'owned observations' })
      .surpriseBits,
    [0],
  );
  assert.throws(() => rhythm([-1]));
});
test('typed state rejects nonfinite values, bad ids, gaps and unsafe feature tags', () => {
  const s = hero();
  s.blocks[0]!.size = NaN;
  assert.throws(() => parseState(s));
  const t = hero();
  t.gaps = [];
  assert.throws(() => parseState(t));
  const u = hero();
  u.blocks[0]!.features = { kern: false };
  assert.throws(() => parseState(u));
});
test('title perturbation invalidates downstream geometry, tracking, leading, whitespace and responsive factors', () => {
  const s = hero();
  const result = perturb(s, '/blocks/0/size', 104);
  for (const id of [
    'shape:title',
    'layout:title',
    'layout:subtitle',
    'tracking:title',
    'leading:title',
    'measure:title',
    'hierarchy',
    'whitespace',
    'rhythm',
    'responsive',
  ])
    assert.ok(result.invalidated.includes(id), id);
  assert.equal(s.blocks[0]!.size, 88);
  assert.equal(result.state.blocks[0]!.size, 104);
  assert.ok(invalidated(s, ['/blocks/0/font/axes']).includes('metrics:title'));
  assert.ok(invalidated(s, ['/gaps/0']).includes('layout:subtitle'));
  assert.throws(() => perturb(s, '/__proto__/polluted', true));
  assert.throws(() => perturb(s, '/blocks/80/size', 2));
  const locked = hero();
  locked.locks = ['/blocks/0/size'];
  assert.throws(() => perturb(locked, '/blocks/0/size', 104));
  const nodes = graph(s);
  const visited = new Set<string>();
  for (const n of nodes) {
    for (const d of n.dependsOn) assert.ok(visited.has(d));
    visited.add(n.id);
  }
});
test('real font inspection and shaped kerning are separate from tracking', () => {
  const s = hero(),
    b = { ...s.blocks[0]!, text: 'AVATAR To office', trackingEm: 0 };
  const f = inspectFont(b.font.file, 'A中');
  assert.equal(f.staticWeight, 900);
  assert.equal(f.glyphCoverage.missing.length, 1);
  const kern = shape(b),
    without = shape({ ...b, kerning: 'none' });
  assert.notEqual(kern.advance, without.advance);
  const tracked = shape({ ...b, trackingEm: 0.1 });
  assert.equal(kern.advance, tracked.advance);
  assert.ok(tracked.tracking.estimatedAdditionalAdvance > 0);
  assert.ok(kern.glyphs.length < b.text.length);
  assert.equal(kern.lineBreaks, null);
  const wrong = hero();
  wrong.blocks[0]!.weight = 700;
  assert.ok(fontIssues(wrong).some((i) => i.code === 'static-weight-mismatch'));
});
test('coupled proposal responds to heading size while preserving pinned values', () => {
  const s = hero();
  const larger = perturb(s, '/blocks/0/size', 104).state;
  const a = couple(s, 0, 1, policy()),
    b = couple(larger, 0, 1, policy(), undefined, ['/blocks/0/size']);
  assert.equal(b.state.blocks[0]!.size, 104);
  assert.notEqual(a.state.blocks[0]!.trackingEm, b.state.blocks[0]!.trackingEm);
  assert.notEqual(a.state.blocks[0]!.measure, b.state.blocks[0]!.measure);
  assert.equal(hash({ a: 1, b: 2 }), hash({ b: 2, a: 1 }));
});
test('Pareto retains trade-offs rather than aggregating beauty', () => {
  const values = [
    { id: 'a', objectives: { x: 1, y: 0 } },
    { id: 'b', objectives: { x: 0, y: 1 } },
    { id: 'c', objectives: { x: 0, y: 0 } },
  ];
  assert.deepEqual(
    frontier(values).map((c) => c.id),
    ['a', 'b'],
  );
});
test('native maps letter spacing in units and explicitly rejects unsupported axes/kerning controls', () => {
  const s = hero();
  s.platform = 'native-ios';
  const m = nativeMapping(s);
  assert.equal(
    m.blocks[0]!.style.letterSpacing,
    resolveLayout(s).state.blocks[0]!.size *
      resolveLayout(s).state.blocks[0]!.trackingEm,
  );
  assert.equal(m.unsupported.length, 0);
  s.blocks[0]!.font.axes = { opsz: 20 };
  s.blocks[0]!.kerning = 'none';
  assert.equal(nativeMapping(s).unsupported.length, 2);
});
test('empty evaluation cannot validate a hypothesis and votes are clustered by project', () => {
  assert.equal(
    evaluate({ trials: [], preferences: [] }).musicalPriorDecision,
    'undetermined; default remains smooth',
  );
  assert.equal(wilson(0, 0), null);
  const preferences = Array.from({ length: 30 }, (_, i) => ({
    projectId: 'one-project',
    taskId: `task-${i}`,
    raterId: 'rater',
    comparison: 'smooth-vs-musical' as const,
    winner: 'right' as const,
  }));
  assert.equal(
    evaluate({
      trials: preferences.flatMap((p) =>
        ['tools-smooth', 'tools-musical'].map((condition) => ({
          projectId: p.projectId,
          taskId: p.taskId,
          agentId: 'test',
          seed: 0,
          condition: condition as 'tools-smooth' | 'tools-musical',
          tokens: 100,
          latencyMs: 1,
          attempts: 1,
          hardFailures: 0,
          responsiveFailures: 0,
        })),
      ),
      preferences,
    }).comparisons[1]!.decisiveProjects,
    1,
  );
  assert.throws(() =>
    evaluate({ trials: [], preferences: [preferences[0]!, preferences[0]!] }),
  );
});
