import test from 'node:test';
import assert from 'node:assert/strict';
import { hash } from '../src/identity.js';
import {
  compileRelationalKernels,
  kernelTextMeasurementIdentity,
  resolveRelationalKernelOutputs,
  resolveKernelSelection,
  type RelationalKernelInput,
} from '../src/relational-kernels.js';
import { runDecisionWorkflow } from '../src/decision-workflow.js';
import { execute } from '../src/commands.js';
import { compileEnergy } from '../src/energy.js';
import { materialPairCandidates } from '../src/material-relations.js';
// Synthetic observations test contracts only; actual browser evidence is a separate recorded fixture.
function fixture(): RelationalKernelInput {
  const scenarios = [
    {
      id: 'phone',
      platform: 'web' as const,
      unit: 'css-px' as const,
      width: 390,
      height: 844,
      textScale: 1,
    },
    {
      id: 'wide',
      platform: 'web' as const,
      unit: 'css-px' as const,
      width: 1000,
      height: 800,
      textScale: 1.5,
    },
  ];
  const identities = {
      design: hash('synthetic direction'),
      source: hash('synthetic source'),
      content: hash('synthetic content'),
    },
    fontIdentity = hash('synthetic font'),
    text = 'Checkout service';
  const candidates = [14, 18].map((fontSize, i) => ({
    id: `type-${i}`,
    label: `Readable ${fontSize}`,
    fontSize,
    lineHeight: 1.4,
    trackingEm: 0,
    cells: scenarios.map((s) => {
      const width = 180 + i * 120;
      return {
        scenario: s.id,
        width,
        height: fontSize * 1.4 * s.textScale,
        overflowX: 0,
        overflowY: 0,
        inputIdentity: kernelTextMeasurementIdentity({
          text,
          fontIdentity,
          fontSize,
          lineHeight: 1.4,
          trackingEm: 0,
          width,
          scenario: s,
        }),
        sourceIdentity: identities.source,
        sourceInputIdentity: hash('synthetic renderer input'),
        resultRef: 'test:synthetic-observation',
        runtime: 'synthetic-unit-fixture',
        provider: 'browser' as const,
      };
    }),
  }));
  const material = (id: string, roughness: number) => ({
    id,
    surface: {
      baseColor: [0.2, 0.2, 0.2] as [number, number, number],
      roughness,
      metalness: 0,
    },
    composition: 'homogeneous-dielectric' as const,
    provenance: {
      kind: 'authored' as const,
      source: 'test-only authored material',
    },
  });
  return {
    version: 1,
    id: 'kernel-test',
    brief: 'Synthetic contract test',
    identities,
    scenarios,
    kernels: [
      {
        id: 'row',
        kind: 'type-row',
        purpose: 'Choose readable row density',
        source: 'synthetic test',
        text,
        fontIdentity,
        minHitSize: 44,
        maxRowHeight: 120,
        preferredRowHeight: 52,
        paddingBlock: [4, 8],
        candidates,
      },
      {
        id: 'workspace',
        kind: 'regions',
        purpose: 'Keep list and detail reachable',
        source: 'synthetic test',
        regions: [
          { id: 'list', minInline: 160, share: 1 },
          { id: 'detail', minInline: 180, share: 2 },
        ],
        roleLink: { kernel: 'row', region: 'list' },
        candidates: [
          {
            id: 'compact',
            label: 'Compact gaps',
            gap: 12,
            inlinePadding: 12,
            splitMinimum: 600,
          },
          {
            id: 'open',
            label: 'Open gaps',
            gap: 24,
            inlinePadding: 20,
            splitMinimum: 800,
          },
        ],
      },
      {
        id: 'appearance',
        kind: 'appearance',
        purpose: 'Compare two task finishes',
        source: 'synthetic test',
        candidates: [0, 1].map((i) => ({
          id: `finish-${i}`,
          label: i ? 'Quiet enamel' : 'Matte',
          palette: {
            system: {
              tokens: { canvas: '#ffffff', ink: '#111111' },
              roles: [
                {
                  id: 'text',
                  foreground: 'ink',
                  background: 'canvas',
                  use: 'text' as const,
                  source: ['synthetic role'],
                },
              ],
            },
          },
          material: {
            first: material('substrate', 0.9),
            second: material('panel', i ? 0.3 : 0.7),
          },
          motion: {
            spring: { mass: 1, stiffness: 160, damping: 26 },
            coordinate: { unit: 'normalized' as const, from: 0, to: 1 },
          },
          preference: i,
          nativeFinish: 'static' as const,
        })),
      },
    ],
  };
}
function materialBand(
  metric: 'roughnessDifference' | 'texturePhysicalFrequencyOctaves',
  min: number,
  max: number,
) {
  const input = fixture();
  const kernel = input.kernels.find((k) => k.kind === 'appearance')!;
  for (const candidate of kernel.candidates)
    candidate.material.profile = {
      id: 'shared-material-brief',
      intent: 'Compare declared material quantities separately from preference',
      roleRelation: 'counterpoint',
      source: 'synthetic regression',
      bands: [
        {
          metric,
          min,
          max,
          rationale: 'Editable test band',
          source: 'synthetic regression',
        },
      ],
    };
  return { input, kernel };
}

