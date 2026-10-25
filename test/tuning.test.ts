import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseState } from '../src/state.js';
import { hash } from '../src/identity.js';
import { measurementKey } from '../src/measurement.js';
import { exportTuning, TeacherRatingsSchema } from '../src/tuning.js';

function fixture() {
  const state = parseState(
    JSON.parse(readFileSync('examples/hero.json', 'utf8')),
  );
  const pair = {
    id: 'pair',
    projectId: 'project',
    split: 'train',
    criterion: 'Protocol fixture',
    candidates: ['left', 'right'].map((id) => ({
      id,
      state,
      stateHash: hash(state),
      measurements: [
        {
          inputHash: measurementKey(state),
          feasible: true,
          engine: 'contract-fixture-only',
        },
      ],
      images: [id + '-fixture-not-a-real-image'],
    })),
  };
  return {
    manifest: {
      version: 1,
      rights: 'Original contract fixture',
      pairs: [pair],
    },
    renderWidths: [state.viewport.width],
    ratings: [
      {
        schemaVersion: 1,
        rater: {
          kind: 'synthetic-astra',
          agent: 'contract-fixture',
          model: 'fixture-not-inference',
          skillCommit: 'fixture',
        },
        ratings: [
          {
            pairId: 'pair',
            choice: 'left',
            reason: 'Fixture label, not empirical evidence',
            evidenceImages: [
              'left-fixture-not-a-real-image',
              'right-fixture-not-a-real-image',
            ],
          },
        ],
      },
    ],
  };
}
test('tuning export preserves synthetic provenance, ties and project holdout while rejecting stale/invalid observations', () => {
  const input = fixture(),
    result = exportTuning(input);
  assert.equal(result.counts.synthetic, 1);
  assert.equal(result.counts.human, 0);
  assert.equal(result.examples[0]!.split, 'train');
  const tie = fixture();
  tie.ratings[0]!.ratings[0]!.choice = 'tie';
  assert.equal(exportTuning(tie).examples.length, 0);
  assert.equal(exportTuning(tie).excluded.length, 1);
  const stale = fixture();
  stale.manifest.pairs[0]!.candidates[0]!.stateHash = '0'.repeat(64);
  assert.throws(() => exportTuning(stale), /Stale tuning state/);
  const receipt = fixture();
  receipt.renderWidths = [320];
  assert.throws(() => exportTuning(receipt), /receipt/);
  const leak = fixture();
  leak.manifest.pairs.push({
    ...leak.manifest.pairs[0]!,
    id: 'other',
    split: 'held-out',
  });
  assert.throws(() => exportTuning(leak), /leakage/);
  const duplicate = fixture();
  duplicate.ratings.push(duplicate.ratings[0]!);
  assert.throws(() => exportTuning(duplicate), /Duplicate/);
  assert.equal(
    TeacherRatingsSchema.safeParse({
      schemaVersion: 1,
      rater: { kind: 'human', id: 'test', model: 'synthetic-model' },
      ratings: [],
    }).success,
    false,
  );
});

test('visual ratings bind every declared candidate view, preserving explicit abstentions', () => {
  for (const images of [
    [],
    ['unrelated-project.png'],
    ['left-fixture-not-a-real-image'],
    ['left-fixture-not-a-real-image', 'left-fixture-not-a-real-image'],
  ]) {
    const input = fixture();
    input.ratings[0]!.ratings[0]!.evidenceImages = images;
    assert.throws(() => exportTuning(input), /evidence images/);
  }
  const abstain = fixture();
  abstain.ratings[0]!.ratings[0]!.choice = 'abstain';
  abstain.ratings[0]!.ratings[0]!.evidenceImages = [];
  const result = exportTuning(abstain);
  assert.equal(result.examples.length, 0);
  assert.deepEqual(result.excluded[0]!.evidenceImages, []);
});

test('explicit evidence roots join basenames to relative paths without accepting traversal or basename collisions', () => {
  const input = { ...fixture(), evidenceRoot: 'evidence/review' };
  input.ratings[0]!.ratings[0]!.evidenceImages = [
    'evidence/review/left-fixture-not-a-real-image',
    'evidence/review/right-fixture-not-a-real-image',
  ];
  const result = exportTuning(input);
  assert.equal(result.manifestHash, hash(input.manifest));
  assert.deepEqual(
    result.examples[0]!.evidenceImageIds,
    input.ratings[0]!.ratings[0]!.evidenceImages,
  );
  input.ratings[0]!.ratings[0]!.evidenceImages[0] =
    'another-project/left-fixture-not-a-real-image';
  assert.throws(() => exportTuning(input), /evidence images/);
  input.ratings[0]!.ratings[0]!.evidenceImages[0] =
    '../review/left-fixture-not-a-real-image';
  assert.throws(() => exportTuning(input), /traversal/);
});
