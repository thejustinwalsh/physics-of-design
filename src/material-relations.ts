import Color from 'colorjs.io';
import { z } from 'zod';
import { SurfaceSchema } from './surface.js';

const finite = z.number().finite();
const id = z.string().regex(/^[a-z][a-z0-9-]{0,79}$/);
const source = z.string().trim().min(1).max(2048);
const direction = z
  .tuple([
    finite.min(-1e6).max(1e6),
    finite.min(-1e6).max(1e6),
    finite.min(-1e6).max(1e6),
  ])
  .refine((v) => Math.hypot(...v) >= 1e-8, 'Light direction must be nonzero');
export const MaterialFeaturesSchema = z
  .object({
    id,
    surface: SurfaceSchema,
    composition: z
      .enum([
        'homogeneous-dielectric',
        'homogeneous-conductor',
        'mixture',
        'unspecified',
      ])
      .default('unspecified'),
    texture: z
      .object({
        cyclesPerTile: finite.min(1e-6).max(1024),
        heightAmplitudeFraction: finite.min(0).max(1),
        tileWidthMm: finite.min(1e-6).max(1e6).optional(),
        projectedTilePixels: finite.min(1e-6).max(1e6).optional(),
        textureResolution: z.number().int().min(1).max(16384).optional(),
        pattern: z.enum(['sinusoidal', 'other']).default('other'),
      })
      .strict()
      .nullable()
      .default(null),
    lighting: z
      .object({
        rigId: id.optional(),
        coordinateFrame: id.optional(),
        environmentId: id.optional(),
        exposureEv: finite.min(-20).max(20).optional(),
        lightDirection: direction.optional(),
      })
      .strict()
      .nullable()
      .default(null),
    provenance: z
      .object({
        kind: z.enum(['authored', 'measured']),
        source,
        note: z.string().max(2048).optional(),
      })
      .strict(),
  })
  .strict();
export const MaterialRelationMetricSchema = z.enum([
  'deltaEOK',
  'roughnessDifference',
  'alphaDifference',
  'metalnessDifference',
  'textureTileFrequencyOctaves',
  'texturePhysicalFrequencyOctaves',
  'textureAmplitudeFractionDifference',
  'textureAmplitudeMmDifference',
  'lightingDirectionDegrees',
  'exposureEvDifference',
]);
export const MaterialPairProfileSchema = z
  .object({
    id,
    intent: z.string().trim().min(1).max(2048),
    roleRelation: z.enum([
      'shared-group',
      'foreground-background',
      'counterpoint',
    ]),
    source,
    bands: z
      .array(
        z
          .object({
            metric: MaterialRelationMetricSchema,
            min: finite.min(0).max(1e6),
            max: finite.min(0).max(1e6),
            rationale: z.string().trim().min(1).max(1024),
            source,
          })
          .strict()
          .refine(
            (b) => b.min <= b.max,
            'Band minimum must not exceed maximum',
          ),
      )
      .min(1)
      .max(10),
  })
  .strict()
  .refine(
    (p) => new Set(p.bands.map((b) => b.metric)).size === p.bands.length,
    'A profile may specify one band per metric',
  );
export const MaterialPairSchema = z
  .object({
    first: MaterialFeaturesSchema,
    second: MaterialFeaturesSchema,
    profile: MaterialPairProfileSchema.nullable().default(null),
  })
  .strict()
  .refine((r) => r.first.id !== r.second.id, 'Paired material IDs must differ');

