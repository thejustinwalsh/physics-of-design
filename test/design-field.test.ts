import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { hash } from '../src/identity.js';
import { compileEnergy, searchEnergy } from '../src/energy.js';
import { DESIGN_FIELD_MOTION_ROLES } from '../src/design-field-vocabulary.js';
import {
  compileDesignField,
  DesignFieldBriefSchema,
  designFieldMeasurementRequests,
  designFieldValidationIdentity,
  runDesignField,
} from '../src/design-field.js';
const brief = () =>
  JSON.parse(readFileSync('examples/design-field/brief.json', 'utf8'));
test('field categorical vocabulary is shared, labelled, and complete over its numeric domain', () => {
  const input = fixture();
  const { workflow } = compileDesignField(input);
  const role = workflow.stages
    .find((s) => s.id === 'expression')!
    .program.variables.find((v) => v.id === 'motionRole')!;
  assert.equal(role.unit, 'role-index');
  assert.equal(role.label, 'Motion role');
  assert.deepEqual(
    role.valueAliases,
    DESIGN_FIELD_MOTION_ROLES.map((label, value) => ({ value, label })),
  );
  assert.ok(
    workflow.stages.every((s) => s.program.variables.every((v) => v.label)),
  );
});
test('finalist receipt identity binds rendered typography, image framing, compared measurements and runtime', () => {
  const request = {
    brief: brief(),
    measurements: JSON.parse(
      readFileSync('examples/design-field/measurements.json', 'utf8'),
    ),
    tokens: JSON.parse(
      readFileSync('examples/design-field/gallery-session.json', 'utf8'),
    ).tokens,
  };
  const runtime = 'Chromium identity-test-only';
  const identity = designFieldValidationIdentity(request, runtime);
  assert.equal(
    designFieldValidationIdentity(structuredClone(request), runtime),
    identity,
  );
  for (const change of [
    (r: typeof request) => {
      r.brief.typography.titleLeading += 0.04;
    },
    (r: typeof request) => {
      r.brief.typography.titleTrackingEm += 0.01;
    },
    (r: typeof request) => {
      r.brief.titleFont.opticalSizing = 'auto';
    },
    (r: typeof request) => {
      r.brief.image.focalX = r.brief.image.focalX === 0 ? 1 : 0;
    },
    (r: typeof request) => {
      r.measurements.identity = '0'.repeat(64);
    },
  ]) {
    const changed = structuredClone(request);
    change(changed);
    assert.notEqual(designFieldValidationIdentity(changed, runtime), identity);
  }
  assert.notEqual(
    designFieldValidationIdentity(request, 'Chromium changed-runtime'),
    identity,
  );
  // Schema defaults must not distinguish equivalent explicit and omitted settings.
  const explicit = structuredClone(request),
    omitted = structuredClone(request);
  explicit.brief.titleFont.axes = {};
  delete omitted.brief.titleFont.axes;
  assert.equal(
    designFieldValidationIdentity(explicit, runtime),
    designFieldValidationIdentity(omitted, runtime),
  );
});
// Explicitly synthetic geometry tests the compiler/cache mechanics, not a renderer.
function fixture() {
  const b = DesignFieldBriefSchema.parse(brief());
  delete b.designContext;
  const digest = (file: string) =>
    createHash('sha256').update(readFileSync(file)).digest('hex');
  const sources = {
    titleFont: digest(b.titleFont.file),
    bodyFont: digest(b.bodyFont.file),
    image: digest(b.image.file),
    briefSource: digest(b.source),
    content: hash({ title: b.title, body: b.body, action: b.action }),
  };

  // Source identity is supplied by the genuine collector contract; use the recorded
  // receipt when available so fixture tests never recreate production identity logic.
  const real = JSON.parse(
    readFileSync('examples/design-field/gallery-session.json', 'utf8'),
  );
  const recorded = JSON.parse(
    readFileSync('examples/design-field/measurements.json', 'utf8'),
  );
  assert.equal(real.sources.content, sources.content);
  const base = {
    ...recorded,
    provider: 'test-fixture',
    runtime: 'explicit synthetic test geometry',
    sources,
    rows: designFieldMeasurementRequests(b).map((r) => ({
      scenario: r.scenario,
      key: r.key,
      width: r.measure,
      height: r.effectiveSize * r.leading * (r.kind === 'title' ? 2 : 4),
      lines: r.kind === 'title' ? 2 : 4,
      overflowX: 0,
      fontLoaded: true,
    })),
  };
  delete base.identity;
  return { brief: b, measurements: { ...base, identity: hash(base) } };
}
test('compiler rejects missing/duplicated measurements and altered content instead of trusting receipt flags', () => {
  const f = fixture();
  compileDesignField(f);
  for (const change of [
    (x: any) => x.measurements.rows.pop(),
    (x: any) => (x.measurements.rows[1] = x.measurements.rows[0]),
    (x: any) => (x.brief.title = 'Unmeasured replacement'),
  ]) {
    const next = structuredClone(f);
    change(next);
    const { identity, ...base } = next.measurements;
    next.measurements.identity = hash(base);
    assert.throws(() => compileDesignField(next));
  }
});
test('a downstream tension change preserves reading identity and changes expression preferences', () => {
  const f = fixture(),
    a = compileDesignField(f);
  f.brief.targets.tension = [0.3, 0.42];
  const b = compileDesignField(f);
  assert.equal(hash(a.workflow.stages[0]), hash(b.workflow.stages[0]));
  assert.notEqual(hash(a.workflow.stages[1]), hash(b.workflow.stages[1]));
  const factor = a.workflow.stages[1]!.program.factors.find(
    (f) => f.id === 'deliberate-tension',
  )!;
  assert.ok(factor.bands[0]!.min > 0);
  assert.equal(factor.mode, 'preference');
});