test('raw material descriptors stay distinct from satisfied-band residuals and retain units', async () => {
  const { input } = materialBand('roughnessDifference', 0.1, 0.7);
  const compiled = compileRelationalKernels(input);
  const program = compiled.workflow.stages.find(
    (s) => s.id === 'appearance',
  )!.program;
  const readoutKeys = compiled.workflow.stages.find(
    (s) => s.id === 'appearance',
  )!.consequenceKeys;
  assert.ok(readoutKeys.includes('material.roughnessDifference.value'));
  assert.ok(readoutKeys.includes('surface.roughness'));
  assert.ok(readoutKeys.includes('spring.stiffness'));
  const evaluator = compileEnergy(program);
  const a = evaluator.evaluate({ choice: 0 }).derived.phone!;
  const b = evaluator.evaluate({ choice: 1 }).derived.phone!;
  assert.ok(Math.abs(a['material.roughnessDifference.value']! - 0.2) < 1e-12);
  assert.ok(Math.abs(b['material.roughnessDifference.value']! - 0.6) < 1e-12);
  assert.equal(a['material.roughnessDifference.bandResidual'], 0);
  assert.equal(b['material.roughnessDifference.bandResidual'], 0);
  const result = await runDecisionWorkflow({ workflow: compiled.workflow });
  const selected = resolveRelationalKernelOutputs(compiled, result);
  assert.equal(
    selected.values.phone!['appearance.material.roughnessDifference'],
    undefined,
  );
  assert.equal(
    selected.values.phone![
      'appearance.material.roughnessDifference.bandResidual'
    ],
    0,
  );
  assert.equal(
    selected.values.phone![
      'appearance.material.texturePhysicalFrequencyOctaves.value'
    ],
    null,
  );
  assert.equal(
    compiled.outputs.find(
      (o) => o.name === 'material.roughnessDifference.value',
    )!.unit,
    'parameter',
  );
  assert.equal(
    compiled.outputs.find(
      (o) => o.name === 'material.roughnessDifference.bandResidual',
    )!.unit,
    'dimensionless',
  );
  assert.equal(
    program.derived.find((d) => d.id === 'material.roughnessDifference.value')!
      .provenance?.kind,
    'calculated',
  );
  const replay = await runDecisionWorkflow({
    workflow: compiled.workflow,
    recipe: result.recipe,
    mode: 'replay',
  });
  assert.deepEqual(
    resolveRelationalKernelOutputs(compiled, replay).values,
    selected.values,
  );
  assert.equal(replay.statistics.neuralCalls, 0);
});

