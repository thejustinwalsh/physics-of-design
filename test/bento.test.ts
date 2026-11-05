import test from 'node:test';
import assert from 'node:assert/strict';
import { planBento, BentoSchema, type BentoFlexNode } from '../src/bento.js';
import { planComposition } from '../src/composition-plan.js';
import { compileEnergy } from '../src/energy.js';
import { resolveWireframe, WireframeSchema } from '../src/wireframe.js';

const regions = Array.from({ length: 4 }, (_, i) => ({
  id: `region-${i}`,
  minWidth: 180,
  minHeight: 100,
  basis: 'authored' as const,
  source: ['test:content requirements'],
  aspect: { min: 0.8, max: 2.5, source: ['test:brief preferred proportions'] },
  areaWeight: [3, 1, 2, 1][i]!,
}));
const base = {
  width: 1200,
  height: 800,
  gap: 16,
  unit: 'css-px' as const,
  regions,
  adjacency: [
    {
      first: 'region-0',
      second: 'region-1',
      maxGap: 16,
      source: ['test:semantic pair'],
    },
  ],
  gapCoverage: { min: 0.01, max: 0.12, source: ['test:brief whitespace band'] },
};
const flatten = (
  node: BentoFlexNode,
): Extract<BentoFlexNode, { kind: 'region' }>[] =>
  node.kind === 'region' ? [node] : node.children.flatMap(flatten);

test('bento enumerates the complete small ordered slicing family and keeps separate preference factors', () => {
  const input = structuredClone(base),
    result = planBento(input);
  assert.deepEqual(input, base);
  assert.equal(result.statistics.enumeratedFamilySize, 80); // Catalan(3) * 2^3 axes * two allocation policies
  assert.equal(result.statistics.attempted, 80);
  assert.equal(result.statistics.enumerationComplete, true);
  assert.equal(result.statistics.selectorCalls, 0);
  assert.equal(result.status, 'proposed');
  assert.ok(result.candidates.length > 1);
  assert.ok(result.program);
  assert.deepEqual(
    result.program.factors.map((factor) => factor.id),
    ['valid-choice', 'aspect', 'allocation', 'adjacency', 'whitespace'],
  );
  const compiled = compileEnergy(result.program);
  for (const candidate of result.candidates) {
    assert.deepEqual(
      flatten(candidate.tree).map((leaf) => leaf.id),
      regions.map((region) => region.id),
    );
    assert.deepEqual(
      compiled.evaluate(candidate.evaluation.assignment),
      candidate.evaluation,
    );
    const leaves = flatten(candidate.tree);
    for (const [index, leaf] of leaves.entries()) {
      for (const axis of ['width', 'height'] as const)
        if (index < 2)
          assert.equal(
            candidate.evaluation.derived.frame![`${leaf.id}.${axis}`],
            leaf.box[axis],
          );
      assert.ok(leaf.box.width >= regions[index]!.minWidth);
      assert.ok(leaf.box.height >= regions[index]!.minHeight);
      assert.ok(leaf.box.x >= 0 && leaf.box.y >= 0);
      assert.ok(leaf.box.x + leaf.box.width <= base.width + 1e-8);
      assert.ok(leaf.box.y + leaf.box.height <= base.height + 1e-8);
      for (const other of leaves.slice(index + 1))
        assert.ok(
          Math.min(leaf.box.x + leaf.box.width, other.box.x + other.box.width) -
            Math.max(leaf.box.x, other.box.x) <=
            1e-8 ||
            Math.min(
              leaf.box.y + leaf.box.height,
              other.box.y + other.box.height,
            ) -
              Math.max(leaf.box.y, other.box.y) <=
              1e-8,
          'Leaf regions cannot overlap',
        );
    }
  }
  assert.deepEqual(planBento(input).candidates, result.candidates);
});

