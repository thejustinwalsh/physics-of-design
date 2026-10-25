// Reproduce from repository root: npm run build && node examples/kernels/relay-proof.mjs
// Actual Chromium text observations; no app construction, native claim or neural call.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const runtimeDirectory = path.resolve(
  process.env.DESIGN_KERNEL_RUNTIME ?? 'dist',
);
const load = (name) =>
  import(pathToFileURL(path.join(runtimeDirectory, name + '.js')).href);
const { hash } = await load('identity');
const { parseState, BlockSchema } = await load('state');
const { inspectFont, shape } = await load('fonts');
const { BrowserRenderer } = await load('measurement');
const {
  compileRelationalKernels,
  kernelTextMeasurementIdentity,
  resolveRelationalKernelOutputs,
} = await load('relational-kernels');
const { runDecisionWorkflow } = await load('decision-workflow');
const { resolveOutputBindings, checkOutputBindings } =
  await load('output-bindings');
const output =
  process.env.DESIGN_KERNEL_OUTPUT ?? 'artifacts/relational-kernels';
const startedAt = new Date().toISOString();
mkdirSync(output, { recursive: true });
const save = (name, value) =>
  writeFileSync(
    `${output}/${name}.json`,
    JSON.stringify(value, null, 2) + '\n',
  );
const digest = (file) =>
  createHash('sha256').update(readFileSync(file)).digest('hex');
const sourceFiles = [
  'src/relational-kernels.ts',
  'src/output-bindings.ts',
  'src/energy.ts',
  'src/decision-workflow.ts',
  'src/measurement.ts',
  'src/emission.ts',
  'examples/kernels/relay-proof.mjs',
  ...[
    'relational-kernels',
    'output-bindings',
    'energy',
    'decision-workflow',
    'measurement',
    'emission',
    'fonts',
  ].map((name) => path.join(runtimeDirectory, name + '.js')),
];
const startSources = Object.fromEntries(sourceFiles.map((p) => [p, digest(p)]));
const fontFile =
  'assets/fonts/RobotoFlex[GRAD,XOPQ,XTRA,YOPQ,YTAS,YTDE,YTFI,YTLC,YTUC,opsz,slnt,wdth,wght].ttf';
const fontIdentity = hash({
  file: digest(fontFile),
  weight: 400,
  axes: {},
  opticalSizing: 'none',
  kerning: 'auto',
  features: {},
});
const fontInspection = inspectFont(fontFile, '0123456789');
const digitAdvances = [...'0123456789'].map((text) => ({
  digit: text,
  advance: shape(
    BlockSchema.parse({
      id: 'digit',
      role: 'prose',
      text,
      font: { file: fontFile, family: 'Roboto Flex' },
      size: 15,
      weight: 400,
      trackingEm: 0,
      leading: 1.4,
      measure: 100,
    }),
  ).advance,
}));
save('font-numerals', {
  fontIdentity,
  features: fontInspection.features,
  requestedFeatures: {},
  digitAdvances,
  scope:
    'Default Fontkit advances at this exact state. tnum is unavailable; native and browser numeric rendering remain separate checks.',
});
const identities = {
  design: digest('experiments/relay/shared/DESIGN.md'),
  content: digest('experiments/relay/shared/fixtures.json'),
  source: hash({
    font: digest(fontFile),
    brief: digest('experiments/relay/shared/BRIEF.md'),
    proof: startSources['examples/kernels/relay-proof.mjs'],
  }),
};
const scenarios = [
  ['small-phone', 320, 740, 1],
  ['phone', 390, 844, 1],
  ['phone-large', 390, 844, 1.5],
  ['narrow', 768, 900, 1],
  ['ipad', 834, 1194, 1.5],
  ['desktop', 1440, 1000, 1],
].map(([id, width, height, textScale]) => ({
  id,
  platform: 'web',
  unit: 'css-px',
  width,
  height,
  textScale,
}));
const text = 'checkout-api · production · us-east-1';
const renderer = new BrowserRenderer(),
  raw = [];