test('point-target residual normalization agrees with material candidates while energy remains separate', () => {
  const { input, kernel } = materialBand('roughnessDifference', 0, 0);
  const compiled = compileRelationalKernels(input);
  const program = compiled.workflow.stages.find(
    (s) => s.id === 'appearance',
  )!.program;
  const evaluation = compileEnergy(program).evaluate({ choice: 0 });
  const pair = kernel.candidates[0]!.material;
  const comparison = materialPairCandidates({
    anchor: pair.first,
    alternatives: [pair.second],
    profile: pair.profile,
  });
  const residual = comparison.candidates[0]!.residuals[0]!.residual!;
  assert.ok(Math.abs(residual - 0.2) < 1e-12);
  const factors = evaluation.factors.filter(
    (f) => f.id === 'material.roughnessDifference.bandResidual',
  );
  assert.equal(factors.length, input.scenarios.length);
  assert.equal(comparison.candidates[0]!.residuals[0]!.units, 'dimensionless');
  assert.equal(
    comparison.candidates[0]!.residuals[0]!.descriptorUnits,
    'parameter',
  );
  assert.equal(comparison.candidates[0]!.residuals[0]!.scaleUnits, 'parameter');
  for (const f of factors) {
    assert.ok(Math.abs(f.residual - residual) < 1e-12);
    assert.ok(Math.abs(f.energy - 0.04) < 1e-12);
    assert.notEqual(f.energy, residual);
  }
});

test('unknown requested material facts cannot win; known alternatives retain the actual descriptor', async () => {
  const { input, kernel } = materialBand(
    'texturePhysicalFrequencyOctaves',
    0,
    2,
  );
  const unknown = compileRelationalKernels(input);
  const failure = await runDecisionWorkflow({ workflow: unknown.workflow });
  assert.equal(failure.stages.appearance!.status, 'failed');
  assert.throws(
    () => resolveRelationalKernelOutputs(unknown, failure),
    /Unresolved kernel/,
  );
  kernel.candidates[1]!.material.first.texture = {
    cyclesPerTile: 4,
    heightAmplitudeFraction: 0.01,
    tileWidthMm: 8,
  };
  kernel.candidates[1]!.material.second.texture = {
    cyclesPerTile: 8,
    heightAmplitudeFraction: 0.01,
    tileWidthMm: 8,
  };
  const compiled = compileRelationalKernels(input);
  const result = await runDecisionWorkflow({ workflow: compiled.workflow });
  assert.equal(result.stages.appearance!.assignment!.choice, 1);
  const selected = resolveRelationalKernelOutputs(compiled, result);
  assert.equal(
    selected.values.phone![
      'appearance.material.texturePhysicalFrequencyOctaves.value'
    ],
    1,
  );
  assert.equal(
    selected.values.phone![
      'appearance.material.texturePhysicalFrequencyOctaves.bandResidual'
    ],
    0,
  );
});

test('appearance alternatives cannot omit a comparison metric but can use attributed conditional target bands', () => {
  const first = materialBand('roughnessDifference', 0.1, 0.7);
  first.kernel.candidates[1]!.material.profile = null;
  assert.throws(
    () => compileRelationalKernels(first.input),
    /comparison metrics differ/,
  );
  const second = materialBand('roughnessDifference', 0.1, 0.7);
  second.kernel.candidates[1]!.material.profile!.bands[0]!.max = 0.8;
  assert.doesNotThrow(() => compileRelationalKernels(second.input));
});

test('old compilation engines require regeneration rather than relabeling residuals', async () => {
  const compiled = compileRelationalKernels(fixture());
  const result = await runDecisionWorkflow({ workflow: compiled.workflow });
  const legacy = { ...compiled, engine: 'relational-kernels-v1' };
  const { identity: _identity, ...body } = legacy;
  legacy.identity = hash(body);
  assert.throws(
    () =>
      resolveRelationalKernelOutputs(
        legacy as unknown as typeof compiled,
        result,
      ),
    /Unsupported kernel compilation engine/,
  );
});

