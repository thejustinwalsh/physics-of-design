import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { hash } from '../dist/identity.js';
import { inspectDesignContext } from '../dist/design-context.js';
import {
  compileDecisionWorkflow,
  runDecisionWorkflow,
} from '../dist/decision-workflow.js';
import { compileRelayAttention } from '../examples/relay/attention-workflow.mjs';
import { acquireLease } from './run-relay-builders.mjs';
import {
  snapshotVerificationSources,
  verificationSourceFields,
} from './verification-sources.mjs';
const args = process.argv.slice(2),
  inputFile = args[0];
assert.ok(
  inputFile,
  'Usage: node scripts/select-relay-attention.mjs MATRIX_REPORT [--selector]',
);
const neural = args.includes('--selector');
const output = path.resolve(
  process.env.DESIGN_ATTENTION_CHOICE_OUTPUT ??
    `artifacts/relay-attention/choice-${Date.now()}`,
);
await mkdir(output, { recursive: true });
const before = snapshotVerificationSources(process.cwd());
const json = async (file) => JSON.parse(await readFile(file, 'utf8'));
const context = await inspectDesignContext({
  file: 'examples/relay/DESIGN.md',
  requiredSections: ['Task-priority experiment — 2026-11-05'],
});
assert.equal(context.status, 'found');
assert.deepEqual(context.missingSections, []);
const compiled = compileRelayAttention({
  matrix: await json(inputFile),
  designIdentity: context.sha256,
  palettes: await json('examples/relay/app/src/design/palette.generated.json'),
  paletteReceipt: await json('artifacts/relay-palettes/receipt.json'),
});
const request = {
  workflow: compiled.workflow,
  ...(neural
    ? {
        selector: {
          gguf:
            process.env.DESIGN_GGUF ??
            'artifacts/runtime/Qwen3.5-4B-Q4_K_M.gguf',
          profile: 'qwen3.5-4b',
          readout: 'single',
          maxPromptTokens: 4096,
          auditDirectory: path.join(output, 'selector'),
        },
      }
    : {}),
};
if (!neural)
  for (const stage of request.workflow.stages) stage.selection = 'mathematical';
await writeFile(
  path.join(output, 'input.json'),
  JSON.stringify(request, null, 2) + '\n',
);
await writeFile(
  path.join(output, 'compiler-metadata.json'),
  JSON.stringify({ context, ...compiled.metadata }, null, 2) + '\n',
);
const providers = () =>
  execFileSync('ps', ['-axo', 'pid=,ppid=,command='], { encoding: 'utf8' })
    .split('\n')
    .filter((line) => /\bsemif-progress\.py(?:\s|$)/.test(line));
const inventoryBefore = neural ? providers() : [];
assert.deepEqual(
  inventoryBefore,
  [],
  'A preexisting local selector must not be taken over',
);
const lease = neural
  ? acquireLease('/private/tmp/design-theory-relay-resources.lock', {
      run: output,
      kind: 'relay-attention-selector',
    })
  : null;
const controller = new AbortController(),
  onSignal = () =>
    controller.abort(new Error('Explicit selector interruption'));
