import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { hash } from '../../../src/identity.js';
import { resolveOutputBindings, checkOutputBindings } from '../../../src/output-bindings.js';
import { sourceIdentity } from './source-identity.mjs';
import { expoProofSourceFiles } from '../../../scripts/expo-proof-contract.mjs';
const output = 'artifacts/expo-design-theory';
const generated = JSON.parse(await readFile('experiments/expo-design-theory/src/design.generated.json', 'utf8'));
const web = JSON.parse(await readFile(`${output}/round2/proof.json`, 'utf8'));
const native = await Promise.all(['ios', 'android'].map(async (p) => JSON.parse(await readFile(`${output}/native-${p}-proof.json`, 'utf8'))));
const source = await sourceIdentity();
const current = { designIdentity: generated.designIdentity, sourceIdentity: source, inputIdentity: generated.inputIdentity, resultIdentity: generated.identity };
const bindings: any[] = [], observations: any[] = [];
for (const scenario of generated.scenarios) {
  const evidence = scenario.platform === 'web' ? web.scenarios.find((s: any) => s.browser === 'chromium' && s.receipt.scenario === scenario.id)?.receipt : native.find((n: any) => n.platform === scenario.platform)?.receipts.find((r: any) => r.receipt.scenario === scenario.id)?.receipt;
  if (!evidence) throw Error(`Missing actual renderer receipt ${scenario.id}`);
  const fields: Array<[string, string, string, number]> = [['list', 'width', 'regions.list.width', evidence.boxes.list.width], ['detail', 'width', 'regions.detail.width', evidence.boxes.detail.width], ['line-height-probe', 'lineHeight', 'row.lineHeight', evidence.boxes['line-height-probe'].height]];
  if (scenario.platform === 'web') fields.push(['row-inlet', 'fontSize', 'row.fontSize', parseFloat(evidence.boundStyles['row-inlet'].fontSize)]);
  for (const [surface, property, token, measured] of fields) {
    const id = `${scenario.id}-${surface}-${property.toLowerCase()}`, sourceLocation = 'experiments/expo-design-theory/src/App.jsx';
    bindings.push({ id, scenario: scenario.id, scenarioIdentity: hash(scenario), platform: scenario.platform, unit: scenario.unit, pointer: `/${scenario.id}/${token}`, target: { surface, property, sourceLocation }, tolerance: property === 'lineHeight' ? 1 : .6 });
    observations.push({ binding: id, current: { ...current, sourceIdentity: evidence.sourceIdentity, resultIdentity: evidence.resultIdentity }, scenario: scenario.id, scenarioIdentity: hash(scenario), platform: scenario.platform, unit: scenario.unit, surface, property, sourceLocation, status: 'observed', value: measured, provider: evidence.provider, runtime: evidence.runtime, resultRef: scenario.platform === 'web' ? `${output}/round2/proof.json` : `${output}/${scenario.platform}-proof.json`, observedAt: evidence.observedAt, detail: property === 'fontSize' ? 'Actual browser computed fontSize on the bound row.' : 'Actual current host-node geometry, independently captured by browser/native renderer; single-line text probe for lineHeight.' });
  }
}
const manifest = resolveOutputBindings({ operation: 'resolve', current, source: { value: generated.values, identity: hash(generated.values) }, bindings });
const bindingCheck = checkOutputBindings({ operation: 'check', manifest, current, observations });
await writeFile(`${output}/output-bindings.json`, JSON.stringify({ manifest, observations, check: bindingCheck }, null, 2));
const files = await Promise.all(expoProofSourceFiles.map(async (file) => ({ path: file, sha256: createHash('sha256').update(await readFile(file)).digest('hex') })));
const artifacts = await Promise.all(Object.entries({ web: `${output}/round2/proof.json`, ios: `${output}/native-ios-proof.json`, android: `${output}/native-android-proof.json`, bindings: `${output}/output-bindings.json`, compiled: `${output}/decisions/compiled.json`, workflow: `${output}/decisions/workflow.json` }).map(async ([role, file]) => ({ role, path: file, sha256: createHash('sha256').update(await readFile(file)).digest('hex') })));
const checks = [
  { name: 'current-source-and-design', passed: source === generated.sourceIdentity && web.sourceIdentity === source && native.every((n) => n.sourceIdentity === source && n.sourceStable) },
  { name: 'current-selected-values', passed: generated.identity === hash(generated.values) && web.resultIdentity === generated.identity && native.every((n) => n.resultIdentity === generated.identity) },
  { name: 'web-render-and-flows', passed: web.failures.length === 0 && web.checks.every((c: any) => c.passed), count: web.checks.length },
  ...native.map((n) => ({ name: `${n.platform}-render-and-real-input`, passed: !n.error && !n.calibrate && n.actions.length >= 8 && n.checks.every((c: any) => c.passed), actions: n.actions.length, count: n.checks.length })),
  { name: 'shared-output-bindings', passed: bindingCheck.verified, count: observations.length },
];
const proof = { version: 1, complete: checks.every((c) => c.passed), generatedAt: new Date().toISOString(), sourceIdentity: source, designIdentity: generated.designIdentity, fontIdentity: generated.fontIdentity, inputIdentity: generated.inputIdentity, resultIdentity: generated.identity, files, artifacts, checks, web: `${output}/round2/proof.json`, native: native.map((n) => ({ platform: n.platform, path: `${output}/${n.platform}-proof.json`, checks: n.checks, actions: n.actions })), bindings: `${output}/output-bindings.json`, historical: `${output}/round1/review.json`, limits: ['React Strict DOM primitives verified in actual Expo Go iOS/Android and production Expo Web; this does not establish visual parity or every API.', 'Native scroll uses documented compat.native and real RN ScrollView. Material shader is web-only; native finish static.', 'Twofold app text enlargement was exercised by real native controls. OS Dynamic Type/font-scale is outside these compiled scenarios.', 'Native fontSize is declared and source-bound, not read from a native computed-style API. Native region width and single-line height are measured directly.', 'Devices are iOS Simulator/Android emulator; physical hardware energy, thermal behavior, full accessibility and native release-build performance remain unverified.'] };
await writeFile(`${output}/proof.json`, JSON.stringify(proof, null, 2));
await writeFile(`${output}/native-proof.json`, JSON.stringify({ ...proof, web: undefined, native }, null, 2));
console.log(JSON.stringify({ complete: proof.complete, checks, sourceIdentity: source, resultIdentity: generated.identity }, null, 2));
if (!proof.complete) process.exitCode = 1;
