import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseState } from '../src/state.js';
import { ResponsiveSchema, resolveLayout } from '../src/responsive.js';
import { geometryIssues } from '../src/measurement.js';
import { nativeMapping } from '../src/emission.js';
import { relax } from '../src/search.js';
import type { Renderer } from '../src/measurement.js';
const hero = () =>
  parseState(JSON.parse(readFileSync('examples/hero.json', 'utf8')));
test('responsive anchors interpolate bounded editable choices and preserve text enlargement', () => {
  const s = hero();
  for (const [width, size] of [
    [360, 52],
    [390, 56],
    [834, 80],
    [1024, 88],
    [1440, 96],
  ]) {
    s.viewport.width = width;
    const r = resolveLayout(s);
    assert.ok(Math.abs(r.state.blocks[0]!.size - size) < 1e-9);
    assert.equal(r.pattern, 'stack');
    assert.equal(r.container.flexWrap, 'nowrap');
    assert.equal(r.state.blocks[0]!.text, s.blocks[0]!.text);
    assert.ok(r.state.padding * 2 < r.surfaceWidth);
  }
  for (let width = 280; width <= 2000; width += 7) {
    s.viewport.width = width;
    const r = resolveLayout(s);
    assert.ok(r.state.blocks[0]!.size >= 52 && r.state.blocks[0]!.size <= 96);
    assert.ok(
      r.state.blocks.every(
        (b) => b.measure <= r.surfaceWidth - 2 * r.state.padding,
      ),
    );
  }
  s.viewport.width = 390;
  s.viewport.textScale = 2;
  assert.equal(resolveLayout(s).state.viewport.textScale, 2);
  const bad = structuredClone(s.responsive!);
  bad.anchors[1]!.width = bad.anchors[0]!.width;
  assert.equal(ResponsiveSchema.safeParse(bad).success, false);
});
test('bounded search rejects invalid proposals without measuring them and validates stress domains', async () => {
  const state = hero();
  state.responsive = null;
  state.blocks.forEach((block) => {
    block.size = 1e-8;
  });
  let calls = 0;
  const renderer: Renderer = {
    async measure() {
      calls++;
      throw new Error('invalid proposal reached renderer');
    },
    async close() {},
  };
  const result = await relax(state, renderer);
  assert.equal(calls, 0);
  assert.equal(result.candidates.length, 0);
  assert.equal(result.rejectedProposals.length, 9);
  for (const options of [
    { widths: [] },
    { textScales: [] },
    { textScales: [6] },
    { widths: [10001] },
  ])
    await assert.rejects(relax(state, renderer, options), /nonempty finite/);
});
test('optional split uses explicit flex and stacks when text enlargement or a narrow window removes space', () => {
  const s = hero();
  s.responsive!.anchors.forEach((a) => (a.pattern = 'split'));
  s.viewport.width = 1440;
  const wide = resolveLayout(s),
    native = nativeMapping(s);
  assert.equal(wide.pattern, 'split');
  assert.equal(native.container.flexDirection, 'row');
  assert.equal(native.container.flexWrap, 'wrap');
  assert.equal(native.blocks[0]!.layoutStyle.flexShrink, 0);
  assert.equal(native.blocks[0]!.layoutStyle.flexBasis, 'auto');
  s.viewport.width = 507;
  assert.equal(resolveLayout(s).pattern, 'stack');
  s.viewport.width = 1024;
  s.viewport.textScale = 2;
  assert.equal(resolveLayout(s).pattern, 'stack');
  const block = (
    id: string,
    x: number,
    y: number,
    width: number,
    height: number,
  ) => ({
    id,
    box: { x, y, width, height },
    lines: [],
    inlineBounds: null,
    inkBounds: null,
    overflowX: 0,
    overflowY: 0,
  });
  assert.ok(
    !geometryIssues([
      block('a', 0, 0, 200, 100),
      block('b', 240, 0, 300, 200),
    ]).some((i) => i.code === 'collision'),
  );
  assert.ok(
    geometryIssues([
      block('a', 0, 0, 200, 100),
      block('b', 100, 50, 300, 200),
    ]).some((i) => i.code === 'collision'),
  );
});
