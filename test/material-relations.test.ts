import test from 'node:test';
import assert from 'node:assert/strict';
import {
  analyzeMaterialPair,
  MaterialPairSchema,
} from '../src/material-relations.js';

const first = {
  id: 'first',
  surface: { baseColor: [0.3, 0.3, 0.3], roughness: 0.8, metalness: 0 },
  composition: 'homogeneous-dielectric',
  provenance: { kind: 'authored', source: 'test fixture' },
};
const second = { ...first, id: 'second' };
const near = (a: number, b: number, epsilon = 1e-8) =>
  assert.ok(Math.abs(a - b) < epsilon, `${a} != ${b}`);

test('identical inputs yield zero descriptors without claiming preference or text contrast', () => {
  const result = analyzeMaterialPair({ first, second });
  assert.equal(result.descriptors.deltaEOK.value, 0);
  assert.equal(result.descriptors.roughnessDifference.value, 0);
  assert.equal(result.descriptors.metalnessDifference.value, 0);
  assert.equal(result.hierarchy.exactSharedFinishParameters, true);
  assert.equal(result.empiricalPreference.score, null);
  assert.equal(result.textOverlayLegibility.ratio, null);
  assert.equal(result.descriptors.texturePhysicalFrequencyOctaves.value, null);
});

test('black to white OKLab distance is one; swapping pair order preserves all differences', () => {
  const a = {
    ...first,
    surface: { baseColor: [0, 0, 0], roughness: 0.2, metalness: 0 },
  };
  const b = {
    ...second,
    surface: { baseColor: [1, 1, 1], roughness: 0.8, metalness: 1 },
  };
  const ab = analyzeMaterialPair({ first: a, second: b });
  const ba = analyzeMaterialPair({
    first: { ...b, id: 'a' },
    second: { ...a, id: 'b' },
  });
  near(ab.descriptors.deltaEOK.value!, 1, 1e-6);
  near(ab.descriptors.alphaDifference.value!, 0.6);
  near(ab.descriptors.roughnessDifference.value!, 0.6);
  for (const metric of Object.keys(
    ab.descriptors,
  ) as (keyof typeof ab.descriptors)[]) {
    assert.equal(ab.descriptors[metric].value, ba.descriptors[metric].value);
  }
});

test('physical scale and projected sampling stay separate from tile coordinates', () => {
  const a = {
    ...first,
    texture: {
      cyclesPerTile: 8,
      heightAmplitudeFraction: 0.01,
      tileWidthMm: 8,
      textureResolution: 16,
      projectedTilePixels: 8,
      pattern: 'sinusoidal',
    },
  };
  const b = {
    ...second,
    texture: {
      cyclesPerTile: 16,
      heightAmplitudeFraction: 0.01,
      tileWidthMm: 16,
      textureResolution: 128,
      projectedTilePixels: 128,
    },
  };
  const result = analyzeMaterialPair({ first: a, second: b });
  assert.equal(result.descriptors.textureTileFrequencyOctaves.value, 1);
  assert.equal(result.descriptors.texturePhysicalFrequencyOctaves.value, 0);
  near(result.descriptors.textureAmplitudeMmDifference.value!, 0.08);
  assert.equal(
    result.features.first.texture!.textureSampling,
    'at-or-above-nyquist',
  );
  assert.equal(
    result.features.first.texture!.projectedSampling,
    'at-or-above-nyquist',
  );
  assert.equal(
    result.features.second.texture!.projectedSampling,
    'declared-frequency-below-nyquist',
  );
  near(
    result.features.first.texture!.maximumSinusoidalSlope!,
    2 * Math.PI * 0.01 * 8,
  );
  assert.equal(result.features.second.texture!.maximumSinusoidalSlope, null);
});