const candidates = [];
try {
  for (const [i, fontSize] of [14, 15, 16].entries()) {
    const candidate = {
      id: `type-${fontSize}`,
      label: `${fontSize}px operational labels`,
      fontSize,
      lineHeight: 1.4,
      trackingEm: 0,
      cells: [],
    };
    for (const scenario of scenarios) {
      const width = i === 2 ? 260 : 240;
      const state = parseState({
        version: 1,
        archetype: 'editorial',
        platform: 'web',
        viewport: {
          width: scenario.width,
          height: scenario.height,
          textScale: scenario.textScale,
        },
        padding: 12,
        blocks: [
          {
            id: 'relay-heading',
            role: 'title',
            text: 'Services',
            font: { file: fontFile, family: 'Roboto Flex' },
            size: 24,
            weight: 400,
            trackingEm: 0,
            leading: 1.2,
            measure: width,
          },
          {
            id: 'relay-service-label',
            role: 'prose',
            text,
            font: { file: fontFile, family: 'Roboto Flex' },
            size: fontSize,
            weight: 400,
            features: {},
            trackingEm: 0,
            leading: 1.4,
            measure: width,
          },
        ],
        gaps: [16],
      });
      const measurement = await renderer.measure(state, {
        probes: false,
        spacing: false,
      });
      if (!measurement.feasible)
        throw Error(JSON.stringify(measurement.issues));
      const block = measurement.blocks.find(
        (x) => x.id === 'relay-service-label',
      );
      const index = raw.length;
      raw.push({ state, measurement });
      candidate.cells.push({
        scenario: scenario.id,
        width: block.box.width,
        height: block.box.height,
        overflowX: block.overflowX,
        overflowY: block.overflowY,
        inputIdentity: kernelTextMeasurementIdentity({
          text,
          fontIdentity,
          fontSize,
          lineHeight: 1.4,
          trackingEm: 0,
          width: block.box.width,
          scenario,
        }),
        sourceIdentity: identities.source,
        sourceInputIdentity: measurement.inputHash,
        resultRef: `${output}/text-observations.json#/${index}/measurement`,
        runtime: JSON.stringify(measurement.runtime),
        provider: 'browser',
      });
    }
    candidates.push(candidate);
  }
} finally {
  await renderer.close();
}
save('text-observations', raw);
const material = (id, roughness, color) => ({
  id,
  surface: { baseColor: color, roughness, metalness: 0 },
  composition: 'homogeneous-dielectric',
  lighting: {
    rigId: 'relay-room',
    coordinateFrame: 'surface',
    environmentId: 'neutral-room',
    exposureEv: 0,
    lightDirection: [0.4, 0.3, 1],
  },
  provenance: {
    kind: 'authored',
    source:
      'Relay DESIGN.md; illustrative material parameters, not calibrated samples',
  },
});
const appearance = [
  ['night', 'Night instrument', '#0e1720', '#eaf2f7', '#66d9ed'],
  ['day', 'Day instrument', '#edf0eb', '#182b35', '#00667a'],
].map(([id, label, canvas, ink, accent], i) => ({
  id,
  label,
  palette: {
    system: {
      tokens: {
        canvas,
        ink,
        accent,
        'dark-canvas': '#0e1720',
        'dark-ink': '#eaf2f7',
        'light-canvas': '#edf0eb',
        'light-ink': '#182b35',
      },
      roles: [
        {
          id: 'primary',
          foreground: 'ink',
          background: 'canvas',
          use: 'text',
          source: ['Relay operational labels'],
        },
        {
          id: 'accent',
          foreground: 'accent',
          background: 'canvas',
          use: 'non-text',
          source: ['Relay selected data and focused controls'],
        },
        {
          id: 'light',
          foreground: 'light-ink',
          background: 'light-canvas',
          theme: 'light',
          use: 'text',
          source: ['Relay light fallback'],
        },
        {
          id: 'dark',
          foreground: 'dark-ink',
          background: 'dark-canvas',
          theme: 'dark',
          use: 'text',
          source: ['Relay dark fallback'],
        },
      ],
    },
  },
  material: {
    first: material('substrate', 0.88, [0.18, 0.2, 0.22]),
    second: material('panel', i ? 0.5 : 0.3, [0.04, 0.12, 0.18]),
    profile: {
      id: 'counterpoint',
      intent: 'Quiet substrate and restrained active panel',
      roleRelation: 'counterpoint',
      source: 'Relay DESIGN.md',
      bands: [
        {
          metric: 'roughnessDifference',
          min: 0.3,
          max: 0.65,
          rationale: 'Authored finish distinction under one rig',
          source: 'Relay DESIGN.md',
        },
      ],
    },
  },
  motion: {
    spring: { mass: 1, stiffness: i ? 160 : 200, damping: i ? 26 : 28 },
    coordinate: { unit: 'normalized', from: 0, to: 1 },
    durationSeconds: 2,
  },
  preference: 0,
  nativeFinish: 'static',
}));
const input = {
  version: 1,
  id: 'relay-relational-kernels',
  brief:
    'Operational precision with material character; current task information, readable rows and preserved list/detail access.',
  identities,
  scenarios,
  kernels: [
    {
      id: 'service-row',
      kind: 'type-row',
      purpose: 'Readable operational label and editable row density',
      source: 'Relay BRIEF.md and DESIGN.md',
      text,
      fontIdentity,
      minHitSize: 44,
      maxRowHeight: 150,
      preferredRowHeight: 72,
      paddingBlock: [4, 8, 12],
      candidates,
    },
    {
      id: 'workspace',
      kind: 'regions',
      purpose: 'Preserve service list and inspector at measured minimum widths',
      source: 'Relay DESIGN.md; authored minimum measures',
      regions: [
        { id: 'list', minInline: 180, share: 1 },
        { id: 'inspector', minInline: 180, share: 1.4 },
      ],
      roleLink: { kernel: 'service-row', region: 'list' },
      candidates: [
        {
          id: 'compact',
          label: 'Compact paired workspace',
          gap: 16,
          inlinePadding: 12,
          splitMinimum: 680,
        },
        {
          id: 'open',
          label: 'Open investigation workspace',
          gap: 24,
          inlinePadding: 16,
          splitMinimum: 780,
        },
      ],
    },
    {
      id: 'appearance',
      kind: 'appearance',
      purpose: 'Compare Night and Day instrument directions',
      source: 'Relay DESIGN.md; equal authored direction preference',
      candidates: appearance,
    },
  ],
};
const compilation = compileRelationalKernels(input),
  result = await runDecisionWorkflow({ workflow: compilation.workflow }),
  resolved = resolveRelationalKernelOutputs(compilation, result),
  replay = await runDecisionWorkflow({
    workflow: compilation.workflow,
    recipe: result.recipe,
    mode: 'replay',
  });