test('narrow frames keep semantic order and reoptimize rather than squeezing below declared content minima', () => {
  const narrow = planBento({ ...base, width: 320, height: 1600 });
  assert.equal(narrow.status, 'proposed');
  for (const candidate of narrow.candidates) {
    const leaves = flatten(candidate.tree);
    assert.ok(leaves.every((leaf) => leaf.box.width === 320));
    assert.ok(
      leaves.every(
        (leaf, i) =>
          i === 0 ||
          leaf.box.y >=
            leaves[i - 1]!.box.y + leaves[i - 1]!.box.height + base.gap - 1e-8,
      ),
    );
  }
  const impossible = planBento({ ...base, width: 120 });
  assert.equal(impossible.status, 'no-admissible-candidate');
  assert.equal(impossible.candidates.length, 0);
  assert.equal(impossible.statistics.enumerationComplete, true);
  const changed = structuredClone(base);
  changed.regions[0]!.minWidth = 400;
  assert.notEqual(planBento(changed).identity, planBento(base).identity);
});

test('RTL mirrors physical positions while preserving the declared semantic order', () => {
  const ltr = planBento(base),
    rtl = planBento({ ...base, direction: 'rtl' });
  assert.equal(ltr.placements.length, rtl.placements.length);
  for (const [i, candidate] of ltr.placements.entries()) {
    const a = flatten(candidate.tree),
      b = flatten(rtl.placements[i]!.tree);
    assert.deepEqual(
      a.map((leaf) => leaf.id),
      b.map((leaf) => leaf.id),
    );
    for (const [j, leaf] of a.entries()) {
      assert.ok(
        Math.abs(b[j]!.box.x - (base.width - leaf.box.x - leaf.box.width)) <
          1e-7,
      );
      assert.equal(b[j]!.box.y, leaf.box.y);
    }
  }
});

test('finite exploration limits retain unknown coverage and the existing energy guard rejects padded table indices', () => {
  const result = planBento({ ...base, maxEvaluations: 7 });
  assert.equal(result.statistics.attempted, 7);
  assert.equal(result.statistics.enumerationComplete, false);
  const large = planBento({
    ...base,
    regions: Array.from({ length: 8 }, (_, i) => ({
      ...regions[i % 4]!,
      id: `region-${i}`,
    })),
    width: 2400,
    height: 1800,
    maxEvaluations: 512,
  });
  assert.equal(large.statistics.attempted, 512);
  assert.equal(large.statistics.enumerationComplete, false);
  assert.ok(large.candidates.length);
  assert.ok(large.program);
  assert.ok(large.search);
  assert.equal(large.search.statistics.method, 'exhaustive');
  assert.equal(large.search.statistics.complete, true);
  const compiled = compileEnergy(large.program);
  const last = {
    choiceGroup: large.program.variables[0]!.values.at(-1)!,
    choiceWithin: large.program.variables[1]!.values.at(-1)!,
  };
  if (last.choiceGroup * 32 + last.choiceWithin >= large.placements.length)
    assert.equal(compiled.evaluate(last).status, 'mathematically-rejected');
});

test('composition plan couples bento to its calculated content width and gap without changing legacy calls', () => {
  const { width: _width, gap: _gap, ...options } = base;
  const legacy = planComposition({ mode: 'app', width: 1440 });
  const proposed = planComposition({
    mode: 'app',
    width: 1440,
    bento: options,
  });
  assert.equal(proposed.bento!.input.width, legacy.contentWidth);
  assert.equal(proposed.bento!.input.gap, legacy.gap);
  assert.equal(proposed.bento!.input.height, 800);
  assert.equal(legacy.bento, undefined);
  assert.throws(
    () => BentoSchema.parse({ ...base, regions: [regions[0], regions[0]] }),
    /unique/,
  );
  assert.throws(
    () =>
      planBento({
        ...base,
        regions: [
          { ...regions[0], areaWeight: undefined },
          ...regions.slice(1),
        ],
      }),
    /every region/,
  );
  assert.throws(
    () =>
      planBento({
        ...base,
        adjacency: [{ ...base.adjacency[0], second: 'missing' }],
      }),
    /declared regions/,
  );
  assert.throws(() => planBento({ ...base, width: NaN }));
});

