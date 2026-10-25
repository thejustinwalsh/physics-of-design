import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { assertFunctionalModelProvenance } from '../scripts/export-bold-design-evidence.mjs';

// Actual metadata from the frozen 773e7cd checkpoint. No prompt/model execution
// and no attempt to republish the archive against subsequently changed sources.
const fixture = JSON.parse(
  await readFile(
    new URL(
      './fixtures/selector-model-provenance.json',
      import.meta.url,
    ),
  ),
);

test('actual raw model metadata matches curated provenance despite checkpoint location/size metadata', () => {
  assert.throws(() => assert.deepEqual(fixture.raw, fixture.curated));
  assertFunctionalModelProvenance(fixture.raw, fixture.curated);
  const moved = structuredClone(fixture.raw);
  moved.gguf.file = '/synthetic/relocated.gguf';
  moved.gguf.bytes += 1;
  assertFunctionalModelProvenance(moved, fixture.curated);
});

for (const key of [
  'source',
  'revision',
  'dtype',
  'backend',
  'serving_config',
  'threads',
  'n_gpu_layers',
  'context_tokens',
  'max_prompt_tokens',
  'decode_chunk',
])
  test(`export rejects changed functional model provenance: ${key}`, () => {
    const changed = structuredClone(fixture.raw);
    changed[key] =
      typeof changed[key] === 'number' ? changed[key] + 1 : 'different';
    assert.throws(() =>
      assertFunctionalModelProvenance(changed, fixture.curated),
    );
  });

test('export rejects a changed, malformed or missing checkpoint content digest', () => {
  for (const digest of ['0'.repeat(64), 'malformed', undefined]) {
    const changed = structuredClone(fixture.raw);
    changed.gguf.sha256 = digest;
    assert.throws(() =>
      assertFunctionalModelProvenance(changed, fixture.curated),
    );
  }
});

test('export preserves strict comparison outside gguf metadata', () => {
  const unexpected = { ...fixture.raw, other_backend_option: true };
  assert.throws(() =>
    assertFunctionalModelProvenance(unexpected, fixture.curated),
  );
});

test('model provenance comparison does not mutate retained raw or curated evidence', () => {
  const before = JSON.stringify(fixture);
  assertFunctionalModelProvenance(fixture.raw, fixture.curated);
  assert.equal(JSON.stringify(fixture), before);
});
