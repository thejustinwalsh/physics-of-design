import { z } from 'zod';

const unit = z.number().finite().min(0).max(1);
const rgb = z.tuple([unit, unit, unit]);
const component = z.number().finite().min(-1e6).max(1e6);
const vector = z
  .tuple([component, component, component])
  .refine(
    (v) => Math.hypot(...v) >= 1e-8,
    'Direction must have nonzero length',
  );
export type SurfaceRGB = [number, number, number];
export const SurfaceSchema = z
  .object({
    baseColor: rgb,
    roughness: unit,
    metalness: unit,
  })
  .strict();
export const SurfaceProbeSchema = z
  .object({
    surface: SurfaceSchema,
    normal: vector.default([0, 0, 1]),
    view: vector.default([0, 0, 1]),
    light: vector.default([0, 0, 1]),
    irradiance: z
      .tuple([
        z.number().finite().min(0).max(1e6),
        z.number().finite().min(0).max(1e6),
        z.number().finite().min(0).max(1e6),
      ])
      .default([1, 1, 1]),
  })
  .strict();
export const SurfaceTextureSchema = z
  .object({
    seed: z.number().int().min(0).max(0xffffffff).default(1),
    size: z.number().int().min(4).max(512).default(128),
    pattern: z.enum(['noise', 'ridges', 'cells']).default('noise'),
    frequency: z.number().int().min(1).max(64).default(8),
    directionDegrees: z.number().finite().min(-360).max(360).default(0),
    normalStrength: z.number().finite().min(0).max(4).default(0.25),
    roughness: unit.default(0.6),
    roughnessVariation: unit.default(0.15),
  })
  .strict();
export type Surface = z.infer<typeof SurfaceSchema>;
export const surfaceSources = [
  'https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html#metal-brdf-and-dielectric-brdf',
  'https://google.github.io/filament/main/filament.html#materialsystem/specularbrdf',
  'https://threejs.org/docs/pages/MeshStandardMaterial.html',
  'https://threejs.org/manual/pages/color-management.html',
] as const;
const clamp = (n: number) => Math.max(0, Math.min(1, n));
const dot = (a: SurfaceRGB, b: SurfaceRGB) =>
  a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const normalized = (v: SurfaceRGB): SurfaceRGB => {
  const length = Math.hypot(...v);
  return v.map((n) => n / length) as SurfaceRGB;
};

/** Single directional-light response in linear RGB, before exposure or display encoding. */
export function probeSurface(input: unknown) {
  const r = SurfaceProbeSchema.parse(input);
  const n = normalized(r.normal),
    v = normalized(r.view),
    l = normalized(r.light);
  const nl = clamp(dot(n, l)),
    nv = clamp(dot(n, v));
  const sum = l.map((c, i) => c + v[i]!) as SurfaceRGB;
  const h = Math.hypot(...sum) > 1e-8 ? normalized(sum) : n;
  const nh = clamp(dot(n, h)),
    vh = clamp(dot(v, h));
  // Exact zero roughness is a delta distribution, which cannot be sampled as a finite BRDF.
  const alpha = Math.max(0.0004, r.surface.roughness ** 2),
    a2 = alpha ** 2;
  const denominator = nh * nh * (a2 - 1) + 1;
  const distribution = a2 / (Math.PI * denominator * denominator);
  const g1 = (cosine: number) =>
    cosine <= 0
      ? 0
      : (2 * cosine) / (cosine + Math.sqrt(a2 + (1 - a2) * cosine * cosine));
  const geometry = g1(nl) * g1(nv);
  const f0 = r.surface.baseColor.map(
    (c) => 0.04 * (1 - r.surface.metalness) + c * r.surface.metalness,
  ) as SurfaceRGB;
  const fresnel = f0.map((f) => f + (1 - f) * (1 - vh) ** 5) as SurfaceRGB;
  const lit = nl > 0 && nv > 0;
  const diffuse = r.surface.baseColor.map((c, i) =>
    lit ? ((1 - fresnel[i]!) * (1 - r.surface.metalness) * c) / Math.PI : 0,
  ) as SurfaceRGB;
  // Cancel NdotL/NdotV algebraically before evaluation: grazing products can underflow.
  const visibilityDenominator =
    (nl + Math.sqrt(a2 + (1 - a2) * nl * nl)) *
    (nv + Math.sqrt(a2 + (1 - a2) * nv * nv));
  const specular = fresnel.map((f) =>
    lit ? (distribution * f) / visibilityDenominator : 0,
  ) as SurfaceRGB;
  const radiance = diffuse.map(
    (d, i) => (d + specular[i]!) * nl * r.irradiance[i]!,
  ) as SurfaceRGB;
  return {
    radiance,
    diffuseBrdf: diffuse,
    specularBrdf: specular,
    terms: {
      nDotL: nl,
      nDotV: nv,
      nDotH: nh,
      vDotH: vh,
      alpha,
      distribution,
      geometry,
      fresnel,
      f0,
    },
    units: 'relative-linear-rgb' as const,
    algorithm: 'lambert-ggx-schlick-separable-smith-v1',
    assumptions: [
      'baseColor is linear sRGB reflectance; directions point away from the surface in one coordinate space.',
      'irradiance is incident directional-light RGB before multiplication by N dot L, in relative units.',
      'Isotropic GGX; alpha=max(roughness squared,0.0004); Schlick Fresnel; dielectric F0=0.04; separable exact Smith G1.',
      'Diffuse uses (1-Fresnel)*(1-metalness)*baseColor/pi; no multiple scattering, environment, shadows, occlusion, transmission or emission.',
      'The inexpensive diffuse/specular coupling is not an exact energy-conservation model (Khronos B.3.6.3).',
      'No luminance calibration, perceptual quality score, display encoding or Three.js pixel-parity claim.',
    ],
    sources: surfaceSources,
  };
}

