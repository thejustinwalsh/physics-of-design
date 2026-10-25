import { z } from 'zod';

const unit = z.number().finite().min(0).max(1);
const signed = z.number().finite().min(-1).max(1);
const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/);
export const DomSurfaceSchema = z
  .object({
    material: z.enum(['paper', 'enamel', 'brushed-metal', 'soft-glass']),
    baseColor: hex.default('#e7e9e3'),
    ink: hex.default('#192822'),
    roughness: unit.optional(),
    metalness: unit.optional(),
    roughnessVariation: unit.optional(),
    textureSeed: z.number().int().min(0).max(0xffffffff).default(17),
    textureScale: z.number().finite().min(0.25).max(8).default(2),
    exposure: z.number().finite().min(0.1).max(4).default(1.5),
    elevation: z.number().finite().min(0).max(48).default(12),
    radius: z.number().finite().min(0).max(128).default(22),
    light: z
      .object({
        x: signed.default(-0.55),
        y: signed.default(-0.7),
        z: z.number().finite().min(0.25).max(4).default(1.4),
        intensity: unit.default(0.8),
        kind: z.enum(['point', 'directional']).default('point'),
        color: hex.default('#ffffff'),
        ambient: unit.default(0.3),
      })
      .strict()
      .default({
        x: -0.55,
        y: -0.7,
        z: 1.4,
        intensity: 0.8,
        kind: 'point',
        color: '#ffffff',
        ambient: 0.3,
      }),
    textureAmount: unit.optional(),
    specularStrength: unit.optional(),
    contentShieldOpacity: unit.default(0.88),
    translucency: unit.optional(),
  })
  .strict()
  .superRefine((r, ctx) => {
    if (
      r.material !== 'soft-glass' &&
      r.translucency !== undefined &&
      r.translucency !== 0
    )
      ctx.addIssue({
        code: 'custom',
        path: ['translucency'],
        message: 'Translucency is available only for soft-glass',
      });
  });

const defaults = {
  paper: {
    roughness: 0.94,
    metalness: 0,
    variation: 0.16,
    texture: 0.32,
    specular: 0.055,
    translucency: 0,
    label: 'Matte paper',
    character:
      'Low-amplitude crossed fibers, broad diffuse shading, restrained edge lift.',
  },
  enamel: {
    roughness: 0.18,
    metalness: 0,
    variation: 0.04,
    texture: 0.14,
    specular: 0.64,
    translucency: 0,
    label: 'Glazed enamel',
    character:
      'Compact rounded highlight, smooth pigment and a crisp light-facing rim.',
  },
  'brushed-metal': {
    roughness: 0.48,
    metalness: 1,
    variation: 0.22,
    texture: 0.45,
    specular: 0.48,
    translucency: 0,
    label: 'Brushed metal',
    character:
      'Directional normal grooves, metallic Fresnel and intrinsic roughness variation in the GPU adapter; CSS fallback is a visual metaphor.',
  },
  'soft-glass': {
    roughness: 0.6,
    metalness: 0,
    variation: 0.06,
    texture: 0,
    specular: 0.27,
    translucency: 0.32,
    label: 'Soft glass',
    character:
      'Translucent tint, backdrop blur, soft rim and opaque fallback; no refraction simulation.',
  },
} as const;
const clamp = (n: number, a = 0, b = 1) => Math.max(a, Math.min(b, n));
const normalized = (v: number[]) => {
  const l = Math.hypot(...v);
  return v.map((n) => n / l);
};
const dot = (a: number[], b: number[]) =>
  a.reduce((sum, n, i) => sum + n * b[i]!, 0);
const rgb = (value: string) =>
  [1, 3, 5].map((i) => parseInt(value.slice(i, i + 2), 16));
