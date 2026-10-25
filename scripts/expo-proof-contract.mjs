import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
function canonical(v) { return Array.isArray(v) ? `[${v.map(canonical).join(',')}]` : v !== null && typeof v === 'object' ? `{${Object.entries(v).sort(([a], [b]) => a.localeCompare(b)).map(([k, x]) => `${JSON.stringify(k)}:${canonical(x)}`).join(',')}}` : JSON.stringify(v); }
const digest = (v) => sha256(canonical(v));
function location(root, file) { const p = path.resolve(root, file); if (!p.startsWith(path.resolve(root) + path.sep)) throw Error(`Proof path outside repository: ${file}`); return p; }

// Ordered path strings are part of the renderer identity, including the font's
// relative path. The producer and verifier share the complete proof source set.
export const expoRendererSourceFiles = Object.freeze(['src/App.jsx', 'src/useObservations.jsx', 'src/Scroll.jsx', 'src/Scroll.native.jsx', 'src/content.js', 'scripts/source-identity.mjs', 'babel.config.js', 'metro.config.js', 'postcss.config.js', 'strict.css', 'index.js', 'app.json', 'package.json', 'package-lock.json', '../../assets/fonts/Lato-Regular.ttf']);
export const expoProofSourceFiles = Object.freeze([
  'scripts/prove-expo-design-theory.mjs',
  'experiments/expo-design-theory/scripts/generate-design.mts',
  'experiments/expo-design-theory/scripts/native-proof.mjs',
  'experiments/expo-design-theory/scripts/finalize-proof.mts',
  'experiments/expo-design-theory/scripts/session.mjs',
  'experiments/expo-design-theory/tsconfig.json',
  'experiments/expo-design-theory/src/assets.d.ts',
  'experiments/expo-design-theory/src/design.generated.json',
  ...expoRendererSourceFiles.map((file) => path.posix.normalize(`experiments/expo-design-theory/${file}`)),
  'experiments/expo-design-theory/scripts/proof-contract.mjs',
  'scripts/expo-proof-contract.mjs',
]);
const browsers = ['chromium', 'webkit'], webWidths = [390, 820, 1440], nativePlatforms = ['native-ios', 'native-android'];
const webScenarioKeys = browsers.flatMap((browser) => webWidths.flatMap((width) => [1, 2].map((scale) => `${browser}/${width}/${scale}`)));
const templateScenarioKeys = browsers.flatMap((browser) => webWidths.map((width) => `${browser}/${width}`));
function exactSet(actual, expected) {
  return Array.isArray(actual) && actual.length === expected.length && new Set(actual).size === actual.length && actual.every((value) => expected.includes(value));
}
function rendererIdentity(root) {
  const hash = createHash('sha256');
  for (const file of expoRendererSourceFiles) hash.update(file).update('\0').update(readFileSync(location(root, `experiments/expo-design-theory/${file}`))).update('\0');
  return hash.digest('hex');
}

/** Validate saved producer evidence against current files, then independently
 * recompute the required geometry/state checks. Hashes bind data; they cannot
 * authenticate that a renderer ran or replace retained raw observations. */
