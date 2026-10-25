import { hash } from '../src/identity.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseState } from '../src/state.js';
import {
  compatibility,
  interval,
  intervalCandidates,
  rhythm,
} from '../src/intervals.js';
import { graph, invalidated, perturb } from '../src/graph.js';
import { evaluate } from '../src/evaluation.js';
import { validateCorpus } from '../src/corpus.js';
import { fontAt, fontDigest, inspectFont, shape } from '../src/fonts.js';
import { factorRegistry, sources } from '../src/registry.js';
import { nativeMapping } from '../src/emission.js';
const state = () =>
  parseState(JSON.parse(readFileSync('examples/hero.json', 'utf8')));
let seed = 0x7365616d;
const random = () => {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return seed / 2 ** 32;
};
test('1000 seeded interval and curve cases preserve algebra, finite range and scale invariance', () => {
  for (let i = 0; i < 1000; i++) {
    const a = 2 ** (random() * 100 - 50),
      b = 2 ** (random() * 100 - 50),
      c = 2 ** (random() * 100 - 50),
      k = 2 ** (random() * 20 - 10);
    assert.ok(
      Math.abs(interval(a, c) - interval(a, b) - interval(b, c)) < 1e-10,
    );
    assert.ok(Math.abs(interval(a * k, b * k) - interval(a, b)) < 1e-10);
    const curve = {
      kind: 'heuristic' as const,
      source: 'numerical-boundary-test',
      peaks: [
        { ratio: a, weight: 1e308, sigma: 1e-300, label: 'tiny sigma' },
        { ratio: b, weight: 1e308, sigma: 1, label: 'broad' },
      ],
    };
    const score = compatibility(a, curve);
    assert.ok(Number.isFinite(score) && score >= 0 && score <= 1);
  }
  assert.throws(
    () => intervalCandidates(1e308, 2, 4, 'smooth'),
    /numeric range/,
  );
});
test('every state-variable family invalidates its factual and downstream dependencies without mutating input', () => {
  const s = state(),
    before = hash(s);
  const changes: [string, unknown, string[]][] = [
    [
      '/blocks/0/font/family',
      'Display',
      ['metrics:title', 'shape:title', 'layout:subtitle'],
    ],
    [
      '/blocks/0/text',
      'Different words',
      ['shape:title', 'layout:title', 'responsive'],
    ],
    ['/blocks/0/weight', 800, ['shape:title', 'tracking:title', 'hierarchy']],
    ['/blocks/0/kerning', 'none', ['shape:title', 'layout:title']],
    ['/blocks/0/trackingEm', 0.01, ['shape:title', 'layout:title']],
    ['/blocks/0/leading', 1.3, ['layout:title', 'whitespace']],
    ['/blocks/0/measure', 400, ['layout:title', 'responsive']],
    ['/blocks/0/align', 'right', ['layout:title', 'whitespace']],
    ['/blocks/0/direction', 'rtl', ['shape:title', 'layout:title']],
    ['/blocks/0/language', 'de', ['shape:title', 'tracking:title']],
    ['/blocks/0/role', 'prose', ['layout:title', 'measure:title', 'hierarchy']],
    ['/blocks/0/id', 'headline', ['metrics:title', 'layout:subtitle']],
    ['/gaps/0', 40, ['layout:subtitle', 'rhythm']],
    ['/viewport/textScale', 2, ['layout:title', 'responsive']],
    ['/padding', 30, ['layout:title', 'layout:subtitle']],
    ['/platform', 'native-android', ['layout:title', 'responsive']],
  ];
  for (const [pointer, value, expected] of changes) {
    if (pointer.endsWith('/role') || pointer.endsWith('/id')) {
      assert.ok(expected.every((x) => invalidated(s, [pointer]).includes(x)));
      continue;
    }
    const result = perturb(s, pointer, value);
    for (const id of expected)
      assert.ok(result.invalidated.includes(id), `${pointer} -> ${id}`);
    assert.equal(hash(s), before);
  }
  for (const node of graph(s))
    assert.ok(node.dependsOn.every((d) => graph(s).some((n) => n.id === d)));
  const titles = state();
  titles.blocks[1]!.role = 'title';
  assert.throws(() => parseState(titles), /subtitle or prose/);
  const whitespace = state();
  whitespace.blocks[0]!.text = ' \n\t';
  assert.throws(() => parseState(whitespace), /visible content/);
});
test('registry and licensed font bytes have complete provenance, variable axes really change glyph geometry', () => {
  const ids = new Set(sources.map((s) => s.id));
  for (const factor of factorRegistry)
    for (const source of factor.sources) assert.ok(ids.has(source));
  const manifest = JSON.parse(
    readFileSync('assets/fonts/manifest.json', 'utf8'),
  );
  for (const f of manifest.files) {
    assert.equal(fontDigest(`assets/fonts/${f.file}`), f.sha256);
    assert.ok(
      readFileSync(`assets/fonts/${f.licenseFile}`, 'utf8').includes(
        'SIL OPEN FONT LICENSE',
      ),
    );
  }
  const file = manifest.files.find((f: { file: string }) =>
    f.file.startsWith('RobotoFlex['),
  ).file;
  const b = state().blocks[0]!;
  b.font = {
    file: `assets/fonts/${file}`,
    family: 'Roboto Flex',
    axes: { wdth: 70, opsz: 24 },
    opticalSizing: 'none',
  };
  b.weight = 400;
  assert.ok(inspectFont(b.font.file).axes.wdth);
  const a = shape(b);
  b.font.axes.wdth = 130;
  assert.notEqual(shape(b).advance, a.advance);
  b.font.axes.wdth = 10000;
  assert.throws(() => fontAt(b), /outside/);
  assert.ok(
    nativeMapping({
      ...state(),
      blocks: [b, state().blocks[1]!],
    }).unsupported.some((x) => x.code === 'native-axes'),
  );
});
test('local entropy follows spatial neighborhoods and never becomes a quality objective', () => {
  const a = rhythm([8, 8, 8, 32, 32, 32], 0.25, undefined, 3),
    b = rhythm([8, 32, 8, 32, 8, 32], 0.25, undefined, 3);
  assert.equal(a.entropyBits, b.entropyBits);
  assert.notDeepEqual(a.localEntropy, b.localEntropy);
  assert.equal(a.localEntropy[0]!.entropyBits, 0);
  assert.equal(a.surpriseBits, null);
  for (let i = 0; i < 100; i++) {
    const gaps = Array.from({ length: 20 }, () => Math.floor(random() * 5) * 8),
      r = rhythm(gaps);
    assert.ok(
      r.localEntropy.every(
        (x) => Number.isFinite(x.entropyBits) && x.entropyBits >= 0,
      ),
    );
  }
});
const trial = (
  projectId: string,
  condition: 'guidance-only' | 'tools-smooth' | 'tools-musical',
  seed = 0,
) => ({
  projectId,
  taskId: 'title',
  agentId: 'fixed',
  seed,
  condition,
  tokens: condition === 'guidance-only' ? 100 : 70,
  latencyMs: 20,
  attempts: condition === 'guidance-only' ? 2 : 1,
  hardFailures: 0,
  responsiveFailures: 0,
});
test('evaluation matches task/seed pairs, rejects orphan votes, and distinguishes retain, discard, uncertainty', () => {
  const trials = Array.from({ length: 30 }, (_, i) =>
    ['guidance-only', 'tools-smooth', 'tools-musical'].map((c) =>
      trial(`p${i}`, c as 'guidance-only' | 'tools-smooth' | 'tools-musical'),
    ),
  ).flat();
  const votes = (winner: 'left' | 'right') =>
    Array.from({ length: 30 }, (_, i) => ({
      projectId: `p${i}`,
      taskId: 'title',
      raterId: 'human-fixture',
      comparison: 'smooth-vs-musical' as const,
      winner,
    }));
  assert.equal(
    evaluate({ trials, preferences: votes('right') }).musicalPriorDecision,
    'retain-experimentally',
  );
  assert.equal(
    evaluate({ trials, preferences: votes('left') }).musicalPriorDecision,
    'discard',
  );
  const failed = structuredClone(trials);
  failed.find((t) => t.condition === 'tools-musical')!.responsiveFailures = 1;
  assert.notEqual(
    evaluate({ trials: failed, preferences: votes('right') })
      .musicalPriorDecision,
    'retain-experimentally',
  );
  assert.throws(
    () => evaluate({ trials: [], preferences: votes('right') }),
    /matched/,
  );
  const unmatched = evaluate({
    trials: [trial('p', 'guidance-only', 1), trial('p', 'tools-smooth', 2)],
    preferences: [],
  });
  assert.equal(unmatched.productScreening.tokenReduction, null);
  assert.equal(unmatched.comparisons[0]!.unmatchedTrials, 2);
});
test('corpus rejects attribution/rights gaps, invented awards, invalid controls and project leakage', () => {
  const data = JSON.parse(readFileSync('research/pilot-corpus.json', 'utf8'));
  assert.equal(validateCorpus({ records: data.records }).projects, 2);
  for (const mutate of [
    (r: any) => {
      r.attribution = '';
    },
    (r: any) => {
      r.stratum = 'award-winning';
    },
    (r: any) => {
      r.rights.basis = 'metadata-only';
    },
  ]) {
    const records = structuredClone(data.records);
    mutate(records[0]);
    assert.throws(() => validateCorpus({ records }));
  }
  const leaked = structuredClone(data.records);
  leaked[1].split = 'held-out';
  assert.throws(() => validateCorpus({ records: leaked }), /leaks/);
  const control = structuredClone(data.records);
  control[1].controlOf = 'missing';
  assert.throws(() => validateCorpus({ records: control }), /control/);
});
