import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  existsSync,
  rmSync,
} from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import os from 'node:os';
import { recordSession } from '../scripts/design-builder-metrics.mjs';
import { currentFullVerificationStages } from '../scripts/evidence-policy.mjs';
import { createExpoGateFixture } from './fixtures/expo-gate.mjs';
import {
  snapshotVerificationSources,
  verificationSourceFields,
} from '../scripts/verification-sources.mjs';
import {
  sha256,
  COMMON_PROMPT,
  validatePolicy,
  prepareExperiment,
  qualifyExperiment,
  buildSessionSpec,
  inspectQualifier,
  assertSnapshot,
  extractToolTrace,
  acquireLease,
  runBuilders,
  snapshotApplication,
  validateSelector,
  validateResolvedThread,
  snapshotPreparedApplication,
  assertPreparedApplication,
  cleanupExperiment,
  validateGate,
} from '../scripts/run-relay-builders.mjs';

const write = (p, value) => {
  mkdirSync(path.dirname(p), { recursive: true });
  writeFileSync(p, typeof value === 'string' ? value : JSON.stringify(value));
};
const read = (p) => JSON.parse(readFileSync(p, 'utf8'));
const git = (cwd, ...args) =>
  execFileSync('git', ['-C', cwd, ...args], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
const policyPath = new URL('../experiments/relay/policy.json', import.meta.url);
const fakeInstall = async (_file, args, cwd) => {
  if (args[0] === 'run') {
    write(path.join(cwd, 'dist/cli.js'), '// synthetic toolkit build');
    write(
      path.join(cwd, 'dist/output-bindings.js'),
      '// synthetic toolkit build',
    );
  }
};
// Every model/usage value below is a synthetic protocol fixture, not measured model usage.
function fixture() {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'relay-harness-test-')),
    repo = path.join(dir, 'repo'),
    remote = path.join(dir, 'remote.git'),
    out = path.join(dir, 'prepared');
  mkdirSync(repo);
  mkdirSync(remote);
  git(repo, 'init', '--initial-branch=main');
  git(remote, 'init', '--bare');
  const policy = JSON.parse(readFileSync(policyPath));
  policy.toolkitRoots = ['src', '.agents/skills/design-theory'];
  policy.toolkitFiles = ['package.json', 'package-lock.json'];
  policy.templateFiles = [
    'package.json',
    'package-lock.json',
    'app.json',
    'index.js',
  ];
  const files = policy.requiredSharedFiles.map((p) => {
    const bytes = Buffer.from(
      p.endsWith('.json') ? '{}' : `Synthetic test ${p}`,
    );
    write(path.join(repo, p), bytes.toString());
    return { path: p, byteLength: bytes.length, sha256: sha256(bytes) };
  });
  write(path.join(repo, policy.sharedManifest), {
    hashAlgorithm: 'sha256',
    files,
  });
  write(path.join(repo, 'src/stub.ts'), 'export const synthetic = true;');
  write(
    path.join(repo, '.agents/skills/design-theory/SKILL.md'),
    '# Synthetic test skill',
  );
  write(
    path.join(repo, 'AGENTS.md'),
    '# Synthetic inherited repository instructions',
  );
  write(path.join(repo, 'package.json'), {
    name: 'synthetic-test',
    scripts: { build: 'true' },
  });
  write(path.join(repo, 'package-lock.json'), {});
  const dependencies = Object.fromEntries(
    policy.pinnedPackages.map((p) => [p, '1.0.0']),
  );
  write(path.join(repo, policy.templateRoot, 'package.json'), { dependencies });
  write(path.join(repo, policy.templateRoot, 'package-lock.json'), {
    packages: Object.fromEntries(
      policy.pinnedPackages.map((p) => [
        `node_modules/${p}`,
        { version: '1.0.0' },
      ]),
    ),
  });
  write(path.join(repo, policy.templateRoot, 'app.json'), { expo: {} });
  write(
    path.join(repo, policy.templateRoot, 'index.js'),
    'import App from "./src/App";',
  );
  write(
    path.join(repo, policy.templateRoot, 'src/App.jsx'),
    'DO NOT COPY READY PRODUCT UI',
  );
  write(path.join(repo, 'experiments/relay/policy.json'), policy);
  const platformFixture = createExpoGateFixture(repo, policy);
  git(repo, 'add', '.');
  git(
    repo,
    '-c',
    'user.name=Test',
    '-c',
    'user.email=test@example.invalid',
    'commit',
    '-m',
    'Synthetic harness fixture',
  );
  git(repo, 'remote', 'add', 'origin', remote);
  git(repo, 'push', 'origin', 'main');
  const commit = git(repo, 'rev-parse', 'HEAD');
  const stages = currentFullVerificationStages;
  const sources = snapshotVerificationSources(repo);
  const verificationPath = path.join(dir, 'verification.json'),
    platformPath = path.join(dir, 'platform.json');
  write(verificationPath, {
    verificationVersion: 4,
    scope: 'full',
    complete: true,
    passed: true,
    expectedStages: stages.length,
    results: stages.map((name) => ({ name, code: 0 })),
    ...verificationSourceFields(sources, sources),
  });
  write(platformPath, platformFixture.envelope);
  const gatePath = path.join(dir, 'gate.json');
  write(gatePath, {
    commit,
    verification: {
      path: verificationPath,
      sha256: sha256(readFileSync(verificationPath)),
    },
    platform: {
      path: platformPath,
      sha256: sha256(readFileSync(platformPath)),
    },
    verifiedSources: sources,
    devices: { ios: 'synthetic-simulator', android: 'synthetic-emulator' },
  });
  const executable = path.join(dir, 'synthetic-selector.sh'),
    checkpoint = path.join(dir, 'synthetic-weights.txt');
  write(executable, '# Synthetic test only; never executed');
  write(checkpoint, 'Synthetic fixture, not model weights');
  const gate = read(gatePath);
  gate.selector = {
    profile: 'qwen3.5-4b',
    revision: '851bf6e806efd8d0a36b00ddf55e13ccb7b8cd0a',
    executable: { path: executable, sha256: sha256(readFileSync(executable)) },
    sources: [{ path: executable, sha256: sha256(readFileSync(executable)) }],
    checkpoint: { path: checkpoint, sha256: sha256(readFileSync(checkpoint)) },
  };
  write(gatePath, gate);
  const prepare = () =>
    prepareExperiment({
      repo,
      commit,
      ref: 'refs/heads/main',
      out,
      gate: gatePath,
    });
  return { dir, repo, out, commit, policy, gatePath, prepare, platformFixture };
}
function qualifiers(f, run) {
  const args = [
    '--disable',
    'hooks',
    '--disable',
    'plugins',
    '--disable',
    'apps',
    '--disable',
    'multi_agent',
    '--disable',
    'memories',
    '--enable',
    'skip_host_skill_discovery',
  ];
  return Object.fromEntries(
    run.policy.order.map((builder) => {
      const directory = path.join(f.dir, 'qualifiers', builder);
      mkdirSync(directory, { recursive: true });
      const model = run.policy.models[builder];
      write(path.join(directory, 'stdout.jsonl'), '{"synthetic":true}\n');
      write(path.join(directory, 'usage.jsonl'), '{"synthetic":true}\n');
      write(path.join(directory, 'receipt.json'), {
        wallTimeLimitMs: null,
        timedOut: false,
        probe: false,
        protocolError: null,
        configUnchanged: true,
        configBefore: run.hostSettings['config.toml'],
        usage: {
          completeTurnObserved: true,
          notificationCount: 1,
          reportedUsage: { total: { inputTokens: 10 } },
          regressions: [],
        },
        rawSha256: sha256(readFileSync(path.join(directory, 'stdout.jsonl'))),
        usageJournalSha256: sha256(
          readFileSync(path.join(directory, 'usage.jsonl')),
        ),
      });
      write(path.join(directory, 'invocation.json'), {
        spec: {
          threadStart: { model, config: { model_reasoning_effort: 'high' } },
          appServerArgs: args,
        },
      });
      write(path.join(directory, 'thread-start-result.json'), {
        model,
        reasoningEffort: 'high',
        thread: { model, cliVersion: run.policy.cliVersion },
      });
      return [builder, directory];
    }),
  );
}
test('published preparation gives identical immutable inputs and a minimal shell, not the spike UI', () => {
  const f = fixture(),
    run = f.prepare();
  assert.equal(run.ready, false);
  assert.equal(
    new Set(
      Object.values(run.builders).map((b) => b.metadata.commonSourceIdentity),
    ).size,
    1,
  );
  for (const b of Object.values(run.builders)) {
    assert.match(
      readFileSync(path.join(b.workspace, 'app/src/App.jsx'), 'utf8'),
      /implementation pending/,
    );
    assert.equal(
      readFileSync(path.join(b.workspace, 'PROMPT.md'), 'utf8'),
      COMMON_PROMPT,
    );
    assertSnapshot(b.workspace, b.immutable);
    assert.equal(existsSync(path.join(b.workspace, '.codex/auth.json')), false);
  }
});
test('prepare rejects an unpushed commit, incomplete verification and mutable shared input', () => {
  const f = fixture();
  write(path.join(f.repo, 'new.txt'), 'new');
  git(f.repo, 'add', '.');
  git(
    f.repo,
    '-c',
    'user.name=Test',
    '-c',
    'user.email=test@example.invalid',
    'commit',
    '-m',
    'unpublished',
  );
  assert.throws(
    () =>
      prepareExperiment({
        repo: f.repo,
        commit: git(f.repo, 'rev-parse', 'HEAD'),
        ref: 'refs/heads/main',
        out: f.out,
        gate: f.gatePath,
      }),
    /Remote branch/,
  );
  const gate = read(f.gatePath),
    verification = read(gate.verification.path);
  verification.complete = false;
  write(gate.verification.path, verification);
  gate.verification.sha256 = sha256(readFileSync(gate.verification.path));
  write(f.gatePath, gate);
  assert.throws(f.prepare, /Verification is incomplete/);
  const next = fixture(),
    run = next.prepare(),
    b = run.builders.luna;
  write(
    path.join(b.workspace, 'toolkit/experiments/relay/shared/BRIEF.md'),
    'tampered',
  );
  assert.throws(
    () => assertSnapshot(b.workspace, b.immutable),
    /Immutable input changed/,
  );
});
test('same exact models, null budget, high effort and permissions are enforced', async () => {
  const f = fixture(),
    run = f.prepare(),
    receipts = qualifiers(f, run);
  let installs = 0;
  const qualified = await qualifyExperiment(f.out, receipts, {
    install: async (...args) => {
      installs++;
      await fakeInstall(...args);
    },
  });
  assert.equal(installs, 9);
  for (const name of qualified.policy.order) {
    const spec = buildSessionSpec(qualified, name);
    assert.equal(spec.timeoutMs, null);
    assert.equal(spec.threadStart.model, qualified.policy.models[name]);
    assert.equal(spec.turnStart.effort, 'high');
    assert.equal(spec.threadStart.approvalsReviewer, 'auto_review');
  }
  const changed = structuredClone(run.policy);
  changed.models.luna = 'gpt-5.6-luna';
  assert.throws(() => validatePolicy(changed), /no downgrade/);
  changed.models = run.policy.models;
  changed.timeoutMs = 900000;
  assert.throws(() => validatePolicy(changed), /null budget/);
  assert.throws(
    () =>
      inspectQualifier(
        receipts.luna,
        'gpt-5.6-luna',
        run.hostSettings['config.toml'],
      ),
    /model\/effort/,
  );
});
test('qualification rejects mismatched model receipt, no usage and changed flags', async () => {
  const f = fixture(),
    run = f.prepare(),
    receipts = qualifiers(f, run),
    receipt = read(path.join(receipts.sol, 'receipt.json'));
  receipt.usage.reportedUsage = null;
  write(path.join(receipts.sol, 'receipt.json'), receipt);
  await assert.rejects(
    qualifyExperiment(f.out, receipts, { install: async () => {} }),
    /completed actual usage/,
  );
});
test('exclusive lease has no automatic stale takeover', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'relay-lease-test-')),
    file = path.join(dir, 'lease.json');
  const lease = acquireLease(file, { run: 'synthetic-test' });
  assert.throws(() => acquireLease(file, { run: 'another' }), /EEXIST/);
  assert.throws(() => lease.release(), /cleanup required/);
  lease.release({ confirmedEmpty: true });
  assert.equal(existsSync(file), false);
});
test('tool ledger records event items and reroutes without certifying nested calls', async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'relay-trace-test-')),
    file = path.join(dir, 'events.jsonl');
  write(
    file,
    [
      {
        method: 'item/started',
        params: {
          threadId: 't',
          turnId: 'u',
          item: {
            id: 'c',
            type: 'commandExecution',
            command: 'node toolkit/dist/cli.js kernel compile',
          },
        },
      },
      {
        method: 'item/completed',
        params: {
          threadId: 't',
          turnId: 'u',
          item: {
            id: 'c',
            type: 'commandExecution',
            command: 'node toolkit/dist/cli.js kernel compile',
            exitCode: 0,
          },
        },
      },
      { method: 'model/rerouted', params: { fromModel: 'a', toModel: 'b' } },
    ]
      .map(JSON.stringify)
      .join('\n') + '\n',
  );
  const trace = await extractToolTrace(file);
  assert.equal(trace.calls.length, 1);
  assert.equal(trace.calls[0].completed, true);
  assert.equal(trace.reroutes.length, 1);
  assert.equal(trace.complete, true);
});
test('real synthetic peer runs only authorized assigned builder and preserves streamed usage', async () => {
  const f = fixture(),
    run = f.prepare();
  await qualifyExperiment(f.out, qualifiers(f, run), { install: fakeInstall });
  await assert.rejects(runBuilders(f.out, 'luna'), /authorization/);
  const peer = syntheticPeer(f.dir, { complete: true });
  const status = await runBuilders(f.out, 'luna', {
    authorize: true,
    sessionOptions: { executable: process.execPath, argsPrefix: [peer] },
    leaseFile: path.join(f.dir, 'lease.json'),
  });
  assert.equal(status.builders.luna.state, 'completed-needs-review');
  assert.equal(status.builders.sol.state, 'qualified');
  const receipt = read(path.join(f.out, 'luna/builder-receipt.json'));
  assert.equal(receipt.metrics.wallTimeLimitMs, null);
  assert.equal(receipt.metrics.usage.reportedUsage.total.inputTokens, 10);
  assert.ok(receipt.evidence.missing.includes('BUILD-REPORT.md'));
  assert.equal(receipt.evidence.claimsVerified, false);
  assert.equal(existsSync(path.join(f.dir, 'lease.json')), false);
});
function responseFor(params) {
  const cache = params.config.sandbox_workspace_write.writable_roots[0];
  return {
    model: params.model,
    cwd: params.cwd,
    runtimeWorkspaceRoots: [params.cwd, cache],
    thread: {
      id: 't',
      model: params.model,
      cliVersion: '0.164.0',
      cwd: params.cwd,
    },
    reasoningEffort: 'high',
    serviceTier: 'default',
    approvalPolicy: 'on-request',
    approvalsReviewer: 'auto_review',
    sandbox: {
      type: 'workspaceWrite',
      writableRoots: [cache],
      networkAccess: true,
      excludeSlashTmp: true,
      excludeTmpdirEnvVar: true,
    },
  };
}
function syntheticPeer(
  dir,
  {
    wrongModel = false,
    complete = false,
    changeResponse = '',
    beforeResponse = '',
    afterStart = '',
  } = {},
) {
  const file = path.join(dir, 'synthetic-peer.mjs');
  write(
    file,
    `import readline from 'node:readline';
import { writeFileSync } from 'node:fs';
const responseFor=${responseFor.toString()};
const send=x=>process.stdout.write(JSON.stringify(x)+'\\n');
const usage=n=>send({method:'thread/tokenUsage/updated',params:{threadId:'t',turnId:'u',tokenUsage:{total:{inputTokens:n,cachedInputTokens:0,outputTokens:2,reasoningOutputTokens:1,totalTokens:n+2},last:{inputTokens:n,cachedInputTokens:0,outputTokens:2,reasoningOutputTokens:1,totalTokens:n+2}}}});
readline.createInterface({input:process.stdin}).on('line',line=>{const m=JSON.parse(line);
if(m.method==='initialize')send({id:m.id,result:{userAgent:'synthetic-peer'}});
if(m.method==='thread/start'){const result=responseFor(m.params);${wrongModel ? "result.model=result.thread.model='gpt-5.6-luna';" : ''}${beforeResponse}${changeResponse}send({id:m.id,result});}
if(m.method==='turn/start'){send({id:m.id,result:{turn:{id:'u'}}});send({method:'turn/started',params:{threadId:'t',turn:{id:'u',status:'inProgress'}}});usage(10);${afterStart}${complete ? "setTimeout(()=>send({method:'turn/completed',params:{threadId:'t',turn:{id:'u',status:'completed'}}}),10);" : ''}}
if(m.method==='turn/interrupt'){send({id:m.id,result:{}});usage(30);send({method:'turn/completed',params:{threadId:'t',turn:{id:'u',status:'interrupted'}}});}
});`,
  );
  return file;
}
function waitingPeer(dir, wrongModel = false) {
  return syntheticPeer(dir, { wrongModel });
}
test('wrong resolved model is rejected before any builder turn starts', async () => {
  const f = fixture(),
    run = f.prepare();
  await qualifyExperiment(f.out, qualifiers(f, run), { install: fakeInstall });
  const peer = waitingPeer(f.dir, true);
  const status = await runBuilders(f.out, 'luna', {
    authorize: true,
    sessionOptions: { executable: process.execPath, argsPrefix: [peer] },
    leaseFile: path.join(f.dir, 'lease.json'),
  });
  assert.equal(status.builders.luna.state, 'infrastructure-failure');
  const requests = readFileSync(
    path.join(f.out, 'luna/metrics/requests.jsonl'),
    'utf8',
  );
  assert.equal(requests.includes('turn/start'), false);
});
test('cancel file drains an active synthetic turn and preserves its late reported usage', async () => {
  const f = fixture(),
    run = f.prepare();
  await qualifyExperiment(f.out, qualifiers(f, run), { install: fakeInstall });
  const peer = waitingPeer(f.dir),
    usagePath = path.join(f.out, 'luna/metrics/usage-latest.json');
  const poll = setInterval(() => {
    if (existsSync(usagePath) && read(usagePath).reportedUsage)
      write(path.join(f.out, 'cancel-request.json'), { synthetic: true });
  }, 20);
  let status;
  try {
    status = await runBuilders(f.out, 'all', {
      authorize: true,
      sessionOptions: { executable: process.execPath, argsPrefix: [peer] },
      leaseFile: path.join(f.dir, 'lease.json'),
    });
  } finally {
    clearInterval(poll);
  }
  assert.equal(status.builders.luna.state, 'cancelled');
  assert.equal(status.builders.sol.state, 'qualified');
  const receipt = read(path.join(f.out, 'luna/builder-receipt.json'));
  assert.equal(receipt.metrics.cancelled, true);
  assert.equal(receipt.metrics.timedOut, false);
  assert.equal(receipt.metrics.usage.reportedUsage.total.inputTokens, 30);
});
test('application source snapshot ignores reports and generated evidence, but detects implementation changes', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'relay-source-test-'));
  write(path.join(dir, 'src/App.jsx'), 'initial');
  const before = snapshotApplication(dir);
  write(path.join(dir, 'evidence/receipt.json'), { source: before.identity });
  write(path.join(dir, 'BUILD-REPORT.md'), 'synthetic report');
  assert.equal(snapshotApplication(dir).identity, before.identity);
  write(path.join(dir, 'src/App.jsx'), 'changed');
  assert.notEqual(snapshotApplication(dir).identity, before.identity);
});
test('external selector sources and checkpoint are hash-checked rather than copied or assumed', () => {
  const f = fixture(),
    selector = read(f.gatePath).selector;
  validateSelector(selector);
  write(selector.checkpoint.path, 'changed synthetic bytes');
  assert.throws(() => validateSelector(selector), /Selector artifact changed/);
});