process.once('SIGINT', onSignal);
process.once('SIGTERM', onSignal);
const progress = [];
const execution = {
  signal: controller.signal,
  onProgress: (event) => {
    progress.push({ ...event, at: new Date().toISOString() });
    console.error(JSON.stringify({ selectorProgress: event }));
  },
};
let successful = false;
try {
  const started = performance.now();
  const machine = compileDecisionWorkflow(request, undefined, execution);
  const snapshots = [];
  while (machine.getSnapshot().state !== 'complete') {
    await machine.step();
    const snapshot = machine.getSnapshot();
    snapshots.push({
      state: snapshot.state,
      nextStage: snapshot.nextStage,
      stages: Object.fromEntries(
        Object.entries(snapshot.stages).map(([id, s]) => [
          id,
          { status: s.status, assignment: s.assignment },
        ]),
      ),
    });
  }
  const first = machine.getSnapshot(),
    firstMs = performance.now() - started;
  await writeFile(
    path.join(output, 'first.json'),
    JSON.stringify(first, null, 2) + '\n',
  );
  assert.equal(first.status, 'proposed');
  assert.equal(first.statistics.neuralCalls, neural ? 3 : 0);
  assert.equal(first.statistics.completedReadoutPasses, neural ? 3 : 0);
  assert.equal(first.statistics.testSelectorCalls, 0);
  const replayStarted = performance.now();
  const replay = await runDecisionWorkflow(
    { ...request, recipe: first.recipe, mode: 'replay' },
    undefined,
    execution,
  );
  const replayMs = performance.now() - replayStarted;
  await writeFile(
    path.join(output, 'replay.json'),
    JSON.stringify(replay, null, 2) + '\n',
  );
  assert.equal(replay.status, 'replayed');
  assert.equal(replay.statistics.neuralCalls, 0);
  assert.equal(replay.statistics.evaluated, 0);
  assert.equal(replay.statistics.cacheHits, 3);
  const downstream = structuredClone(request);
  downstream.workflow.stages[2].question +=
    ' Compare a more restrained art direction.';
  const partial = await runDecisionWorkflow(
    { ...downstream, recipe: first.recipe, mode: 'replay' },
    undefined,
    execution,
  );
  assert.equal(partial.stages.composition.status, 'replayed');
  assert.equal(partial.stages.kinetics.status, 'replayed');
  assert.equal(partial.stages.palette.status, 'stale');
  assert.equal(partial.statistics.neuralCalls, 0);
  await writeFile(
    path.join(output, 'palette-invalidated.json'),
    JSON.stringify(partial, null, 2) + '\n',
  );
  const upstream = structuredClone(request);
  upstream.workflow.stages[1].program.factors.find(
    (f) => f.id === 'material-counterpoint',
  ).bands[0].min = -0.15;
  const invalidated = await runDecisionWorkflow(
    { ...upstream, recipe: first.recipe, mode: 'replay' },
    undefined,
    execution,
  );
  assert.equal(invalidated.stages.composition.status, 'replayed');
  assert.equal(invalidated.stages.kinetics.status, 'stale');
  assert.equal(invalidated.stages.palette.status, 'blocked');
  assert.equal(invalidated.statistics.neuralCalls, 0);
  await writeFile(
    path.join(output, 'kinetics-invalidated.json'),
    JSON.stringify(invalidated, null, 2) + '\n',
  );
  const variant =
    compiled.metadata.variants[first.stages.composition.assignment.variant];
  const physics = first.stages.kinetics.assignment;
  const handoff = {
    version: 1,
    selectedVariant: variant.id,
    palette:
      compiled.metadata.paletteIds[first.stages.palette.assignment.palette],
    physics: {
      mass: 1,
      ...physics,
      damping: 2 * physics.dampingRatio * Math.sqrt(physics.stiffness),
    },
    workflowIdentity: hash(request.workflow),
    resultIdentity: hash({ stages: first.stages, recipe: first.recipe }),
    designIdentity: context.sha256,
    matrixIdentity: compiled.metadata.matrixIdentity,
    origin: neural
      ? 'Three real staged local qwen3.5-4b/SemIf choices among viable alternatives; deterministic validation and current renderer verification stay separate.'
      : 'Mathematical prototype; no local model choice.',
    rendererVerification: 'pending-current-selected-build',
  };
  await writeFile(
    path.join(output, 'handoff.json'),
    JSON.stringify(handoff, null, 2) + '\n',
  );
  const stable = verificationSourceFields(
    before,
    snapshotVerificationSources(process.cwd()),
  );
  assert.equal(
    stable.sourceStable,
    true,
    'Selector implementation/input source changed during run',
  );
  const report = {
    passed: true,
    neural,
    createdAt: new Date().toISOString(),
    output,
    ...stable,
    matrixIdentity: compiled.metadata.matrixIdentity,
    contextIdentity: context.sha256,
    first: {
      ms: firstMs,
      statistics: first.statistics,
      assignments: Object.fromEntries(
        Object.entries(first.stages).map(([id, s]) => [id, s.assignment]),
      ),
    },
    replay: { ms: replayMs, statistics: replay.statistics },
    downstreamEdit: partial.statistics,
    upstreamEdit: invalidated.statistics,
    snapshots,
    scope:
      'Three conditional choices, finite numeric search, exact unchanged replay and selective invalidation. No human preference, coding-token savings, universal energy/beauty score, current rendered finalist or hardware throughput claim.',
  };
  await writeFile(
    path.join(output, 'report.json'),
    JSON.stringify(report, null, 2) + '\n',
  );
  successful = true;
  console.log(
    JSON.stringify({
      passed: true,
      output,
      first: report.first,
      replay: report.replay,
      selected: handoff,
    }),
  );
} finally {
  process.removeListener('SIGINT', onSignal);
  process.removeListener('SIGTERM', onSignal);
  await writeFile(
    path.join(output, 'progress.json'),
    JSON.stringify(progress, null, 2) + '\n',
  );
  const inventoryAfter = neural ? providers() : [];
  const cleanup = {
    confirmedEmpty: inventoryAfter.length === 0,
    providerProcesses: inventoryAfter,
    successful,
    scope:
      'Selector SDK awaited child close; exact local provider inventory checked, no processes signaled by this guard',
  };
  await writeFile(
    path.join(output, 'cleanup.json'),
    JSON.stringify(cleanup, null, 2) + '\n',
  );
  if (lease) {
    if (cleanup.confirmedEmpty) lease.release(cleanup);
    else lease.retain(cleanup);
  }
  assert.ok(
    cleanup.confirmedEmpty,
    'Selector cleanup unresolved; lease retained',
  );
}
