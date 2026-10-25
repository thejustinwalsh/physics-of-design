import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { hash } from '../dist/identity.js';
import {
  collectDesignFieldMeasurements,
  runDesignField,
  validateDesignFieldFinalist,
  designFieldStageView,
} from '../dist/design-field.js';
const directory = process.env.DESIGN_FIELD_OUTPUT ?? 'artifacts/design-field';
const brief = JSON.parse(
  await readFile('examples/design-field/brief.json', 'utf8'),
);
const implementationPaths = [
  'src/design-field.ts',
  'src/design-field-vocabulary.ts',
  'src/energy.ts',
  'src/energy-analysis.ts',
  'src/decision-workflow.ts',
  'src/selector.ts',
  'src/selector-process.ts',
  'scripts/semif-local.sh',
  'scripts/semif-progress.py',
  'src/math-expression.ts',
  'src/identity.ts',
  'scripts/prove-design-field.mjs',
];
// Also pin executed JavaScript; a source receipt alone does not identify a stale build.
implementationPaths.push(
  ...implementationPaths
    .filter((path) => path.startsWith('src/'))
    .map((path) => path.replace('src/', 'dist/').replace(/\.ts$/, '.js')),
);
const implementationHashes = async () =>
  Object.fromEntries(
    await Promise.all(
      implementationPaths.map(async (path) => [
        path,
        hash(await readFile(path, 'utf8')),
      ]),
    ),
  );
// Capture before measurements, search or inference; never attribute a run to later edits.
const implementationSources = await implementationHashes();
const selector = process.argv.includes('--selector')
  ? {
      gguf:
        process.env.DESIGN_GGUF ?? 'artifacts/runtime/Qwen3.5-4B-Q4_K_M.gguf',
      profile: 'qwen3.5-4b',
      readout: 'single',
      maxPromptTokens: 8192,
      auditDirectory: `${directory}/selector`,
    }
  : undefined;