export const materialRelationSources = {
  khronos:
    'https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html#materials',
  filament:
    'https://google.github.io/filament/main/filament.html#materialsystem',
  disney:
    'https://disneyanimation.com/publications/physically-based-shading-at-disney/',
  oklab: 'https://bottosson.github.io/posts/oklab/',
  sampling:
    'https://pbr-book.org/4ed/Sampling_and_Reconstruction/Sampling_Theory',
  fingerprinting: 'https://arxiv.org/abs/2410.13615',
  illuminationExperiment: 'https://arxiv.org/abs/1908.00902',
  perceptionReview:
    'https://www.annualreviews.org/doi/10.1146/annurev-vision-102016-061429',
} as const;
type Material = z.infer<typeof MaterialFeaturesSchema>;
function textureFeatures(texture: Material['texture']) {
  if (texture === null) return null;
  const texelsPerCycle =
    texture.textureResolution === undefined
      ? null
      : texture.textureResolution / texture.cyclesPerTile;
  const pixelsPerCycle =
    texture.projectedTilePixels === undefined
      ? null
      : texture.projectedTilePixels / texture.cyclesPerTile;
  const sampling = (samples: number | null) =>
    samples === null
      ? 'unknown'
      : samples <= 2
        ? 'at-or-above-nyquist'
        : 'declared-frequency-below-nyquist';
  return {
    ...texture,
    cyclesPerMm:
      texture.tileWidthMm === undefined
        ? null
        : texture.cyclesPerTile / texture.tileWidthMm,
    amplitudeMm:
      texture.tileWidthMm === undefined
        ? null
        : texture.heightAmplitudeFraction * texture.tileWidthMm,
    maximumSinusoidalSlope:
      texture.pattern === 'sinusoidal'
        ? 2 * Math.PI * texture.heightAmplitudeFraction * texture.cyclesPerTile
        : null,
    texelsPerCycle,
    pixelsPerCycle,
    textureSampling: sampling(texelsPerCycle),
    projectedSampling: sampling(pixelsPerCycle),
    scope:
      'One authored frequency along the declared tile width. Higher harmonics, perspective, mipmaps, normal-map lighting and derivative filtering can change aliasing. Below-Nyquist here is not a rendered anti-aliasing certificate.',
    sources: [materialRelationSources.sampling],
  };
}
function physicalCheck(material: Material) {
  const metalness = material.surface.metalness;
  const conflict =
    (material.composition === 'homogeneous-dielectric' && metalness !== 0) ||
    (material.composition === 'homogeneous-conductor' && metalness !== 1);
  return {
    id: material.id,
    status:
      material.composition === 'unspecified'
        ? 'unknown'
        : conflict
          ? 'declared-composition-conflict'
          : 'parameter-consistent',
    detail: conflict
      ? 'The declared homogeneous composition conflicts with the metalness endpoint. Intermediate metalness represents a blend/transition in this model.'
      : 'Parameter consistency does not identify a real material, calibrate reflectance, prove energy conservation or establish a pleasing pairing.',
    sources: [
      materialRelationSources.filament,
      materialRelationSources.khronos,
    ],
  };
}
const distanceOctaves = (
  a: number | null | undefined,
  b: number | null | undefined,
) =>
  a === null || a === undefined || b === null || b === undefined
    ? null
    : Math.abs(Math.log2(a / b));