test('bento preserves measurement units and emits explicit platform support with proposed inspection geometry', () => {
  const web = planBento(base).candidates[0]!;
  assert.equal(web.styles.rendererVerified, false);
  assert.ok(web.styles.stylex.source?.includes('stylex.create'));
  assert.equal(web.styles.reactNative.source, null);
  assert.ok(web.styles.reactNative.unsupported.length);
  const wireframe = WireframeSchema.parse(web.wireframe);
  assert.ok(wireframe.nodes.every((node) => node.evidence === 'proposed'));
  assert.deepEqual(
    resolveWireframe(wireframe).nodes.map((node) => node.box),
    web.consequences.boxes.map((node) => node.box),
  );
  const native = planBento({
    ...base,
    unit: 'dp',
    regions: regions.map((region) => ({
      ...region,
      basis: 'measured',
      measurement: {
        unit: 'dp',
        provider: 'native-android',
        inputIdentity: 'a'.repeat(64),
      },
    })),
  }).candidates[0]!;
  assert.ok(native.styles.reactNative.source?.includes('StyleSheet.create'));
  assert.equal(native.styles.stylex.source, null);
  assert.ok(native.styles.stylex.unsupported.length);
  assert.equal(native.styles.rendererVerified, false);
  assert.throws(
    () =>
      planBento({
        ...base,
        regions: regions.map((region) => ({
          ...region,
          basis: 'measured',
          measurement: {
            unit: 'dp',
            provider: 'native-android',
            inputIdentity: 'a'.repeat(64),
          },
        })),
      }),
    /current frame unit/,
  );
  assert.throws(
    () =>
      planBento({
        ...base,
        regions: regions.map((region) => ({
          ...region,
          basis: 'measured',
          measurement: {
            unit: 'css-px',
            provider: 'native-ios',
            inputIdentity: 'a'.repeat(64),
          },
        })),
      }),
    /distinct/,
  );
  assert.throws(() =>
    planBento({
      ...base,
      regions: regions.map((region) => ({ ...region, basis: 'measured' })),
    }),
  );
});

test('capped bento search includes feasible mobile stacks before mixed descendant exploration', () => {
  for (const count of [6, 7, 8]) {
    const result = planBento({
      ...base,
      width: 320,
      height: 2000,
      regions: Array.from({ length: count }, (_, i) => ({
        id: `region-${i}`,
        minWidth: 180,
        minHeight: 100,
        basis: 'authored',
        source: ['test:mobile content'],
      })),
      adjacency: [],
    });
    assert.equal(result.status, 'proposed');
    assert.equal(result.statistics.enumerationComplete, false);
    assert.ok(
      result.candidates.some((candidate) =>
        candidate.consequences.boxes.every(
          (region) => region.box.width === 320,
        ),
      ),
    );
  }
});

test('flex growth consumes the available span even in subpixel frames', () => {
  const result = planBento({
    width: 0.5,
    height: 0.5,
    gap: 0,
    unit: 'css-px',
    regions: [
      {
        id: 'a',
        minWidth: 0.001,
        minHeight: 0.001,
        basis: 'authored',
        source: ['test:tiny frame'],
      },
      {
        id: 'b',
        minWidth: 0.001,
        minHeight: 0.001,
        basis: 'authored',
        source: ['test:tiny frame'],
      },
    ],
  });
  for (const candidate of result.candidates) {
    assert.equal(candidate.tree.kind, 'split');
    if (candidate.tree.kind === 'split')
      assert.equal(
        candidate.tree.children.reduce(
          (sum, child) => sum + child.style.flexGrow!,
          0,
        ),
        1,
      );
  }
});

test('incomplete search without a witness remains distinct from a complete empty family', () => {
  const input = {
    ...base,
    width: 1200,
    height: 100,
    adjacency: [],
    maxEvaluations: 1,
  };
  assert.equal(planBento(input).status, 'search-exhausted-without-witness');
  assert.equal(planBento({ ...input, maxEvaluations: 512 }).status, 'proposed');
});