test('resolved permission contract rejects wrong cwd, expanded roots, temp access, network and active profile', async () => {
  const f = fixture(),
    prepared = f.prepare();
  const run = await qualifyExperiment(f.out, qualifiers(f, prepared), {
    install: fakeInstall,
  });
  const spec = buildSessionSpec(run, 'luna');
  const valid = responseFor({ ...spec.threadStart, cwd: spec.cwd });
  validateResolvedThread(valid, run, 'luna');
  const cases = [
    (r) => {
      r.cwd = '/';
    },
    (r) => {
      r.thread.cwd = '/';
    },
    (r) => {
      r.runtimeWorkspaceRoots = ['/'];
    },
    (r) => {
      r.sandbox.writableRoots = ['/'];
    },
    (r) => {
      r.runtimeWorkspaceRoots.push(r.cwd);
    },
    (r) => {
      r.sandbox.networkAccess = false;
    },
    (r) => {
      r.sandbox.excludeSlashTmp = false;
    },
    (r) => {
      r.sandbox.excludeTmpdirEnvVar = false;
    },
    (r) => {
      r.activePermissionProfile = 'unverified';
    },
    (r) => {
      r.thread.environments = [
        { environmentId: 'local', cwd: '/', runtimeWorkspaceRoots: ['/'] },
      ];
    },
  ];
  for (const change of cases) {
    const bad = structuredClone(valid);
    change(bad);
    assert.throws(() => validateResolvedThread(bad, run, 'luna'));
  }
});