export function validateExpoProof(proof, { root = process.cwd(), checkSources = true } = {}) {
  const failures = [], require = (ok, message) => { if (!ok) failures.push(message); };
  try {
    require(proof.version === 1 && proof.complete === true, 'Aggregate is not complete version1');
    require(exactSet(proof.files.map((f) => f.path), expoProofSourceFiles), 'Spike source files must be the exact unique canonical producer set');
    if (checkSources) {
      for (const f of proof.files) require(sha256(readFileSync(location(root, f.path))) === f.sha256, `Current source differs: ${f.path}`);
      require(rendererIdentity(root) === proof.sourceIdentity, 'Current renderer source identity differs');
    }
    require(exactSet(proof.artifacts.map((f) => f.role), ['web', 'ios', 'android', 'bindings', 'compiled', 'workflow']), 'Spike artifact roles must be exact and unique');
    require(new Set(proof.artifacts.map((f) => f.path)).size === proof.artifacts.length, 'Spike artifact paths must be unique');
    const artifacts = {};
    for (const f of proof.artifacts) { const bytes = readFileSync(location(root, f.path)); require(sha256(bytes) === f.sha256, `Artifact differs: ${f.path}`); artifacts[f.role] = JSON.parse(bytes); }
    const generated = JSON.parse(readFileSync(location(root, 'experiments/expo-design-theory/src/design.generated.json'), 'utf8'));
    require(generated.sourceIdentity === proof.sourceIdentity && generated.designIdentity === proof.designIdentity && generated.identity === proof.resultIdentity && digest(generated.values) === proof.resultIdentity, 'Current selected values/identities differ');
    const web = artifacts.web, natives = [artifacts.ios, artifacts.android];
    require(web.sourceIdentity === proof.sourceIdentity && web.resultIdentity === proof.resultIdentity && !web.failures.length, 'Web identity or execution failure');
    require(exactSet(web.scenarios.map((s) => `${s.browser}/${s.width}/${s.textScale}`), webScenarioKeys), 'Web scenarios must be the exact unique browser/width/scale set');
    for (const browser of browsers) for (const width of webWidths) for (const scale of [1, 2]) {
      const matches = web.scenarios.filter((s) => s.browser === browser && s.width === width && s.textScale === scale);
      require(matches.length === 1, `Missing/duplicate web scenario ${browser}/${width}/${scale}`);
      const r = matches[0]?.receipt, v = r && generated.values[r.scenario];
      require(r?.provider === 'browser' && r.platform === 'web' && r.textScale === scale && r.viewport?.width === width && r.scenario === `web-${width}-${scale}` && r.sourceIdentity === proof.sourceIdentity && r.resultIdentity === proof.resultIdentity && r.phase === 'resolved-kernels', 'Web receipt is not current renderer evidence');
      require(v && Math.abs(parseFloat(r.boundStyles['row-inlet'].fontSize) - v['row.fontSize']) < .1 && Math.abs(r.boxes.list.width - v['regions.list.width']) < .6 && Math.abs(r.boxes['line-height-probe'].height - v['row.lineHeight']) < 1, `Actual web binding mismatch ${browser}/${width}/${scale}`);
    }
    require(web.checks.length >= 60 && web.checks.every((c) => c.passed), 'Web producer checks failed or missing');
    for (const [index, native] of natives.entries()) {
      const platform = nativePlatforms[index];
      require(native.platform === platform && !native.calibrate && !native.error && native.sourceStable && native.sourceIdentity === proof.sourceIdentity && native.resultIdentity === proof.resultIdentity, `${platform} producer is stale/failed`);
      const targetSequence = native.actions.map((a) => a.target);
      for (const target of ['filter-all', 'enlarge', 'filter-review', 'row-inlet', 'mark-reviewed', 'long-text']) require(targetSequence.includes(target), `${platform} missing real input ${target}`);
      require(native.actions.length >= 8 && native.actions.every((a) => a.method === (index === 0 ? 'idb-native-hid-with-independent-ax-id' : 'adb-native-input-with-independent-uiautomator-bounds')), `${platform} wrong input provider`);
      require(exactSet(native.receipts.map((r) => r.name), ['normal', 'enlarged', 'detail', 'reviewed-long-text']), `${platform} receipt stages must be exact and unique`);
      require(native.receipts.every(({ receipt: r }) => r.provider === platform && r.platform === platform && r.sourceIdentity === proof.sourceIdentity && r.resultIdentity === proof.resultIdentity && r.phase === 'resolved-kernels'), `${platform} receipt stages are stale or fabricated`);
      for (const scale of [1, 2]) {
        const r = native.receipts.find((r) => r.name === (scale === 1 ? 'normal' : 'enlarged'))?.receipt, v = r && generated.values[r.scenario];
        require(r?.provider === platform && r.platform === platform && r.textScale === scale && r.sourceIdentity === proof.sourceIdentity && r.resultIdentity === proof.resultIdentity && r.phase === 'resolved-kernels', `${platform} missing current scale ${scale}`);
        require(v && Math.abs(r.boxes.list.width - v['regions.list.width']) < .6 && Math.abs(r.boxes.detail.width - v['regions.detail.width']) < .6 && Math.abs(r.boxes['line-height-probe'].height - v['row.lineHeight']) < 1 && r.boxes['row-inlet'].height + .6 >= v['row.rowHeight'], `${platform} actual binding mismatch scale${scale}`);
      }
      require(native.checks.length >= 10 && native.checks.every((c) => c.passed), `${platform} checks failed`);
    }
    require(artifacts.bindings.check.verified && artifacts.bindings.observations.length === 36 && artifacts.bindings.check.entries.every((e) => e.status === 'pass'), 'Output binding checks are incomplete');
  } catch (e) { failures.push(e.message); }
  return { valid: failures.length === 0, failures, sourceIdentity: proof.sourceIdentity, resultIdentity: proof.resultIdentity, platforms: failures.length ? [] : ['web', 'native-ios', 'native-android'], scope: 'Current files, exact retained artifacts, required actual renderer geometry and input-provider/state records. Does not authenticate observations or imply physical-device/native-release parity.' };
}