test('three kernels compile to the existing engine and preserve alternatives and dependencies', async () => {
  const compiled = compileRelationalKernels(fixture()),
    first = await runDecisionWorkflow({ workflow: compiled.workflow });
  assert.equal(first.state, 'complete');
  assert.equal(first.statistics.neuralCalls, 0);
  assert.ok(first.stages.row!.alternatives.length > 1);
  assert.equal(compiled.workflow.stages[1]!.bindings[0]!.stage, 'row');
  const named = resolveRelationalKernelOutputs(compiled, first);
  assert.equal(named.values.phone!['workspace.columns'], 1);
  assert.equal(named.values.wide!['workspace.columns'], 2);
  assert.equal(named.verification, 'pending-current-renderer');
  assert.equal(compiled.obligations.length, 6);
  assert.equal(named.values.phone!['row.lineHeight'], 19.599999999999998);
  const replay = await runDecisionWorkflow({
    workflow: compiled.workflow,
    recipe: first.recipe,
    mode: 'replay',
  });
  assert.equal(replay.statistics.searches, 0);
  assert.equal(replay.statistics.neuralCalls, 0);
  assert.deepEqual(
    resolveRelationalKernelOutputs(compiled, replay).values,
    named.values,
  );
});
test('selected type width genuinely conditions region widths', async () => {
  const r = fixture();
  r.scenarios = r.scenarios.filter((s) => s.id === 'wide');
  for (const k of r.kernels)
    if (k.kind === 'type-row')
      for (const c of k.candidates)
        c.cells = c.cells.filter((s) => s.scenario === 'wide');
  const compiled = compileRelationalKernels(r),
    first = await runDecisionWorkflow({ workflow: compiled.workflow });
  const changedInput = structuredClone(r),
    row = changedInput.kernels[0]!;
  if (row.kind === 'type-row') row.candidates[0]!.cells[0]!.overflowX = 10;
  const changedCompilation = compileRelationalKernels(changedInput);
  const changed = await runDecisionWorkflow({
    workflow: changedCompilation.workflow,
  });
  const a = resolveRelationalKernelOutputs(compiled, first),
    b = resolveRelationalKernelOutputs(changedCompilation, changed);
  assert.throws(
    () => resolveRelationalKernelOutputs(changedCompilation, first),
    /Stale workflow/,
  );
  assert.notEqual(
    a.values.wide!['workspace.list.width'],
    b.values.wide!['workspace.list.width'],
  );
});

test('content provenance changes preserve unchanged stage choices but require current renderer evidence', async () => {
  const input = fixture();
  const compiled = compileRelationalKernels(input);
  const first = await runDecisionWorkflow({ workflow: compiled.workflow });
  const updated = structuredClone(input);
  updated.identities.content = hash(
    'new content record; exact kernel copy/facts unchanged',
  );
  const next = compileRelationalKernels(updated);
  assert.notEqual(next.identity, compiled.identity);
  assert.notEqual(next.inputIdentity, compiled.inputIdentity);
  const replay = await runDecisionWorkflow({
    workflow: next.workflow,
    recipe: first.recipe,
    mode: 'replay',
  });
  assert.equal(replay.state, 'complete');
  assert.equal(replay.statistics.cacheHits, 3);
  assert.equal(replay.statistics.searches, 0);
  assert.equal(replay.statistics.neuralCalls, 0);
  const resolved = resolveRelationalKernelOutputs(next, replay);
  assert.equal(resolved.identities.content, updated.identities.content);
  assert.equal(resolved.inputIdentity, next.inputIdentity);
  assert.deepEqual(
    resolved.values,
    resolveRelationalKernelOutputs(compiled, first).values,
  );
  assert.equal(resolved.verification, 'pending-current-renderer');
});

