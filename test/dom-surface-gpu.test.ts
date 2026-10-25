import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createDomSurfaceTexture,
  domSurfaceLinearColor,
} from '../src/dom-surface-shading.js';
import { createDomSurfaceRecipe } from '../src/dom-surface.js';

test('material data is deterministic, unlit and independent of scalar finish/light edits', () => {
  const first = createDomSurfaceTexture('paper', 17),
    second = createDomSurfaceTexture('paper', 17),
    changed = createDomSurfaceTexture('paper', 18);
  assert.deepEqual(first, second);
  assert.notDeepEqual(first.pixels, changed.pixels);
  assert.equal(first.width * first.height * 4, first.pixels.length);
  const values = new Set<number>();
  for (let i = 0; i < first.pixels.length; i += 4)
    values.add(first.pixels[i + 2]!);
  assert(
    values.size > 200,
    'high frequency reflectance grain has independent variation',
  );
  const enamel = createDomSurfaceTexture('enamel', 17);
  for (let i = 2; i < enamel.pixels.length; i += 4)
    assert.equal(
      enamel.pixels[i],
      128,
      'smooth pigment does not inherit paper grain',
    );
});
test('sRGB reflectance conversion has independent reference values', () => {
  assert.throws(() => domSurfaceLinearColor('white'));
  assert.throws(() => domSurfaceLinearColor('#ffffff00'));
  assert.deepEqual(domSurfaceLinearColor('#000000'), [0, 0, 0]);
  assert.deepEqual(domSurfaceLinearColor('#ffffff'), [1, 1, 1]);
  assert(
    Math.abs(domSurfaceLinearColor('#808080')[0] - 0.21586050011389926) < 1e-12,
  );
});
test('DOM material contract exposes physical and authored quantities separately', () => {
  const metal = createDomSurfaceRecipe({ material: 'brushed-metal' }),
    paper = createDomSurfaceRecipe({ material: 'paper' });
  assert.equal(metal.input.metalness, 1);
  assert.equal(paper.input.metalness, 0);
  assert.equal(metal.input.light.kind, 'point');
  assert.equal(metal.input.light.color, '#ffffff');
  for (const patch of [
    { metalness: -1 },
    { roughnessVariation: 2 },
    { textureScale: 0 },
    { exposure: Infinity },
    { textureSeed: -1 },
    { light: { kind: 'spot' } },
  ])
    assert.throws(() =>
      createDomSurfaceRecipe({ material: 'enamel', ...patch }),
    );
  assert.equal(
    createDomSurfaceRecipe({
      material: 'enamel',
      light: { kind: 'directional', ambient: 0 },
    }).input.light.kind,
    'directional',
  );
});
