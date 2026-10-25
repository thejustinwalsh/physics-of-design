import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import os from 'node:os';
import { expoRendererSourceFiles, validateExpoProof, validateTemplateProof } from '../scripts/expo-proof-contract.mjs';
import { sourceFiles } from '../experiments/expo-design-theory/scripts/source-identity.mjs';
import { createExpoGateFixture } from './fixtures/expo-gate.mjs';

const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const read = (file) => JSON.parse(readFileSync(file, 'utf8'));
const policy = read(new URL('../experiments/relay/policy.json', import.meta.url));

function fixture(t) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'expo-proof-contract-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(path.join(root, 'experiments/relay'), { recursive: true });
  writeFileSync(path.join(root, 'experiments/relay/policy.json'), JSON.stringify(policy));
  for (const file of policy.templateFiles) {
    const target = path.join(root, policy.templateRoot, file);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, `Synthetic source fixture: ${file}\n`);
  }
  const result = createExpoGateFixture(root, policy);
  const spike = read(result.spikePath), template = read(result.templatePath);
  assert.deepEqual(validateExpoProof(spike, { root }).failures, [], 'Synthetic baseline must satisfy the complete contract');
  assert.deepEqual(validateTemplateProof(template, { root }).failures, [], 'Synthetic shell baseline must satisfy the complete contract');
  return { root, spike, template };
}

test('canonical renderer paths preserve the actual source-identity order', () => {
  assert.deepEqual(expoRendererSourceFiles, sourceFiles);
});

for (const [name, mutate, expected] of [
  ['duplicate native platform', (p) => { p.native[1] = structuredClone(p.native[0]); }, /native platforms/],
  ['duplicate browser scenario', (p) => { p.web[1] = structuredClone(p.web[0]); }, /web scenarios/],
  ['duplicate source replacing required path', (p) => { p.sourceFiles[1] = structuredClone(p.sourceFiles[0]); p.sourceIdentity = sha256(JSON.stringify(p.sourceFiles)); }, /source files/],
  ['missing source', (p) => { p.sourceFiles.pop(); p.sourceIdentity = sha256(JSON.stringify(p.sourceFiles)); }, /source files/],
  ['fabricated web stage', (p) => { p.web[0].receipt.phase = 'passed'; }, /web shell primitive/],
  ['fabricated native stage', (p) => { p.native[0].after.phase = 'passed'; }, /native shell primitive/],
]) test(`template rejects ${name}`, (t) => {
  const { root, template } = fixture(t);
  mutate(template);
  const result = validateTemplateProof(template, { root });
  assert.equal(result.valid, false);
  assert.match(result.failures.join('\n'), expected);
});

for (const [name, mutate, expected] of [
  ['missing source manifest', (p) => { p.files = []; }, /source files/],
  ['duplicate source replacing required path', (p) => { p.files[1] = structuredClone(p.files[0]); }, /source files/],
  ['duplicate artifact role', (p) => { p.artifacts[1].role = p.artifacts[0].role; }, /artifact roles/],
  ['missing artifact role', (p) => { p.artifacts.pop(); }, /artifact roles/],
]) test(`spike rejects ${name}`, (t) => {
  const { root, spike } = fixture(t);
  mutate(spike);
  const result = validateExpoProof(spike, { root });
  assert.equal(result.valid, false);
  assert.match(result.failures.join('\n'), expected);
});

for (const [name, role, mutate, expected] of [
  ['duplicate web scenario', 'web', (p) => { p.scenarios[1] = structuredClone(p.scenarios[0]); }, /Web scenarios/],
  ['fabricated web stage', 'web', (p) => { p.scenarios[0].receipt.phase = 'passed'; }, /current renderer evidence/],
  ['duplicate native stage', 'ios', (p) => { p.receipts[1] = structuredClone(p.receipts[0]); }, /receipt stages/],
  ['fabricated native stage', 'ios', (p) => { p.receipts[2].receipt.phase = 'passed'; }, /stale or fabricated/],
]) test(`spike rejects hash-bound ${name}`, (t) => {
  const { root, spike } = fixture(t), artifact = spike.artifacts.find((a) => a.role === role);
  const file = path.resolve(root, artifact.path), value = read(file);
  mutate(value);
  const bytes = JSON.stringify(value);
  writeFileSync(file, bytes);
  artifact.sha256 = sha256(bytes);
  const result = validateExpoProof(spike, { root });
  assert.equal(result.valid, false);
  assert.match(result.failures.join('\n'), expected);
});
