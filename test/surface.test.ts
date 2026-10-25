import test from 'node:test';
import assert from 'node:assert/strict';
import {
  probeSurface,
  generateSurfaceTextures,
  mapSurfaceToThree,
  surfaceSupport,
  SurfaceProbeSchema,
} from '../src/surface.js';

const surface = { baseColor: [0.5, 0.2, 0.1], roughness: 1, metalness: 0 };
const near = (a: number, b: number, tolerance = 1e-10) =>
  assert.ok(Math.abs(a - b) <= tolerance, `${a} != ${b}`);

test('normal incidence has independently calculable Lambert plus GGX response', () => {
  const p = probeSurface({ surface });
  surface.baseColor.forEach((c, i) =>
    near(p.radiance[i]!, (0.96 * c + 0.04 / 4) / Math.PI),
  );
  near(p.terms.distribution, 1 / Math.PI);
  assert.deepEqual(p.terms.f0, [0.04, 0.04, 0.04]);
});

test('black metal has no diffuse response; back-facing and zero light produce zero radiance', () => {
  assert.deepEqual(
    probeSurface({ surface: { ...surface, metalness: 1 } }).diffuseBrdf,
    [0, 0, 0],
  );
  assert.deepEqual(
    probeSurface({ surface, light: [0, 0, -1] }).radiance,
    [0, 0, 0],
  );
  assert.deepEqual(
    probeSurface({ surface, view: [0, 0, -1] }).radiance,
    [0, 0, 0],
  );
  assert.deepEqual(
    probeSurface({ surface, irradiance: [0, 0, 0] }).radiance,
    [0, 0, 0],
  );
});

test('BRDF is reciprocal, direction-scale invariant, and radiance linear in incident light', () => {
  const light = [0.7, 0.2, 0.4],
    view = [-0.2, 0.5, 0.8];
  const a = probeSurface({
    surface: { ...surface, roughness: 0.3 },
    light,
    view,
  });
  const b = probeSurface({
    surface: { ...surface, roughness: 0.3 },
    light: view,
    view: light,
  });
  const scaled = probeSurface({
    surface: { ...surface, roughness: 0.3 },
    light: light.map((x) => x * 11),
    view,
    irradiance: [2, 2, 2],
  });
  for (let i = 0; i < 3; i++) {
    near(a.diffuseBrdf[i]!, b.diffuseBrdf[i]!);
    near(a.specularBrdf[i]!, b.specularBrdf[i]!);
    near(scaled.radiance[i]!, a.radiance[i]! * 2);
  }
});

test('grazing underflow and finite endpoint roughness remain finite', () => {
  for (const roughness of [0, 1e-12, 0.5, 1])
    for (const z of [1e-300, 1e-12, 0, 1]) {
      const result = probeSurface({
        surface: { ...surface, roughness },
        light: [1, 0, z],
        view: [-1, 0, z],
      });
      assert.ok(
        [
          ...result.radiance,
          ...result.specularBrdf,
          ...result.diffuseBrdf,
        ].every(Number.isFinite),
      );
    }
  for (const value of [NaN, Infinity, -Infinity, -1, 1.01]) {
    assert.throws(() =>
      probeSurface({ surface: { ...surface, roughness: value } }),
    );
  }
  assert.equal(
    SurfaceProbeSchema.safeParse({ surface, normal: [0, 0, 0] }).success,
    false,
  );
  assert.throws(() => probeSurface({ surface, beauty: 1 }));
});

test('seeded textures are reproducible, vary by seed, and normal vectors stay unit length after quantization', () => {
  const a = generateSurfaceTextures({ seed: 12, size: 32 });
  const b = generateSurfaceTextures({ seed: 12, size: 32 });
  const c = generateSurfaceTextures({ seed: 13, size: 32 });
  assert.deepEqual(a.normal, b.normal);
  assert.deepEqual(a.roughness, b.roughness);
  assert.notDeepEqual(a.normal, c.normal);
  for (let i = 0; i < a.normal.length; i += 4) {
    near(
      Math.hypot(...[0, 1, 2].map((j) => (a.normal[i + j]! / 255) * 2 - 1)),
      1,
      0.007,
    );
    assert.equal(a.normal[i + 3], 255);
  }
  const flat = generateSurfaceTextures({
    size: 4,
    normalStrength: 0,
    roughnessVariation: 0,
    roughness: 0.2,
  });
  assert.deepEqual([...flat.normal.slice(0, 4)], [128, 128, 255, 255]);
  assert.deepEqual([...flat.roughness.slice(0, 4)], [51, 51, 51, 255]);
});

test('renderer recipe preserves linear color and distinguishes data maps; unobserved support stays unknown', () => {
  const mapping = mapSurfaceToThree(surface);
  assert.deepEqual(mapping.colorLinearSRGB, surface.baseColor);
  assert.equal(mapping.textureChannels.roughness, 'g');
  assert.equal(mapping.textureColorSpaces.normal, 'NoColorSpace');
  assert.equal(surfaceSupport().browser, 'unverified');
  assert.equal(surfaceSupport({ webgl2: true }).browser, 'available');
  assert.equal(surfaceSupport({ webgl2: true }).worker, 'unverified');
  assert.equal(surfaceSupport().native, 'unsupported');
});
