#!/usr/bin/env node
// Matched experiment orchestration. Importing this module never starts a model.
import { createHash } from 'node:crypto';
import { execFileSync, spawn } from 'node:child_process';
import {
  closeSync,
  copyFileSync,
  existsSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readSync,
  readdirSync,
  realpathSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { recordSession } from './design-builder-metrics.mjs';
import { assertFullVerification } from './evidence-policy.mjs';
import {
  assertVerificationSourceSnapshot,
  verificationSourceIdentity,
  verificationSourcesFromFiles,
} from './verification-sources.mjs';
import {
  validateExpoProof,
  validateTemplateProof,
} from './expo-proof-contract.mjs';

export const sha256 = (bytes) =>
  createHash('sha256').update(bytes).digest('hex');
const digest = (value) => sha256(JSON.stringify(value));
function hashFile(file) {
  const fd = openSync(file, 'r'),
    accumulator = createHash('sha256'),
    buffer = Buffer.allocUnsafe(1024 * 1024);
  try {
    let n;
    while ((n = readSync(fd, buffer, 0, buffer.length, null)))
      accumulator.update(buffer.subarray(0, n));
  } finally {
    closeSync(fd);
  }
  return accumulator.digest('hex');
}
const json = (file) => JSON.parse(readFileSync(file, 'utf8'));
const now = () => new Date().toISOString();
const fail = (condition, message) => {
  if (!condition) throw Error(message);
};
function save(file, value) {
  mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const temporary = `${file}.${process.pid}.tmp`,
    fd = openSync(temporary, 'wx', 0o600);
  try {
    writeFileSync(fd, JSON.stringify(value, null, 2) + '\n');
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  renameSync(temporary, file);
}
function relative(file) {
  fail(
    typeof file === 'string' &&
      file.length > 0 &&
      !path.isAbsolute(file) &&
      !file.split('/').some((p) => p === '..' || p === '') &&
      !file.includes('\\'),
    `Unsafe relative path: ${file}`,
  );
  return file;
}
function safeFile(root, file) {
  const candidate = path.join(root, relative(file));
  fail(
    lstatSync(candidate).isFile() && !lstatSync(candidate).isSymbolicLink(),
    `Expected regular file: ${file}`,
  );
  fail(
    realpathSync(candidate).startsWith(realpathSync(root) + path.sep),
    `File escaped root: ${file}`,
  );
  return candidate;
}
const bytesIdentity = (root, file) => {
  const b = readFileSync(safeFile(root, file));
  return { path: file, byteLength: b.length, sha256: sha256(b) };
};
const sourceSnapshot = (root, files) =>
  [...new Set(files)].sort().map((p) => bytesIdentity(root, p));
export function assertSnapshot(root, files) {
  for (const item of files)
    fail(
      bytesIdentity(root, item.path).sha256 === item.sha256,
      `Immutable input changed: ${item.path}`,
    );
}
export function snapshotPreparedApplication(app) {
  const entries = [];
  const visit = (directory, prefix = '') => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const name = prefix + entry.name,
        location = path.join(directory, entry.name);
      // npm ci owns this one predeclared generated directory. No other cache,
      // evidence, hidden file, source file or directory may appear before start.
      if (name === 'node_modules') {
        fail(
          entry.isDirectory() && !entry.isSymbolicLink(),
          'Prepared app node_modules must be a real directory',
        );
        continue;
      }
      fail(
        !entry.isSymbolicLink(),
        `Prepared application symlink is unsupported: ${name}`,
      );
      if (entry.isDirectory()) {
        entries.push({ path: name, kind: 'directory' });
        visit(location, name + '/');
      } else {
        fail(entry.isFile(), `Unsupported prepared application entry: ${name}`);
        const bytes = readFileSync(location);
        entries.push({
          path: name,
          kind: 'file',
          byteLength: bytes.length,
          sha256: sha256(bytes),
          executable: (lstatSync(location).mode & 0o111) !== 0,
        });
      }
    }
  };
  fail(
    lstatSync(app).isDirectory() && !lstatSync(app).isSymbolicLink(),
    'Prepared app root must be a real directory',
  );
  visit(app);
  entries.sort((a, b) => a.path.localeCompare(b.path));
  return {
    version: 1,
    ignoredGeneratedDirectories: ['node_modules'],
    identity: digest(entries),
    entries,
  };
}
export function assertPreparedApplication(builder) {
  fail(
    builder.template?.version === 1 &&
      builder.template.identity === digest(builder.template.entries),
    'Prepared application snapshot is missing or invalid',
  );
  const current = snapshotPreparedApplication(
    path.join(builder.workspace, 'app'),
  );
  fail(
    current.identity === builder.template.identity,
    `Prepared application tree changed for ${builder.metadata.builder}; added, removed or edited inputs require a new equal preparation`,
  );
}
function hostSettings() {
  const home = process.env.CODEX_HOME ?? path.join(os.homedir(), '.codex');
  return Object.fromEntries(
    ['config.toml', 'AGENTS.md', 'instructions.md'].map((p) => [
      p,
      existsSync(path.join(home, p))
        ? sha256(readFileSync(path.join(home, p)))
        : null,
    ]),
  );
}
function git(repo, args, encoding = 'utf8') {
  return execFileSync('git', ['-C', repo, ...args], {
    encoding,
    maxBuffer: 64 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}
export function validatePolicy(p) {
  fail(
    p.version === 1 &&
      JSON.stringify(p.models) ===
        JSON.stringify({
          luna: 'gpt-6-luna',
          sol: 'gpt-6.1-sol',
          astra: 'gpt-6-astra',
        }),
    'Exact user-requested GPT-6 model assignment required; no downgrade',
  );
  fail(p.cliVersion === '0.164.0', 'Current qualified CLI 0.164.0 required');
  fail(
    p.effort === 'high' &&
      p.timeoutMs === null &&
      p.concurrency === 1 &&
      p.webTuningRounds === 2,
    'Matched high effort, null budget, sequential resources and two web rounds required',
  );
  fail(
    p.approvalPolicy === 'on-request' &&
      p.approvalsReviewer === 'auto_review' &&
      p.sandbox === 'workspace-write',
    'Unexpected permission policy',
  );
  fail(
    JSON.stringify(p.order) === JSON.stringify(['luna', 'sol', 'astra']),
    'Unexpected builder order',
  );
  const ports = p.order.flatMap((b) =>
    ['metro', 'proxy', 'observer'].map((k) => p.runtime[b][k]),
  );
  fail(
    ports.every((x) => Number.isInteger(x) && x > 1024 && x < 65536) &&
      new Set(ports).size === ports.length,
    'Invalid or conflicting runtime ports',
  );
  return p;
}
export function validateSharedManifest(root, manifest, policy) {
  fail(
    manifest.hashAlgorithm === 'sha256' && Array.isArray(manifest.files),
    'Malformed common input manifest',
  );
  const paths = manifest.files.map((f) => relative(f.path));
  fail(new Set(paths).size === paths.length, 'Duplicate common input');
  for (const required of policy.requiredSharedFiles)
    fail(paths.includes(required), `Common manifest omits ${required}`);
  for (const item of manifest.files) {
    const current = bytesIdentity(root, item.path);
    fail(
      current.sha256 === item.sha256 && current.byteLength === item.byteLength,
      `Common input hash mismatch: ${item.path}`,
    );
  }
  return digest(manifest.files);
}
function verifyReference(reference) {
  fail(
    reference &&
      path.isAbsolute(reference.path) &&
      /^[a-f0-9]{64}$/.test(reference.sha256),
    'Evidence reference requires absolute path and SHA256',
  );
  const bytes = readFileSync(reference.path);
  fail(
    sha256(bytes) === reference.sha256,
    `Evidence receipt hash mismatch: ${reference.path}`,
  );
  return JSON.parse(bytes);
}
export function validateGate(gate, commit, root = process.cwd()) {
  fail(
    gate.commit === commit,
    'Verification gate commit does not match published commit',
  );
  const verification = verifyReference(gate.verification);
  fail(
    verification.verificationVersion === 4 && verification.scope === 'full',
    'Current v4 full verification is required',
  );
  assertFullVerification(verification);
  assertVerificationSourceSnapshot(verification);
  fail(
    verificationSourceIdentity(gate.verifiedSources) ===
      verification.sourceIdentity &&
      digest(gate.verifiedSources) === digest(verification.sources),
    'Gate verified sources must exactly match the full verification snapshot',
  );
  const platform = verifyReference(gate.platform);
  fail(
    platform.version === 1 && platform.kind === 'relay-platform-gate',
    'Versioned spike and independent template platform evidence is required',
  );
  const spike = validateExpoProof(verifyReference(platform.spike), { root });
  const template = validateTemplateProof(verifyReference(platform.template), {
    root,
  });
  fail(
    spike.valid,
    `Current Expo spike proof failed: ${spike.failures.join('; ')}`,
  );
  fail(
    template.valid,
    `Current independent template proof failed: ${template.failures.join('; ')}`,
  );
  fail(
    typeof gate.devices?.ios === 'string' &&
      gate.devices.ios.trim().length > 0 &&
      typeof gate.devices?.android === 'string' &&
      gate.devices.android.trim().length > 0,
    'Explicit iOS simulator and Android device identities required',
  );
  validateSelector(gate.selector);
  return {
    verification,
    platform,
    platformChecks: {
      spike,
      template,
      deviceIdentityMatch:
        'unavailable: current platform producers do not record device IDs; gate device IDs configure the builder runtime',
    },
  };
}
export function validateSelector(selector) {
  fail(
    selector?.profile === 'qwen3.5-4b' &&
      selector.revision === '851bf6e806efd8d0a36b00ddf55e13ccb7b8cd0a' &&
      Array.isArray(selector.sources) &&
      selector.sources.length > 0,
    'Frozen common Qwen3.5-4B selector provenance required',
  );
  fail(
    selector.checkpoint && /^[a-f0-9]{64}$/.test(selector.checkpoint.sha256),
    'Hash-bound local selector checkpoint required',
  );
  for (const entry of [
    selector.executable,
    ...selector.sources,
    selector.checkpoint,
  ]) {
    fail(
      entry &&
        path.isAbsolute(entry.path) &&
        /^[a-f0-9]{64}$/.test(entry.sha256) &&
        lstatSync(entry.path).isFile(),
      'Selector artifacts require absolute regular files and hashes',
    );
    fail(
      hashFile(entry.path) === entry.sha256,
      `Selector artifact changed: ${entry.path}`,
    );
  }
}
const SHELL = `import React, { useState } from 'react';
import { html, css } from 'react-strict-dom';
import { Platform, useWindowDimensions } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useObservations } from './useObservations';
const styles = css.create({root: {boxSizing: 'border-box', display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 16, height: '100%', paddingInline: 20}, safe: (top, bottom) => ({paddingTop: top + 20, paddingBottom: bottom + 20}), text: {fontSize: 16, lineHeight: 1.5}, button: {boxSizing: 'border-box', minHeight: 48, maxWidth: '100%', padding: 12, borderWidth: 1, borderStyle: 'solid', borderColor: '#555', fontSize: 16, lineHeight: 1.5}});
function Shell() {
  const safeArea = useSafeAreaInsets(), viewport = useWindowDimensions(), [presses, setPresses] = useState(0);
  const bind = useObservations({phase: 'template-shell', platform: Platform.OS === 'web' ? 'web' : 'native-' + Platform.OS, viewport, safeArea, presses, sourceIdentity: process.env.EXPO_PUBLIC_DESIGN_SOURCE_HASH ?? 'unbound'});
  return <html.div data-layoutconformance="strict" ref={bind('shell-root')} style={[styles.root, styles.safe(safeArea.top, safeArea.bottom)]}><html.p ref={bind('shell-text')} style={styles.text}>Relay implementation pending</html.p><html.button data-testid="shell-button" ref={bind('shell-button')} style={styles.button} onClick={() => setPresses(presses + 1)}>Check interaction</html.button><html.p ref={bind('shell-status')} style={styles.text}>Button checks: {presses}</html.p></html.div>;
}
export default function App() { return <SafeAreaProvider><Shell /></SafeAreaProvider>; }
`;
export const COMMON_PROMPT = `Build Relay completely in app/ using the frozen product brief, shared data and licensed assets in toolkit/experiments/relay/shared/. Read BRIEF.md, DESIGN.md, TOOL-COVERAGE.md and REPORTING.md first. Read toolkit/.agents/skills/design-theory/SKILL.md and only relevant facets. These instructions are identical for all three builders; BUILDER.json records your assigned identity, exact model, pinned settings, source commit, input identity, runtime ports and native device IDs.

Actual React Native iOS and Android are primary, with Expo web for exactly two documented tuning rounds before final native validation. Use the supplied pinned Expo/RSD integration shell and adapters; it contains no Relay UI. Deliver all primary and secondary flows in the brief, current platform observations, accessible interactions, persistence and recovery. You have no wall-time deadline. Continue until the complete app and its tests/evidence/report are delivered; preserve any genuine blockers or unsupported capabilities explicitly. Do not silently reduce scope.

Use the Design Theory CLI/exported implementation from toolkit. Start with compact catalog/schema discovery, --summary --output files and hash-bound references. Reuse examples/kernels/relay-compact.json as a shared measured starting point, with new real app/native measurements as necessary. The supplied browser cells do not certify native output. Record exact tool inputs/results and selected output pointers; consume them in actual properties on all twelve named surfaces. Preserve alternatives, bounded numeric budgets, actual local System 1 selection when useful, a coupled perturbation and recipe replay. Do not call every command ceremonially. Numeric feasibility, model choices, renderer observations and synthetic critique are different evidence.

Only your assigned coding model may work on this build. Do not start subagents, other coding models or peer tasks. The toolkit's configured local 4B selector is allowed for its decision readouts; SELECTOR.json is a provenance descriptor binding the common external executable, sources and checkpoint; it is not a selector request. Use the selector schema to construct requests from the needed fields. DESIGN_SEMIF_BIN points to that executable. There is no imposed selector or builder wall-time budget; keep finite candidate domains and mathematical evaluation bounds, and retain real progress/usage. Do not alter host settings, HOME, credentials, frozen toolkit/shared sources or pinned style dependency versions. Do not inspect sibling outputs. app/ is your implementation area; keep evidence there. Use BUILDER.json's ports, unique bundle/storage namespace and explicit devices; stop your Metro/browser/observer processes at completion and record every runtime child in app/evidence/runtime-processes.json. Native iOS/Android runs must be sequential. The orchestrator holds an exclusive runtime/selector lease for your entire run.

Produce app/BUILD-REPORT.md and app/build-report.json exactly as REPORTING.md requests, including wins, misses, tool friction, improvements and candid synthetic self-critique. Include all requested functionality, failures and unsupported states. Do not estimate token use. usageReceipt is ../metrics/receipt.json. Produce app/evidence/output-bindings.json as {sources:[{identity,path}],rendererReceipts:[{ref,path,sha256}],checks:[{operation:'check',manifest,current,observations}]}; paths are relative to app/, source identities use the toolkit hash of parsed JSON, and renderer receipt identities hash saved bytes. Each observation resultRef must have a saved receipt. Each binding current.sourceIdentity must match the automatic app snapshot from node toolkit/scripts/run-relay-builders.mjs source --app app; current.designIdentity is the frozen DESIGN.md byte hash. Source locations name actual app files with optional :line suffix. See toolkit/docs/relay-experiment.md for the exact contract. Keep generated evidence under app/evidence so it does not invalidate the source snapshot. Record app/evidence/web-tuning-rounds.json as {rounds:[{round:1,changes,receipts},{round:2,changes,receipts}]}. Those files are evidence to be checked, not self-certified pass declarations. Runtime process records are {processes:[{pid,command,port,stopped}]}; write {processes:[]} explicitly if no runtime children were started.

Document fresh setup, web/native launch and proof commands. The orchestrator separately records actual app-server events and cumulative token notifications. No human preference, award quality, universal model ranking or comparative token-savings claim follows from this experiment. Finish with a concise status including any remaining limitations.
`;
function pinnedVersions(root, policy) {
  const pkg = json(path.join(root, 'package.json')),
    lock = json(path.join(root, 'package-lock.json'));
  const direct = Object.fromEntries(
    policy.pinnedPackages.map((name) => {
      const declared = pkg.dependencies?.[name] ?? pkg.devDependencies?.[name],
        resolved = lock.packages?.[`node_modules/${name}`]?.version;
      fail(
        typeof declared === 'string' &&
          /^\d+\.\d+\.\d+(?:[-+][\w.-]+)?$/.test(declared) &&
          declared === resolved,
        `Style/platform dependency must be exactly pinned and locked: ${name}`,
      );
      return [name, resolved];
    }),
  );
  const transitive = Object.fromEntries(
    Object.entries(lock.packages ?? {})
      .filter(([location]) =>
        policy.pinnedTransitivePrefixes.some((prefix) =>
          location.split('node_modules/').at(-1).startsWith(prefix),
        ),
      )
      .map(([location, entry]) => [
        `lock:${location}`,
        { version: entry.version, integrity: entry.integrity ?? null },
      ]),
  );
  return { ...direct, ...transitive };
}
export function prepareExperiment({
  repo,
  commit,
  remote = 'origin',
  ref,
  out,
  gate: gateFile,
}) {
  fail(
    /^[a-f0-9]{40}$/.test(commit) && /^refs\/heads\/[\w./-]+$/.test(ref ?? ''),
    'Explicit full commit SHA and remote branch ref required',
  );
  fail(/^[\w.-]+$/.test(remote), 'Remote must be a configured remote name');
  repo = realpathSync(repo);
  out = path.resolve(out);
  const parent = realpathSync(path.dirname(out)),
    temporaryRoots = [realpathSync(os.tmpdir()), '/private/tmp'];
  fail(
    temporaryRoots.some(
      (r) => parent === r || parent.startsWith(r + path.sep),
    ) && !existsSync(out),
    'Output must be a new private temporary directory',
  );
  fail(
    git(repo, ['rev-parse', `${commit}^{commit}`]).trim() === commit,
    'Commit not available locally',
  );
  const remoteOutput = git(repo, [
    'ls-remote',
    '--exit-code',
    remote,
    ref,
  ]).trim();
  fail(
    remoteOutput.split(/\s+/)[0] === commit &&
      remoteOutput.split(/\s+/)[1] === ref,
    'Remote branch does not match explicit commit',
  );
  const tree = git(repo, ['ls-tree', '-rz', '--full-tree', commit])
    .split('\0')
    .filter(Boolean)
    .map((entry) => {
      const [meta, p] = entry.split('\t'),
        [mode, type, oid] = meta.split(' ');
      return { path: relative(p), mode, type, oid };
    });
  const byPath = new Map(tree.map((item) => [item.path, item]));
  const read = (p) => {
    const item = byPath.get(p);
    fail(
      item?.type === 'blob' && ['100644', '100755'].includes(item.mode),
      `Published regular file missing: ${p}`,
    );
    return git(repo, ['cat-file', 'blob', item.oid], null);
  };
  const policy = validatePolicy(
    JSON.parse(read('experiments/relay/policy.json')),
  );
  const gate = json(gateFile);
  validateGate(gate, commit, repo);
  const publishedSources = verificationSourcesFromFiles(tree, read);
  fail(
    digest(gate.verifiedSources) === digest(publishedSources),
    'Verified source set or content differs from the complete published source snapshot',
  );
  const shared = JSON.parse(read(policy.sharedManifest));
  const selected = [
    ...new Set([
      ...policy.toolkitFiles,
      policy.sharedManifest,
      'experiments/relay/policy.json',
      ...shared.files.map((f) => f.path),
      ...tree
        .filter((f) =>
          policy.toolkitRoots.some((r) => f.path.startsWith(r + '/')),
        )
        .map((f) => f.path),
    ]),
  ].sort();
  for (const p of [
    'AGENTS.md',
    ...selected,
    ...policy.templateFiles.map((p) => `${policy.templateRoot}/${p}`),
  ])
    read(p);
  mkdirSync(out, { mode: 0o700 });
  save(path.join(out, 'gate.json'), gate);
  copyFileSync(gate.verification.path, path.join(out, 'verification.json'));
  copyFileSync(gate.platform.path, path.join(out, 'platform.json'));
  const builders = {};
  for (const builder of policy.order) {
    const workspace = path.join(out, builder, 'workspace'),
      toolkit = path.join(workspace, 'toolkit'),
      app = path.join(workspace, 'app');
    for (const p of selected) {
      const destination = path.join(toolkit, p);
      mkdirSync(path.dirname(destination), { recursive: true, mode: 0o700 });
      writeFileSync(destination, read(p), {
        mode: byPath.get(p).mode === '100755' ? 0o755 : 0o644,
      });
    }
    validateSharedManifest(toolkit, shared, policy);
    for (const p of policy.templateFiles) {
      const destination = path.join(app, p);
      mkdirSync(path.dirname(destination), { recursive: true });
      writeFileSync(destination, read(`${policy.templateRoot}/${p}`));
    }
    mkdirSync(path.join(app, 'src'), { recursive: true });
    writeFileSync(path.join(app, 'src/App.jsx'), SHELL);
    const inheritedSkills = selected.filter((p) =>
      p.startsWith('.agents/skills/design-theory/'),
    );
    for (const p of inheritedSkills) {
      mkdirSync(path.dirname(path.join(workspace, p)), { recursive: true });
      writeFileSync(path.join(workspace, p), read(p));
    }
    save(path.join(workspace, 'SELECTOR.json'), {
      ...gate.selector,
      wallTimeLimitMs: null,
    });
    const pinned = pinnedVersions(app, policy),
      immutable = sourceSnapshot(workspace, [
        ...selected.map((p) => `toolkit/${p}`),
        ...inheritedSkills,
        'SELECTOR.json',
      ]);
    const metadata = {
      builder,
      resolvedModel: policy.models[builder],
      effort: policy.effort,
      commit,
      inputsIdentity: digest(shared.files),
      designIdentity: shared.files.find(
        (f) => f.path === 'experiments/relay/shared/DESIGN.md',
      ).sha256,
      commonSourceIdentity: digest(immutable),
      runtime: { ...policy.runtime[builder], devices: gate.devices },
      storageNamespace: `relay-${builder}-${commit.slice(0, 12)}`,
      pinned,
      usageReceipt: '../metrics/receipt.json',
    };
    save(path.join(workspace, 'BUILDER.json'), metadata);
    writeFileSync(path.join(workspace, 'AGENTS.md'), read('AGENTS.md'));
    writeFileSync(path.join(workspace, 'PROMPT.md'), COMMON_PROMPT);
    const expo = json(path.join(app, 'app.json'));
    expo.expo.name = `Relay · ${builder}`;
    expo.expo.slug = `relay-${builder}`;
    expo.expo.ios = {
      ...expo.expo.ios,
      bundleIdentifier: metadata.runtime.bundleId,
    };
    expo.expo.android = {
      ...expo.expo.android,
      package: metadata.runtime.bundleId,
    };
    save(path.join(app, 'app.json'), expo);
    builders[builder] = {
      workspace,
      metadata,
      immutable: [
        ...immutable,
        ...sourceSnapshot(workspace, [
          'BUILDER.json',
          'AGENTS.md',
          'PROMPT.md',
        ]),
      ],
      template: snapshotPreparedApplication(app),
      state: 'prepared',
    };
  }
  fail(
    new Set(Object.values(builders).map((b) => b.metadata.commonSourceIdentity))
      .size === 1,
    'Common source identity diverged',
  );
  const run = {
    version: 1,
    preparedAt: now(),
    commit,
    remote,
    ref,
    remoteEvidence: remoteOutput,
    policy,
    policyIdentity: digest(policy),
    promptIdentity: sha256(COMMON_PROMPT),
    launcherIdentity: sha256(readFileSync(fileURLToPath(import.meta.url))),
    hostSettings: hostSettings(),
    selector: gate.selector,
    gateIdentity: digest(gate),
    builders,
    ready: false,
  };
  save(path.join(out, 'run.json'), run);
  return run;
}
function checkRun(out) {
  const run = json(path.join(out, 'run.json'));
  validatePolicy(run.policy);
  fail(
    run.policyIdentity === digest(run.policy) &&
      run.promptIdentity === sha256(COMMON_PROMPT),
    'Harness/policy changed since preparation',
  );
  fail(
    run.launcherIdentity ===
      sha256(readFileSync(fileURLToPath(import.meta.url))),
    'Launcher changed since preparation',
  );
  if (run.ready)
    fail(
      run.metricsHelperIdentity ===
        sha256(
          readFileSync(
            new URL('./design-builder-metrics.mjs', import.meta.url),
          ),
        ),
      'Metrics helper changed since qualification',
    );
  fail(
    digest(run.hostSettings) === digest(hostSettings()),
    'Host settings changed since preparation',
  );
  fail(
    run.gateIdentity === digest(json(path.join(out, 'gate.json'))),
    'Launch gate changed',
  );
  validateSelector(run.selector);
  for (const b of Object.values(run.builders)) {
    assertSnapshot(b.workspace, b.immutable);
    if (!b.actualStartedAt) assertPreparedApplication(b);
  }
  return run;
}
export function inspectQualifier(
  directory,
  model,
  expectedConfig,
  expectedCli = '0.164.0',
) {
  const receipt = json(path.join(directory, 'receipt.json')),
    invocation = json(path.join(directory, 'invocation.json')),
    resolved = json(path.join(directory, 'thread-start-result.json'));
  fail(
    receipt.wallTimeLimitMs === null &&
      receipt.timedOut === false &&
      receipt.probe === false &&
      receipt.protocolError === null &&
      receipt.configUnchanged === true &&
      receipt.configBefore === expectedConfig,
    'Qualifier transport/configuration mismatch',
  );
  fail(
    receipt.usage?.completeTurnObserved &&
      receipt.usage.notificationCount > 0 &&
      receipt.usage.reportedUsage?.total &&
      receipt.usage.regressions?.length === 0,
    'Qualifier must have completed actual usage',
  );
  fail(
    resolved.model === model &&
      resolved.thread?.model === model &&
      resolved.reasoningEffort === 'high' &&
      invocation.spec.threadStart.model === model &&
      invocation.spec.threadStart.config.model_reasoning_effort === 'high',
    'Qualifier resolved model/effort mismatch',
  );
  fail(
    resolved.thread.cliVersion === expectedCli,
    'Qualifier CLI version is not current policy version',
  );
  fail(
    sha256(readFileSync(path.join(directory, 'stdout.jsonl'))) ===
      receipt.rawSha256 &&
      sha256(readFileSync(path.join(directory, 'usage.jsonl'))) ===
        receipt.usageJournalSha256,
    'Qualifier raw evidence changed',
  );
  return {
    directory,
    model,
    receiptIdentity: sha256(readFileSync(path.join(directory, 'receipt.json'))),
    actualUsage: receipt.usage,
    cliVersion: resolved.thread.cliVersion,
    helperIdentity: invocation.helperSha256 ?? null,
    appServerArgs: invocation.spec.appServerArgs,
  };
}
async function command(file, args, cwd, log, env) {
  const fd = openSync(log, 'wx', 0o600);
  try {
    const child = spawn(file, args, {
      cwd,
      env: { ...process.env, ...env },
      stdio: ['ignore', fd, fd],
    });
    const code = await new Promise((resolve, reject) => {
      child.on('error', reject);
      child.on('close', resolve);
    });
    fail(
      code === 0,
      `Preparation command failed: ${file} ${args.join(' ')}; ${log}`,
    );
  } finally {
    closeSync(fd);
  }
}
export async function qualifyExperiment(
  out,
  receiptDirectories,
  { install = command } = {},
) {
  const run = checkRun(out),
    qualifiers = {};
  fail(!run.ready, 'Run is already qualified');
  for (const builder of run.policy.order)
    qualifiers[builder] = inspectQualifier(
      receiptDirectories[builder],
      run.policy.models[builder],
      run.hostSettings['config.toml'],
      run.policy.cliVersion,
    );
  fail(
    new Set(Object.values(qualifiers).map((q) => digest(q.appServerArgs)))
      .size === 1 &&
      new Set(Object.values(qualifiers).map((q) => q.cliVersion)).size === 1,
    'Qualifier isolation flags or CLI versions differ',
  );
  const args = qualifiers.luna.appServerArgs;
  for (const feature of ['hooks', 'plugins', 'apps', 'multi_agent', 'memories'])
    fail(
      args.some((arg, i) => arg === '--disable' && args[i + 1] === feature),
      `Qualification lacks disabled ${feature}`,
    );
  fail(
    args.some(
      (arg, i) =>
        arg === '--enable' && args[i + 1] === 'skip_host_skill_discovery',
    ),
    'Host skill discovery must be disabled',
  );
  for (const builder of run.policy.order) {
    const b = run.builders[builder],
      cache = path.join(out, builder, 'cache');
    mkdirSync(cache, { recursive: true });
    const env = {
      npm_config_cache: cache,
      EXPO_NO_TELEMETRY: '1',
      __UNSAFE_EXPO_HOME_DIRECTORY: path.join(cache, 'expo'),
      CI: '1',
    };
    for (const target of ['toolkit', 'app'])
      await install(
        'npm',
        ['ci', '--no-audit', '--no-fund'],
        path.join(b.workspace, target),
        path.join(out, builder, `${target}-install.log`),
        env,
      );
    await install(
      'npm',
      ['run', 'build'],
      path.join(b.workspace, 'toolkit'),
      path.join(out, builder, 'toolkit-build.log'),
      env,
    );
    pinnedVersions(path.join(b.workspace, 'app'), run.policy);
    assertSnapshot(b.workspace, b.immutable);
    assertPreparedApplication(b);
    const emitted = path.join(b.workspace, 'toolkit/dist');
    fail(
      existsSync(path.join(emitted, 'cli.js')) &&
        existsSync(path.join(emitted, 'output-bindings.js')),
      'Toolkit build did not emit required runtime',
    );
    const emittedFiles = [];
    const visit = (dir, prefix = 'toolkit/dist/') => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (entry.isDirectory())
          visit(path.join(dir, entry.name), prefix + entry.name + '/');
        else emittedFiles.push(prefix + entry.name);
      }
    };
    visit(emitted);
    b.immutable.push(...sourceSnapshot(b.workspace, emittedFiles));
    b.state = 'qualified';
  }
  fail(
    digest(run.hostSettings) === digest(hostSettings()),
    'Qualification changed host settings',
  );
  for (const b of Object.values(run.builders)) assertPreparedApplication(b);
  run.qualifiers = qualifiers;
  run.qualifiedAt = now();
  run.ready = true;
  run.metricsHelperIdentity = sha256(
    readFileSync(new URL('./design-builder-metrics.mjs', import.meta.url)),
  );
  run.qualifierHelperDifferences = Object.fromEntries(
    Object.entries(qualifiers).map(([name, q]) => [
      name,
      {
        qualifier: q.helperIdentity,
        current: run.metricsHelperIdentity,
        changed: q.helperIdentity !== run.metricsHelperIdentity,
      },
    ]),
  );
  save(path.join(out, 'run.json'), run);
  return run;
}
export function buildSessionSpec(run, builder) {
  const b = run.builders[builder];
  fail(b && run.ready, 'Unknown builder or unqualified run');
  return {
    cwd: b.workspace,
    prompt: COMMON_PROMPT,
    timeoutMs: null,
    interruptGraceMs: 5000,
    appServerArgs: run.qualifiers[builder].appServerArgs,
    threadStart: {
      model: run.policy.models[builder],
      serviceTier: run.policy.serviceTier,
      approvalPolicy: run.policy.approvalPolicy,
      approvalsReviewer: run.policy.approvalsReviewer,
      sandbox: run.policy.sandbox,
      config: {
        model_reasoning_effort: 'high',
        sandbox_workspace_write: {
          network_access: true,
          writable_roots: [path.join(path.dirname(b.workspace), 'cache')],
          exclude_slash_tmp: true,
          exclude_tmpdir_env_var: true,
        },
      },
    },
    turnStart: { effort: 'high' },
  };
}
export function validateResolvedThread(resolved, run, builder) {
  fail(
    resolved.model === run.policy.models[builder] &&
      resolved.thread?.model === run.policy.models[builder] &&
      resolved.thread?.cliVersion === run.policy.cliVersion &&
      resolved.reasoningEffort === 'high' &&
      resolved.serviceTier === run.policy.serviceTier &&
      resolved.approvalsReviewer === 'auto_review' &&
      resolved.approvalPolicy === 'on-request' &&
      resolved.sandbox?.type === 'workspaceWrite',
    'Actual model/settings differ from assigned builder; no builder turn may start',
  );
  const workspace = run.builders[builder].workspace,
    cache = path.join(path.dirname(workspace), 'cache');
  const canonicalPath = (value) => {
    fail(
      typeof value === 'string' && path.isAbsolute(value),
      'Resolved permission paths must be absolute',
    );
    return realpathSync(value);
  };
  const exactPaths = (actual, expected) => {
    fail(Array.isArray(actual), 'Resolved workspace roots are missing');
    const normalized = actual.map(canonicalPath).sort();
    return (
      new Set(normalized).size === normalized.length &&
      digest(normalized) === digest(expected.map(canonicalPath).sort())
    );
  };
  fail(
    canonicalPath(resolved.cwd) === canonicalPath(workspace) &&
      canonicalPath(resolved.thread.cwd) === canonicalPath(workspace),
    'Resolved cwd differs from assigned workspace',
  );
  fail(
    exactPaths(resolved.runtimeWorkspaceRoots, [workspace, cache]),
    'Resolved runtime workspace roots differ from exact allowed roots',
  );
  fail(
    exactPaths(resolved.sandbox.writableRoots, [cache]),
    'Resolved additional writable roots differ from private cache',
  );
  fail(
    resolved.sandbox.networkAccess === true &&
      resolved.sandbox.excludeSlashTmp === true &&
      resolved.sandbox.excludeTmpdirEnvVar === true,
    'Resolved network or temporary-directory permissions differ from contract',
  );
  fail(
    resolved.activePermissionProfile == null,
    'An active permission profile requires a separately verified exact contract',
  );
  if (resolved.thread.environments !== undefined) {
    fail(
      Array.isArray(resolved.thread.environments) &&
        resolved.thread.environments.length === 1,
      'Unexpected additional runtime environment',
    );
    const environment = resolved.thread.environments[0];
    fail(
      environment.environmentId === 'local' &&
        canonicalPath(environment.cwd) === canonicalPath(workspace) &&
        exactPaths(environment.runtimeWorkspaceRoots, [workspace, cache]),
      'Resolved local environment differs from assigned workspace',
    );
  }
}
export async function extractToolTrace(rawFile) {
  const calls = new Map(),
    reroutes = [];
  let line = 0;
  for await (const text of createInterface({
    input: createReadStream(rawFile),
    crlfDelay: Infinity,
  })) {
    line++;
    if (!text.trim()) continue;
    let event;
    try {
      event = JSON.parse(text);
    } catch {
      return {
        calls: [...calls.values()],
        reroutes,
        malformedLine: line,
        complete: false,
      };
    }
    if (event.method === 'model/rerouted')
      reroutes.push({ line, ...event.params });
    if (!['item/started', 'item/completed'].includes(event.method)) continue;
    const p = event.params,
      item = p?.item;
    if (
      !item ||
      ![
        'commandExecution',
        'mcpToolCall',
        'dynamicToolCall',
        'webSearch',
        'fileChange',
        'collabAgentToolCall',
      ].includes(item.type)
    )
      continue;
    const key = `${p.threadId}:${p.turnId}:${item.id}`,
      previous = calls.get(key);
    calls.set(key, {
      ...previous,
      threadId: p.threadId,
      turnId: p.turnId,
      id: item.id,
      type: item.type,
      startedLine: previous?.startedLine ?? line,
      lastLine: line,
      completed: event.method === 'item/completed',
      item,
      eventSha256: sha256(text),
    });
  }
  return {
    calls: [...calls.values()],
    reroutes,
    complete: true,
    limits:
      'Observed app-server items only. A successful shell command is not proof that every nested toolkit output influenced the app.',
  };
}
export function acquireLease(file, owner) {
  const fd = openSync(file, 'wx', 0o600);
  const lease = {
    ...owner,
    pid: process.pid,
    acquiredAt: now(),
    state: 'held',
  };
  try {
    writeFileSync(fd, JSON.stringify(lease));
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  const assertOwner = () => {
    fail(
      json(file).pid === process.pid &&
        json(file).run === owner.run &&
        json(file).acquiredAt === lease.acquiredAt,
      'Lease ownership changed',
    );
  };
  return {
    release(proof) {
      assertOwner();
      fail(
        proof?.confirmedEmpty === true,
        'Confirmed runtime cleanup required before lease release',
      );
      unlinkSync(file);
    },
    retain(proof) {
      assertOwner();
      save(file, {
        ...lease,
        state: 'cleanup-blocked',
        cleanup: proof,
        retainedAt: now(),
      });
    },
  };
}
async function portsFree(runtime) {
  for (const key of ['metro', 'proxy', 'observer'])
    for (const host of ['127.0.0.1', '::1'])
      await new Promise((resolve, reject) => {
        const server = net.createServer();
        server.once('error', reject);
        server.listen(runtime[key], host, () => server.close(resolve));
      });
}
function processAbsent(pid) {
  try {
    process.kill(pid, 0);
    return false;
  } catch (error) {
    return error.code === 'ESRCH';
  }
}
export async function verifyRuntimeCleanup(out, run) {
  const failures = [],
    observations = [];
  for (const [builder, b] of Object.entries(run.builders)) {
    try {
      await portsFree(b.metadata.runtime);
      observations.push({ builder, reservedPortsFree: true });
    } catch (error) {
      failures.push(
        `${builder}: reserved runtime ports are not clear: ${error}`,
      );
    }
    if (!b.startedAt) continue;
    const output = path.join(out, builder, 'metrics');
    try {
      const metrics = json(path.join(output, 'receipt.json')),
        cleanup = metrics.processCleanup;
      fail(cleanup, 'Recorder process cleanup receipt is missing');
      fail(
        (cleanup.groupId === null && cleanup.confirmedEmpty === true) ||
          (Number.isSafeInteger(cleanup.groupId) &&
            cleanup.groupId > 1 &&
            processAbsent(-cleanup.groupId)),
        'Owned process group still exists or is unknown',
      );
      observations.push({ builder, ownedProcessCleanup: cleanup });
      const manifestPath = path.join(
        b.workspace,
        'app/evidence/runtime-processes.json',
      );
      if (existsSync(manifestPath)) {
        const manifest = json(manifestPath);
        fail(
          Array.isArray(manifest.processes),
          'Malformed runtime process manifest',
        );
        for (const item of manifest.processes) {
          fail(
            Number.isSafeInteger(item.pid) && item.pid > 1,
            'Runtime process record requires a real PID',
          );
          fail(
            processAbsent(item.pid),
            `Declared runtime PID ${item.pid} is still present or its absence is unknown`,
          );
        }
        observations.push({
          builder,
          declaredRuntimePidsAbsent: manifest.processes.map((p) => p.pid),
        });
      } else {
        const trace = await extractToolTrace(path.join(output, 'stdout.jsonl'));
        fail(
          trace.complete && trace.calls.length === 0,
          'Tool execution requires a runtime process manifest, including an explicit empty list when no external runtime was started',
        );
        observations.push({
          builder,
          noRuntimeManifestNeeded:
            'Complete recorder trace contains no tool items',
        });
      }
    } catch (error) {
      failures.push(`${builder}: ${error}`);
    }
  }
  return {
    checkedAt: now(),
    confirmedEmpty: failures.length === 0,
    failures,
    observations,
    scope:
      'Recorder-owned process groups, declared runtime PIDs, and all reserved IPv4/IPv6 ports. No authentication of declarations or discovery of unreported detached processes.',
  };
}
export async function cleanupExperiment(
  out,
  { leaseFile = '/private/tmp/design-theory-relay-resources.lock' } = {},
) {
  out = realpathSync(out);
  const lease = json(leaseFile);
  fail(
    lease.run === out && lease.state === 'cleanup-blocked',
    "Only this run's explicitly retained cleanup lease may be inspected for release",
  );
  const run = json(path.join(out, 'run.json'));
  const proof = await verifyRuntimeCleanup(out, run);
  save(path.join(out, 'cleanup.json'), proof);
  run.resourceCleanup = proof;
  save(path.join(out, 'run.json'), run);
  // This operation never signals a process or forcibly takes a live lease.
  fail(
    digest(json(leaseFile)) === digest(lease),
    'Lease changed during cleanup inspection',
  );
  if (proof.confirmedEmpty) unlinkSync(leaseFile);
  else save(leaseFile, { ...lease, cleanup: proof, retainedAt: now() });
  return { leaseReleased: proof.confirmedEmpty, cleanup: proof };
}
export function snapshotApplication(app) {
  app = realpathSync(app);
  const files = [];
  const excluded = new Set([
    'node_modules',
    'evidence',
    'dist',
    'web-build',
    '.expo',
    'build',
    'Pods',
    '.gradle',
    '.cxx',
    '.git',
  ]);
  const visit = (directory, prefix = '') => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (
        excluded.has(entry.name) ||
        ['.DS_Store', 'BUILD-REPORT.md', 'build-report.json'].includes(
          entry.name,
        )
      )
        continue;
      const p = prefix + entry.name;
      fail(
        !entry.isSymbolicLink(),
        `Application source symlink is unsupported: ${p}`,
      );
      if (entry.isDirectory()) visit(path.join(directory, entry.name), p + '/');
      else if (entry.isFile()) files.push(p);
    }
  };
  visit(app);
  const sources = sourceSnapshot(app, files);
  return {
    identity: digest(sources),
    files: sources,
    scope:
      'Current application files excluding dependency/build/cache/evidence directories and the two final reports; no renderer execution claim.',
  };
}
export async function inspectOutputs(b, policy) {
  const app = path.join(b.workspace, 'app'),
    missing = [],
    reportPath = path.join(app, 'build-report.json');
  for (const file of [
    'BUILD-REPORT.md',
    'build-report.json',
    'evidence/output-bindings.json',
    'evidence/web-tuning-rounds.json',
    'evidence/runtime-processes.json',
  ])
    if (!existsSync(path.join(app, file))) missing.push(file);
  let bindingChecks = [],
    report = null,
    rounds = null,
    processes = null;
  if (existsSync(reportPath)) {
    report = json(reportPath);
    for (const field of [
      'builder',
      'resolvedModel',
      'commit',
      'inputsIdentity',
      'platformEvidence',
      'flows',
      'toolInfluence',
      'replay',
      'wins',
      'misses',
      'improvements',
      'selfCritique',
      'unsupported',
      'knownFailures',
      'usageReceipt',
    ])
      if (!Object.hasOwn(report, field)) missing.push(`report.${field}`);
    for (const field of [
      'builder',
      'resolvedModel',
      'commit',
      'inputsIdentity',
    ])
      if (report[field] !== b.metadata[field])
        missing.push(`report.${field}:identity-mismatch`);
  }
  if (existsSync(path.join(app, 'evidence/output-bindings.json'))) {
    const input = json(path.join(app, 'evidence/output-bindings.json'));
    const { checkOutputBindings, resolveOutputBindings } = await import(
      pathToFileURL(path.join(b.workspace, 'toolkit/dist/output-bindings.js'))
    );
    const { hash } = await import(
      pathToFileURL(path.join(b.workspace, 'toolkit/dist/identity.js'))
    );
    fail(
      Array.isArray(input.checks) && input.checks.length > 0,
      'Expected executable output binding checks',
    );
    fail(
      Array.isArray(input.sources) && Array.isArray(input.rendererReceipts),
      'Binding sources and renderer receipt files required',
    );
    const sources = new Map(
      input.sources.map((source) => {
        const value = json(safeFile(app, source.path));
        fail(
          hash(value) === source.identity,
          'Binding source JSON payload changed',
        );
        return [source.identity, value];
      }),
    );
    const receipts = new Map(
      input.rendererReceipts.map((receipt) => {
        fail(
          sha256(readFileSync(safeFile(app, receipt.path))) === receipt.sha256,
          'Renderer receipt bytes changed',
        );
        return [receipt.ref, receipt];
      }),
    );
    const currentSource = snapshotApplication(app);
    bindingChecks = input.checks.map((check) => {
      fail(
        check.current.sourceIdentity === currentSource.identity &&
          check.current.designIdentity === b.metadata.designIdentity,
        'Binding source/design is not current application source',
      );
      fail(
        sources.has(check.manifest.sourceValueIdentity),
        'Binding has no saved selected source JSON',
      );
      const projected = resolveOutputBindings({
        operation: 'resolve',
        current: check.current,
        source: {
          value: sources.get(check.manifest.sourceValueIdentity),
          identity: check.manifest.sourceValueIdentity,
        },
        bindings: check.manifest.entries.map(
          ({ expected: _, ...binding }) => binding,
        ),
      });
      fail(
        digest(projected.entries) === digest(check.manifest.entries),
        'Binding expectations differ from saved selected source',
      );
      for (const observation of check.observations)
        fail(
          receipts.has(observation.resultRef),
          'Observation has no hash-checked saved renderer receipt',
        );
      for (const binding of check.manifest.entries)
        safeFile(app, binding.target.sourceLocation.replace(/:\d+$/, ''));
      return {
        result: checkOutputBindings(check),
        targets: check.manifest.entries.map((binding) => ({
          surface: binding.target.surface,
          platform: binding.platform,
        })),
      };
    });
    for (const platform of policy.platforms)
      for (const surface of policy.requiredSurfaces)
        if (
          !bindingChecks.some(
            (check) =>
              check.result.verified &&
              check.targets.some(
                (t) => t.platform === platform && t.surface === surface,
              ),
          )
        )
          missing.push(`binding:${platform}:${surface}`);
  }
  if (existsSync(path.join(app, 'evidence/web-tuning-rounds.json'))) {
    rounds = json(path.join(app, 'evidence/web-tuning-rounds.json'));
    if (JSON.stringify(rounds.rounds?.map((r) => r.round)) !== '[1,2]')
      missing.push('exactly-two-web-rounds');
  }
  if (existsSync(path.join(app, 'evidence/runtime-processes.json'))) {
    processes = json(path.join(app, 'evidence/runtime-processes.json'));
    if (
      !Array.isArray(processes.processes) ||
      processes.processes.some((p) => !p.stopped)
    )
      missing.push('runtime-process-disposal');
  }
  return {
    missing,
    report,
    bindingChecks,
    rounds,
    processes,
    claimsVerified: false,
    scope:
      'Report presence and executable binding consistency only. Independent functional/render/native evidence review remains required.',
  };
}
export async function runBuilders(
  out,
  selection,
  {
    authorize = false,
    session = recordSession,
    sessionOptions = {},
    leaseFile = '/private/tmp/design-theory-relay-resources.lock',
  } = {},
) {
  fail(
    authorize,
    'Explicit run authorization required; prepare/qualify never starts a builder',
  );
  out = realpathSync(out);
  let run = checkRun(out);
  fail(run.ready, 'Experiment is not qualified');
  fail(
    !existsSync(path.join(out, 'cancel-request.json')),
    'Experiment has a cancellation request; prepare a new run or inspect it explicitly',
  );
  const builders = selection === 'all' ? run.policy.order : [selection];
  fail(
    builders.every((b) => run.builders[b]?.state === 'qualified'),
    'Builder must be qualified and not previously run',
  );
  const lease = acquireLease(leaseFile, {
    run: out,
    resources: ['coding-model', 'local-selector', 'ios', 'android'],
  });
  const controller = new AbortController(),
    cancel = () => controller.abort();
  process.once('SIGINT', cancel);
  process.once('SIGTERM', cancel);
  const timer = setInterval(() => {
    if (existsSync(path.join(out, 'cancel-request.json'))) controller.abort();
  }, 250);
  try {
    for (const builder of builders) {
      if (controller.signal.aborted) break;
      run = checkRun(out);
      const b = run.builders[builder];
      await portsFree(b.metadata.runtime);
      fail(
        digest(pinnedVersions(path.join(b.workspace, 'app'), run.policy)) ===
          digest(b.metadata.pinned),
        'Pinned app dependencies changed',
      );
      b.state = 'starting';
      b.startedAt = now();
      save(path.join(out, 'run.json'), run);
      const output = path.join(out, builder, 'metrics'),
        spec = buildSessionSpec(run, builder);
      const cache = path.join(out, builder, 'cache');
      mkdirSync(path.join(cache, 'tmp'), { recursive: true });
      let metrics = null,
        error = null,
        evidence = null,
        trace = null;
      try {
        metrics = await session(spec, output, {
          ...sessionOptions,
          signal: controller.signal,
          validateThreadStart: (resolved) => {
            validateResolvedThread(resolved, run, builder);
            assertSnapshot(b.workspace, b.immutable);
            assertPreparedApplication(b);
          },
          onTurnStarted: ({ threadId, turnId }) => {
            fail(!b.actualStartedAt, 'Duplicate actual turn start callback');
            b.actualStartedAt = now();
            b.threadId = threadId;
            b.turnId = turnId;
            b.state = 'running';
            save(path.join(out, 'run.json'), run);
          },
          env: {
            npm_config_cache: cache,
            TMPDIR: path.join(cache, 'tmp'),
            EXPO_NO_TELEMETRY: '1',
            __UNSAFE_EXPO_HOME_DIRECTORY: path.join(out, builder, 'cache/expo'),
            CI: '1',
            DESIGN_SEMIF_BIN: run.selector.executable.path,
          },
        });
        const resolved = json(path.join(output, 'thread-start-result.json'));
        validateResolvedThread(resolved, run, builder);
        fail(
          !metrics.usage?.turnId || b.actualStartedAt,
          'Actual turn was not recorded by the start callback',
        );
        assertSnapshot(b.workspace, b.immutable);
        fail(
          metrics.configUnchanged &&
            digest(hostSettings()) === digest(run.hostSettings),
          'Host settings changed during builder',
        );
        fail(
          digest(pinnedVersions(path.join(b.workspace, 'app'), run.policy)) ===
            digest(b.metadata.pinned),
          'Pinned app dependency changed during builder',
        );
        trace = await extractToolTrace(path.join(output, 'stdout.jsonl'));
        fail(
          trace.complete &&
            trace.reroutes.length === 0 &&
            !trace.calls.some((c) => c.type === 'collabAgentToolCall'),
          'Model reroute, delegation or incomplete tool trace',
        );
        fail(
          metrics.wallTimeLimitMs === null &&
            !metrics.timedOut &&
            !metrics.protocolError &&
            metrics.usage?.reportedUsage &&
            metrics.usage.regressions.length === 0,
          'Missing or invalid actual usage/transport',
        );
        evidence = await inspectOutputs(b, run.policy);
      } catch (e) {
        error = String(e);
      }
      // Run these even when transport, parsing or cancellation failed earlier.
      try {
        assertSnapshot(b.workspace, b.immutable);
        if (!b.actualStartedAt) assertPreparedApplication(b);
        validateSelector(run.selector);
        fail(
          digest(hostSettings()) === digest(run.hostSettings),
          'Host settings changed during builder',
        );
      } catch (e) {
        error = [error, String(e)].filter(Boolean).join('; ');
      }
      const cleanup = await verifyRuntimeCleanup(out, run);
      if (!cleanup.confirmedEmpty)
        error = [error, ...cleanup.failures].filter(Boolean).join('; ');
      b.finishedAt = now();
      b.state = controller.signal.aborted
        ? 'cancelled'
        : error
          ? 'infrastructure-failure'
          : metrics?.usage.completeTurnObserved
            ? 'completed-needs-review'
            : 'incomplete';
      const receipt = {
        builder,
        model: b.metadata.resolvedModel,
        commit: run.commit,
        inputsIdentity: b.metadata.inputsIdentity,
        commonSourceIdentity: b.metadata.commonSourceIdentity,
        startedAt: b.startedAt,
        actualStartedAt: b.actualStartedAt ?? null,
        finishedAt: b.finishedAt,
        state: b.state,
        error,
        metrics,
        evidence,
        trace,
        cleanup,
        hostSettingsAfter: hostSettings(),
      };
      save(path.join(out, builder, 'builder-receipt.json'), receipt);
      if (trace) save(path.join(out, builder, 'tool-trace.json'), trace);
      save(path.join(out, 'run.json'), run);
      if (error || controller.signal.aborted) break;
    }
  } finally {
    clearInterval(timer);
    process.removeListener('SIGINT', cancel);
    process.removeListener('SIGTERM', cancel);
    let proof;
    try {
      proof = await verifyRuntimeCleanup(out, run);
    } catch (error) {
      proof = {
        checkedAt: now(),
        confirmedEmpty: false,
        failures: [String(error)],
      };
    }
    save(path.join(out, 'cleanup.json'), proof);
    run.resourceCleanup = proof;
    save(path.join(out, 'run.json'), run);
    if (proof.confirmedEmpty) lease.release(proof);
    else lease.retain(proof);
  }
  return statusExperiment(out);
}
export function statusExperiment(out) {
  const run = json(path.join(out, 'run.json'));
  return {
    commit: run.commit,
    ready: run.ready,
    models: run.policy.models,
    sequential: true,
    resourceCleanup: run.resourceCleanup ?? null,
    builders: Object.fromEntries(
      Object.entries(run.builders).map(([name, b]) => {
        const latest = path.join(out, name, 'metrics/usage-latest.json');
        return [
          name,
          {
            state: b.state,
            startedAt: b.startedAt ?? null,
            actualStartedAt: b.actualStartedAt ?? null,
            finishedAt: b.finishedAt ?? null,
            usage: existsSync(latest) ? json(latest) : null,
          },
        ];
      }),
    ),
  };
}
function options(args) {
  const result = {};
  for (let i = 0; i < args.length; i++) {
    fail(args[i].startsWith('--'), 'Expected --option');
    const key = args[i].slice(2);
    result[key] = ['authorize'].includes(key) ? true : args[++i];
  }
  return result;
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const [commandName, ...args] = process.argv.slice(2),
    o = options(args);
  let result;
  if (commandName === 'prepare')
    result = prepareExperiment({
      repo: o.repo ?? process.cwd(),
      commit: o.commit,
      remote: o.remote ?? 'origin',
      ref: o.ref,
      out: o.out,
      gate: o.gate,
    });
  else if (commandName === 'qualify')
    result = await qualifyExperiment(path.resolve(o.run), json(o.receipts));
  else if (commandName === 'run')
    result = await runBuilders(path.resolve(o.run), o.builder ?? 'all', {
      authorize: o.authorize === true,
    });
  else if (commandName === 'status')
    result = statusExperiment(path.resolve(o.run));
  else if (commandName === 'cleanup')
    result = await cleanupExperiment(path.resolve(o.run));
  else if (commandName === 'source') {
    const app = path.resolve(o.app),
      snapshot = snapshotApplication(app),
      output = o.output
        ? path.resolve(o.output)
        : path.join(app, 'evidence/source-manifest.json');
    save(output, snapshot);
    result = {
      identity: snapshot.identity,
      fileCount: snapshot.files.length,
      manifest: output,
    };
  } else if (commandName === 'cancel') {
    save(path.join(path.resolve(o.run), 'cancel-request.json'), {
      requestedAt: now(),
      reason: o.reason ?? 'operator requested cancellation',
    });
    result = { cancellationRequested: true };
  } else
    throw Error(
      'prepare --commit SHA --ref refs/heads/BRANCH --out NEW_DIR --gate JSON | qualify --run DIR --receipts JSON | run --run DIR --builder luna|sol|astra|all --authorize | status --run DIR | cancel --run DIR | cleanup --run DIR',
    );
  console.log(
    JSON.stringify(
      commandName === 'prepare' || commandName === 'qualify'
        ? {
            commit: result.commit,
            ready: result.ready,
            builders: Object.keys(result.builders),
          }
        : result,
      null,
      2,
    ),
  );
}
