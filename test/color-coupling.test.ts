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
