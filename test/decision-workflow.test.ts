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

async function lookaheadFixture() {
  const input = await fixture();
  const parent = input.workflow.stages[0]!,
    child = input.workflow.stages[1]!;
  parent.program.factors[0]!.bands = [{ min: 560, max: 720 }];
  child.program.factors.find((f) => f.id === 'line-length')!.bands = [
    { min: 60, max: 62 },
  ];
  parent.lookahead = {
    successors: ['typography'],
    maxBranches: 3,
    maxEvaluations: 48,
    maxFactorObservations: 5000,
    maxExpressionOperations: 100000,
    completion: 'require',
    parentTies: 'prefer-successor-targets',
  };
  return input;
}

test('successor guidance resolves an identical parent-cost plateau without summing stage energies', async () => {
  const input = await lookaheadFixture();
  const original = structuredClone(input);
  delete original.workflow.stages[0]!.lookahead;
  const before = await runDecisionWorkflow(original);
  assert.equal(before.stages.composition!.assignment!.contentWidth, 560);
  const result = await runDecisionWorkflow(input);
  assert.equal(result.stages.composition!.assignment!.contentWidth, 640);
  assert.equal(result.stages.typography!.assignment!.bodySize, 20);
  const selected = result.stages.typography!.alternatives.find(
    (a) => a.assignment.bodySize === 20,
  )!;
  assert.equal(selected.energy, 0);
  assert.equal(result.statistics.lookahead.searches, 3);
  assert.equal(result.statistics.lookahead.evaluated, 9);
  assert.equal(result.statistics.lookahead.reusedSearches, 1);
  assert.equal(result.statistics.evaluated, 12);
  assert.equal(result.statistics.graphNodes, 12);
  assert.equal(result.statistics.neuralCalls, 0);
  assert.ok(result.recipe.entries.composition!.payload.continuation);
});

test('successor target guidance never overrides a distinct parent preference vector', async () => {
  const input = await lookaheadFixture();
  input.workflow.stages[0]!.program.factors[0]!.bands = [
    { min: 560, max: 560 },
  ];
  const result = await runDecisionWorkflow(input);
  assert.equal(result.stages.composition!.assignment!.contentWidth, 560);
  assert.ok(result.stages.typography!.alternatives[0]!.energy > 0);
});

test('required lookahead backtracks a dead-end parent while preserving the rejected branch evidence', async () => {
  const input = await lookaheadFixture();
  input.workflow.stages[1]!.program.factors.push({
    id: 'usable-parent',
    expression: { ref: 'columnWidth' },
    bands: [{ min: 640, max: 720 }],
    mode: 'hard',
    scale: 1,
    category: 'test',
    provenance: { kind: 'brief', source: 'Synthetic completion requirement' },
  });
  const result = await runDecisionWorkflow(input);
  assert.equal(result.status, 'proposed');
  assert.equal(result.stages.composition!.assignment!.contentWidth, 640);
  const evidence = result.stages.composition!.evidence as any;
  const rejected = evidence.lookahead.branches.find(
    (b: any) => b.parent.assignment.contentWidth === 560,
  );
  assert.equal(rejected.completion, 'infeasible');
  assert.equal(rejected.successors[0].search.statistics.complete, true);
  assert.equal(rejected.successors[0].search.candidates.length, 0);
  input.workflow.stages[0]!.lookahead!.maxBranches = 1;
  const bounded = await runDecisionWorkflow(input);
  assert.equal(bounded.stages.composition!.status, 'failed');
  assert.equal(bounded.stages.typography!.status, 'blocked');
  assert.equal(bounded.statistics.lookahead.branches, 1);
  assert.equal(
    (bounded.stages.composition!.evidence as any).lookahead.uncoveredParents
      .length,
    2,
  );
});

test('lookahead evaluation, observation and expression limits keep unresolved branches unknown', async () => {
  for (const budget of [
    'maxEvaluations',
    'maxFactorObservations',
    'maxExpressionOperations',
  ] as const) {
    const input = await lookaheadFixture();
    input.workflow.stages[1]!.program.factors.push({
      id: 'impossible',
      expression: { ref: 'bodySize' },
      bands: [{ min: 30, max: 40 }],
      mode: 'hard',
      scale: 1,
      category: 'test',
      provenance: {
        kind: 'brief',
        source: 'Synthetic impossible continuation',
      },
    });
    input.workflow.stages[0]!.lookahead![budget] = 1;
    const result = await runDecisionWorkflow(input);
    assert.equal(result.stages.composition!.status, 'failed');
    const lookahead = (result.stages.composition!.evidence as any).lookahead;
    assert.ok(lookahead.branches.every((b: any) => b.completion === 'unknown'));
    assert.ok(result.statistics.lookahead.evaluated <= 1);
    if (budget === 'maxFactorObservations')
      assert.ok(result.statistics.lookahead.factorEvaluations <= 1);
    if (budget === 'maxExpressionOperations')
      assert.ok(result.statistics.lookahead.expressionOperationUpperBound <= 1);
    assert.equal(result.statistics.neuralCalls, 0);
  }
});