test('lighting directions need an explicit common frame; IDs remain declarations', () => {
  const a = {
    ...first,
    lighting: {
      rigId: 'studio',
      lightDirection: [0, 0, 2],
      exposureEv: -1,
      coordinateFrame: 'world',
    },
  };
  const b = {
    ...second,
    lighting: {
      rigId: 'studio',
      lightDirection: [2, 0, 0],
      exposureEv: 1,
      coordinateFrame: 'world',
    },
  };
  const result = analyzeMaterialPair({ first: a, second: b });
  near(result.descriptors.lightingDirectionDegrees.value!, 90);
  assert.equal(result.descriptors.exposureEvDifference.value, 2);
  assert.equal(result.lighting.sameDeclaredRig, true);
  assert.equal(result.lighting.sameDeclaredEnvironment, null);
  const differentFrame = analyzeMaterialPair({
    first: a,
    second: { ...b, lighting: { ...b.lighting, coordinateFrame: 'local' } },
  });
  assert.equal(differentFrame.descriptors.lightingDirectionDegrees.value, null);
});

test('contradictory homogeneous composition is identified without refusing art direction', () => {
  const result = analyzeMaterialPair({
    first: { ...first, surface: { ...first.surface, metalness: 0.5 } },
    second: { ...second, composition: 'mixture' },
  });
  assert.equal(
    result.physicalModelChecks[0]!.status,
    'declared-composition-conflict',
  );
  assert.equal(result.physicalModelChecks[1]!.status, 'parameter-consistent');
});

test('the same pair can meet continuity bands and fail counterpoint bands; neither is universal quality', () => {
  const baseProfile = {
    id: 'continuity',
    intent: 'Group adjacent surfaces',
    roleRelation: 'shared-group',
    source: 'authored brief',
    bands: [
      {
        metric: 'roughnessDifference',
        min: 0,
        max: 0.1,
        rationale: 'Similar finish for this brief',
        source: 'authored finish policy',
      },
    ],
  };
  const continuity = analyzeMaterialPair({
    first,
    second,
    profile: baseProfile,
  });
  const counterpoint = analyzeMaterialPair({
    first,
    second,
    profile: {
      ...baseProfile,
      id: 'counterpoint',
      roleRelation: 'counterpoint',
      bands: [{ ...baseProfile.bands[0], min: 0.3, max: 0.8 }],
    },
  });
  assert.deepEqual(continuity.descriptors, counterpoint.descriptors);
  assert.equal(continuity.brief!.status, 'declared-bands-met');
  assert.equal(counterpoint.brief!.status, 'outside-declared-bands');
  const incomplete = analyzeMaterialPair({
    first,
    second,
    profile: {
      ...baseProfile,
      bands: [
        { ...baseProfile.bands[0], metric: 'texturePhysicalFrequencyOctaves' },
      ],
    },
  });
  assert.equal(incomplete.brief!.status, 'incomplete');
});

test('finite limits, direction length, provenance and band order are validated', () => {
  for (const roughness of [NaN, Infinity, -1, 2])
    assert.throws(() =>
      analyzeMaterialPair({
        first: { ...first, surface: { ...first.surface, roughness } },
        second,
      }),
    );
  assert.throws(() =>
    analyzeMaterialPair({
      first: { ...first, lighting: { lightDirection: [0, 0, 0] } },
      second,
    }),
  );
  assert.throws(() =>
    analyzeMaterialPair({
      first: {
        ...first,
        texture: { cyclesPerTile: 0, heightAmplitudeFraction: 0 },
      },
      second,
    }),
  );
  assert.equal(
    MaterialPairSchema.safeParse({
      first: { ...first, provenance: undefined },
      second,
    }).success,
    false,
  );
  assert.throws(() =>
    analyzeMaterialPair({
      first,
      second,
      profile: {
        id: 'bad',
        intent: 'test',
        source: 'test',
        roleRelation: 'shared-group',
        bands: [
          {
            metric: 'deltaEOK',
            min: 2,
            max: 1,
            rationale: 'test',
            source: 'test',
          },
        ],
      },
    }),
  );
});

