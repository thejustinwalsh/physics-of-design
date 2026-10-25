import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseState } from '../dist/state.js';
import { NativeRenderer } from '../dist/native.js';

test(
  'actual native Text/Yoga wrapping thresholds, scaled reflow and clipping rejection',
  { timeout: 120000 },
  async () => {
    const renderer = new NativeRenderer(process.env.DESIGN_NATIVE_URL);
    const state = parseState(
      JSON.parse(readFileSync('examples/hero.json', 'utf8')),
    );
    state.platform =
      process.env.DESIGN_NATIVE_PLATFORM === 'native-android'
        ? 'native-android'
        : 'native-ios';
    state.viewport.width = 390;
    state.padding = 24;
    try {
      const measured = await renderer.measure(state, { probes: true });
      assert.equal(measured.engine, 'react-native/Text+Yoga');
      assert.ok(measured.feasible, JSON.stringify(measured.issues));
      assert.ok(measured.runtime.reactNative);
      const threshold = measured.blocks[0]!.thresholds!.narrower;
      assert.ok(threshold.bracket);
      assert.ok(threshold.bracket[1] - threshold.bracket[0] <= 0.25);
      assert.ok(threshold.distance);
      const scaled = structuredClone(state);
      scaled.viewport.textScale = 2;
      const reflow = await renderer.measure(scaled);
      assert.ok(reflow.feasible, JSON.stringify(reflow.issues));
      assert.ok(
        reflow.blocks[0]!.lines.length >= measured.blocks[0]!.lines.length,
      );
      const clipped = structuredClone(state);
      clipped.blocks[0]!.maxHeight = 10;
      const bad = await renderer.measure(clipped);
      assert.equal(bad.feasible, false);
      assert.ok(bad.issues.some((i) => i.code === 'clipping'));
      const colored = structuredClone(state);
      colored.colors = JSON.parse(
        readFileSync('examples/palette.json', 'utf8'),
      );
      assert.ok((await renderer.measure(colored)).feasible);
      colored.colors!.tokens.ink = '#777777';
      colored.colors!.tokens.canvas = '#ffffff';
      const lowContrast = await renderer.measure(colored);
      assert.equal(lowContrast.feasible, false);
      assert.ok(
        lowContrast.issues.some((issue) => issue.code === 'text-contrast'),
      );
    } finally {
      await renderer.close();
    }
  },
);