test('prepared input tree rejects edits, additions and removals, allowing only predeclared node_modules generation', async () => {
  const f = fixture(),
    run = f.prepare(),
    b = run.builders.sol,
    app = path.join(b.workspace, 'app');
  write(
    path.join(app, 'node_modules/synthetic/index.js'),
    'generated dependency',
  );
  assertPreparedApplication(b);
  write(path.join(app, '.hidden-input'), 'unequal input');
  assert.throws(() => assertPreparedApplication(b), /tree changed/);
  rmSync(path.join(app, '.hidden-input'));
  mkdirSync(path.join(app, 'unexpected-empty-directory'));
  assert.throws(() => assertPreparedApplication(b), /tree changed/);
  rmSync(path.join(app, 'unexpected-empty-directory'), { recursive: true });
  const index = readFileSync(path.join(app, 'index.js'));
  rmSync(path.join(app, 'index.js'));
  assert.throws(() => assertPreparedApplication(b), /tree changed/);
  writeFileSync(path.join(app, 'index.js'), index);
  assert.equal(snapshotPreparedApplication(app).identity, b.template.identity);
  write(path.join(app, 'src/App.jsx'), 'changed only Sol');
  await assert.rejects(
    qualifyExperiment(f.out, qualifiers(f, run), { install: fakeInstall }),
    /tree changed/,
  );
});