/** Descriptors and authored brief bands, with no scalar aesthetic preference score. */
export function analyzeMaterialPair(input: unknown) {
  const r = MaterialPairSchema.parse(input),
    a = r.first,
    b = r.second;
  const colorA = new Color('srgb-linear', a.surface.baseColor)
    .to('oklab')
    .coords.map((c) => c ?? 0);
  const colorB = new Color('srgb-linear', b.surface.baseColor)
    .to('oklab')
    .coords.map((c) => c ?? 0);
  const ta = textureFeatures(a.texture),
    tb = textureFeatures(b.texture);
  const la = a.lighting,
    lb = b.lighting;
  const d1 = la?.lightDirection,
    d2 = lb?.lightDirection;
  const angle =
    d1 === undefined ||
    d2 === undefined ||
    la?.coordinateFrame === undefined ||
    la.coordinateFrame !== lb?.coordinateFrame
      ? null
      : (Math.acos(
          Math.max(
            -1,
            Math.min(
              1,
              d1.reduce(
                (sum, c, i) =>
                  sum + (c / Math.hypot(...d1)) * (d2[i]! / Math.hypot(...d2)),
                0,
              ),
            ),
          ),
        ) *
          180) /
        Math.PI;
  const factor = (
    value: number | null,
    units: string,
    interpretation: string,
    sources: string[],
  ) => ({
    value,
    units,
    interpretation,
    sources,
    basis: 'computed-from-declared-inputs' as const,
  });
  const descriptors = {
    deltaEOK: factor(
      Math.hypot(...colorA.map((c, i) => c - colorB[i]!)),
      'OKLab-coordinate-distance',
      'Distance between base-color parameter swatches in OKLab. It is neither displayed material difference nor preference, text contrast, or luminance.',
      [materialRelationSources.oklab],
    ),
    roughnessDifference: factor(
      Math.abs(a.surface.roughness - b.surface.roughness),
      'parameter',
      'Absolute perceptual-roughness parameter difference; perceived gloss also depends on geometry and illumination.',
      [
        materialRelationSources.filament,
        materialRelationSources.illuminationExperiment,
      ],
    ),
    alphaDifference: factor(
      Math.abs(a.surface.roughness ** 2 - b.surface.roughness ** 2),
      'microfacet-alpha',
      'Difference after alpha=roughness squared, before renderer-specific clamping.',
      [materialRelationSources.filament],
    ),
    metalnessDifference: factor(
      Math.abs(a.surface.metalness - b.surface.metalness),
      'parameter',
      'Difference in dielectric/conductor model blend. Intermediate values are not a new homogeneous substance.',
      [materialRelationSources.khronos, materialRelationSources.disney],
    ),
    textureTileFrequencyOctaves: factor(
      distanceOctaves(ta?.cyclesPerTile, tb?.cyclesPerTile),
      'octaves-per-declared-tile',
      'Absolute log2 ratio of authored frequencies; tile widths may represent different physical sizes.',
      [materialRelationSources.sampling],
    ),
    texturePhysicalFrequencyOctaves: factor(
      distanceOctaves(ta?.cyclesPerMm, tb?.cyclesPerMm),
      'octaves',
      'Absolute log2 ratio in cycles/mm; unknown unless both physical tile widths are supplied.',
      [materialRelationSources.sampling],
    ),
    textureAmplitudeFractionDifference: factor(
      ta === null || tb === null
        ? null
        : Math.abs(ta.heightAmplitudeFraction - tb.heightAmplitudeFraction),
      'fraction-of-tile-width',
      'Authored height-amplitude difference relative to each tile width; not roughness or measured normal-map strength.',
      [materialRelationSources.sampling],
    ),
    textureAmplitudeMmDifference: factor(
      ta?.amplitudeMm === null ||
        tb?.amplitudeMm === null ||
        ta === null ||
        tb === null
        ? null
        : Math.abs(ta.amplitudeMm - tb.amplitudeMm),
      'mm',
      'Authored physical height-amplitude difference; unknown without both scale declarations.',
      [materialRelationSources.sampling],
    ),
    lightingDirectionDegrees: factor(
      angle,
      'degrees',
      'Angle between declared light directions; unknown unless coordinateFrame is supplied and matches. Not a normal/view difference.',
      [materialRelationSources.illuminationExperiment],
    ),
    exposureEvDifference: factor(
      la?.exposureEv === undefined || lb?.exposureEv === undefined
        ? null
        : Math.abs(la.exposureEv - lb.exposureEv),
      'stops',
      'Difference in authored exposure; matching it alone does not establish matching irradiance or appearance.',
      [materialRelationSources.illuminationExperiment],
    ),
  };
  const bands =
    r.profile?.bands.map((band) => {
      const value = descriptors[band.metric].value;
      return {
        ...band,
        value,
        status:
          value === null
            ? ('unknown' as const)
            : value < band.min
              ? ('below-band' as const)
              : value > band.max
                ? ('above-band' as const)
                : ('within-band' as const),
        basis: 'authored-art-direction-band' as const,
      };
    }) ?? [];
  const same = (first: string | undefined, second: string | undefined) =>
    first === undefined || second === undefined ? null : first === second;
  return {
    pair: [a.id, b.id],
    provenance: [a.provenance, b.provenance],
    descriptors,
    features: {
      first: {
        baseColorOklab: colorA,
        alpha: a.surface.roughness ** 2,
        texture: ta,
      },
      second: {
        baseColorOklab: colorB,
        alpha: b.surface.roughness ** 2,
        texture: tb,
      },
    },
    physicalModelChecks: [physicalCheck(a), physicalCheck(b)],
    lighting: {
      sameDeclaredRig: same(la?.rigId, lb?.rigId),
      sameDeclaredEnvironment: same(la?.environmentId, lb?.environmentId),
      status: 'declarations-only',
      scope:
        'Identical rig IDs and exposure are not a measured lighting-consistency result; surface orientation and local light transport remain unmeasured.',
    },
    hierarchy: {
      roleRelation: r.profile?.roleRelation ?? null,
      exactSharedFinishParameters:
        a.surface.roughness === b.surface.roughness &&
        a.surface.metalness === b.surface.metalness,
      scope:
        'Grouping or counterpoint is the authored role intention. Finish similarity is one descriptor, not proof of perceived hierarchy.',
    },
    brief:
      r.profile === null
        ? null
        : {
            id: r.profile.id,
            intent: r.profile.intent,
            source: r.profile.source,
            bands,
            status: bands.some((x) => x.status === 'unknown')
              ? 'incomplete'
              : bands.every((x) => x.status === 'within-band')
                ? 'declared-bands-met'
                : 'outside-declared-bands',
            scope:
              'Feasibility against this brief only; bands are editable and have not been fitted to preference data.',
          },
    textOverlayLegibility: {
      status: 'unknown',
      ratio: null,
      reason:
        'Measure the actual rendered composite at relevant light/view states. Base color and base-color OKLab distance do not establish text contrast.',
    },
    empiricalPreference: {
      status: 'unknown',
      score: null,
      reason:
        'The cited studies support material-appearance descriptors and context dependence; they do not validate a universal preference score for this pair.',
    },
    algorithm: 'conditional-material-relations-v1',
    sources: materialRelationSources,
    limits: [
      'The standard isotropic single-layer surface model cannot describe every coating, textile, subsurface, anisotropic or translucent material.',
      'Physical identity, calibration and rights of supplied measurements are caller declarations, not independently verified facts.',
      'Compare alternatives under a shared measured geometry, lighting and display setup before attributing differences to material alone.',
      'Texture scales describe authored inputs; no image-based physical-scale or normal-map inference runs.',
    ],
  };
}

