// Isolated numerical/renderer proof. No neural calls and no gallery publication.
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import {
  collectDesignFieldMeasurements,
  compileDesignField,
  validateDesignFieldFinalist,
} from '../dist/design-field.js';
import { compileEnergy, searchEnergy } from '../dist/energy.js';
import { inspectDesignContext } from '../dist/design-context.js';
import { hash } from '../dist/identity.js';

const output =
  process.env.DESIGN_CHOICE_OUTPUT ?? 'artifacts/choice-effectiveness';
await mkdir(output, { recursive: true });
const save = (name, value) =>
  writeFile(`${output}/${name}.json`, JSON.stringify(value, null, 2) + '\n');
const brief = JSON.parse(
  await readFile('examples/design-field/brief.json', 'utf8'),
);
const measurements = await collectDesignFieldMeasurements(brief);
await save('current-measurements', measurements);
const context = await inspectDesignContext({ file: brief.designContext });
assert.equal(context.status, 'found');
const oldBrief = structuredClone(brief);
delete oldBrief.targets.imageToTextHeightByScenario;
// The recorded historical gallery choice, fixed for the retention-only ablation.
const historicalReading = {
  bodySize: 16,
  contentMax: 1080,
  gap: 32,
  leading: 1.35,
  titleSize: 52,
};
const vector = (a) =>
  a.factors.filter((f) => f.mode === 'preference').map((f) => f.energy);
const profileKey = (a) => JSON.stringify(vector(a));
const geometryKey = (a) =>
  `${a.assignment.imageShare}/${a.assignment.imageAspect}`;
const runs = {};
const summary = {};

function inspectRun(name, inputBrief, retention) {
  const { workflow } = compileDesignField({
    brief: inputBrief,
    measurements,
    designContextIdentity: context.sha256,
  });
  const result = {};
  for (const stage of workflow.stages) {
    const program = structuredClone(stage.program);
    for (const scenario of program.scenarios)
      for (const binding of stage.bindings)
        scenario.values[binding.input] = historicalReading[binding.variable];
    const options = { ...stage.options, retention };
    const search = searchEnergy({ program, options });
    assert.equal(search.statistics.complete, true);
    const engine = compileEnergy(program);
    const all = search.choiceGraph.nodes
      .filter((n) => n.seed)
      .map((n) => engine.evaluate(n.seed))
      .filter((a) => !a.hardFailures);
    const profiles = new Map();
    for (const a of all) {
      const key = profileKey(a);
      if (!profiles.has(key))
        profiles.set(key, { vector: vector(a), assignments: [] });
      profiles.get(key).assignments.push(a.assignment);
    }
    const unique = [...profiles.values()];
    // Independent all-pairs oracle is deliberately confined to this small field.
    assert.ok(unique.length < 1000);
    const frontier = unique.filter(
      (a) =>
        !unique.some(
          (b) =>
            b.vector.every((n, i) => n <= a.vector[i]) &&
            b.vector.some((n, i) => n < a.vector[i]),
        ),
    );
    result[stage.id] = { search, profiles: unique, oracleFrontier: frontier };
    summary[`${name}/${stage.id}`] = {
      evaluated: search.statistics.evaluated,
      admissible: all.length,
      profiles: profiles.size,
      paretoProfiles: frontier.length,
      retainedProfiles: new Set(search.candidates.map(profileKey)).size,
      retained: search.candidates.map((a) => ({
        assignment: a.assignment,
        energy: a.energy,
      })),
      comparisons: search.retention?.comparisons ?? null,
      coverageComplete: search.retention?.paretoComplete ?? null,
      unachievablePreferences:
        search.retention?.preferences.filter(
          (p) => p.satisfiedAssignments === 0,
        ) ?? null,
      jointlySatisfiedAssignments:
        search.retention?.jointlySatisfiedAssignments ?? null,
    };
    if (retention === 'pareto-diverse') {
      assert.equal(search.retention.paretoComplete, true);
      assert.equal(search.retention.paretoProfiles, frontier.length);
      const complete = searchEnergy({
        program,
        options: { ...options, limit: 24 },
      });
      assert.equal(
        new Set(complete.candidates.map(profileKey)).size,
        frontier.length,
      );
      result[stage.id].expandedCoverage = complete;
    }
  }
  runs[name] = result;
  return result;
}
const legacy = inspectRun('original-ranked', oldBrief, 'ranked');
const retentionOnly = inspectRun('original-pareto', oldBrief, 'pareto-diverse');
const revised = inspectRun('responsive-pareto', brief, 'pareto-diverse');
await save('runs', runs);
for (const id of ['reading', 'expression']) {
  assert.equal(
    legacy[id].search.programIdentity,
    retentionOnly[id].search.programIdentity,
  );
  assert.deepEqual(
    legacy[id].search.choiceGraph,
    retentionOnly[id].search.choiceGraph,
  );
  assert.equal(
    legacy[id].search.candidates[0].id,
    retentionOnly[id].search.candidates[0].id,
  );
}
assert.equal(
  new Set(legacy.expression.search.candidates.map((a) => a.energy)).size,
  1,
);
assert.equal(
  new Set(legacy.expression.search.candidates.map(geometryKey)).size,
  1,
);
assert.equal(
  new Set(retentionOnly.expression.search.candidates.map(profileKey)).size,
  6,
);
assert.ok(
  new Set(retentionOnly.expression.search.candidates.map(geometryKey)).size > 1,
);
assert.ok(
  new Set(revised.expression.search.candidates.map(geometryKey)).size > 1,
);
assert.equal(
  new Set(revised.reading.search.candidates.map(profileKey)).size,
  1,
);
assert.deepEqual(
  [
    ...new Set(
      revised.reading.search.candidates.map((a) => a.assignment.contentMax),
    ),
  ].sort((a, b) => a - b),
  [900, 1080],
);
const oldPhone = retentionOnly.expression.search.retention.preferences.find(
  (p) => p.id === 'image-type-counterpoint' && p.scenario === 'phone-large',
);
const newPhone = revised.expression.search.retention.preferences.find(
  (p) => p.id === 'image-type-counterpoint' && p.scenario === 'phone-large',
);
assert.equal(oldPhone.satisfiedAssignments, 0);
assert.ok(newPhone.satisfiedAssignments > 0);

