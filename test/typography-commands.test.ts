import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execute } from '../src/commands.js';

const fixture = JSON.parse(
  readFileSync('examples/typography/inspect.json', 'utf8'),
);

test('typography commands inspect effective responsive size, measure and user enlargement', async () => {
  const state = structuredClone(fixture.state);
  state.viewport.textScale = 2;
  state.responsive = {
    source: 'test-authored-anchors',
    anchors: [320, 1440].map((width) => ({
      width,
      padding: 20,
      gapScale: 1,
      contentMaxWidth: 600,
      pattern: 'stack',
      blocks: {
        [fixture.blockId]: {
          sizeScale: 1.5,
          leadingDelta: 0,
          trackingDelta: 0,
          measureScale: 2,
        },
      },
    })),
  };
  const facts: any = await execute('typography inspect', {
    state,
    blockId: fixture.blockId,
    render: false,
  });
  const authored = state.blocks.find((b: any) => b.id === fixture.blockId);
  assert.equal(facts.resolution.effectiveSize, authored.size * 3);
  assert.equal(
    facts.resolution.effectiveMeasure,
    Math.min(authored.measure * 2, Math.min(state.viewport.width, 600) - 40),
  );
  assert.equal(
    facts.metrics.scale,
    (authored.size * 3) / facts.font.unitsPerEm,
  );
  assert.equal(facts.renderer, null);
  assert.equal(
    state.responsive.anchors[0].blocks[fixture.blockId].sizeScale,
    1.5,
  );
  assert.equal(state.blocks[0].size, fixture.state.blocks[0].size);
});

test('axis command covers all 13 axes by default and makes omitted candidates explicit', async () => {
  const facts: any = await execute('typography axes', {
    state: fixture.state,
    blockId: fixture.blockId,
    render: false,
  });
  assert.equal(facts.results.length, 40);
  assert.equal(facts.omittedCandidates, 0);
  assert.equal(Object.keys(facts.axes).length, 13);
  const bounded: any = await execute('typography axes', {
    state: fixture.state,
    blockId: fixture.blockId,
    render: false,
    limit: 1,
  });
  assert.equal(bounded.omittedCandidates, 39);
  assert.equal(bounded.results[0].renderer, null);
});

test('native targets cannot be silently inspected by a browser', async () => {
  const state = { ...fixture.state, platform: 'native-ios' };
  for (const command of ['typography inspect', 'typography axes'] as const)
    await assert.rejects(
      execute(command, { state, blockId: fixture.blockId }),
      /cannot certify native/,
    );
  const facts: any = await execute('typography inspect', {
    state,
    blockId: fixture.blockId,
    render: false,
  });
  assert.equal(facts.targetPlatform, 'native-ios');
  assert.equal(facts.renderer, null);
  assert.equal(facts.metrics.baseline, null);
});