/** Renderer-neutral recipe. Set the Three Color with setRGB(...rgb, THREE.LinearSRGBColorSpace). */
export function mapSurfaceToThree(input: unknown) {
  const surface = SurfaceSchema.parse(input);
  return {
    material: 'MeshStandardMaterial' as const,
    colorLinearSRGB: surface.baseColor,
    roughness: surface.roughness,
    metalness: surface.metalness,
    normalMapType: 'TangentSpaceNormalMap' as const,
    textureColorSpaces: {
      baseColor: 'SRGBColorSpace',
      normal: 'NoColorSpace',
      roughness: 'NoColorSpace',
      metalness: 'NoColorSpace',
    },
    textureChannels: { roughness: 'g', metalness: 'b' },
    warning:
      'A lit photograph is not a calibrated base-color map. Three lighting, environment, shader approximations and tone mapping require separate renderer verification.',
    sources: surfaceSources,
  };
}

/** Only reports supplied observations; absence of a probe never implies device support. */
export function surfaceSupport(input: unknown = {}) {
  const observed = z
    .object({
      webgl2: z.boolean().nullable().default(null),
      webgpu: z.boolean().nullable().default(null),
      offscreenCanvas: z.boolean().nullable().default(null),
      workerWebgl2: z.boolean().nullable().default(null),
    })
    .strict()
    .parse(input);
  return {
    observed,
    browser:
      observed.webgl2 === true
        ? 'available'
        : observed.webgl2 === false
          ? 'unavailable'
          : 'unverified',
    worker:
      observed.workerWebgl2 === true
        ? 'available'
        : observed.workerWebgl2 === false
          ? 'unavailable'
          : 'unverified',
    native: 'unsupported' as const,
    fallback:
      'Authored flat color and ordinary image content; preserve controls and labels.',
    scope:
      'Browser renderer only. API presence is not a rendered-frame or context-loss recovery test.',
  };
}

/** Seeded seamless height-field normal/roughness textures; contains no implied material identity. */
export function generateSurfaceTextures(input: unknown = {}) {
  const r = SurfaceTextureSchema.parse(input),
    { size, frequency } = r;
  const lattice = (x: number, y: number) => {
    x = ((x % frequency) + frequency) % frequency;
    y = ((y % frequency) + frequency) % frequency;
    let h =
      (r.seed ^ Math.imul(x + 1, 374761393) ^ Math.imul(y + 1, 668265263)) >>>
      0;
    h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
    return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
  };
  const smooth = (n: number) => n * n * (3 - 2 * n);
  const theta = (r.directionDegrees * Math.PI) / 180;
  // Integer winding counts keep the periodic ridges seamless at any authored direction.
  const wx = Math.round(Math.cos(theta) * frequency),
    wy = Math.round(Math.sin(theta) * frequency);
  const heights = new Float64Array(size * size);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const px = (x / size) * frequency,
        py = (y / size) * frequency;
      const ix = Math.floor(px),
        iy = Math.floor(py),
        tx = smooth(px - ix),
        ty = smooth(py - iy);
      const top = lattice(ix, iy) * (1 - tx) + lattice(ix + 1, iy) * tx;
      const bottom =
        lattice(ix, iy + 1) * (1 - tx) + lattice(ix + 1, iy + 1) * tx;
      const noise = top * (1 - ty) + bottom * ty;
      heights[y * size + x] =
        r.pattern === 'ridges'
          ? 0.5 +
            0.4 *
              Math.sin(
                2 * Math.PI * ((wx * x) / size + (wy * y) / size) +
                  lattice(0, 0) * 2 * Math.PI,
              ) +
            0.1 * (noise - 0.5)
          : r.pattern === 'cells'
            ? 1 - Math.abs(2 * noise - 1)
            : noise;
    }
  const normal = new Uint8Array(size * size * 4),
    roughness = new Uint8Array(normal.length);
  const height = (x: number, y: number) =>
    heights[((y + size) % size) * size + ((x + size) % size)]!;
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const index = (y * size + x) * 4;
      const dx = ((height(x + 1, y) - height(x - 1, y)) * size) / 2;
      const dy = ((height(x, y + 1) - height(x, y - 1)) * size) / 2;
      const n = normalized([-dx * r.normalStrength, -dy * r.normalStrength, 1]);
      normal.set(
        [...n.map((c) => Math.round((c * 0.5 + 0.5) * 255)), 255],
        index,
      );
      const value = Math.round(
        clamp(r.roughness + (height(x, y) - 0.5) * 2 * r.roughnessVariation) *
          255,
      );
      roughness.set([value, value, value, 255], index);
    }
  return {
    width: size,
    height: size,
    normal,
    roughness,
    parameters: r,
    encoding: 'rgba8-linear-data' as const,
    roughnessMapSemantics:
      'Absolute roughness in green; set material.roughness=1 when using this map.',
    orientation:
      'Rows advance +v; normal XY encode -dheight/du and -dheight/dv. Adapter must preserve this UV orientation.',
    algorithm: 'periodic-seeded-height-central-difference-v1',
  };
}