test('measured reading plateaus cover content widths and expression frontiers retain distinct frame geometry', () => {
  const b = brief();
  delete b.designContext;
  const measurements = JSON.parse(
    readFileSync('examples/design-field/measurements.json', 'utf8'),
  );
  const { workflow } = compileDesignField({ brief: b, measurements });
  const reading = searchEnergy({
    program: workflow.stages[0]!.program,
    options: workflow.stages[0]!.options,
  });
  assert.equal(reading.retention!.paretoComplete, true);
  assert.equal(reading.retention!.retainedPreferenceProfiles, 1);
  assert.deepEqual(
    [...new Set(reading.candidates.map((a) => a.assignment.contentMax))].sort(
      (a, b) => a! - b!,
    ),
    [900, 1080],
  );
  assert.ok(
    new Set(reading.candidates.map((a) => a.derived.ipad!.titleHeight)).size >
      1,
  );
  const expression = structuredClone(workflow.stages[1]!);
  for (const scenario of expression.program.scenarios)
    Object.assign(scenario.values, reading.candidates[0]!.assignment);
  const run = searchEnergy({
    program: expression.program,
    options: expression.options,
  });
  assert.ok(run.retention!.retainedPreferenceProfiles > 1);
  assert.ok(
    new Set(
      run.candidates.map(
        (a) => `${a.assignment.imageAspect}/${a.assignment.imageShare}`,
      ),
    ).size > 1,
  );
  assert.ok(run.candidates.every((a) => !a.hardFailures));
});

test('scenario overrides change only conditioned expression policy and diagnose the original enlarged-phone conflict', () => {
  const f = fixture();
  delete f.brief.targets.imageToTextHeightByScenario;
  const old = compileDesignField(f);
  f.brief.targets.imageToTextHeightByScenario = { 'phone-large': [0.08, 0.25] };
  const updated = compileDesignField(f);
  assert.deepEqual(updated.workflow.stages[0], old.workflow.stages[0]);
  const oldFactor = old.workflow.stages[1]!.program.factors.find(
    (x) => x.id === 'image-type-counterpoint',
  )!;
  const updatedFactor = updated.workflow.stages[1]!.program.factors.find(
    (x) => x.id === 'image-type-counterpoint',
  )!;
  assert.equal(oldFactor.scenarioBands, undefined);
  assert.deepEqual(updatedFactor.scenarioBands, {
    'phone-large': [{ min: 0.08, max: 0.25 }],
  });
  const b = brief();
  delete b.designContext;
  delete b.targets.imageToTextHeightByScenario;
  const measured = compileDesignField({
    brief: b,
    measurements: JSON.parse(
      readFileSync('examples/design-field/measurements.json', 'utf8'),
    ),
  });
  const stage = measured.workflow.stages[1]!;
  const saved = JSON.parse(
    readFileSync('examples/design-field/gallery-session.json', 'utf8'),
  ).tokens;
  for (const scenario of stage.program.scenarios)
    for (const binding of stage.bindings)
      scenario.values[binding.input] = saved[binding.variable];
  const result = searchEnergy({
    program: stage.program,
    options: stage.options,
  });
  const phone = result.retention!.preferences.find(
    (f) => f.id === 'image-type-counterpoint' && f.scenario === 'phone-large',
  )!;
  assert.equal(result.statistics.complete, true);
  assert.equal(phone.satisfiedAssignments, 0);
  assert.ok(phone.observedRange[1]! < phone.targetBands[0]!.min);
});
test('source-bound numeric session explores hundreds of alternatives and replays without inference', async () => {
  const f = fixture();
  const first = await runDesignField(f);
  assert.equal(first.workflow.status, 'proposed');
  assert.equal(first.workflow.statistics.evaluated, 3132);
  assert.equal(first.workflow.statistics.lookahead.evaluated, 2592);
  assert.equal(first.workflow.statistics.lookahead.reusedSearches, 1);
  assert.equal(first.workflow.statistics.neuralCalls, 0);
  assert.equal(first.measurements.provider, 'test-fixture');
  const replay = await runDesignField({
    ...f,
    recipe: first.workflow.recipe,
    mode: 'replay',
  });
  assert.equal(replay.workflow.status, 'replayed');
  assert.equal(replay.workflow.statistics.evaluated, 0);
  assert.equal(replay.workflow.statistics.neuralCalls, 0);
  const changed = structuredClone(f);
  changed.brief.weights.material += 1;
  const partial = await runDesignField({
    ...changed,
    recipe: first.workflow.recipe,
    mode: 'replay',
  });
  assert.equal(partial.workflow.stages.reading.status, 'stale');
  assert.equal(partial.workflow.stages.expression.status, 'blocked');
  const current = first.analyses.expression!;
  assert.equal(current.effects.length, 5);
  assert.ok(
    current.effects.some((x) =>
      x.probes.some((p) => 'energyChange' in p && p.energyChange !== 0),
    ),
  );
});