test('qualification detects post-install cross-builder changes and launch detects post-qualification changes', async () => {
  const f = fixture(),
    run = f.prepare();
  await assert.rejects(
    qualifyExperiment(f.out, qualifiers(f, run), {
      install: async (...args) => {
        await fakeInstall(...args);
        if (args[2].includes('/astra/'))
          write(
            path.join(run.builders.luna.workspace, 'app/new-source.txt'),
            'tampered later',
          );
      },
    }),
    /tree changed/,
  );
  const g = fixture(),
    initial = g.prepare();
  await qualifyExperiment(g.out, qualifiers(g, initial), {
    install: fakeInstall,
  });
  write(
    path.join(initial.builders.sol.workspace, 'app/src/App.jsx'),
    'changed',
  );
  let called = false;
  await assert.rejects(
    runBuilders(g.out, 'luna', {
      authorize: true,
      session: () => {
        called = true;
      },
      leaseFile: path.join(g.dir, 'lease.json'),
    }),
    /tree changed/,
  );
  assert.equal(called, false);
});

test('wrong permissions and input mutation during thread startup both prevent any first turn', async () => {
  for (const kind of ['permissions', 'input']) {
    const f = fixture(),
      run = f.prepare();
    await qualifyExperiment(f.out, qualifiers(f, run), {
      install: fakeInstall,
    });
    const peer = syntheticPeer(
      f.dir,
      kind === 'permissions'
        ? {
            changeResponse:
              "result.sandbox.writableRoots=['/']; result.sandbox.networkAccess=false;",
          }
        : {
            beforeResponse:
              "writeFileSync(m.params.cwd+'/app/src/App.jsx','startup mutation');",
          },
    );
    const status = await runBuilders(f.out, 'luna', {
      authorize: true,
      sessionOptions: { executable: process.execPath, argsPrefix: [peer] },
      leaseFile: path.join(f.dir, 'lease.json'),
    });
    assert.equal(status.builders.luna.state, 'infrastructure-failure');
    assert.equal(status.builders.luna.actualStartedAt, null);
    assert.equal(
      readFileSync(
        path.join(f.out, 'luna/metrics/requests.jsonl'),
        'utf8',
      ).includes('turn/start'),
      false,
    );
    assert.equal(existsSync(path.join(f.dir, 'lease.json')), false);
  }
});

