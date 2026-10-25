import test from 'node:test';
import assert from 'node:assert/strict';
import { planComposition } from '../src/composition-plan.js';
import { auditAppleHig } from '../src/apple-hig.js';

test('composition topology follows usable measures and scaling while preserving editable parameters', () => {
  for (const mode of ['app', 'publication'] as const)
    for (const width of [280, 390, 507, 834, 1194, 1440])
      for (const density of [0.7, 1, 1.4]) {
        const base = planComposition({ mode, width, density });
        const enlarged = planComposition({
          mode,
          width,
          density,
          textScale: 2,
        });
        assert.ok(base.contentWidth > 0);
        assert.ok(enlarged.columns <= base.columns);
        assert.equal(enlarged.bodySize, base.bodySize);
        assert.equal(base.controlSize, 44);
        assert.equal(
          planComposition({ mode, width, density, expression: 1.2 }).titleSize,
          base.titleSize * 1.2,
        );
      }
  assert.equal(planComposition({ mode: 'app', width: 390 }).navigation, 'tabs');
  assert.equal(
    planComposition({ mode: 'app', width: 834 }).navigation,
    'sidebar',
  );
  assert.equal(
    planComposition({ mode: 'app', width: 834, textScale: 2 }).navigation,
    'tabs',
  );
  assert.throws(() => planComposition({ mode: 'app', width: 0 }));
});
test('Apple audit distinguishes minimum, adopted default, safe areas and absent evidence', () => {
  const input = {
    platform: 'ios',
    viewport: { width: 390, height: 844 },
    safeArea: { top: 44, bottom: 34, left: 0, right: 0 },
    targets: [
      {
        id: 'save',
        label: 'Save story',
        box: { x: 20, y: 60, width: 32, height: 32 },
      },
    ],
    evidence: { engine: 'contract fixture', receipt: 'not native evidence' },
  };
  const result = auditAppleHig(input);
  assert.equal(
    result.checks.find((c) => c.id === 'control-minimum')?.status,
    'pass',
  );
  assert.equal(
    result.checks.find((c) => c.id === 'control-default')?.status,
    'fail',
  );
  assert.ok(result.unknown.includes('dynamic-type'));
  assert.equal(result.overallConformance, null);
  const enlarged = structuredClone(input);
  enlarged.targets[0]!.box = { x: 20, y: 40, width: 44, height: 44 };
  assert.equal(
    auditAppleHig(enlarged).checks.find((c) => c.id === 'safe-area')?.status,
    'fail',
  );
  assert.throws(
    () =>
      auditAppleHig({
        ...input,
        targets: [...input.targets, ...input.targets],
      }),
    /Duplicate/,
  );
});

test('authored focal cover crops keep finite coverage and concentric radii respect bounds', async () => {
  const { cropMedia, concentricRadius } =
    await import('../src/composition-plan.js');
  for (const width of [280, 390, 834, 1440])
    for (const aspect of [0.7, 1.12, 1.55, 2.2]) {
      const crop = cropMedia({
        sourceWidth: 1536,
        sourceHeight: 1024,
        width,
        height: width / aspect,
        focalX: 0.82,
        focalY: 0.19,
      });
      assert.ok(crop.drawWidth + crop.offsetX >= width - 1e-8);
      assert.ok(crop.drawHeight + crop.offsetY >= width / aspect - 1e-8);
      assert.ok(crop.focal.x >= 0 && crop.focal.x <= width);
      assert.ok(crop.focal.y >= 0 && crop.focal.y <= width / aspect);
    }
  assert.equal(concentricRadius(24, 8, 100, 100), 16);
  assert.equal(concentricRadius(24, 30, 100, 100), 0);
  assert.equal(concentricRadius(100, 0, 20, 10), 5);
  assert.throws(() => concentricRadius(Number.NaN, 4, 20, 20));
});

test('declared image alignment catches peer jank without treating all regions as equal', async () => {
  const { analyzeComposition } = await import('../src/composition.js');
  const input = {
    viewport: { width: 834, height: 1000 },
    rectangles: [
      { id: 'first', box: { x: 20, y: 100, width: 380, height: 250 } },
      { id: 'second', box: { x: 420, y: 105, width: 380, height: 250 } },
    ],
    constraints: [
      {
        id: 'peer-tops',
        members: ['first', 'second'],
        axis: 'top',
        tolerance: 1,
        source: 'authored equivalent story media',
      },
    ],
  };
  assert.equal(analyzeComposition(input).constraints[0]!.pass, false);
  input.rectangles[1]!.box.y = 100;
  assert.equal(analyzeComposition(input).constraints[0]!.pass, true);
  input.constraints[0]!.members[1] = 'unknown';
  assert.throws(() => analyzeComposition(input), /unknown rectangle/);
});

test('Apple coordinate tolerance accepts float32 reconstruction noise, not undersized controls', () => {
  const input = {
    platform: 'ios',
    viewport: { width: 390, height: 844 },
    safeArea: { top: 44, bottom: 34, left: 0, right: 0 },
    targets: [
      {
        id: 'save',
        label: 'Save',
        box: { x: 20, y: 60, width: 43.999969482421875, height: 44 },
      },
    ],
    evidence: {
      engine: 'float32 boundary fixture',
      receipt: 'not runtime evidence',
    },
  };
  assert.equal(
    auditAppleHig(input).checks.find((c) => c.id === 'control-default')?.status,
    'pass',
  );
  input.targets[0]!.box.width = 43.99;
  assert.equal(
    auditAppleHig(input).checks.find((c) => c.id === 'control-default')?.status,
    'fail',
  );
  assert.throws(() =>
    auditAppleHig({ ...input, viewport: { width: 1e100, height: 844 } }),
  );
});