const current = {
  designIdentity: identities.design,
  sourceIdentity: hash(startSources),
  inputIdentity: compilation.inputIdentity,
  resultIdentity: hash(resolved),
};
const bindings = scenarios.map((s) => ({
  id: `label-${s.id}`,
  scenario: s.id,
  scenarioIdentity: hash(s),
  platform: 'web',
  unit: 'css-px',
  pointer: `/values/${s.id}/service-row.textWidth`,
  target: {
    surface: 'relay-service-label',
    property: 'width',
    sourceLocation: 'src/emission.ts:emitStyleX',
  },
  tolerance: 0.01,
}));
const manifest = resolveOutputBindings({
  operation: 'resolve',
  current,
  source: { value: resolved, identity: hash(resolved) },
  bindings,
});
const selected = candidates[result.stages['service-row'].assignment.choice];
const observations = scenarios.map((s) => {
  const cell = selected.cells.find((c) => c.scenario === s.id);
  return {
    binding: `label-${s.id}`,
    current,
    scenario: s.id,
    scenarioIdentity: hash(s),
    platform: 'web',
    unit: 'css-px',
    surface: 'relay-service-label',
    property: 'width',
    sourceLocation: 'src/emission.ts:emitStyleX',
    status: 'observed',
    value: cell.width,
    provider: 'browser',
    runtime: cell.runtime,
    resultRef: cell.resultRef,
    observedAt: new Date().toISOString(),
    detail:
      'Actual existing React/StyleX specimen text box read from BrowserRenderer; not a Relay application task receipt',
  };
});
const checked = checkOutputBindings({
  operation: 'check',
  manifest,
  current,
  observations,
});
const changed = structuredClone(observations);
changed[0].value += 2;
const override = checkOutputBindings({
  operation: 'check',
  manifest,
  current,
  observations: changed,
});
const endSources = Object.fromEntries(sourceFiles.map((p) => [p, digest(p)]));
if (hash(startSources) !== hash(endSources))
  throw Error('Source changed during renderer proof; retain files and rerun');
save('input', input);
save('compilation', compilation);
save('workflow', result);
save('resolved', resolved);
save('replay', replay);
save('bindings', { manifest, observations, checked, override });
const receipt = {
  startedAt,
  finishedAt: new Date().toISOString(),
  sources: startSources,
  sourceStable: true,
  cells: raw.length,
  scenarios: scenarios.length,
  statistics: result.statistics,
  replayStatistics: replay.statistics,
  bindingsVerified: checked.verified,
  overrideDetected: override.entries[0].status === 'override',
  inputIdentity: compilation.inputIdentity,
  inputBytes: Buffer.byteLength(JSON.stringify(input)),
  neuralCalls: 0,
  scope:
    'Current Chromium text + deterministic compiler/analyzer/search/binding proof. No full Relay app, actual native geometry, GPU composite or human preference evidence.',
};
save('receipt', receipt);
if (process.argv.includes('--publish-input')) {
  writeFileSync(
    'examples/kernels/relay.json',
    JSON.stringify(input, null, 2) + '\n',
  );
  const cells = Object.fromEntries(
    input.kernels
      .filter((k) => k.kind === 'type-row')
      .flatMap((k) => k.candidates.map((c) => [`${k.id}-${c.id}`, c.cells])),
  );
  const bytes = JSON.stringify(cells, null, 2) + '\n';
  writeFileSync('examples/kernels/relay-measurements.json', bytes);
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  const compact = structuredClone(input);
  for (const k of compact.kernels)
    if (k.kind === 'type-row')
      for (const c of k.candidates)
        c.cells = {
          $designFile: 'examples/kernels/relay-measurements.json',
          sha256,
          pointer: `/${k.id}-${c.id}`,
        };
  writeFileSync(
    'examples/kernels/relay-compact.json',
    JSON.stringify(compact, null, 2) + '\n',
  );
}
console.log(JSON.stringify(receipt, null, 2));