test('actual start is recorded once and makes subsequent implementation edits valid', async () => {
  const f = fixture(),
    run = f.prepare();
  await qualifyExperiment(f.out, qualifiers(f, run), { install: fakeInstall });
  const peer = syntheticPeer(f.dir, { complete: true });
  const status = await runBuilders(f.out, 'luna', {
    authorize: true,
    leaseFile: path.join(f.dir, 'lease.json'),
    session: async (spec, out, options) => {
      const started = options.onTurnStarted;
      return recordSession(spec, out, {
        ...options,
        executable: process.execPath,
        argsPrefix: [peer],
        onTurnStarted: (info) => {
          started(info);
          assert.equal(
            read(path.join(f.out, 'run.json')).builders.luna.state,
            'running',
          );
          write(
            path.join(spec.cwd, 'app/src/App.jsx'),
            'legitimate implementation after actual start',
          );
        },
      });
    },
  });
  assert.equal(status.builders.luna.state, 'completed-needs-review');
  assert.ok(status.builders.luna.actualStartedAt);
  const invocation = read(path.join(f.out, 'luna/metrics/invocation.json'));
  assert.ok(invocation.environmentOverrideKeys.includes('TMPDIR'));
});

test('failure still checks ports, retains the lease and prevents the next builder until cleanup is proven', async () => {
  const f = fixture(),
    run = f.prepare();
  await qualifyExperiment(f.out, qualifiers(f, run), { install: fakeInstall });
  const peer = syntheticPeer(f.dir, { complete: true }),
    leaseFile = path.join(f.dir, 'lease.json');
  let server;
  try {
    const status = await runBuilders(f.out, 'all', {
      authorize: true,
      leaseFile,
      session: async (spec, out, options) => {
        const metrics = await recordSession(spec, out, {
          ...options,
          executable: process.execPath,
          argsPrefix: [peer],
        });
        server = net.createServer();
        await new Promise((resolve, reject) => {
          server.once('error', reject);
          server.listen(
            run.builders.luna.metadata.runtime.proxy,
            '127.0.0.1',
            resolve,
          );
        });
        write(path.join(spec.cwd, 'app/build-report.json'), '{malformed');
        return metrics;
      },
    });
    assert.equal(status.builders.luna.state, 'infrastructure-failure');
    assert.equal(status.builders.sol.state, 'qualified');
    assert.equal(status.resourceCleanup.confirmedEmpty, false);
    assert.equal(read(leaseFile).state, 'cleanup-blocked');
    assert.equal(
      (await cleanupExperiment(f.out, { leaseFile })).leaseReleased,
      false,
    );
    await new Promise((resolve) => server.close(resolve));
    server = null;
    assert.equal(
      (await cleanupExperiment(f.out, { leaseFile })).leaseReleased,
      true,
    );
    assert.equal(existsSync(leaseFile), false);
  } finally {
    if (server) await new Promise((resolve) => server.close(resolve));
  }
});