test('Apple known failures dominate absent evidence and RN caps retain their actual semantics', () => {
  const input = {
    platform: 'ios',
    viewport: { width: 390, height: 844 },
    safeArea: { top: 44, bottom: 34, left: 0, right: 0 },
    targets: [
      {
        id: 'save',
        label: 'Save',
        box: { x: 20, y: 60, width: 44, height: 44 },
      },
    ],
    evidence: { engine: 'fixture', receipt: 'fixture' },
  };
  for (const navigation of [
    { destinations: ['journal'], selected: 'missing' },
    {
      destinations: ['journal'],
      selected: 'journal',
      taskStatePreserved: false,
    },
  ])
    assert.equal(
      auditAppleHig({ ...input, navigation }).checks.find(
        (c) => c.id === 'navigation-continuity',
      )?.status,
      'fail',
    );
  assert.equal(
    auditAppleHig({
      ...input,
      typography: {
        allowsFontScaling: false,
        maxFontSizeMultiplier: null,
        testedTextScale: 2,
        contentPreserved: true,
      },
    }).checks.find((c) => c.id === 'dynamic-type')?.status,
    'fail',
  );
  for (const [cap, expected] of [
    [0, 'pass'],
    [1, 'fail'],
    [null, 'unknown'],
  ] as const)
    assert.equal(
      auditAppleHig({
        ...input,
        typography: {
          allowsFontScaling: true,
          maxFontSizeMultiplier: cap,
          testedTextScale: 2,
          contentPreserved: true,
        },
      }).checks.find((c) => c.id === 'dynamic-type')?.status,
      expected,
    );
});

test('crop geometry rejects numerically unrepresentable source dimensions', async () => {
  const { cropMedia } = await import('../src/composition-plan.js');
  assert.throws(() =>
    cropMedia({
      sourceWidth: Number.MIN_VALUE,
      sourceHeight: 1,
      width: 390,
      height: 280,
      focalX: 0.5,
      focalY: 0.5,
    }),
  );
});

test('native capture discards obsolete revisions and bounds missing callbacks', async () => {
  const { captureObservationBatch } =
    await import('../native/observation-batch.js');
  let revision = 1,
    callback: ((frame: Record<string, unknown> | null) => void) | undefined;
  const pending = captureObservationBatch({
    records: ['old'],
    snapshot: { screen: 'journal' },
    revision,
    getRevision: () => revision,
    measure: (_record, done) => {
      callback = done;
    },
  });
  revision++;
  callback!({ id: 'old' });
  assert.equal(await pending, null);
  const snapshot = { screen: 'reader' };
  const frozen = captureObservationBatch({
    records: ['new'],
    snapshot,
    revision,
    getRevision: () => revision,
    measure: (_record, done) => {
      callback = done;
    },
  });
  snapshot.screen = 'saved';
  callback!({ id: 'new' });
  assert.equal((await frozen)?.snapshot.screen, 'reader');
  const missing = await captureObservationBatch({
    records: ['missing'],
    snapshot,
    revision,
    getRevision: () => revision,
    measure: () => {},
    timeoutMs: 5,
  });
  assert.equal(missing?.incomplete, true);
  assert.deepEqual(missing?.observations, []);
});

test('native visible frames use measured scroll clipping and retain unsafe fixed controls', async () => {
  const { clipObservationFrames } =
    await import('../native/observation-clipping.js');
  const observations = clipObservationFrames([
    { id: 'scroll', box: { x: 0, y: 100, width: 390, height: 640 } },
    {
      id: 'row',
      clipId: 'scroll',
      box: { x: 20, y: 700, width: 300, height: 104 },
    },
    { id: 'fixed', box: { x: 20, y: 20, width: 44, height: 44 } },
  ]);
  assert.equal(observations[1]!.visibleBox.height, 40);
  assert.equal(observations[2]!.visibleBox.y, 20);
  const result = auditAppleHig({
    platform: 'ios',
    viewport: { width: 390, height: 844 },
    safeArea: { top: 44, bottom: 34, left: 0, right: 0 },
    targets: observations.slice(1).map((o) => ({
      id: o.id,
      label: o.id,
      box: o.box,
      visibleBox: o.visibleBox,
    })),
    evidence: { engine: 'measured-clip fixture', receipt: 'fixture' },
  });
  assert.equal(
    result.checks.find((c) => c.id === 'safe-area' && c.subject === 'row')
      ?.status,
    'pass',
  );
  assert.equal(
    result.checks.find((c) => c.id === 'safe-area' && c.subject === 'fixed')
      ?.status,
    'fail',
  );
  assert.throws(
    () =>
      clipObservationFrames([
        {
          id: 'child',
          box: { x: 0, y: 0, width: 20, height: 20 },
          clipId: 'missing',
        },
      ]),
    /Missing/,
  );
});

test('reader media stays bounded by pane and reading scale independently of tab/sidebar topology', () => {
  const normal = planComposition({ mode: 'app', width: 834 });
  const enlarged = planComposition({
    mode: 'app',
    width: 834,
    textScale: 3.571,
  });
  assert.equal(normal.navigation, 'sidebar');
  assert.equal(enlarged.navigation, 'tabs');
  assert.ok(
    (enlarged.contentWidth + 2 * enlarged.gutter) / enlarged.readerImageAspect <
      300,
  );
  assert.equal(
    planComposition({ mode: 'app', width: 390 }).readerImageAspect,
    1.2,
  );
});
