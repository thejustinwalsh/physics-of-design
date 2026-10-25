import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createDesignActor,
  createDesignHandoff,
  replayDesignHandoff,
  resolveHandoff,
  type DesignHandoffInput,
} from '../src/decision-machine.js';
import { resolveDesignRuntime } from '../src/decision-runtime.js';
import { compileEnergy, type Expression } from '../src/energy.js';

const ref = (name: string): Expression => ({ ref: name });
const op = (
  operation: Exclude<Expression, number | { ref: string }>['op'],
  ...args: Expression[]
): Expression => ({ op: operation, args });

function fixture(): DesignHandoffInput {
  return {
    program: {
      version: 1,
      id: 'test-design',
      brief: {
        intent: 'Readable fluid panes with intentional gutters',
        source: 'test',
      },
      identity: { policy: 'test-v1', renderer: 'pending' },
      variables: [{ id: 'gutter', unit: 'px', values: [16, 24], locked: 16 }],
      scenarios: [
        { id: 'phone', values: { width: 390 } },
        { id: 'tablet', values: { width: 834 } },
      ],
      derived: [
        {
          id: 'contentWidth',
          expression: op('sub', ref('width'), op('mul', 2, ref('gutter'))),
          unit: 'px',
          provenance: { kind: 'calculated', source: 'inner allocation' },
        },
      ],
      factors: [
        {
          id: 'content-minimum',
          expression: ref('contentWidth'),
          bands: [{ min: 100, max: 2000 }],
          scale: 100,
          mode: 'hard',
          weight: 1,
          category: 'geometry',
          provenance: { kind: 'brief', source: 'declared pane range' },
        },
      ],
    },
    assignment: { gutter: 16 },
    machine: {
      id: 'reading-machine',
      initial: 'home',
      states: [
        {
          id: 'home',
          purpose: 'Choose a story',
          regions: [
            {
              id: 'list',
              role: 'story-list',
              bindings: { width: ref('contentWidth') },
            },
          ],
          on: [
            {
              event: 'OPEN',
              target: 'reader.detail',
              when: op('lte', 500, ref('width')),
              motion: 'open',
            },
          ],
        },
        {
          id: 'reader.detail',
          purpose: 'Read the story',
          regions: [
            {
              id: 'article',
              role: 'article',
              bindings: { width: ref('contentWidth') },
            },
          ],
          on: [{ event: 'BACK', target: 'home' }],
        },
      ],
      motions: {
        open: {
          stiffness: 100,
          damping: 20,
          mass: 1,
          channel: 'translateX',
          reducedMotion: 'instant',
        },
      },
      buildContract: {
        layout: 'flex',
        web: 'React + StyleX',
        native: 'React Native Text + Yoga',
        requirements: ['Remeasure actual text before acceptance'],
      },
    },
  };
}

function scenarioBandFixture(): DesignHandoffInput {
  const input = fixture();
  input.program.factors[0]!.bands = [{ min: 358, max: 358 }];
  input.program.factors[0]!.scenarioBands = {
    tablet: [{ min: 802, max: 802 }],
  };
  return input;
}

test('scenario bands agree across compiler, portable/trusted runtime, actor reflow and zero-search replay', () => {
  const input = scenarioBandFixture();
  assert.equal(
    compileEnergy(input.program).evaluate(input.assignment).hardFailures,
    0,
  );
  const handoff = createDesignHandoff(input);
  for (const scenario of input.program.scenarios) {
    const portable = resolveDesignRuntime(handoff, scenario.values);
    assert.equal(portable.admissible, true);
    assert.equal(portable.scenarioResolution.scenarioId, scenario.id);
    assert.deepEqual(resolveHandoff(handoff, scenario.values), portable);
    const replay = replayDesignHandoff({
      program: input.program,
      machine: input.machine,
      recipe: handoff,
      scenario: scenario.values,
    });
    assert.equal(replay.status, 'replayed');
    assert.equal(replay.selectorCalls, 0);
    assert.ok('energySearches' in replay && replay.energySearches === 0);
  }
  const actor = createDesignActor(handoff, { width: 390 }).start();
  actor.send({
    type: 'REFLOW',
    scenario: { width: 834 },
    scenarioId: 'tablet',
  });
  assert.equal(actor.getSnapshot().context.facts.admissible, true);
  assert.equal(actor.getSnapshot().context.facts.values.width, 834);
  actor.send({
    type: 'REFLOW',
    scenario: { width: 390 },
    scenarioId: 'tablet',
  });
  assert.equal(actor.getSnapshot().context.reflow.status, 'rejected');
  assert.equal(actor.getSnapshot().context.facts.values.width, 834);
  actor.stop();
  assert.throws(
    () => resolveHandoff(handoff, { width: 390 }, { scenarioId: 'tablet' }),
    /exactly/,
  );
  assert.throws(
    () =>
      resolveDesignRuntime(handoff, { width: 390 }, { scenarioId: 'missing' }),
    /exactly/,
  );
});

