import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseState } from '../src/state.js';
import {
  defaultColors,
  renderedColorAnalysis,
  colorIssues,
} from '../src/design-color.js';
import { perturb } from '../src/graph.js';
import { nativeMapping } from '../src/emission.js';

test('color edits invalidate color facts without inventing changed glyph metrics', () => {
  const state = parseState(
    JSON.parse(readFileSync('examples/hero.json', 'utf8')),
  );
  state.viewport.width = 390;
  const changed = perturb(state, '/colors', {
    ...defaultColors,
    tokens: { canvas: '#ffffff', ink: '#777777', accent: '#2255aa' },
  });
  assert.ok(changed.invalidated.includes('color:title'));
  assert.ok(changed.invalidated.includes('color:subtitle'));
  assert.ok(!changed.invalidated.includes('metrics:title'));
  assert.ok(!changed.invalidated.includes('shape:title'));
  const facts = renderedColorAnalysis(changed.state);
  assert.equal(facts.text.find((t) => t.id === 'subtitle')!.passes, false);
  changed.state.viewport.textScale = 2;
  assert.equal(
    renderedColorAnalysis(changed.state).text.find((t) => t.id === 'subtitle')!
      .passes,
    false,
    'user enlargement does not excuse authored low contrast',
  );
  changed.state.platform = 'native-ios';
  assert.ok(colorIssues(changed.state).length > 0);
  assert.equal(nativeMapping(changed.state).blocks[0]!.style.color, '#777777');
  assert.equal(
    nativeMapping(changed.state).container.backgroundColor,
    '#ffffff',
  );
  const locked = { ...state, locks: ['/colors'] };
  assert.throws(() => perturb(locked, '/colors', defaultColors), /locked/);
});

test('large-text contrast uses effective variable weight and includes exact 14pt bold', () => {
  const state = parseState(
    JSON.parse(readFileSync('examples/hero.json', 'utf8')),
  );
  state.responsive = null;
  state.colors = {
    ...defaultColors,
    tokens: { canvas: '#fff', ink: '#888', accent: '#005599' },
  };
  const title = state.blocks[0]!;
  title.text = 'مرحبا';
  title.font.file = 'assets/fonts/NotoSansArabic[wdth,wght].ttf';
  title.font.family = 'Noto Sans Arabic';
  title.size = 20;
  title.weight = 700;
  title.font.axes = { wght: 400 };
  const regular = renderedColorAnalysis(state).text[0]!;
  assert.equal(regular.effectiveWeight, 400);
  assert.equal(regular.minimum, 4.5);
  assert.equal(regular.passes, false);
  title.weight = 400;
  title.font.axes.wght = 700;
  title.size = (14 * 96) / 72;
  assert.equal(renderedColorAnalysis(state).text[0]!.minimum, 3);
  assert.equal(renderedColorAnalysis(state).text[0]!.passes, true);
  title.size -= 1e-8;
  assert.equal(renderedColorAnalysis(state).text[0]!.minimum, 4.5);
  title.font.axes = {};
  title.weight = 700;
  title.size = (14 * 96) / 72;
  assert.equal(renderedColorAnalysis(state).text[0]!.minimum, 3);
});