test('unknown recorder cleanup is retained on exceptional exit without blindly killing processes', async () => {
  const f = fixture(),
    run = f.prepare();
  await qualifyExperiment(f.out, qualifiers(f, run), { install: fakeInstall });
  const leaseFile = path.join(f.dir, 'lease.json');
  const status = await runBuilders(f.out, 'luna', {
    authorize: true,
    leaseFile,
    session: async () => {
      throw Error('synthetic unexpected failure');
    },
  });
  assert.equal(status.builders.luna.state, 'infrastructure-failure');
  assert.equal(read(leaseFile).state, 'cleanup-blocked');
  assert.equal(
    (await cleanupExperiment(f.out, { leaseFile })).leaseReleased,
    false,
  );
});

test('a live declared PID blocks release even when a report says stopped, and is never signaled', async () => {
  const f = fixture(),
    run = f.prepare();
  await qualifyExperiment(f.out, qualifiers(f, run), { install: fakeInstall });
  const peer = syntheticPeer(f.dir, { complete: true }),
    leaseFile = path.join(f.dir, 'lease.json');
  const status = await runBuilders(f.out, 'luna', {
    authorize: true,
    leaseFile,
    session: async (spec, out, options) => {
      const metrics = await recordSession(spec, out, {
        ...options,
        executable: process.execPath,
        argsPrefix: [peer],
      });
      write(path.join(spec.cwd, 'app/evidence/runtime-processes.json'), {
        processes: [{ pid: process.pid, stopped: true }],
      });
      return metrics;
    },
  });
  assert.equal(status.resourceCleanup.confirmedEmpty, false);
  assert.equal(read(leaseFile).state, 'cleanup-blocked');
  process.kill(process.pid, 0);
});