test('restrictive named bands cannot falsely pass a permissive base band', () => {
  const input = scenarioBandFixture();
  input.program.factors[0]!.bands = [{ min: 100, max: 2000 }];
  delete input.program.variables[0]!.locked;
  const handoff = createDesignHandoff(input);
  const invalid = { ...handoff, assignment: { gutter: 24 } };
  assert.equal(
    compileEnergy(input.program).evaluate(invalid.assignment).hardFailures,
    1,
  );
  const facts = resolveDesignRuntime(invalid, { width: 834 });
  assert.equal(facts.admissible, false);
  assert.deepEqual(facts.failures, ['content-minimum']);
  assert.throws(
    () => createDesignHandoff({ ...input, assignment: invalid.assignment }),
    /rejected/,
  );
});

test('duplicate vectors with divergent bands require an explicit matching scenario ID', () => {
  const input = fixture();
  input.program.scenarios.push({
    id: 'phone-alternate',
    values: { width: 390 },
  });
  input.program.factors[0]!.scenarioBands = {
    'phone-alternate': [{ min: 350, max: 400 }],
  };
  const handoff = createDesignHandoff(input);
  const ambiguous = resolveHandoff(handoff, { width: 390 });
  assert.equal(ambiguous.admissible, false);
  assert.equal(ambiguous.applicability, 'scenario-bands-unresolved');
  assert.deepEqual(ambiguous.scenarioResolution.unresolvedFactors, [
    'content-minimum',
  ]);
  assert.throws(
    () => createDesignActor(handoff, { width: 390 }),
    /applicability/,
  );
  const actor = createDesignActor(
    handoff,
    { width: 390 },
    { scenarioId: 'phone-alternate' },
  ).start();
  actor.send({ type: 'REFLOW', scenario: { width: 390 } });
  assert.equal(actor.getSnapshot().context.reflow.status, 'requires-search');
  assert.equal(
    actor.getSnapshot().context.facts.scenarioResolution.scenarioId,
    'phone-alternate',
  );
  actor.send({ type: 'REFLOW', scenario: { width: 390 }, scenarioId: 'phone' });
  assert.equal(actor.getSnapshot().context.reflow.status, 'resolved');
  actor.stop();
  const replay = replayDesignHandoff({
    program: input.program,
    machine: input.machine,
    recipe: handoff,
    scenario: { width: 390 },
    scenarioId: 'phone-alternate',
  });
  assert.equal(replay.status, 'replayed');
  input.program.factors[0]!.scenarioBands!['phone-alternate'] =
    input.program.factors[0]!.bands;
  assert.equal(
    resolveHandoff(createDesignHandoff(input), { width: 390 }).admissible,
    true,
  );
});

