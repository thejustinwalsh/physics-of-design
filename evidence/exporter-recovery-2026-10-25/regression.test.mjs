import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {assertFunctionalModelProvenance} from './export.mjs';
const fixture = JSON.parse(await readFile(new URL('./model-provenance.fixture.json', import.meta.url)));
test('actual fixture reproduces original failure and passes equivalent checkpoint metadata', () => {
  assert.throws(() => assert.deepEqual(fixture.raw, fixture.curated));
  assertFunctionalModelProvenance(fixture.raw, fixture.curated);
  const moved = structuredClone(fixture.raw);
  moved.gguf.file='/synthetic/relocated.gguf'; moved.gguf.bytes+=1;
  assertFunctionalModelProvenance(moved, fixture.curated);
});
for (const key of ['source','revision','dtype','backend','serving_config','threads','context_tokens'])
  test(`functional mismatch remains rejected: ${key}`, () => {
    const changed=structuredClone(fixture.raw);
    changed[key]=typeof changed[key]==='number'?changed[key]+1:'different';
    assert.throws(()=>assertFunctionalModelProvenance(changed, fixture.curated));
  });
test('changed or missing checkpoint digest remains rejected',()=>{
  for(const digest of ['0'.repeat(64),undefined]) {
    const changed=structuredClone(fixture.raw); changed.gguf.sha256=digest;
    assert.throws(()=>assertFunctionalModelProvenance(changed, fixture.curated));
  }
});
test('validation does not mutate either preserved receipt',()=>{
  const before=JSON.stringify(fixture);
  assertFunctionalModelProvenance(fixture.raw,fixture.curated);
  assert.equal(JSON.stringify(fixture),before);
});