test('candidate selection preserves Pareto tradeoffs and removes only strictly dominated alternatives', async () => {
  const { materialPairCandidates } =
    await import('../src/material-relations.js');
  const anchor = {
    ...first,
    surface: { baseColor: [0, 0, 0], roughness: 0.2, metalness: 0 },
  };
  const alt = (id: string, white: number, roughness: number) => ({
    ...second,
    id,
    surface: { baseColor: [white, white, white], roughness, metalness: 0 },
  });
  const result = materialPairCandidates({
    anchor,
    alternatives: [
      alt('finish-match', 1, 0.2),
      alt('color-match', 0, 0.8),
      alt('dominated', 1, 1),
    ],
    profile: {
      id: 'tradeoff',
      intent: 'Inspect color and finish separately',
      roleRelation: 'shared-group',
      source: 'test brief',
      bands: [
        {
          metric: 'deltaEOK',
          min: 0,
          max: 0,
          rationale: 'Exact color target',
          source: 'test brief',
        },
        {
          metric: 'roughnessDifference',
          min: 0,
          max: 0,
          rationale: 'Exact finish target',
          source: 'test brief',
        },
      ],
    },
    limit: 1,
  });
  assert.deepEqual(result.paretoIds, ['color-match', 'finish-match']);
  assert.deepEqual(result.dominatedIds, ['dominated']);
  assert.deepEqual(result.selectedIds, ['color-match']);
  assert.equal(result.candidates.length, 3);
  assert.equal(
    result.candidates[0]!.residuals[0]!.normalization,
    'zero-width-target-unit-scale',
  );
  assert.equal(result.empiricalPreference.score, null);
});

test('unknown candidates cannot win by omitted data; identities and tiny normalization intervals reject', async () => {
  const { materialPairCandidates } =
    await import('../src/material-relations.js');
  const texture = {
    cyclesPerTile: 4,
    heightAmplitudeFraction: 0.01,
    tileWidthMm: 10,
  };
  const anchor = { ...first, texture };
  const known = {
    ...second,
    id: 'known',
    texture: { ...texture, cyclesPerTile: 8 },
  };
  const unknown = { ...second, id: 'unknown' };
  const profile = {
    id: 'scale',
    intent: 'Compare physical scale',
    roleRelation: 'shared-group',
    source: 'test brief',
    bands: [
      {
        metric: 'texturePhysicalFrequencyOctaves',
        min: 0,
        max: 0.5,
        rationale: 'Related scale',
        source: 'test brief',
      },
    ],
  };
  const result = materialPairCandidates({
    anchor,
    alternatives: [unknown, known],
    profile,
  });
  assert.deepEqual(result.unresolvedIds, ['unknown']);
  assert.deepEqual(result.paretoIds, ['known']);
  assert.equal(result.candidates[0]!.residuals[0]!.residual, null);
  assert.equal(result.candidates[1]!.residuals[0]!.residual, 1);
  assert.throws(() =>
    materialPairCandidates({ anchor, alternatives: [known, known], profile }),
  );
  assert.throws(() =>
    materialPairCandidates({ anchor, alternatives: [anchor], profile }),
  );
  assert.throws(() =>
    materialPairCandidates({
      anchor,
      alternatives: [known],
      profile: {
        ...profile,
        bands: [{ ...profile.bands[0], min: 0, max: 1e-300 }],
      },
    }),
  );
});

test('authored example selects continuity and counterpoint from the same alternatives', async () => {
  const { readFile } = await import('node:fs/promises');
  const { materialPairCandidates } =
    await import('../src/material-relations.js');
  const example = JSON.parse(
    await readFile(
      new URL('../examples/materials/pairings.json', import.meta.url),
      'utf8',
    ),
  );
  const results = example.selections.map(
    (selection: {
      anchor: string;
      alternatives: string[];
      profile: string;
      limit: number;
    }) =>
      materialPairCandidates({
        anchor: example.materials[selection.anchor],
        alternatives: selection.alternatives.map((id) => example.materials[id]),
        profile: example.profiles[selection.profile],
        limit: selection.limit,
      }),
  );
  assert.deepEqual(results[0].selectedIds, ['mineral-inset']);
  assert.deepEqual(results[1].selectedIds, ['metal-control']);
});