test('unsampled hard overrides fail closed unless an identity-bound base-band policy is declared', () => {
  const input = scenarioBandFixture();
  input.program.factors[0]!.bands = [{ min: 300, max: 900 }];
  const handoff = createDesignHandoff(input);
  const unresolved = resolveHandoff(handoff, { width: 600 });
  assert.equal(unresolved.admissible, false);
  assert.equal(unresolved.applicability, 'scenario-bands-unresolved');
  assert.equal(unresolved.scenarioResolution.status, 'unresolved');
  assert.equal(
    resolveHandoff(createDesignHandoff(fixture()), { width: 600 }).admissible,
    true,
  );
  input.runtimePolicy = { unsampledScenarioBands: 'base' };
  const permitted = createDesignHandoff(input);
  assert.notEqual(permitted.identity, handoff.identity);
  const resolved = resolveHandoff(permitted, { width: 600 });
  assert.equal(resolved.admissible, true);
  assert.equal(resolved.scenarioResolution.status, 'explicit-base-policy');
  assert.deepEqual(resolveDesignRuntime(permitted, { width: 600 }), resolved);
  assert.equal(
    resolveHandoff(permitted, { width: 1000 }).admissible,
    false,
    'Explicit base policy does not expand the input envelope',
  );
  const replayInput = {
    program: input.program,
    machine: input.machine,
    runtimePolicy: input.runtimePolicy,
    recipe: permitted,
    scenario: { width: 600 },
  };
  assert.equal(replayDesignHandoff(replayInput).status, 'replayed');
  const { runtimePolicy, ...withoutPolicy } = replayInput;
  assert.equal(replayDesignHandoff(withoutPolicy).status, 'invalidated');
  const old = structuredClone(handoff) as any;
  delete old.runtimeSemantics;
  assert.equal(
    replayDesignHandoff({ ...withoutPolicy, recipe: old }).status,
    'invalidated',
  );
});

test('unsampled preference overrides remain unresolved without inventing a hard layout failure', () => {
  const input = fixture();
  input.program.factors.push({
    id: 'soft-scale',
    expression: ref('contentWidth'),
    bands: [{ min: 350, max: 400 }],
    scenarioBands: { tablet: [{ min: 790, max: 810 }] },
    scale: 1,
    mode: 'preference',
    category: 'test',
    provenance: { kind: 'brief', source: 'Synthetic responsive preference' },
  });
  const handoff = createDesignHandoff(input);
  const facts = resolveHandoff(handoff, { width: 600 });
  assert.equal(facts.admissible, true);
  assert.deepEqual(facts.failures, []);
  assert.equal(facts.scenarioResolution.status, 'unresolved');
  assert.deepEqual(facts.scenarioResolution.unresolvedFactors, ['soft-scale']);
  input.program.scenarios.push({
    id: 'phone-alternate',
    values: { width: 390 },
  });
  input.program.factors[1]!.scenarioBands!['phone-alternate'] = [
    { min: 358, max: 358 },
  ];
  assert.equal(
    resolveHandoff(createDesignHandoff(input), { width: 390 }).admissible,
    false,
    'Divergent named meanings require explicit scenario selection even for preference bands',
  );
});

test('handoff resolves numeric design decisions and keeps renderer verification pending', () => {
  const handoff = createDesignHandoff(fixture());
  assert.equal(handoff.verification.status, 'pending-renderer-verification');
  assert.equal(handoff.decisions[0]!.chosen, 16);
  assert.equal(handoff.decisions[0]!.locked, true);
  const facts = resolveHandoff(handoff, { width: 390 });
  assert.equal(facts.values.contentWidth, 358);
  assert.equal(facts.regions.home!.list!.width, 358);
  assert.equal(facts.motions.open!.mass, 1);
  assert.equal(facts.admissible, true);
});

test('exact serialized recipe replays with zero selector calls and freshly calculated facts', () => {
  const input = fixture();
  const recipe = JSON.parse(JSON.stringify(createDesignHandoff(input)));
  const replay = replayDesignHandoff({
    program: input.program,
    machine: input.machine,
    recipe,
    scenario: { width: 834 },
  });
  assert.equal(replay.status, 'replayed');
  assert.equal(replay.selectorCalls, 0);
  assert.ok('resolved' in replay);
  assert.equal(replay.resolved.values.contentWidth, 802);
  assert.equal(replay.energySearches, 0);
  assert.equal(replay.rendererVerification, 'pending');
});

test('brief, tool identity, assignment and machine edits invalidate persisted recipes', () => {
  const original = fixture();
  const recipe = createDesignHandoff(original);
  for (const change of [
    (x: DesignHandoffInput) => {
      x.program.brief.intent = 'A different intent';
    },
    (x: DesignHandoffInput) => {
      x.program.identity = { policy: 'test-v2' };
    },
    (x: DesignHandoffInput) => {
      x.machine.states[0]!.purpose = 'A different role';
    },
  ]) {
    const input = structuredClone(original);
    change(input);
    assert.equal(
      replayDesignHandoff({
        program: input.program,
        machine: input.machine,
        recipe,
        scenario: { width: 390 },
      }).status,
      'invalidated',
    );
  }
  assert.throws(
    () =>
      replayDesignHandoff({
        program: original.program,
        machine: original.machine,
        recipe: { ...recipe, assignment: { gutter: 24 } },
        scenario: { width: 390 },
      }),
    /Invalid assignment/,
  );
});

