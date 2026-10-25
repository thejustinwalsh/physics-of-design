import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
import { z } from 'zod';
import { MediaRegionSchema } from './media-geometry.js';

const unit = z.number().finite().min(0).max(1);
const rgb = z.tuple([unit, unit, unit]);
export const MediaProvenanceSchema = z
  .object({
    origin: z
      .enum([
        'original-generated',
        'original-photograph',
        'licensed-external',
        'unknown',
      ])
      .default('unknown'),
    source: z.string().min(1).max(2048).nullable().default(null),
    creator: z.string().min(1).max(512).nullable().default(null),
    license: z.string().min(1).max(512).nullable().default(null),
    licenseEvidence: z.string().min(1).max(2048).nullable().default(null),
    expectedSha256: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .nullable()
      .default(null),
  })
  .strict();
export const MediaAnalyzeSchema = z
  .object({
    file: z.string().min(1).max(4096),
    provenance: MediaProvenanceSchema.default({
      origin: 'unknown',
      source: null,
      creator: null,
      license: null,
      licenseEvidence: null,
      expectedSha256: null,
    }),
    sampleLimit: z.number().int().min(1).max(65536).default(4096),
    maxPixels: z.number().int().min(1).max(16777216).default(8388608),
    contrastRegions: z
      .array(
        z
          .object({
            id: z.string().min(1).max(80),
            region: MediaRegionSchema,
            foreground: rgb,
            backdrop: rgb.nullable().default(null),
            minimum: z.number().finite().min(1).max(21).default(4.5),
          })
          .strict(),
      )
      .max(32)
      .default([]),
  })
  .strict()
  .refine(
    (r) =>
      new Set(r.contrastRegions.map((x) => x.id)).size ===
      r.contrastRegions.length,
    'Contrast region IDs must be unique',
  );
const srgbLinear = (n: number) =>
  n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4;
const luminance = (r: number, g: number, b: number) =>
  0.2126 * srgbLinear(r) + 0.7152 * srgbLinear(g) + 0.0722 * srgbLinear(b);
const ratio = (a: number, b: number) =>
  (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);

/** RGBA8, encoded sRGB input. Samples describe pixels; only exhaustive regions yield contrast bounds. */
export function analyzeRasterPixels(
  pixels: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number,
  options: {
    sampleLimit?: number;
    contrastRegions?: z.input<typeof MediaAnalyzeSchema>['contrastRegions'];
  } = {},
) {
  if (
    !(pixels instanceof Uint8Array || pixels instanceof Uint8ClampedArray) ||
    !Number.isSafeInteger(width) ||
    !Number.isSafeInteger(height) ||
    width < 1 ||
    height < 1 ||
    width * height > 16777216 ||
    pixels.length !== width * height * 4
  )
    throw new Error('RGBA8 dimensions must match 1–16777216 pixels');
  const parsed = MediaAnalyzeSchema.parse({ file: 'pixel-buffer', ...options });
  const count = width * height,
    stride = Math.max(1, Math.ceil(count / parsed.sampleLimit));
  let samples = 0,
    opaqueSamples = 0,
    alphaSum = 0,
    lSum = 0,
    lSqSum = 0;
  const mean = [0, 0, 0],
    histogram = new Array<number>(16).fill(0);
  for (let p = 0; p < count; p += stride) {
    samples++;
    const i = p * 4,
      alpha = pixels[i + 3]! / 255;
    alphaSum += alpha;
    // Uncomposited transparent color channels are not evidence of the visible image.
    if (alpha !== 1) continue;
    opaqueSamples++;
    const channels = [
      pixels[i]! / 255,
      pixels[i + 1]! / 255,
      pixels[i + 2]! / 255,
    ];
    channels.forEach((c, j) => {
      mean[j]! += c;
    });
    const l = luminance(channels[0]!, channels[1]!, channels[2]!);
    lSum += l;
    lSqSum += l * l;
    histogram[Math.min(15, Math.floor(l * 16))]!++;
  }
  const regions = parsed.contrastRegions.map((item) => {
    const x0 = Math.floor(item.region.x * width),
      y0 = Math.floor(item.region.y * height);
    const x1 = Math.min(
      width,
      Math.ceil((item.region.x + item.region.width) * width),
    );
    const y1 = Math.min(
      height,
      Math.ceil((item.region.y + item.region.height) * height),
    );
    const foreground = luminance(...item.foreground);
    let min = 21,
      max = 1,
      minL = 1,
      maxL = 0,
      transparent = 0;
    const visited = (x1 - x0) * (y1 - y0);
    for (let y = y0; y < y1; y++)
      for (let x = x0; x < x1; x++) {
        const i = (y * width + x) * 4,
          a = pixels[i + 3]! / 255;
        if (a !== 1) transparent++;
        if (a !== 1 && item.backdrop === null) continue;
        const c = [0, 1, 2].map(
          (j) =>
            (pixels[i + j]! / 255) * a + (item.backdrop?.[j] ?? 0) * (1 - a),
        );
        const l = luminance(c[0]!, c[1]!, c[2]!);
        minL = Math.min(minL, l);
        maxL = Math.max(maxL, l);
        const value = ratio(foreground, l);
        min = Math.min(min, value);
        max = Math.max(max, value);
      }
    const unknown = transparent > 0 && item.backdrop === null;
    // All decoded pixels are included. Interval also protects linear resampling between extrema.
    const lowerBound = unknown
      ? null
      : foreground >= minL && foreground <= maxL
        ? 1
        : Math.min(ratio(foreground, minL), ratio(foreground, maxL));
    return {
      id: item.id,
      region: item.region,
      foreground: item.foreground,
      backdrop: item.backdrop,
      coverage: 'full-region-decoded-pixels' as const,
      pixelsVisited: visited,
      transparentPixels: transparent,
      pixelBounds: { x0, y0, x1, y1 },
      decodedPixelRatioRange: unknown ? null : { min, max },
      luminanceRange: unknown ? null : { min: minL, max: maxL },
      conservativeRatioLowerBound: lowerBound,
      minimum: item.minimum,
      status: unknown
        ? 'unknown'
        : lowerBound! >= item.minimum
          ? 'pass'
          : 'fail',
      compositing: transparent
        ? 'nominal encoded-sRGB source-over with authored opaque backdrop'
        : 'opaque decoded pixels',
      reason: unknown ? 'Transparent pixels require an opaque backdrop' : null,
    };
  });
  const meanL = opaqueSamples ? lSum / opaqueSamples : null;
  return {
    sampledDescriptors: {
      coverage: 'systematic-pixel-sample' as const,
      stride,
      samples,
      opaqueSamples,
      meanAlpha: alphaSum / samples,
      meanEncodedSrgbOfOpaqueSamples: opaqueSamples
        ? mean.map((c) => c / opaqueSamples)
        : null,
      meanRelativeLuminance: meanL,
      luminanceVariance:
        meanL === null
          ? null
          : Math.max(0, lSqSum / opaqueSamples - meanL * meanL),
      luminanceHistogram16: histogram,
      scope:
        'Descriptive statistics of opaque sampled pixels; no quality, entropy quality, subject, salience or material inference.',
    },
    contrastRegions: regions,
    contrastScope:
      'All intersecting source pixels at decoded resolution. Bounds concern opaque sRGB foreground over this region, before overlays, filters, text antialiasing or display rendering. Alpha compositing is nominal; certify the final rendered composite separately.',
    source: 'https://www.w3.org/TR/WCAG22/#dfn-relative-luminance',
  };
}