test('preflight port failure also retains the lease until all reserved ports are free', async () => {
  const f = fixture(),
    run = f.prepare(),
    leaseFile = path.join(f.dir, 'lease.json');
  await qualifyExperiment(f.out, qualifiers(f, run), { install: fakeInstall });
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(
      run.builders.luna.metadata.runtime.metro,
      '127.0.0.1',
      resolve,
    );
  });
  let called = false;
  try {
    await assert.rejects(
      runBuilders(f.out, 'luna', {
        authorize: true,
        leaseFile,
        session: () => {
          called = true;
        },
      }),
      /EADDRINUSE/,
    );
    assert.equal(called, false);
    assert.equal(read(leaseFile).state, 'cleanup-blocked');
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
  assert.equal(
    (await cleanupExperiment(f.out, { leaseFile })).leaseReleased,
    true,
  );
});

test('launch gate requires exact v4 full stage order and matching stable source snapshots', () => {
  const f = fixture(),
    gate = read(f.gatePath),
    original = read(gate.verification.path);
  validateGate(gate, f.commit, f.repo);
  const attempts = [
    (v) => {
      v.verificationVersion = 3;
    },
    (v) => {
      v.scope = 'headless';
    },
    (v) => {
      v.results = v.results.slice(0, 7);
      v.expectedStages = 7;
    },
    (v) => {
      v.results.reverse();
    },
    (v) => {
      v.results[1] = v.results[0];
    },
    (v) => {
      v.results[0].code = 1;
    },
    (v) => {
      v.sourceStable = false;
    },
    (v) => {
      v.sourcesAfter[0].sha256 = '0'.repeat(64);
    },
    (v) => {
      delete v.sources;
    },
  ];
  for (const change of attempts) {
    const altered = structuredClone(original);
    change(altered);
    write(gate.verification.path, altered);
    gate.verification.sha256 = sha256(readFileSync(gate.verification.path));
    assert.throws(() => validateGate(gate, f.commit, f.repo));
  }
  write(gate.verification.path, original);
  gate.verification.sha256 = sha256(readFileSync(gate.verification.path));
  gate.verifiedSources = gate.verifiedSources.slice(1);
  assert.throws(() => validateGate(gate, f.commit, f.repo), /exactly match/);
});

