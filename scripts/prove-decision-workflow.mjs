import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { runDecisionWorkflow } from '../dist/decision-workflow.js';

const input = JSON.parse(
  await readFile('examples/workflow/editorial.json', 'utf8'),
);
const useSelector = process.argv.includes('--selector');
const directory = process.env.DESIGN_WORKFLOW_OUTPUT ?? 'artifacts/workflow';
if (useSelector)
  input.selector = {
    gguf: process.env.DESIGN_GGUF ?? 'artifacts/runtime/Qwen3.5-4B-Q4_K_M.gguf',
    profile: 'qwen3.5-4b',
    readout: 'single',
    maxPromptTokens: 4096,
    auditDirectory: `${directory}/selector`,
  };
else
  for (const stage of input.workflow.stages) stage.selection = 'mathematical';
await mkdir(directory, { recursive: true });
const started = performance.now();
const first = await runDecisionWorkflow(input);
await writeFile(
  `${directory}/first.json`,
  JSON.stringify(first, null, 2) + '\n',
);
assert.equal(first.status, 'proposed');
assert.equal(first.statistics.neuralCalls, useSelector ? 2 : 0);
assert.equal(first.statistics.testSelectorCalls, 0);
assert.equal(first.statistics.completedReadoutPasses, useSelector ? 2 : 0);
assert.equal(first.statistics.checkpointHashes, useSelector ? 1 : 0);
const firstMs = performance.now() - started;
const replayStarted = performance.now();
const replay = await runDecisionWorkflow({
  ...input,
  recipe: first.recipe,
  mode: 'replay',
});
assert.equal(replay.status, 'replayed');
assert.equal(replay.statistics.selectorCalls, 0);
assert.equal(replay.statistics.evaluated, 0);
assert.equal(replay.statistics.revalidated, 6);
const replayMs = performance.now() - replayStarted;
const altered = structuredClone(input);
altered.workflow.stages[1].program.factors[0].bands = [{ min: 20, max: 20 }];
const partial = await runDecisionWorkflow({
  ...altered,
  recipe: first.recipe,
  mode: 'replay',
});
assert.equal(partial.stages.composition.status, 'replayed');
assert.equal(partial.stages.typography.status, 'stale');
assert.equal(partial.statistics.selectorCalls, 0);
const report = {
  createdAt: new Date().toISOString(),
  implementation: 'Executable dependency-ordered design-stage machine',
  realNeuralReadouts: useSelector,
  firstMs,
  replayMs,
  statistics: first.statistics,
  stages: Object.fromEntries(
    Object.entries(first.stages).map(([id, result]) => [
      id,
      {
        status: result.status,
        cacheKey: result.cacheKey,
        assignment: result.assignment,
        selection: result.selection,
      },
    ]),
  ),
  replay: replay.statistics,
  downstreamRuleChange: {
    composition: partial.stages.composition.status,
    typography: partial.stages.typography.status,
    statistics: partial.statistics,
  },
  scope:
    'Two sequential, conditioned design decisions with bounded mathematical exploration. Optional real local model chooses a mathematical alternative at each stage. Renderer checks remain pending. This is a protocol/reuse demonstration, not a design-quality or throughput benchmark.',
};
await writeFile(
  `${directory}/replay.json`,
  JSON.stringify(replay, null, 2) + '\n',
);
await writeFile(
  `${directory}/partial-invalidation.json`,
  JSON.stringify(partial, null, 2) + '\n',
);
await writeFile(
  `${directory}/proof.json`,
  JSON.stringify(report, null, 2) + '\n',
);
console.log(JSON.stringify(report, null, 2));
