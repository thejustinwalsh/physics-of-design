import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  compileDecisionWorkflow,
  runDecisionWorkflow,
  RunDecisionWorkflowSchema,
  type DecisionWorkflowInput,
} from '../src/decision-workflow.js';
import { hash } from '../src/identity.js';
import { prepareLocalOptionsSession } from '../src/selector.js';

async function fixture(): Promise<DecisionWorkflowInput> {
  const input = JSON.parse(
    await readFile(
      new URL('../examples/workflow/editorial.json', import.meta.url),
      'utf8',
    ),
  );
  for (const stage of input.workflow.stages) stage.selection = 'mathematical';
  return input;
}
test('executable machine advances stage by stage and conditions later numeric inputs', async () => {
  const machine = compileDecisionWorkflow(await fixture());
  assert.equal(machine.getSnapshot().nextStage, 'composition');
  const first = await machine.step();
  assert.equal(first.state, 'ready');
  assert.equal(first.nextStage, 'typography');
  assert.equal(first.stages.composition!.assignment!.contentWidth, 640);
  const result = await machine.run();
  assert.equal(result.state, 'complete');
  const type = result.stages.typography!;
  assert.ok(
    type.alternatives.every(
      (a) =>
        a.derived.desktop!.estimatedCharacters ===
        640 / (a.assignment.bodySize! * 0.52),
    ),
  );
  assert.equal(result.statistics.evaluated, 6);
  assert.equal(result.statistics.graphNodes, 6);
  assert.equal(result.rendererVerification, 'pending');
  first.stages.composition!.assignment!.contentWidth = 999;
  assert.equal(
    machine.getSnapshot().stages.composition!.assignment!.contentWidth,
    640,
  );
});
test('unchanged replay revalidates every retained alternative with zero search or selector calls', async () => {
  const input = await fixture();
  const first = await runDecisionWorkflow(input);
  const replay = await runDecisionWorkflow({
    ...input,
    recipe: first.recipe,
    mode: 'replay',
  });
  assert.equal(replay.status, 'replayed');
  assert.equal(replay.statistics.evaluated, 0);
  assert.equal(replay.statistics.selectorCalls, 0);
  assert.equal(replay.statistics.revalidated, 6);
  assert.ok(replay.statistics.factorEvaluations > 0);
  assert.deepEqual(
    replay.stages.typography!.assignment,
    first.stages.typography!.assignment,
  );
});
test('downstream-only rule changes retain the earlier stage and invalidate the later stage', async () => {
  const input = await fixture();
  const first = await runDecisionWorkflow(input);
  input.workflow.stages[1]!.program.factors[0]!.bands = [{ min: 20, max: 20 }];
  const replay = await runDecisionWorkflow({
    ...input,
    recipe: first.recipe,
    mode: 'replay',
  });
  assert.equal(replay.stages.composition!.status, 'replayed');
  assert.equal(replay.stages.typography!.status, 'stale');
  assert.equal(replay.statistics.selectorCalls, 0);
  const changed = await runDecisionWorkflow({ ...input, recipe: first.recipe });
  assert.equal(changed.stages.composition!.status, 'replayed');
  assert.equal(changed.stages.typography!.status, 'chosen');
  assert.equal(changed.statistics.searches, 1);
  assert.ok(changed.stages.typography!.previous);
});
test('stage ordering and dependency list ordering are not preferences', async () => {
  const input = await fixture();
  const first = await runDecisionWorkflow(input);
  input.workflow.stages.reverse();
  const next = await runDecisionWorkflow({ ...input, recipe: first.recipe });
  assert.deepEqual(next.order, first.order);
  assert.equal(next.statistics.cacheHits, 2);
});
test('upstream changes invalidate dependants but preserve independent branches', async () => {
  const input = await fixture();
  const independent = structuredClone(input.workflow.stages[0]!);
  independent.id = 'independent';
  input.workflow.stages.push(independent);
  const first = await runDecisionWorkflow(input);
  input.workflow.stages[0]!.program.variables[0]!.values = [720];
  const next = await runDecisionWorkflow({ ...input, recipe: first.recipe });
  assert.equal(next.stages.independent!.status, 'replayed');
  assert.equal(next.stages.composition!.assignment!.contentWidth, 720);
  assert.equal(next.stages.typography!.status, 'chosen');
});
test('declared stage context selectively invalidates while unused context does not', async () => {
  const input = await fixture();
  input.workflow.stages[0]!.contextKeys = [];
  const first = await runDecisionWorkflow(input);
  input.workflow.context = { ...input.workflow.context, unrelated: 'new' };
  const same = await runDecisionWorkflow({ ...input, recipe: first.recipe });
  assert.equal(same.statistics.cacheHits, 2);
  input.workflow.context.audience = 'Experienced typographers';
  const changed = await runDecisionWorkflow({ ...input, recipe: first.recipe });
  assert.equal(changed.stages.composition!.status, 'replayed');
  assert.equal(changed.stages.typography!.status, 'chosen');
});
test('conditional guard skips inactive stages and is rechecked on replay', async () => {
  const input = await fixture();
  input.workflow.stages[1]!.when = {
    op: 'lt',
    args: [{ ref: 'columnWidth' }, 600],
  };
  const first = await runDecisionWorkflow(input);
  assert.equal(first.stages.typography!.status, 'skipped');
  assert.equal(first.statistics.searches, 1);
  const replay = await runDecisionWorkflow({
    ...input,
    recipe: first.recipe,
    mode: 'replay',
  });
  assert.equal(replay.stages.typography!.status, 'skipped');
  input.workflow.stages[0]!.program.variables[0]!.values = [560];
  const changed = await runDecisionWorkflow({ ...input, recipe: first.recipe });
  assert.equal(changed.stages.typography!.status, 'chosen');
});
test('failed branches keep search evidence and alternatives; independent stages continue', async () => {
  const input = await fixture();
  const independent = structuredClone(input.workflow.stages[0]!);
  independent.id = 'independent';
  input.workflow.stages.push(independent);
  input.workflow.stages[0]!.program.factors[0]!.mode = 'hard';
  input.workflow.stages[0]!.program.factors[0]!.bands = [
    { min: 1000, max: 1100 },
  ];
  const next = await runDecisionWorkflow(input);
  assert.equal(next.status, 'incomplete');
  assert.equal(next.stages.composition!.status, 'failed');
  assert.equal(next.stages.typography!.status, 'blocked');
  assert.equal(next.stages.independent!.status, 'chosen');
  assert.ok(next.stages.composition!.evidence);
  assert.equal(next.statistics.selectorCalls, 0);
});
test('strict schemas and graph validation reject unknown keys, inputs, dependencies and cycles', async () => {
  const input = await fixture();
  assert.throws(() =>
    RunDecisionWorkflowSchema.parse({ ...input, surprise: true }),
  );
  for (const mutate of [
    (x: DecisionWorkflowInput) => {
      x.workflow.stages[1]!.bindings![0]!.variable = 'missing';
    },
    (x: DecisionWorkflowInput) => {
      x.workflow.stages[1]!.bindings![0]!.input = 'missing';
    },
    (x: DecisionWorkflowInput) => {
      x.workflow.stages[1]!.dependsOn = [];
    },
    (x: DecisionWorkflowInput) => {
      x.workflow.stages[0]!.dependsOn = ['typography'];
    },
    (x: DecisionWorkflowInput) => {
      x.workflow.stages[1]!.when = { ref: 'unknown' };
    },
    (x: DecisionWorkflowInput) => {
      x.workflow.stages[1]!.contextKeys = ['missing'];
    },
  ]) {
    const copy = structuredClone(input);
    mutate(copy);
    assert.throws(() => compileDecisionWorkflow(copy));
  }
});
test('workflow graph/evaluation reservation rejects over-budget plans before execution', async () => {
  const input = await fixture();
  input.workflow.budgets = { maxEvaluations: 31, maxGraphNodes: 32 };
  assert.throws(() => compileDecisionWorkflow(input), /budget/);
});
test('replay does not trust a changed assignment even when its payload digest is recomputed', async () => {
  const input = await fixture();
  const first = await runDecisionWorkflow(input);
  const entry = first.recipe.entries.composition!;
  entry.payload.assignment = { contentWidth: 999 };
  entry.payload.alternatives = [{ contentWidth: 999 }];
  entry.digest = hash(entry.payload);
  const replay = await runDecisionWorkflow({
    ...input,
    recipe: first.recipe,
    mode: 'replay',
  });
  assert.equal(replay.stages.composition!.status, 'stale');
  assert.match(replay.stages.composition!.reason!, /Invalid assignment/);
  assert.equal(replay.stages.typography!.status, 'blocked');
  assert.equal(replay.statistics.selectorCalls, 0);
});
test('test-injected selector runs per stage, pins checkpoint bytes, and cannot reuse a production cache identity', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'workflow-test-'));
  try {
    const gguf = path.join(dir, 'test.gguf');
    await writeFile(gguf, 'test fixture bytes A; not a neural model');
    const input = await fixture();
    for (const stage of input.workflow.stages)
      stage.selection = 'local-selector';
    input.selector = { gguf };
    let calls = 0;
    const hooks = {
      testSelectorIdentity: 'unit-test-only',
      testSelector: async (request: any) => {
        calls++;
        return { selected: request.payload.options[1].id };
      },
    };
    const first = await runDecisionWorkflow(input, hooks);
    assert.equal(calls, 2);
    assert.equal(first.statistics.neuralCalls, 0);
    assert.equal(first.statistics.testSelectorCalls, 2);
    assert.equal(first.statistics.checkpointHashes, 1);
    const replay = await runDecisionWorkflow(
      { ...input, recipe: first.recipe },
      hooks,
    );
    assert.equal(calls, 2);
    assert.equal(replay.statistics.selectorCalls, 0);
    const productionReplay = await runDecisionWorkflow({
      ...input,
      recipe: first.recipe,
      mode: 'replay',
    });
    assert.equal(productionReplay.stages.composition!.status, 'stale');
    await writeFile(gguf, 'test fixture bytes B; not a neural model');
    const changed = await runDecisionWorkflow(
      { ...input, recipe: first.recipe },
      hooks,
    );
    assert.equal(changed.statistics.selectorCalls, 2);
    assert.equal(calls, 4);
    input.workflow.budgets = { maxSelectorCalls: 1 };
    const limited = await runDecisionWorkflow(input, hooks);
    assert.equal(limited.stages.typography!.status, 'failed');
    assert.equal(limited.stages.typography!.alternatives.length, 3);
    assert.equal(limited.statistics.selectorCalls, 1);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
test('prepared selector refuses changed checkpoint metadata before invoking inference', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'prepared-test-'));
  try {
    const gguf = path.join(dir, 'test.gguf');
    await writeFile(gguf, 'A');
    const session = await prepareLocalOptionsSession(gguf);
    await writeFile(gguf, 'different checkpoint');
    await assert.rejects(
      session.select({
        gguf,
        profile: 'qwen3.5-4b',
        readout: 'single',
        maxPromptTokens: 4096,
        payload: {
          state: {},
          question: 'test',
          options: [{ id: 'a', description: 'a' }],
        },
      }),
      /checkpoint changed/,
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('unavailable model fails its stage while independent mathematical branches still execute', async () => {
  const input = await fixture();
  input.workflow.stages[0]!.selection = 'local-selector';
  input.selector = {
    gguf: '/tmp/design-workflow-deliberately-missing-checkpoint.gguf',
  };
  const independent = structuredClone(input.workflow.stages[0]!);
  independent.id = 'independent';
  independent.selection = 'mathematical';
  input.workflow.stages.push(independent);
  const result = await runDecisionWorkflow(input);
  assert.equal(result.stages.composition!.status, 'failed');
  assert.equal(result.stages.typography!.status, 'blocked');
  assert.equal(result.stages.independent!.status, 'chosen');
  assert.equal(result.statistics.neuralCalls, 0);
});

test('replay refuses changed selector options before any neural call', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'workflow-policy-test-'));
  try {
    const gguf = path.join(dir, 'test.gguf');
    await writeFile(gguf, 'protocol test fixture');
    const input = await fixture();
    input.workflow.stages[0]!.selection = 'local-selector';
    input.selector = { gguf, readout: 'single' };
    const hooks = {
      testSelectorIdentity: 'policy-test',
      testSelector: async (request: any) => ({
        selected: request.payload.options[0].id,
      }),
    };
    const first = await runDecisionWorkflow(input, hooks);
    input.selector.readout = 'balanced';
    const replay = await runDecisionWorkflow(
      { ...input, recipe: first.recipe, mode: 'replay' },
      hooks,
    );
    assert.equal(replay.stages.composition!.status, 'stale');
    assert.equal(replay.stages.typography!.status, 'blocked');
    assert.equal(replay.statistics.selectorCalls, 0);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