export const MaterialCandidatesSchema = z
  .object({
    anchor: MaterialFeaturesSchema,
    alternatives: z.array(MaterialFeaturesSchema).min(1).max(32),
    profile: MaterialPairProfileSchema,
    limit: z.number().int().min(1).max(16).default(8),
  })
  .strict()
  .superRefine((r, ctx) => {
    const ids = [r.anchor.id, ...r.alternatives.map((a) => a.id)];
    if (new Set(ids).size !== ids.length)
      ctx.addIssue({
        code: 'custom',
        path: ['alternatives'],
        message: 'Anchor and alternative IDs must all be unique',
      });
    r.profile.bands.forEach((band, index) => {
      const width = band.max - band.min;
      if (width > 0 && width < 1e-9)
        ctx.addIssue({
          code: 'custom',
          path: ['profile', 'bands', index],
          message:
            'A positive normalization band width must be at least 1e-9; an exact zero-width target uses scale one',
        });
    });
  });

/** Pareto selection under authored bands; unresolved descriptors cannot win by omission. */
export function materialPairCandidates(input: unknown) {
  const r = MaterialCandidatesSchema.parse(input);
  const candidates = r.alternatives.map((alternative) => {
    const analysis = analyzeMaterialPair({
      first: r.anchor,
      second: alternative,
      profile: r.profile,
    });
    const residuals = analysis.brief!.bands.map((band) => {
      const width = band.max - band.min,
        scale = width === 0 ? 1 : width;
      const residual =
        band.value === null
          ? null
          : Math.max(0, band.min - band.value, band.value - band.max) / scale;
      return {
        metric: band.metric,
        residual,
        scale,
        normalization:
          width === 0
            ? ('zero-width-target-unit-scale' as const)
            : ('authored-band-width' as const),
        units: analysis.descriptors[band.metric].units,
        source: band.source,
      };
    });
    return {
      id: alternative.id,
      alternative,
      analysis,
      residuals,
      comparisonStatus: residuals.every((x) => x.residual !== null)
        ? ('complete' as const)
        : ('unresolved' as const),
    };
  });
  const complete = candidates.filter(
    (candidate) => candidate.comparisonStatus === 'complete',
  );
  const dominates = (
    a: (typeof candidates)[number],
    b: (typeof candidates)[number],
  ) =>
    a.residuals.every(
      (value, i) => value.residual! <= b.residuals[i]!.residual!,
    ) &&
    a.residuals.some((value, i) => value.residual! < b.residuals[i]!.residual!);
  const paretoIds = complete
    .filter(
      (candidate) =>
        !complete.some(
          (other) => other !== candidate && dominates(other, candidate),
        ),
    )
    .map((candidate) => candidate.id)
    .sort();
  return {
    anchor: r.anchor,
    profile: r.profile,
    candidates,
    paretoIds,
    selectedIds: paretoIds.slice(0, r.limit),
    unresolvedIds: candidates
      .filter((candidate) => candidate.comparisonStatus === 'unresolved')
      .map((candidate) => candidate.id)
      .sort(),
    dominatedIds: complete
      .filter((candidate) => !paretoIds.includes(candidate.id))
      .map((candidate) => candidate.id)
      .sort(),
    selection: {
      rule: 'Pareto dominance: no greater residual on every band and strictly smaller on at least one.',
      completeness:
        'Only candidates with every profile metric known enter comparisons. Unknown candidates remain visible and cannot dominate by omission.',
      tieAndLimit:
        'Pareto IDs sort lexically; selectedIds applies the requested presentation limit. This order is not a preference ranking. All candidates and the full front remain available.',
      physicalScope:
        'The front concerns the requested numeric bands only. Physical composition cautions and unverified provenance remain in each analysis; they are not silently converted into new objectives.',
    },
    algorithm: 'material-pair-band-residual-pareto-v1',
    empiricalPreference: { status: 'unknown', score: null },
  };
}