function rasterMime(bytes: Buffer) {
  if (
    bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  )
    return 'image/png';
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255)
    return 'image/jpeg';
  if (
    bytes.toString('ascii', 0, 4) === 'RIFF' &&
    bytes.toString('ascii', 8, 12) === 'WEBP'
  )
    return 'image/webp';
  throw new Error(
    'Supported raster content is PNG, JPEG or WebP; vector and remote resources are not decoded',
  );
}

/** Local raster bytes only; no external assets or remote image requests are loaded. */
export async function analyzeMediaFile(input: unknown) {
  const r = MediaAnalyzeSchema.parse(input),
    file = resolve(r.file);
  const metadata = await stat(file);
  if (!metadata.isFile() || metadata.size > 64 * 1024 * 1024)
    throw new Error('Media must be a local file no larger than 64 MiB');
  const bytes = await readFile(file),
    mime = rasterMime(bytes);
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  if (
    r.provenance.expectedSha256 !== null &&
    r.provenance.expectedSha256 !== sha256
  )
    throw new Error('Media content does not match expectedSha256 provenance');
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.route('**/*', (route) => route.abort());
    const decoded = await page.evaluate(
      async ({ dataUrl, maxPixels }) => {
        const img = new Image();
        img.src = dataUrl;
        await img.decode();
        const width = img.naturalWidth,
          height = img.naturalHeight;
        if (!width || !height || width * height > maxPixels)
          throw new Error(
            'Decoded media exceeds maxPixels; no downsampled contrast certification is performed',
          );
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext('2d', {
          colorSpace: 'srgb',
          willReadFrequently: true,
        });
        if (!context) throw new Error('sRGB canvas context unavailable');
        context.drawImage(img, 0, 0);
        const pixels = context.getImageData(0, 0, width, height, {
          colorSpace: 'srgb',
        }).data;
        const chunks: string[] = [];
        for (let i = 0; i < pixels.length; i += 16384)
          chunks.push(String.fromCharCode(...pixels.subarray(i, i + 16384)));
        return { width, height, rgbaBase64: btoa(chunks.join('')) };
      },
      {
        dataUrl: `data:${mime};base64,${bytes.toString('base64')}`,
        maxPixels: r.maxPixels,
      },
    );
    const pixels = Buffer.from(decoded.rgbaBase64, 'base64');
    const analysis = analyzeRasterPixels(
      pixels,
      decoded.width,
      decoded.height,
      { sampleLimit: r.sampleLimit, contrastRegions: r.contrastRegions },
    );
    return {
      file,
      sha256,
      byteLength: bytes.length,
      mime,
      width: decoded.width,
      height: decoded.height,
      provenance: {
        ...r.provenance,
        hashVerified: r.provenance.expectedSha256 !== null,
        rightsStatus:
          r.provenance.license && r.provenance.licenseEvidence
            ? 'declared-with-evidence-reference'
            : 'unknown',
      },
      decoder: {
        engine: 'chromium-canvas2d',
        version: browser.version(),
        colorSpace: 'srgb',
        frame: 'decoded-snapshot',
        orientation: 'browser-decoded-orientation',
      },
      metadataUnknown: [
        'capture illuminant',
        'camera response',
        'physical scale',
        'calibrated albedo',
        'rights independently verified',
        'animation timeline',
      ],
      ...analysis,
      algorithm: 'local-raster-srgb-pixels-v1',
    };
  } finally {
    await browser.close();
  }
}