export function validateTemplateProof(proof, { root = process.cwd() } = {}) {
  const failures = [], require = (ok, message) => { if (!ok) failures.push(message); };
  try {
    const policy = JSON.parse(readFileSync(location(root, 'experiments/relay/policy.json'), 'utf8'));
    const launcher = readFileSync(location(root, 'scripts/run-relay-builders.mjs'), 'utf8'), shell = launcher.match(/const SHELL = `([\s\S]*?)`;\n/)[1];
    require(proof.version === 1 && proof.kind === 'independent-builder-template-smoke' && proof.complete === true && !proof.errors.length, 'Template producer incomplete');
    require(proof.shellSourceIdentity === sha256(shell), 'Current blank shell differs');
    require(proof.sourceIdentity === sha256(JSON.stringify(proof.sourceFiles)), 'Template source manifest identity differs');
    require(new Set(policy.templateFiles).size === policy.templateFiles.length && !policy.templateFiles.includes('src/App.jsx'), 'Template policy allowlist must be unique and exclude the generated shell');
    require(exactSet(proof.sourceFiles.map((f) => f.path), [...policy.templateFiles, 'src/App.jsx']), 'Template source files must be the exact unique policy allowlist plus shell');
    for (const file of proof.sourceFiles) require(file.sha256 === sha256(file.path === 'src/App.jsx' ? shell : readFileSync(location(root, `${policy.templateRoot}/${file.path}`))), `Template file differs: ${file.path}`);
    require(proof.web.length === 6 && proof.native.length === 2 && proof.checks.length === 8 && proof.checks.every((c) => c.passed), 'Template platform checks incomplete');
    require(exactSet(proof.web.map((w) => `${w.browser}/${w.width}`), templateScenarioKeys), 'Template web scenarios must be the exact unique browser/width set');
    require(exactSet(proof.native.map((n) => n.platform), nativePlatforms), 'Template native platforms must be exactly iOS and Android once each');
    for (const w of proof.web) require(w.receipt.phase === 'template-shell' && w.receipt.platform === 'web' && w.receipt.viewport?.width === w.width && w.receipt.sourceIdentity === proof.sourceIdentity && w.receipt.presses === 1 && w.receipt.provider === 'browser' && w.receipt.boxes['shell-button'].height >= 48, 'Invalid web shell primitive evidence');
    for (const n of proof.native) require([n.before, n.after].every((r) => r.phase === 'template-shell' && r.platform === n.platform && r.provider === n.platform && r.sourceIdentity === proof.sourceIdentity) && n.before.presses === 0 && n.after.presses === 1 && n.after.boxes['shell-button'].height >= 48, 'Invalid native shell primitive transition');
  } catch (e) { failures.push(e.message); }
  return { valid: failures.length === 0, failures, sourceIdentity: proof.sourceIdentity, scope: 'Independent blank shell bytes and actual platform primitive/input records; original spike UI proof is not reused.' };
}