test('unknown sibling inputs are not treated as successor feasibility', async () => {
  const input = await lookaheadFixture();
  const sibling = structuredClone(input.workflow.stages[0]!);
  sibling.id = 'sibling';
  delete sibling.lookahead;
  input.workflow.stages.push(sibling);
  input.workflow.stages[1]!.dependsOn!.push('sibling');
  const result = await runDecisionWorkflow(input);
  assert.equal(result.stages.composition!.status, 'failed');
  assert.equal(result.stages.sibling!.status, 'chosen');
  assert.equal(result.statistics.lookahead.evaluated, 0);
  assert.match(
    (result.stages.composition!.evidence as any).lookahead.branches[0]
      .successors[0].reason,
    /unresolved/,
  );
});

test('lookahead replay revalidates continuation witnesses without search or inference', async () => {
  const input = await lookaheadFixture();
  const first = await runDecisionWorkflow(input);
  const replay = await runDecisionWorkflow({
    ...input,
    recipe: first.recipe,
    mode: 'replay',
  });
  assert.equal(replay.status, 'replayed');
  assert.equal(replay.statistics.searches, 0);
  assert.equal(replay.statistics.evaluated, 0);
  assert.equal(replay.statistics.lookahead.searches, 0);
  assert.equal(replay.statistics.lookahead.revalidated, 3);
  assert.equal(replay.statistics.revalidated, 9);
  assert.equal(replay.statistics.neuralCalls, 0);
  const tampered = structuredClone(first.recipe);
  const entry = tampered.entries.composition!;
  entry.payload.continuation!.successors[0]!.alternatives[0] = {
    bodySize: 999,
  };
  entry.digest = hash(entry.payload);
  const rejected = await runDecisionWorkflow({
    ...input,
    recipe: tampered,
    mode: 'replay',
  });
  assert.equal(rejected.stages.composition!.status, 'stale');
  assert.equal(rejected.stages.typography!.status, 'blocked');
  assert.match(rejected.stages.composition!.reason!, /Invalid assignment/);
});

test('looked-ahead target changes invalidate the parent but preserve unrelated branches', async () => {
  const input = await lookaheadFixture();
  const independent = structuredClone(input.workflow.stages[0]!);
  independent.id = 'independent';
  delete independent.lookahead;
  input.workflow.stages.push(independent);
  const first = await runDecisionWorkflow(input);
  input.workflow.stages[1]!.program.factors[0]!.bands = [{ min: 16, max: 16 }];
  const replay = await runDecisionWorkflow({
    ...input,
    recipe: first.recipe,
    mode: 'replay',
  });
  assert.equal(replay.stages.composition!.status, 'stale');
  assert.equal(replay.stages.typography!.status, 'blocked');
  assert.equal(replay.stages.independent!.status, 'replayed');
  const changed = await runDecisionWorkflow({ ...input, recipe: first.recipe });
  assert.equal(changed.stages.composition!.status, 'chosen');
  assert.equal(changed.stages.typography!.status, 'chosen');
  assert.equal(changed.stages.independent!.status, 'replayed');
});

