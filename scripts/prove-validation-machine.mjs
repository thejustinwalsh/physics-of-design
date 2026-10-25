import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import {
  execute,
  hash,
  parseState,
  describeValidationPlan,
  checkValidation,
} from '../dist/index.js';

const directory =
  process.env.DESIGN_VALIDATION_OUTPUT ?? 'artifacts/validation';
await mkdir(directory, { recursive: true });
const base = parseState(
  JSON.parse(await readFile('examples/hero.json', 'utf8')),
);
const sources = Object.fromEntries(
  await Promise.all(
    [
      'src/validation-machine.ts',
      'src/measurement.ts',
      'src/responsive.ts',
      'src/palette.ts',
      'scripts/prove-validation-machine.mjs',
    ].map(async (f) => [f, hash(await readFile(f, 'utf8'))]),
  ),
);
const scenarios = [
  {
    id: 'phone',
    platform: 'web',
    width: 390,
    height: 844,
    textScale: 1,
    colorScheme: 'light',
    reducedMotion: false,
    contentId: 'original',
    source: 'Authored responsive proof scope',
  },
  {
    id: 'ipad-large-text',
    platform: 'web',
    width: 834,
    height: 1194,
    textScale: 2,
    colorScheme: 'dark',
    reducedMotion: true,
    contentId: 'long-copy',
    source: 'Authored responsive proof scope',
  },
  {
    id: 'desktop',
    platform: 'web',
    width: 1440,
    height: 1000,
    textScale: 1,
    colorScheme: 'light',
    reducedMotion: true,
    contentId: 'original',
    source: 'Authored responsive proof scope',
  },
];
const calls = scenarios
  .map((s) => {
    const state = structuredClone(base);
    state.viewport = {
      width: s.width,
      height: s.height,
      textScale: s.textScale,
    };
    if (s.contentId === 'long-copy')
      state.blocks[1].text +=
        ' Build an approach that remains useful when real content changes and readers enlarge the text.';
    const system = {
      tokens:
        s.colorScheme === 'dark'
          ? { canvas: '#17291f', ink: '#faf6e9', accent: '#d1dda3' }
          : { canvas: '#faf6e9', ink: '#17291f', accent: '#345e48' },
      roles: [
        {
          id: 'prose',
          foreground: 'ink',
          background: 'canvas',
          use: 'text',
          source: ['Authored proof fixture'],
        },
      ],
    };
    state.colors = system;
    return [
      {
        id: `${s.id}-geometry`,
        scenario: s.id,
        tool: 'layout measure',
        input: { state, probes: false, spacing: true },
        accept: (r) => r.feasible === true,
      },
      {
        id: `${s.id}-contrast`,
        scenario: s.id,
        tool: 'palette analyze',
        input: { system },
        accept: (r) => r.summary.status === 'pass',
      },
    ];
  })
  .flat();
const requirement = (c) => ({
  id: c.id,
  scenario: c.scenario,
  tool: c.tool,
  inputIdentity: hash(c.input),
  evidenceKind: 'deterministic',
  rationale: 'Explicit proof requirement, scoped to the declared tool input',
});
const plan = {
  version: 1,
  id: 'responsive-finalists',
  designIdentity: hash({ base, sources }),
  scenarios,
  phases: [
    {
      id: 'geometry',
      purpose:
        'Measure phone, iPad enlarged content and desktop before progressing',
      requirements: calls
        .filter((c) => c.tool === 'layout measure')
        .map(requirement),
    },
    {
      id: 'contrast',
      purpose: 'Check every authored palette before completing this proof',
      requirements: calls
        .filter((c) => c.tool === 'palette analyze')
        .map(requirement),
    },
  ],
};
const compiled = describeValidationPlan(plan);
await writeFile(`${directory}/plan.json`, JSON.stringify(plan, null, 2) + '\n');
const receipts = [];
for (const c of calls) {
  const result = await execute(c.tool, c.input);
  await writeFile(
    `${directory}/${c.id}.json`,
    JSON.stringify(result, null, 2) + '\n',
  );
  receipts.push({
    requirement: c.id,
    planIdentity: compiled.identity,
    designIdentity: plan.designIdentity,
    inputIdentity: hash(c.input),
    tool: c.tool,
    evidenceKind: 'deterministic',
    outcome: c.accept(result) ? 'pass' : 'fail',
    resultRef: `${directory}/${c.id}.json`,
    observedAt: new Date().toISOString(),
    detail:
      'Actual toolkit handler executed; layout receipt or palette constraints checked. Reduced-motion metadata does not imply an animated-scene check.',
  });
}
const missing = checkValidation({
  plan,
  receipts: receipts.filter(
    (r) => r.requirement !== 'ipad-large-text-geometry',
  ),
  advance: 16,
});
assert.equal(missing.complete, false);
assert.equal(missing.state, 'geometry');
const complete = checkValidation({ plan, receipts, advance: 16 });
await writeFile(
  `${directory}/check.json`,
  JSON.stringify({ plan, receipts, advance: 16 }, null, 2) + '\n',
);
const changed = structuredClone(plan);
changed.scenarios[0].width = 375;
const stale = checkValidation({ plan: changed, receipts, advance: 16 });
assert.equal(stale.complete, false);
assert.ok(stale.next.every((r) => r.status === 'stale'));
const report = {
  createdAt: new Date().toISOString(),
  sources,
  planIdentity: compiled.identity,
  receipts,
  missingPermutation: missing,
  state: complete.state,
  complete: complete.complete,
  changedScenario: stale,
  scope:
    'Six actual deterministic tool invocations feed an XState planning gate. This is a scoped geometry/palette example, not a complete app, native, motion, contrast-over-PBR or aesthetic certification.',
};
await writeFile(
  `${directory}/report.json`,
  JSON.stringify(report, null, 2) + '\n',
);
assert.equal(complete.complete, true, JSON.stringify(complete.phases));
console.log(
  JSON.stringify({
    complete: report.complete,
    toolInvocations: receipts.length,
    missingPermutation: missing.state,
    changedScenario: stale.state,
  }),
);