test('content plus row geometry edits invalidate the row and its dependent workspace while preserving appearance', async () => {
  const input = fixture();
  const first = await runDecisionWorkflow({
    workflow: compileRelationalKernels(input).workflow,
  });
  const updated = structuredClone(input);
  updated.identities.content = hash('new content record');
  const row = updated.kernels.find((k) => k.kind === 'type-row')!;
  assert.equal(row.kind, 'type-row');
  if (row.kind === 'type-row') row.paddingBlock.push(12);
  const replay = await runDecisionWorkflow({
    workflow: compileRelationalKernels(updated).workflow,
    recipe: first.recipe,
    mode: 'replay',
  });
  assert.equal(replay.stages.row!.status, 'stale');
  assert.equal(replay.stages.workspace!.status, 'blocked');
  assert.equal(replay.stages.appearance!.status, 'replayed');
  assert.equal(replay.statistics.cacheHits, 1);
  assert.equal(replay.statistics.neuralCalls, 0);
});

test('reusable content provenance does not relax measured copy/source or shared direction guards', async () => {
  const input = fixture();
  const first = await runDecisionWorkflow({
    workflow: compileRelationalKernels(input).workflow,
  });
  const changedText = structuredClone(input);
  const row = changedText.kernels.find((k) => k.kind === 'type-row')!;
  if (row.kind === 'type-row') row.text += ' changed';
  assert.throws(
    () => compileRelationalKernels(changedText),
    /Stale text parameters/,
  );
  const changedSource = structuredClone(input);
  changedSource.identities.source = hash('new renderer source');
  assert.throws(
    () => compileRelationalKernels(changedSource),
    /Stale text source/,
  );
  const changedBrief = structuredClone(input);
  changedBrief.brief += ' New direction.';
  const replay = await runDecisionWorkflow({
    workflow: compileRelationalKernels(changedBrief).workflow,
    recipe: first.recipe,
    mode: 'replay',
  });
  assert.equal(replay.statistics.cacheHits, 0);
  assert.equal(replay.stages.appearance!.status, 'stale');
  assert.equal(replay.stages.row!.status, 'stale');
  assert.equal(replay.stages.workspace!.status, 'blocked');
});
test('changed content, source, text parameters and missing cells cannot reuse observations', () => {
  for (const edit of [
    (r: RelationalKernelInput) => {
      const k = r.kernels[0]!;
      if (k.kind === 'type-row') k.text += ' changed';
    },
    (r: RelationalKernelInput) => {
      r.identities.source = hash('different source');
    },
    (r: RelationalKernelInput) => {
      const k = r.kernels[0]!;
      if (k.kind === 'type-row') k.candidates[0]!.fontSize++;
    },
    (r: RelationalKernelInput) => {
      const k = r.kernels[0]!;
      if (k.kind === 'type-row') k.candidates[0]!.cells.pop();
    },
  ]) {
    const r = fixture();
    edit(r);
    assert.throws(() => compileRelationalKernels(r), /Stale|Missing/);
  }
});
test('browser cells cannot claim native geometry, and platform units are explicit', () => {
  const r = fixture();
  r.scenarios[0]!.platform = 'native-ios';
  r.scenarios[0]!.unit = 'pt';
  assert.throws(() => compileRelationalKernels(r), /Wrong renderer/);
  const invalid = fixture();
  invalid.scenarios[0]!.unit = 'dp';
  assert.throws(() => compileRelationalKernels(invalid), /unit mismatch/);
});
test('impossible region minimums fail rather than discard a region', async () => {
  const r = fixture(),
    k = r.kernels[1]!;
  if (k.kind === 'regions') k.regions[1]!.minInline = 2000;
  const compiled = compileRelationalKernels(r),
    result = await runDecisionWorkflow({ workflow: compiled.workflow });
  assert.equal(result.stages.workspace!.status, 'failed');
  assert.throws(
    () => resolveRelationalKernelOutputs(compiled, result),
    /Unresolved/,
  );
});
test('palette failures and inconsistent material parameters are not viable appearance candidates', async () => {
  const r = fixture(),
    k = r.kernels[2]!;
  if (k.kind === 'appearance')
    for (const c of k.candidates) {
      c.palette.system.tokens.ink = '#ffffff';
      c.material.second.surface.metalness = 1;
    }
  const c = compileRelationalKernels(r),
    result = await runDecisionWorkflow({ workflow: c.workflow });
  assert.equal(result.stages.appearance!.status, 'failed');
});
test('changed compilation identity and manually invalid selected assignments fail closed', async () => {
  const c = compileRelationalKernels(fixture()),
    r = await runDecisionWorkflow({ workflow: c.workflow });
  const bad = structuredClone(c);
  bad.outputs[0]!.name = 'overridden';
  assert.throws(() => resolveRelationalKernelOutputs(bad, r), /identity/);
  r.stages.row!.assignment!.choice = 99;
  assert.throws(
    () => resolveRelationalKernelOutputs(c, r),
    /Invalid assignment/,
  );
});
test('arbitrary role and region names work without a Relay component catalog', async () => {
  const r = fixture(),
    row = r.kernels[0]!,
    regions = r.kernels[1]!;
  row.id = 'dialog-copy';
  if (regions.kind === 'regions') {
    regions.roleLink!.kernel = row.id;
    regions.roleLink!.region = 'summary';
    regions.regions[0]!.id = 'summary';
    regions.regions[1]!.id = 'actions';
  }
  const c = compileRelationalKernels(r),
    run = await runDecisionWorkflow({ workflow: c.workflow });
  assert.ok(
    resolveRelationalKernelOutputs(c, run).values.phone![
      'workspace.actions.width'
    ],
  );
});