test('prepare rejects an internally consistent but incomplete published source snapshot', () => {
  const f = fixture(),
    gate = read(f.gatePath),
    verification = read(gate.verification.path);
  const incomplete = verification.sources.filter(
    (source) => source.path !== 'src/stub.ts',
  );
  Object.assign(verification, verificationSourceFields(incomplete, incomplete));
  gate.verifiedSources = incomplete;
  write(gate.verification.path, verification);
  gate.verification.sha256 = sha256(readFileSync(gate.verification.path));
  write(f.gatePath, gate);
  validateGate(gate, f.commit, f.repo);
  assert.throws(f.prepare, /complete published source snapshot/);
});

test('platform gate rejects boolean summaries, missing native or shell evidence, stale artifacts and changed shell bytes', () => {
  const cases = [
    (f) => {
      write(read(f.gatePath).platform.path, {
        readyForBuilders: true,
        sourceStable: true,
        platforms: ['web', 'native-ios', 'native-android'].map((id) => ({
          id,
          passed: true,
        })),
      });
    },
    (f) => {
      const spike = read(f.platformFixture.spikePath);
      spike.artifacts = spike.artifacts.filter((a) => a.role !== 'android');
      write(f.platformFixture.spikePath, spike);
    },
    (f) => {
      const template = read(f.platformFixture.templatePath);
      template.native = template.native.filter(
        (n) => n.platform !== 'native-android',
      );
      write(f.platformFixture.templatePath, template);
    },
    (f) => {
      const artifact = read(f.platformFixture.artifactPaths.web);
      artifact.syntheticEditedAfterProof = true;
      write(f.platformFixture.artifactPaths.web, artifact);
    },
    (f) => {
      const file = path.join(f.repo, 'scripts/run-relay-builders.mjs');
      write(
        file,
        readFileSync(file, 'utf8').replace(
          'Relay implementation pending',
          'Unequal changed shell',
        ),
      );
    },
    (f) => {
      rmSync(f.platformFixture.templatePath);
    },
  ];
  for (const mutate of cases) {
    const f = fixture(),
      gate = read(f.gatePath);
    validateGate(gate, f.commit, f.repo);
    mutate(f);
    const envelope = read(gate.platform.path);
    for (const key of ['spike', 'template'])
      if (envelope[key] && existsSync(envelope[key].path))
        envelope[key].sha256 = sha256(readFileSync(envelope[key].path));
    write(gate.platform.path, envelope);
    gate.platform.sha256 = sha256(readFileSync(gate.platform.path));
    assert.throws(() => validateGate(gate, f.commit, f.repo));
  }
});

test('prepare rejects byte or executable-mode mismatches even when receipt source hashes are self-consistent', () => {
  for (const kind of ['sha256', 'mode']) {
    const f = fixture(),
      gate = read(f.gatePath),
      verification = read(gate.verification.path);
    const forged = structuredClone(verification.sources),
      source = forged.find((s) => s.path === 'src/stub.ts');
    source[kind] = kind === 'sha256' ? '0'.repeat(64) : '100755';
    Object.assign(verification, verificationSourceFields(forged, forged));
    gate.verifiedSources = forged;
    write(gate.verification.path, verification);
    gate.verification.sha256 = sha256(readFileSync(gate.verification.path));
    write(f.gatePath, gate);
    validateGate(gate, f.commit, f.repo);
    assert.throws(f.prepare, /complete published source snapshot/);
  }
});