test('measured field lookahead reaches a jointly satisfied expression path from the reading plateau', async () => {
  const b = brief();
  const measurements = JSON.parse(
    readFileSync('examples/design-field/measurements.json', 'utf8'),
  );
  const result = await runDesignField({ brief: b, measurements });
  assert.equal(result.workflow.status, 'proposed');
  assert.equal(result.analyses.expression!.baseline.energy, 0);
  assert.equal(result.tokens.contentMax, 900);
  assert.equal(result.tokens.titleSize, 64);
  assert.equal(result.tokens.leading, 1.65);
  assert.equal(result.workflow.statistics.evaluated, 3132);
  assert.equal(result.workflow.statistics.lookahead.evaluated, 2592);
  assert.equal(result.workflow.statistics.lookahead.branches, 6);
  assert.equal(result.workflow.statistics.lookahead.reusedSearches, 1);
  assert.equal(result.workflow.statistics.neuralCalls, 0);
  assert.ok(Buffer.byteLength(JSON.stringify(result)) < 2 * 1024 * 1024);
  const branches = (result.workflow.stages.reading.evidence as any).lookahead
    .branches;
  assert.ok(
    branches.every((branch: any) =>
      branch.successors.every(
        (s: any) =>
          !Object.hasOwn(s.search, 'program') &&
          !Object.hasOwn(s.search, 'choiceGraph'),
      ),
    ),
  );
  const replay = await runDesignField({
    brief: b,
    measurements,
    recipe: result.workflow.recipe,
    mode: 'replay',
  });
  assert.equal(replay.workflow.status, 'replayed');
  assert.equal(replay.workflow.statistics.evaluated, 0);
  assert.equal(replay.workflow.statistics.lookahead.revalidated, 6);
});
test('hard measured overflow remains separate from preference energy even at zero weights', () => {
  const f = fixture();
  for (const row of f.measurements.rows) row.overflowX = 20;
  const { identity, ...base } = f.measurements;
  f.measurements.identity = hash(base);
  for (const k of Object.keys(f.brief.weights)) (f.brief.weights as any)[k] = 0;
  const c = compileDesignField(f),
    p = c.workflow.stages[0]!.program,
    assignment = Object.fromEntries(
      p.variables.map((v) => [v.id, v.values[0]!]),
    );
  const e = compileEnergy(p).evaluate(assignment);
  assert.ok(e.hardFailures > 0);
  assert.ok(
    e.factors.filter((f) => f.mode === 'hard').every((f) => f.energy === 0),
  );
});

test('DESIGN.md identity changes invalidate choices without invalidating reusable text measurements', async () => {
  const { mkdtemp, writeFile, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const dir = await mkdtemp(join(tmpdir(), 'field-context-'));
  try {
    const f = fixture();
    f.brief.designContext = join(dir, 'DESIGN.md');
    await writeFile(
      f.brief.designContext,
      '# Test authored direction\nFirst intent.\n',
    );
    const first = await runDesignField(f);
    await writeFile(
      f.brief.designContext,
      '# Test authored direction\nChanged intent.\n',
    );
    const next = await runDesignField({
      ...f,
      recipe: first.workflow.recipe,
      mode: 'replay',
    });
    assert.equal(next.workflow.stages.reading.status, 'stale');
    assert.equal(next.workflow.stages.expression.status, 'blocked');
    assert.equal(next.measurements.identity, first.measurements.identity);
    assert.equal(next.workflow.statistics.neuralCalls, 0);
    assert.equal(next.ledger[0]!.command, 'context inspect');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