await mkdir(directory, { recursive: true });
await writeFile(
  `${directory}/implementation-freeze.json`,
  JSON.stringify(
    {
      status: 'running',
      implementationSources,
      scope:
        'Hashes captured before proof calls; verified again before final receipts or fixture publication',
    },
    null,
    2,
  ) + '\n',
);
const ledger = [];
async function call(command, fn, input, evidenceKind) {
  const before = performance.now();
  const result = await fn(
    input,
    command === 'field run'
      ? {
          onProgress: (progress) =>
            process.stderr.write(
              JSON.stringify({ type: 'design.progress', ...progress }) + '\n',
            ),
        }
      : undefined,
  );
  ledger.push({
    command,
    function: fn.name,
    inputHash: hash(input),
    resultHash: hash(result),
    evidenceKind,
    runtime: result.runtime ?? 'Node; detailed runtime in result',
    elapsedMs: performance.now() - before,
  });
  return result;
}
const measurements = await call(
  'field measure',
  collectDesignFieldMeasurements,
  brief,
  'actual-browser-text-matrix-and-decoded-source-image',
);
await writeFile(
  `${directory}/measurements.json`,
  JSON.stringify(measurements, null, 2) + '\n',
);
const request = { brief, measurements, ...(selector ? { selector } : {}) };
const first = await call(
  'field run',
  runDesignField,
  request,
  'mathematical-search-with-optional-local-selector',
);
await writeFile(
  `${directory}/first.json`,
  JSON.stringify(first, null, 2) + '\n',
);
assert.equal(first.workflow.status, 'proposed');
assert.equal(first.workflow.statistics.evaluated, 3132);
assert.equal(first.workflow.statistics.lookahead.evaluated, 2592);
assert.equal(first.workflow.statistics.lookahead.branches, 6);
assert.equal(first.workflow.statistics.lookahead.reusedSearches, 1);
if (!selector) assert.equal(first.analyses.expression.baseline.energy, 0);
assert.equal(first.workflow.statistics.neuralCalls, selector ? 2 : 0);
assert.equal(
  first.workflow.statistics.completedReadoutPasses,
  selector ? 2 : 0,
);
const validation = await call(
  'field validate',
  validateDesignFieldFinalist,
  { brief, measurements, tokens: first.tokens },
  'actual-browser-finalist-layout',
);
await writeFile(
  `${directory}/validation.json`,
  JSON.stringify(validation, null, 2) + '\n',
);
assert.equal(validation.status, 'passed');
const replay = await call(
  'field run',
  runDesignField,
  { ...request, recipe: first.workflow.recipe, mode: 'replay' },
  'revalidated-cache-zero-neural-calls',
);
assert.equal(replay.workflow.status, 'replayed');
assert.equal(replay.workflow.statistics.neuralCalls, 0);
assert.equal(replay.workflow.statistics.evaluated, 0);
assert.equal(replay.workflow.statistics.lookahead.revalidated, 6);
const changed = structuredClone(brief);
changed.targets.tension = [0.3, 0.42];
const partial = await runDesignField({
  ...request,
  brief: changed,
  recipe: first.workflow.recipe,
  mode: 'replay',
});
assert.equal(partial.workflow.stages.reading.status, 'stale');
assert.equal(partial.workflow.stages.expression.status, 'blocked');
const artifact = {
  version: 1,
  identity: first.identity,
  brief: first.brief,
  sources: measurements.sources,
  measurement: {
    identity: measurements.identity,
    provider: measurements.provider,
    runtime: measurements.runtime,
    cells: measurements.rows.length,
    image: measurements.image,
  },
  tokens: first.tokens,
  selection: {
    mode: selector ? 'local-selector' : 'mathematical',
    neuralCalls: first.workflow.statistics.neuralCalls,
    completedReadoutPasses: first.workflow.statistics.completedReadoutPasses,
    stageIds: Object.keys(first.workflow.stages),
    stages: Object.fromEntries(
      Object.entries(first.workflow.stages).map(([id, s]) => [
        id,
        { status: s.status, cacheKey: s.cacheKey, selection: s.selection },
      ]),
    ),
  },
  stages: ['reading', 'expression'].map((id) =>
    designFieldStageView(first, id),
  ),
  validation,
  statistics: first.workflow.statistics,
  lookahead: {
    scope: first.workflow.stages.reading.evidence.lookahead.scope,
    policy: first.workflow.stages.reading.evidence.lookahead.policy,
    branches: first.workflow.stages.reading.evidence.lookahead.branches.map(
      (branch) => ({
        parent: branch.parent.assignment,
        parentEnergy: branch.parent.energy,
        completion: branch.completion,
        jointlySatisfied: branch.jointlySatisfied,
        successors: branch.successors.map((successor) => ({
          stage: successor.stage,
          outcome: successor.outcome,
          evaluated: successor.search?.statistics.evaluated ?? 0,
          boundedBestEnergy: successor.search?.candidates[0]?.energy ?? null,
          boundedBestAssignment:
            successor.search?.candidates[0]?.assignment ?? null,
        })),
      }),
    ),
  },
  replay: replay.workflow.statistics,
  partialReplay: Object.fromEntries(
    Object.entries(partial.workflow.stages).map(([id, s]) => [id, s.status]),
  ),
  ledger: [...ledger, ...first.ledger],
  scope: first.scope,
  recipePath: `${directory}/first.json`,
  implementationSources,
};
assert.deepEqual(
  await implementationHashes(),
  implementationSources,
  'Implementation changed during proof; receipts are historical and cannot be published',
);
await writeFile(
  `${directory}/implementation-freeze.json`,
  JSON.stringify(
    {
      status: 'verified-unchanged',
      implementationSources,
      scope:
        'Source and executed module hashes matched before and after proof calls',
    },
    null,
    2,
  ) + '\n',
);
await writeFile(
  `${directory}/replay.json`,
  JSON.stringify(replay, null, 2) + '\n',
);
await writeFile(
  `${directory}/partial-replay.json`,
  JSON.stringify(partial, null, 2) + '\n',
);
await writeFile(
  `${directory}/gallery-session.json`,
  JSON.stringify(artifact, null, 2) + '\n',
);
if (process.argv.includes('--publish-fixture')) {
  await writeFile(
    'examples/design-field/gallery-session.json',
    JSON.stringify(artifact, null, 2) + '\n',
  );
  await writeFile(
    'examples/design-field/measurements.json',
    JSON.stringify(measurements, null, 2) + '\n',
  );
}
console.log(
  JSON.stringify(
    {
      directory,
      cells: measurements.rows.length,
      statistics: first.workflow.statistics,
      validation: validation.status,
      replay: replay.workflow.statistics,
      partialReplay: artifact.partialReplay,
    },
    null,
    2,
  ),
);