test('CLI/MCP resolver exposes importable values without another search or local readout', async () => {
  const input = fixture(),
    compiled = compileRelationalKernels(input);
  const result = await runDecisionWorkflow({ workflow: compiled.workflow });
  const before = structuredClone(result.statistics);
  const request = { input, compilationIdentity: compiled.identity, result };
  const expected = resolveRelationalKernelOutputs(compiled, result);
  assert.deepEqual(resolveKernelSelection(request), expected);
  assert.deepEqual(await execute('kernel resolve', request), expected);
  assert.deepEqual(result.statistics, before);
  assert.equal(expected.verification, 'pending-current-renderer');
  assert.throws(
    () =>
      resolveKernelSelection({
        ...request,
        compilationIdentity: hash('different'),
      }),
    /differs from the selected compilation/,
  );
  const failed = structuredClone(result);
  failed.stages[compiled.workflow.stages[0]!.id]!.status = 'failed';
  assert.throws(
    () => resolveKernelSelection({ ...request, result: failed }),
    /Unresolved kernel/,
  );
  const tampered = structuredClone(result);
  tampered.stages[compiled.workflow.stages[0]!.id]!.assignment = {
    choice: 999,
    paddingBlock: 12,
  };
  assert.throws(() => resolveKernelSelection({ ...request, result: tampered }));
});

test('compact frozen Relay input resolves exactly to the source-bound full input', async () => {
  const { readFile } = await import('node:fs/promises');
  const { resolveDesignFileReferences } =
    await import('../src/file-references.js');
  const full = JSON.parse(
    await readFile('examples/kernels/relay.json', 'utf8'),
  );
  const compact = JSON.parse(
    await readFile('examples/kernels/relay-compact.json', 'utf8'),
  );
  assert.deepEqual(await resolveDesignFileReferences(compact), full);
  assert.equal(
    compileRelationalKernels(full).inputIdentity,
    compileRelationalKernels(
      (await resolveDesignFileReferences(compact)) as RelationalKernelInput,
    ).inputIdentity,
  );
});