test('fresh hard failures require search and forged cached facts invalidate the recipe', () => {
  const input = fixture();
  const recipe = createDesignHandoff(input);
  const replay = replayDesignHandoff({
    program: input.program,
    machine: input.machine,
    recipe,
    scenario: { width: 80 },
  });
  assert.equal(replay.status, 'requires-search');
  assert.ok('resolved' in replay);
  assert.equal(replay.resolved.admissible, false);
  assert.equal(replay.resolved.failures[0], 'content-minimum');
  const forged = replayDesignHandoff({
    program: input.program,
    machine: input.machine,
    recipe: { ...recipe, feasible: true, resolved: { contentWidth: 99999 } },
    scenario: { width: 390 },
  });
  assert.equal(forged.status, 'invalidated');
});

test('dotted state IDs execute as flat named states and guards use current facts', () => {
  const actor = createDesignActor(createDesignHandoff(fixture()), {
    width: 390,
  });
  actor.start();
  actor.send({ type: 'OPEN' });
  assert.equal(actor.getSnapshot().value, 'home');
  actor.send({ type: 'REFLOW', scenario: { width: 834 } });
  actor.send({ type: 'OPEN' });
  assert.equal(actor.getSnapshot().value, 'reader.detail');
  actor.send({ type: 'BACK' });
  assert.equal(actor.getSnapshot().value, 'home');
  actor.stop();
});

test('invalid REFLOW preserves a live actor that can recover on a later valid viewport', () => {
  const actor = createDesignActor(createDesignHandoff(fixture()), {
    width: 390,
  });
  const errors: unknown[] = [];
  actor.subscribe({ error: (error) => errors.push(error) });
  actor.start();
  actor.send({ type: 'REFLOW', scenario: { width: 80 } });
  assert.equal(actor.getSnapshot().status, 'active');
  assert.equal(actor.getSnapshot().context.facts.values.width, 390);
  actor.send({ type: 'REFLOW', scenario: { width: 834 } });
  assert.equal(actor.getSnapshot().context.facts.values.width, 834);
  actor.send({ type: 'OPEN' });
  assert.equal(actor.getSnapshot().value, 'reader.detail');
  assert.deepEqual(errors, []);
  actor.stop();
});

test('actor guards and bindings cannot be rewritten through caller-owned handoff objects', () => {
  const handoff = createDesignHandoff(fixture());
  const actor = createDesignActor(handoff, { width: 390 });
  actor.start();
  const guard = handoff.machine.states[0]!.on[0]!.when!;
  if (typeof guard !== 'number' && 'args' in guard) {
    try {
      guard.args[0] = 1;
    } catch {
      /* frozen handoffs reject edits */
    }
  }
  try {
    handoff.machine.states[0]!.regions[0]!.bindings.width = 1;
  } catch {
    /* frozen handoffs reject edits */
  }
  actor.send({ type: 'OPEN' });
  assert.equal(actor.getSnapshot().value, 'home');
  actor.send({ type: 'REFLOW', scenario: { width: 834 } });
  assert.equal(
    actor.getSnapshot().context.facts.regions.home!.list!.width,
    802,
  );
  actor.stop();
});

test('binding and guard operators reject wrong arity and hidden unknown references', () => {
  for (const expression of [
    op('div', 4, 2, 100),
    op('lt', 1),
    op('if', 1, 2, ref('missing')),
  ]) {
    const input = fixture();
    input.machine.states[0]!.regions[0]!.bindings.width = expression;
    assert.throws(() => createDesignHandoff(input));
  }
  const input = fixture();
  input.machine.states[0]!.on[0]!.when = op('lt', 1);
  assert.throws(() => createDesignHandoff(input));
});

