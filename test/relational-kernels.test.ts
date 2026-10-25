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
