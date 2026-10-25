import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import {
  solveComposition,
  replayDesignHandoff,
  summarizeMotion,
} from '../dist/index.js';
const problem = JSON.parse(
    await readFile('examples/vela/problem.json', 'utf8'),
  ),
  options = { maxEvaluations: 4096, limit: 3 };
const useSelector = process.argv.includes('--selector'),
  update = process.argv.includes('--update-vela');
const selector = {
  gguf: process.env.DESIGN_GGUF ?? 'artifacts/runtime/Qwen3.5-4B-Q4_K_M.gguf',
  profile: 'qwen3.5-4b',
  readout: 'single',
  maxPromptTokens: 4096,
  auditDirectory: 'artifacts/vela/selector-final',
};
await mkdir('artifacts/vela', { recursive: true });
const start = performance.now();
const result = await solveComposition({
  ...problem,
  options,
  ...(useSelector ? { selector } : {}),
});
assert.ok(result.handoff);
const explorationMs = performance.now() - start;
const cachedStart = performance.now(),
  replayed = await solveComposition({
    ...problem,
    options,
    ...(useSelector ? { selector } : {}),
    recipe: result.recipe,
  }),
  cachedMs = performance.now() - cachedStart;
assert.equal(replayed.status, 'replayed');
assert.equal(replayed.statistics.selectorCalls, 0);
assert.equal(replayed.statistics.evaluated, 0);
const pureStart = performance.now(),
  pure = replayDesignHandoff({
    ...problem,
    recipe: result.handoff,
    scenario: problem.program.scenarios[0].values,
  }),
  pureMs = performance.now() - pureStart;
assert.equal(pure.status, 'replayed');
const altered = structuredClone(problem);
altered.program.factors.find((f) => f.id === 'tracking-size-coupling').weight +=
  1;
const invalidated = replayDesignHandoff({
  ...altered,
  recipe: result.handoff,
  scenario: altered.program.scenarios[0].values,
});
assert.equal(invalidated.status, 'invalidated');
const report = {
  createdAt: new Date().toISOString(),
  explorationMs,
  cachedMs,
  pureMs,
  statistics: result.statistics,
  selection: result.selection,
  handoffIdentity: result.handoff.identity,
  replay: {
    selectorCalls: replayed.statistics.selectorCalls,
    evaluated: replayed.statistics.evaluated,
    pureStatus: pure.status,
  },
  changedPolicy: invalidated.status,
  scope:
    'One authored product problem, deterministic mathematical search plus optional single local neural readout. Not a controlled design-quality or token-savings benchmark.',
};
await writeFile(
  'artifacts/vela/selected-final.json',
  JSON.stringify(result, null, 2),
);
await writeFile(
  'artifacts/vela/machine-proof.json',
  JSON.stringify(report, null, 2),
);
await writeFile(
  'artifacts/vela/replay-final.json',
  JSON.stringify({ replayed, pure }, null, 2),
);
if (update) {
  const choice = {
    programIdentity: result.handoff.programIdentity,
    assignment: result.handoff.assignment,
    selection: result.selection,
  };
  await writeFile(
    'examples/vela/choice.json',
    JSON.stringify(choice, null, 2) + '\n',
  );
  const policy = JSON.parse(
    await readFile('examples/vela/design.generated.json', 'utf8'),
  );
  policy.handoff = result.handoff;
  policy.selection = result.selection;
  policy.motion = summarizeMotion({
    spring: {
      mass: 1,
      stiffness: result.handoff.assignment.stiffness,
      damping: result.handoff.assignment.damping,
    },
    coordinate: { unit: 'dp', from: 32, to: 0 },
    durationSeconds: 2,
  });
  await writeFile(
    'examples/vela/design.generated.json',
    JSON.stringify(policy, null, 2) + '\n',
  );
}
console.log(JSON.stringify(report));
