import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { hash } from '../dist/identity.js';
import { execute } from '../dist/commands.js';
import { resolveRelayRuntimeChoice } from '../examples/relay/app/src/design/runtime-choice.mjs';

const repository = fileURLToPath(new URL('..', import.meta.url));
const file = (name) => path.join(repository, name);
const briefFile = file('examples/relay/app/src/design/palette-brief.json');
const outputFile = file('examples/relay/app/src/design/palette.generated.json');
const surfaceFile = file(
  'examples/relay/app/src/design/surfaces.generated.json',
);
const surfaceTemplates = JSON.parse(
  await readFile(
    file('examples/relay/app/src/design/surface-values.json'),
    'utf8',
  ),
);
const brief = JSON.parse(await readFile(briefFile, 'utf8'));
const choice = resolveRelayRuntimeChoice(
  JSON.parse(
    await readFile(
      file('examples/relay/app/src/design/attention.generated.json'),
      'utf8',
    ),
  ),
);
if (choice)
  assert.ok(
    brief.directions.some((d) => d.id === choice.palette),
    'Selected palette must exist',
  );
const roles = [];
const add = (foreground, background, use) =>
  roles.push({
    id: `${foreground}-on-${background}`,
    foreground,
    background,
    use,
    source: [
      'https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html',
      'https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html',
    ],
  });
for (const background of ['canvas', 'panel', 'raised']) {
  for (const foreground of [
    'ink',
    'muted',
    'accent',
    'critical',
    'warning',
    'healthy',
  ])
    add(foreground, background, 'text');
  for (const foreground of ['line', 'data', 'comparison', 'focus'])
    add(foreground, background, 'non-text');
}
add('on-accent', 'accent', 'text');
add('accent', 'selection', 'text');
add('ink', 'selection', 'text');
const output = {
  version: 1,
  inputIdentity: hash({ brief, choiceIdentity: choice?.resultIdentity ?? null }),
  defaultDirection: choice?.palette ?? brief.defaultDirection,
  choiceIdentity: choice?.resultIdentity ?? null,
  provenance: brief.provenance,
  directions: {},
};
const receipts = [];
for (const theme of ['dark', 'light']) {
  const input = {
    system: { tokens: brief.directions[0][theme], roles, harmony: 'free' },
    contrastLevel: 'AA',
    editableTokens: [
      'ink',
      'muted',
      'line',
      'accent',
      'on-accent',
      'data',
      'comparison',
      'focus',
    ],
    limit: 6,
    maxAttempts: 1536,
    directions: brief.directions.map((direction) => ({
      id: direction.id,
      tokens: direction[theme],
      source: direction.source,
    })),
  };
  const result = await execute('palette candidates', input);
  for (const direction of brief.directions) {
    const candidate = result.candidates.find(
      (candidate) => candidate.direction.id === direction.id,
    );
    assert.ok(
      candidate,
      `No viable ${direction.id}/${theme}: ${JSON.stringify(result.exploration)}`,
    );
    assert.ok(
      candidate.compatibleSystem,
      'Relay consumes opaque sRGB role tokens',
    );
    const facts = await execute('palette analyze', {
      system: candidate.system,
    });
    assert.equal(facts.summary.status, 'pass');
    output.directions[direction.id] ??= { label: direction.label };
    output.directions[direction.id][theme] = candidate.compatibleSystem.tokens;
    receipts.push({
      theme,
      direction: direction.id,
      candidate,
      checks: facts.checks,
      measurementRef: facts.measurementRef,
    });
  }
  receipts.push({ theme, input, result });
}
output.resultIdentity = hash(output.directions);
const surfaces = {
  paletteIdentity: output.resultIdentity,
  choiceIdentity: choice?.resultIdentity ?? null,
  lightResponse: choice?.lightResponse ?? 5,
  directions: {},
};
for (const [id, direction] of Object.entries(output.directions)) {
  surfaces.directions[id] = {};
  for (const theme of ['dark', 'light']) {
    surfaces.directions[id][theme] = {};
    const palette = direction[theme];
    for (const [name, base] of [
      ['substrate', 'panel'],
      ['navigation', 'canvas'],
      ['action', 'raised'],
    ]) {
      const template =
        surfaceTemplates[(theme === 'light' ? 'light-' : '') + name] ??
        surfaceTemplates[name];
      surfaces.directions[id][theme][name] = await execute('surface css', {
        ...template.input,
        ...(choice && name === 'action' ? { roughness: choice.roughness } : {}),
        baseColor: palette[base],
        ink: palette.ink,
      });
    }
  }
}
surfaces.resultIdentity = hash(surfaces);
const bytes = JSON.stringify(output, null, 2) + '\n';
const surfaceBytes = JSON.stringify(surfaces, null, 2) + '\n';
if (process.argv.includes('--check')) {
  assert.equal(
    await readFile(outputFile, 'utf8'),
    bytes,
    'Regenerate Relay palettes',
  );
  assert.equal(
    await readFile(surfaceFile, 'utf8'),
    surfaceBytes,
    'Regenerate Relay material colors',
  );
} else {
  await writeFile(outputFile, bytes);
  await writeFile(surfaceFile, surfaceBytes);
}
await mkdir(file('artifacts/relay-palettes'), { recursive: true });
await writeFile(
  file('artifacts/relay-palettes/receipt.json'),
  JSON.stringify(
    {
      inputIdentity: output.inputIdentity,
      resultIdentity: output.resultIdentity,
      scope:
        'Authored whole-palette directions through existing CLI implementation; deterministic contrast repair/facts, 0 selector calls. No renderer, human preference or aesthetic validation.',
      receipts,
    },
    null,
    2,
  ) + '\n',
);
console.log(
  JSON.stringify({
    directions: Object.keys(output.directions),
    themes: ['dark', 'light'],
    checks: receipts
      .filter((r) => r.checks)
      .reduce((sum, r) => sum + r.checks.length, 0),
    selectorCalls: 0,
    resultIdentity: output.resultIdentity,
    checked: process.argv.includes('--check'),
  }),
);