export function domSurfaceLuminance(color: readonly number[]) {
  if (
    color.length !== 3 ||
    color.some((c) => !Number.isFinite(c) || c < 0 || c > 255)
  )
    throw new Error('Expected three sRGB channels in [0,255]');
  const [r, g, b] = color.map((c) => {
    const v = c / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}
export function domSurfaceContrast(
  first: readonly number[],
  second: readonly number[],
) {
  const a = domSurfaceLuminance(first),
    b = domSurfaceLuminance(second);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}
const number = (n: number) => String(Math.round(n * 100000) / 100000);

/** A bounded CSS rendering recipe. Coefficients below are authored UI policies, not calibrated reflectance. */
export function createDomSurfaceRecipe(input: unknown) {
  const parsed = DomSurfaceSchema.parse(input),
    preset = defaults[parsed.material];
  const r = {
    ...parsed,
    roughness: parsed.roughness ?? preset.roughness,
    metalness: parsed.metalness ?? preset.metalness,
    roughnessVariation: parsed.roughnessVariation ?? preset.variation,
    textureAmount: parsed.textureAmount ?? preset.texture,
    specularStrength: parsed.specularStrength ?? preset.specular,
    translucency: parsed.translucency ?? preset.translucency,
  };
  const channels = rgb(r.baseColor).join(' ');
  const cssVariables: Record<string, string> = {
    '--dt-base': r.baseColor,
    '--dt-ink': r.ink,
    '--dt-base-channels': channels,
    '--dt-radius': `${r.radius}px`,
    '--dt-texture': number(r.textureAmount),
    '--dt-shield': number(r.contentShieldOpacity),
    '--dt-opacity': number(1 - r.translucency),
    '--dt-blur': `${number(6 + r.roughness * 14)}px`,
  };
  const recipe = {
    version: 1,
    input: r,
    material: {
      name: r.material,
      label: preset.label,
      character: preset.character,
    },
    className: 'dt-dom-surface',
    attributes: { 'data-dom-surface': r.material },
    cssVariables,
    cssText: DOM_SURFACE_CSS,
    descriptors: {
      roughness: r.roughness,
      metalness: r.metalness,
      roughnessVariation: r.roughnessVariation,
      elevationCssPx: r.elevation,
      textureAmount: r.textureAmount,
      directionalTexture: r.material === 'brushed-metal',
      translucency: r.translucency,
      contrastShieldOpacity: r.contentShieldOpacity,
      calibration:
        'authored material parameters; GPU Lambert/GGX response and CSS fallback are distinct rendering paths, neither is a measured material classification or preference score',
    },
    contrast: {
      nominalOpaqueBaseRatio: domSurfaceContrast(rgb(r.ink), rgb(r.baseColor)),
      renderedComposite: null,
      requirement:
        'Capture actual background behind text across lighting, motion and backdrop states; nominal swatches do not certify rendered contrast.',
    },
    limits: [
      'The optional WebGL plane evaluates Lambert/GGX/Schlick/separable Smith, matching the headless probe conventions. Authored ambient fill, normal maps and tone mapping are explicit approximations; no energy-conservation claim.',
      'CSS gradients, alpha layers and shadows approximate a lit 2D surface. They are not an energy-conserving BRDF, radiometry, occlusion solver or real refraction.',
      'Roughness broadens an authored highlight; it is not a measured microfacet distribution. Brushed grooves are a directional visual cue, not anisotropic PBR.',
      'Backdrop filtering depends on ancestor compositing and browser behavior. Solid-color fallback remains available.',
      'No universal material-pair or beauty score is produced. Verify readability and motion on target devices.',
    ],
  };
  Object.assign(
    cssVariables,
    sampleDomSurfaceLight(recipe, { x: 0, y: 0 }).cssVariables,
  );
  return recipe;
}
export type DomSurfaceRecipe = ReturnType<typeof createDomSurfaceRecipe>;
export interface DomSurfaceLightSample {
  normal: number[];
  lightDirection: number[];
  descriptors: {
    incidence: number;
    highlightLobe: number;
    highlightExponent: number;
    castShadowOffset: { x: number; y: number };
    shadowSoftnessCssPx: number;
    specularOpacity: number;
    diffuseShadeOpacity: number;
  };
  cssVariables: Record<string, string>;
  model: string;
}

/** Point-light direction and a virtual plane normal drive CSS presentation coefficients. */
export function sampleDomSurfaceLight(
  recipe: DomSurfaceRecipe,
  motion: { x: number; y: number; tiltDegrees?: number },
): DomSurfaceLightSample {
  const { x, y } = motion,
    tilt = motion.tiltDegrees ?? 6;
  if (
    ![x, y, tilt].every(Number.isFinite) ||
    Math.abs(x) > 1 ||
    Math.abs(y) > 1 ||
    tilt < 0 ||
    tilt > 12
  )
    throw new Error('Motion x/y must be in [-1,1] and tiltDegrees in [0,12]');
  const r = recipe.input,
    a = (x * tilt * Math.PI) / 180,
    b = (y * tilt * Math.PI) / 180;
  const normal = [
    Math.sin(a) * Math.cos(b),
    Math.sin(b),
    Math.cos(a) * Math.cos(b),
  ];
  const light = normalized([
    r.light.x + x * 0.65,
    r.light.y + y * 0.65,
    r.light.z,
  ]);
  const half = normalized([light[0]!, light[1]!, light[2]! + 1]);
  const incidence = clamp(dot(normal, light));
  const exponent = clamp(2 / Math.max(0.04, r.roughness ** 2) - 2, 1, 48);
  const lobe = clamp(dot(normal, half)) ** exponent;
  const specularOpacity = clamp(
    r.specularStrength *
      r.light.intensity *
      (0.15 + 0.85 * lobe) *
      (1 - 0.65 * r.roughness),
  );
  const castX = (-r.elevation * light[0]!) / light[2]!,
    castY = (-r.elevation * light[1]!) / light[2]!;
  const softness = 2 + r.elevation * (0.4 + 0.7 * r.roughness);
  const brushed = r.material === 'brushed-metal';
  return {
    normal,
    lightDirection: light,
    descriptors: {
      incidence,
      highlightLobe: lobe,
      highlightExponent: exponent,
      castShadowOffset: { x: castX, y: castY },
      shadowSoftnessCssPx: softness,
      specularOpacity,
      diffuseShadeOpacity: (1 - incidence) * 0.22 * r.light.intensity,
    },
    cssVariables: {
      '--dt-light-x': `${number(50 + light[0]! * 42)}%`,
      '--dt-light-y': `${number(50 + light[1]! * 42)}%`,
      '--dt-specular': number(specularOpacity),
      '--dt-shade': number((1 - incidence) * 0.22 * r.light.intensity),
      '--dt-highlight-width': `${number(brushed ? 65 + r.roughness * 35 : 12 + r.roughness * 72)}%`,
      '--dt-highlight-height': `${number(brushed ? 8 + r.roughness * 16 : 12 + r.roughness * 72)}%`,
      '--dt-shadow-x': `${number(castX)}px`,
      '--dt-shadow-y': `${number(castY)}px`,
      '--dt-shadow-blur': `${number(softness)}px`,
      '--dt-shadow-alpha': number(
        (0.09 + 0.12 * incidence) * r.light.intensity,
      ),
      '--dt-rim-x': `${number(-light[0]! * 1.3)}px`,
      '--dt-rim-y': `${number(-light[1]! * 1.3)}px`,
      '--dt-rim-alpha': number(
        (r.material === 'enamel' ? 0.85 : 0.68) * r.light.intensity,
      ),
      '--dt-rotate-x': `${number(-y * tilt)}deg`,
      '--dt-rotate-y': `${number(x * tilt)}deg`,
    },
    model:
      'Lambert cosine and normalized half-vector supply bounded appearance descriptors; CSS mapping is authored, not physically calibrated.',
  };
}

export const DOM_SURFACE_CSS = `
.dt-dom-surface>.dt-dom-light-canvas{position:absolute;inset:0;width:100%;height:100%;border-radius:inherit;pointer-events:none;z-index:0;}
.dt-dom-surface[data-dom-renderer="webgl"]::before,.dt-dom-surface[data-dom-renderer="webgl"]::after{display:none;}
.dt-dom-surface[data-dom-renderer="webgl"]{background:var(--dt-base);}

.dt-dom-surface{position:relative;isolation:isolate;border-radius:var(--dt-radius,22px);color:var(--dt-ink,#192822);background:var(--dt-base,#e7e9e3);border:1px solid rgb(255 255 255 / .3);box-shadow:var(--dt-shadow-x,4px) var(--dt-shadow-y,7px) var(--dt-shadow-blur,18px) rgb(12 21 25 / var(--dt-shadow-alpha,.16)),0 1px 2px rgb(12 21 25 / .15);transform:perspective(1000px) rotateX(var(--dt-rotate-x,0deg)) rotateY(var(--dt-rotate-y,0deg));transform-origin:center;}
.dt-dom-surface::before,.dt-dom-surface::after{content:"";position:absolute;inset:0;border-radius:inherit;pointer-events:none;z-index:0;}
.dt-dom-surface::before{background:radial-gradient(ellipse var(--dt-highlight-width,50%) var(--dt-highlight-height,50%) at var(--dt-light-x,30%) var(--dt-light-y,25%),rgb(255 255 255 / var(--dt-specular,.1)),rgb(255 255 255 / 0) 100%),linear-gradient(rgb(0 0 0 / var(--dt-shade,0)),rgb(0 0 0 / var(--dt-shade,0)));box-shadow:inset var(--dt-rim-x,1px) var(--dt-rim-y,1px) 0 rgb(255 255 255 / var(--dt-rim-alpha,.68)),inset 0 -1px 1px rgb(0 0 0 / .08);}
.dt-dom-surface::after{opacity:var(--dt-texture,.2);}
.dt-dom-surface[data-dom-surface="paper"]::after{background:repeating-linear-gradient(8deg,rgb(95 73 42 / .11) 0 1px,transparent 1px 5px),repeating-linear-gradient(98deg,rgb(255 255 255 / .3) 0 1px,transparent 1px 7px);}
.dt-dom-surface[data-dom-surface="enamel"]::before{background:radial-gradient(ellipse var(--dt-highlight-width,28%) var(--dt-highlight-height,28%) at var(--dt-light-x,30%) var(--dt-light-y,25%),rgb(255 255 255 / var(--dt-specular,.45)) 0%,rgb(255 255 255 / 0) 100%),linear-gradient(135deg,transparent 25%,rgb(0 0 0 / var(--dt-shade,0)) 100%);box-shadow:inset var(--dt-rim-x,1px) var(--dt-rim-y,1px) 0 rgb(255 255 255 / var(--dt-rim-alpha,.85)),inset 0 -2px 3px rgb(0 0 0 / .09);}
.dt-dom-surface[data-dom-surface="brushed-metal"]::after{background:repeating-linear-gradient(0deg,rgb(255 255 255 / .45) 0 1px,rgb(31 42 52 / .18) 1px 2px,transparent 2px 4px);}
.dt-dom-surface[data-dom-surface="soft-glass"]{background:rgb(var(--dt-base-channels,231 233 227) / var(--dt-opacity,.68));-webkit-backdrop-filter:blur(var(--dt-blur,14px)) saturate(115%);backdrop-filter:blur(var(--dt-blur,14px)) saturate(115%);}
.dt-dom-content{position:relative;z-index:1;border-radius:calc(var(--dt-radius,22px) * .55);background:rgb(var(--dt-base-channels,231 233 227) / var(--dt-shield,.88));color:var(--dt-ink,#192822);}
@supports not ((backdrop-filter:blur(1px)) or (-webkit-backdrop-filter:blur(1px))){.dt-dom-surface[data-dom-surface="soft-glass"]{background:var(--dt-base,#e7e9e3);}}
@media(prefers-reduced-motion:reduce){.dt-dom-surface{transform:none;}}
`;