test('selector sees successor consequences and may revise preference guidance within viable paths', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'lookahead-selector-'));
  try {
    const input = await lookaheadFixture(),
      gguf = path.join(dir, 'test.gguf');
    await writeFile(gguf, 'test-only checkpoint bytes');
    input.selector = { gguf };
    input.workflow.stages[0]!.selection = 'local-selector';
    let seen = 0;
    const hooks = {
      testSelectorIdentity: 'successor-guidance-test',
      testSelector: async (request: any) => {
        seen++;
        const choices = request.payload.options.map((option: any) => ({
          id: option.id,
          ...JSON.parse(option.description),
        }));
        assert.ok(choices.some((a: any) => a.successors[0].jointlySatisfied));
        assert.ok(
          choices.some((a: any) => a.successors[0].preferenceViolations.length),
        );
        assert.equal(request.payload.state.lookahead.completion, 'require');
        assert.equal(request.payload.state.variables[0].unit, 'px');
        assert.equal(
          request.payload.state.lookahead.successorVariables.typography[0].unit,
          'px',
        );
        const violated = choices.flatMap(
          (a: any) => a.successors[0].preferenceViolations,
        )[0];
        assert.equal(violated.worstScenario.id, 'desktop');
        assert.ok(violated.worstScenario.residual > 0);
        assert.ok(violated.worstScenario.targetBands.length);
        assert.equal(Object.hasOwn(violated, 'source'), false);
        return {
          selected: choices.find((a: any) => a.assignment.contentWidth === 560)
            .id,
        };
      },
    };
    const result = await runDecisionWorkflow(input, hooks);
    assert.equal(result.stages.composition!.assignment!.contentWidth, 560);
    assert.equal(result.statistics.testSelectorCalls, 1);
    assert.equal(result.statistics.neuralCalls, 0);
    await runDecisionWorkflow(
      { ...input, recipe: result.recipe, mode: 'replay' },
      hooks,
    );
    assert.equal(seen, 1);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('selector dictionary, units and worst-scenario bands are bounded, and alias edits invalidate replay', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'workflow-aliases-'));
  try {
    const input = await fixture(),
      gguf = path.join(dir, 'test.gguf');
    await writeFile(gguf, 'test-only checkpoint bytes');
    input.selector = { gguf };
    const parent = input.workflow.stages[0]!;
    parent.selection = 'local-selector';
    const variable = parent.program.variables[0]!;
    variable.label = 'Reading column';
    variable.valueAliases = variable.values.map((value, i) => ({
      value,
      label: ['Narrow', 'Medium', 'Wide'][i]!,
    }));
    parent.program.scenarios.push({ id: 'enlarged', values: {} });
    parent.program.factors[0]!.bands = [{ min: 560, max: 720 }];
    parent.program.factors[0]!.scenarioBands = {
      enlarged: [{ min: 500, max: 500 }],
    };
    for (let i = 0; i < 15; i++)
      parent.program.factors.push({
        ...structuredClone(parent.program.factors[0]!),
        id: `extra-${i}`,
        provenance: { kind: 'brief', source: 's'.repeat(2000) },
      });
    const hooks = {
      testSelectorIdentity: 'semantic-dictionary-test',
      testSelector: async (request: any) => {
        const v = request.payload.state.variables[0];
        assert.equal(v.unit, 'px');
        assert.equal(v.label, 'Reading column');
        assert.deepEqual(v.valueAliases, variable.valueAliases);
        const option = JSON.parse(request.payload.options[0].description);
        assert.equal(option.preferences.length, 12);
        assert.equal(option.omittedPreferenceFactors, 4);
        assert.equal(option.preferences[0].worstScenario.id, 'enlarged');
        assert.equal(
          option.preferences[0].worstScenario.value,
          option.assignment.contentWidth,
        );
        assert.deepEqual(option.preferences[0].worstScenario.targetBands, [
          { min: 500, max: 500 },
        ]);
        assert.equal(option.preferences[0].unit, 'px');
        assert.ok(
          !JSON.stringify(request.payload).includes('s'.repeat(2000)),
          'Do not repeat full provenance in the prompt',
        );
        return { selected: request.payload.options[0].id };
      },
    };
    const first = await runDecisionWorkflow(input, hooks);
    assert.equal(first.status, 'proposed');
    for (const mutate of [
      (v: typeof variable) => {
        v.label = 'Different label';
      },
      (v: typeof variable) => {
        v.unit = 'different-unit';
      },
      (v: typeof variable) => {
        v.valueAliases![0]!.label = 'Different meaning';
      },
    ]) {
      const changed = structuredClone(input);
      mutate(changed.workflow.stages[0]!.program.variables[0]!);
      const replay = await runDecisionWorkflow(
        { ...changed, recipe: first.recipe, mode: 'replay' },
        hooks,
      );
      assert.equal(replay.stages.composition!.status, 'stale');
      assert.equal(replay.stages.typography!.status, 'blocked');
      assert.equal(replay.statistics.neuralCalls, 0);
      assert.equal(replay.statistics.testSelectorCalls, 0);
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('lookahead declarations and aggregate work reservations reject invalid plans before execution', async () => {
  const input = await lookaheadFixture();
  for (const mutate of [
    (x: DecisionWorkflowInput) => {
      x.workflow.stages[0]!.lookahead!.successors = ['composition'];
    },
    (x: DecisionWorkflowInput) => {
      x.workflow.stages[0]!.lookahead!.successors.push('typography');
    },
    (x: DecisionWorkflowInput) => {
      x.workflow.budgets = { maxEvaluations: 32 };
    },
    (x: DecisionWorkflowInput) => {
      x.workflow.budgets = { maxFactorObservations: 1000000 };
    },
    (x: DecisionWorkflowInput) => {
      x.workflow.budgets = { maxExpressionOperations: 10000000 };
    },
  ]) {
    const next = structuredClone(input);
    mutate(next);
    assert.throws(() => compileDecisionWorkflow(next));
  }
  const legacy = RunDecisionWorkflowSchema.parse(await fixture());
  assert.equal(Object.hasOwn(legacy.workflow.stages[0]!, 'lookahead'), false);
  assert.equal(
    Object.hasOwn(legacy.workflow.budgets, 'maxFactorObservations'),
    false,
  );
});
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