test('unknown motion references and invalid resolved spring parameters fail at handoff creation', () => {
  const missing = fixture();
  missing.machine.states[0]!.on[0]!.motion = 'unregistered';
  assert.throws(() => createDesignHandoff(missing));
  for (const [field, value] of [
    ['mass', 0],
    ['mass', -1],
    ['stiffness', 0],
    ['damping', -1],
  ] as const) {
    const input = fixture();
    input.machine.motions!.open![field] = value;
    assert.throws(() => createDesignHandoff(input));
  }
});

test('portable runtime matches trusted resolution and cannot override fixed decisions', () => {
  const handoff = createDesignHandoff(fixture());
  const portable = resolveDesignRuntime(handoff, { width: 834 });
  const trusted = resolveHandoff(handoff, { width: 834 });
  assert.deepEqual(portable.values, trusted.values);
  assert.deepEqual(portable.regions, trusted.regions);
  assert.deepEqual(portable.motions, trusted.motions);
  assert.equal(portable.admissible, trusted.admissible);
  for (const scenario of [
    { width: 834, gutter: 999 },
    { width: Infinity },
    {},
    { width: 834, unexpected: 1 },
  ]) {
    assert.throws(() => resolveDesignRuntime(handoff, scenario));
    assert.throws(() => resolveHandoff(handoff, scenario));
  }
});

test('portable and trusted runtimes enforce the same applicability and spring domains', () => {
  const handoff = createDesignHandoff(fixture());
  assert.equal(resolveHandoff(handoff, { width: 900 }).admissible, false);
  assert.equal(resolveDesignRuntime(handoff, { width: 900 }).admissible, false);
  const input = fixture();
  input.machine.motions!.open!.mass = op(
    'sub',
    op('pow', op('sub', ref('width'), 600), 2),
    100,
  );
  const nonlinear = createDesignHandoff(input);
  assert.throws(() => resolveHandoff(nonlinear, { width: 600 }), /spring/i);
  assert.throws(
    () => resolveDesignRuntime(nonlinear, { width: 600 }),
    /spring/i,
  );
});

test('runtime-invalid guard arithmetic rejects reflow without killing navigation', () => {
  const input = fixture();
  input.machine.states[0]!.on[0]!.when = op(
    'div',
    1,
    op('sub', ref('width'), 600),
  );
  const actor = createDesignActor(createDesignHandoff(input), { width: 390 });
  const errors: unknown[] = [];
  actor.subscribe({ error: (error) => errors.push(error) });
  actor.start();
  actor.send({ type: 'REFLOW', scenario: { width: 600 } });
  assert.equal(actor.getSnapshot().status, 'active');
  assert.equal(actor.getSnapshot().context.facts.values.width, 390);
  assert.equal(actor.getSnapshot().context.reflow.status, 'rejected');
  actor.send({ type: 'OPEN' });
  assert.equal(actor.getSnapshot().value, 'reader.detail');
  assert.deepEqual(errors, []);
  actor.stop();
});

test('authored responsive copy and its provenance participate in replay identity', () => {
  const input = fixture();
  input.machine.content = {
    home: {
      default: 'Build momentum',
      compact: 'Build your pace',
      source: 'approved brief',
    },
  };
  const recipe = createDesignHandoff(input);
  for (const field of ['default', 'compact', 'source'] as const) {
    const changed = structuredClone(input);
    changed.machine.content!.home![field] += ' changed';
    const replacement = createDesignHandoff(changed);
    assert.notEqual(replacement.identity, recipe.identity);
    const replay = replayDesignHandoff({
      program: changed.program,
      machine: changed.machine,
      recipe,
      scenario: { width: 390 },
    });
    assert.equal(replay.status, 'invalidated');
  }
  assert.throws(() =>
    createDesignHandoff({
      ...input,
      machine: {
        ...input.machine,
        content: { home: { default: 'Build', compact: 'Build', source: '' } },
      },
    }),
  );
});

test('literal zero transition guard blocks while literal one and absent guards enable', () => {
  for (const guard of [0, 1, undefined]) {
    const input = fixture();
    const transition = input.machine.states[0]!.on[0]!;
    if (guard === undefined) delete transition.when;
    else transition.when = guard;
    const handoff = createDesignHandoff(input);
    const actor = createDesignActor(handoff, { width: 390 }).start();
    actor.send({ type: 'OPEN' });
    assert.equal(
      actor.getSnapshot().value,
      guard === 0 ? 'home' : 'reader.detail',
    );
    actor.stop();
  }
});