// For each reading alternative, rebind and recompute the conditioned expression
// program. These are 6 separate mathematical branches, not additional neural calls.
const validations = [],
  sensitivity = [];
for (const candidate of revised.reading.search.candidates) {
  const program = structuredClone(revised.expression.search.program);
  for (const scenario of program.scenarios)
    Object.assign(scenario.values, candidate.assignment);
  const branch = searchEnergy({
    program,
    options: {
      method: 'exhaustive',
      maxEvaluations: 1000,
      maxExpressionOperations: 50000000,
      retention: 'pareto-diverse',
    },
  });
  const tokens = {
    ...candidate.assignment,
    ...branch.candidates[0].assignment,
  };
  const receipt = await validateDesignFieldFinalist({
    brief,
    measurements,
    tokens,
  });
  assert.equal(receipt.status, 'passed');
  validations.push({
    stage: 'reading',
    candidate: candidate.id,
    tokens,
    receipt,
  });
  sensitivity.push({
    reading: candidate.assignment,
    expression: branch.candidates[0].assignment,
    expressionEnergy: branch.candidates[0].energy,
    expressionProgram: branch.programIdentity,
    readingGeometry: candidate.derived,
    diagnostics: branch.retention,
  });
}
for (const candidate of revised.expression.search.candidates) {
  const tokens = { ...historicalReading, ...candidate.assignment };
  const receipt = await validateDesignFieldFinalist({
    brief,
    measurements,
    tokens,
  });
  assert.equal(receipt.status, 'passed');
  validations.push({
    stage: 'expression',
    candidate: candidate.id,
    tokens,
    receipt,
  });
}
assert.ok(new Set(sensitivity.map((s) => s.expressionEnergy)).size > 1);
assert.ok(new Set(sensitivity.map((s) => s.expressionProgram)).size > 1);

const record = {
  status: 'passed',
  implementationSources: Object.fromEntries(
    await Promise.all(
      [
        'src/energy.ts',
        'src/design-field.ts',
        'scripts/prove-choice-effectiveness.mjs',
      ].map(async (path) => [path, hash(await readFile(path, 'utf8'))]),
    ),
  ),
  briefIdentity: hash(brief),
  measurementIdentity: measurements.identity,
  runtime: measurements.runtime,
  measuredCells: measurements.rows.length,
  summary,
  validations: validations.length,
  renderedScenarios: validations.reduce(
    (n, v) => n + v.receipt.scenarios.length,
    0,
  ),
  neuralCalls: 0,
  scope:
    'Current Chromium standalone text/action/image fixture geometry. Cost/profile changes do not demonstrate human preference, model quality, material appearance, motion quality or full-gallery interaction.',
};
await save('runs', runs);
await save('validations', validations);
await save('sensitivity', sensitivity);
await save('report', record);
console.log(JSON.stringify(record, null, 2));
