import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { compileRelayAttention } from '../examples/relay/attention-workflow.mjs';
import { overviewVariants } from '../examples/relay/app/src/design/attention-policy.mjs';
import { hash } from '../dist/identity.js';
import { runDecisionWorkflow } from '../dist/decision-workflow.js';

// Synthetic compiler inputs only: these numbers are not renderer evidence.
async function fixture() {
  const palettes = JSON.parse(
    await readFile(
      new URL(
        '../examples/relay/app/src/design/palette.generated.json',
        import.meta.url,
      ),
      'utf8',
    ),
  );
  const paletteReceipt = {
    resultIdentity: palettes.resultIdentity,
    receipts: [],
  };
  for (const [direction, value] of Object.entries(palettes.directions))
    for (const theme of ['dark', 'light'])
      paletteReceipt.receipts.push({
        direction,
        theme,
        candidate: {
          system: {
            tokens: value[theme],
            roles: [
              {
                id: 'body',
                foreground: 'ink',
                background: 'canvas',
                use: 'text',
                source: ['Synthetic unit fixture'],
              },
            ],
          },
        },
      });
  const matrix = {
    passed: true,
    sourceStable: true,
    sourceIdentity: 'synthetic-compiler-fixture',
    scenarios: Array.from({ length: 8 }, (_, i) => ({ id: `case-${i}` })),
    variants: structuredClone(overviewVariants),
    cells: [],
  };
  for (const engine of ['chromium', 'webkit'])
    for (let i = 0; i < 8; i++)
      for (const variant of overviewVariants)
        matrix.cells.push({
          scenario: `${engine}-case-${i}`,
          variant: variant.id,
          sourceIdentity: matrix.sourceIdentity,
          rectangles: [
            {
              id: 'diagnose-checkout',
              box: { x: 0, y: 0, width: 160, height: 44 },
            },
          ],
          analysis: {
            exposure: {
              regions: [
                {
                  id: 'diagnose-checkout',
                  visibleFraction: variant.actionLead ? 1 : 0.8,
                  endFraction: variant.actionLead ? 0.4 : 0.9,
                },
                {
                  id: 'relay-latency-chart',
                  visibleFraction: variant.orderIndex === 2 ? 0.7 : 0.1,
                },
                {
                  id: 'relay-overview-summary',
                  visibleFraction: variant.orderIndex === 2 ? 0 : 0.6,
                },
              ],
            },
          },
        });
  rehash(matrix);
  return {
    matrix,
    palettes,
    paletteReceipt,
    designIdentity: 'synthetic-brief',
  };
}
function rehash(matrix) {
  matrix.identity = hash({
    source: matrix.sourceIdentity,
    scenarios: matrix.scenarios,
    variants: matrix.variants,
    cells: matrix.cells,
  });
}
test('Relay compiler runs all conditioned stages and replays without any model', async () => {
  const { workflow, metadata } = compileRelayAttention(await fixture());
  for (const stage of workflow.stages) stage.selection = 'mathematical';
  const first = await runDecisionWorkflow({ workflow });
  assert.equal(first.status, 'proposed');
  assert.equal(first.statistics.evaluated, 201);
  assert.equal(first.statistics.neuralCalls, 0);
  assert.equal(Object.keys(first.stages).length, 3);
  assert.equal(metadata.paletteChecks.length, 6);
  const replay = await runDecisionWorkflow({
    workflow,
    recipe: first.recipe,
    mode: 'replay',
  });
  assert.equal(replay.statistics.cacheHits, 3);
  assert.equal(replay.statistics.searches, 0);
  assert.equal(replay.statistics.neuralCalls, 0);
});
test('Relay compiler rejects altered identity, semantic topology, missing cells and stale palette evidence', async () => {
  const input = await fixture();
  const changed = structuredClone(input);
  changed.matrix.cells[0].analysis.exposure.regions[0].visibleFraction = 0;
  assert.throws(() => compileRelayAttention(changed), /identity mismatch/);
  const topology = structuredClone(input);
  topology.matrix.variants[0].regions.reverse();
  rehash(topology.matrix);
  assert.throws(() => compileRelayAttention(topology), /topology differs/);
  const missing = structuredClone(input);
  missing.matrix.cells.pop();
  rehash(missing.matrix);
  assert.throws(() => compileRelayAttention(missing));
  const stale = structuredClone(input);
  stale.paletteReceipt.resultIdentity = 'changed';
  assert.throws(
    () => compileRelayAttention(stale),
    /Palette evidence is stale/,
  );
});
