#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { build } from 'esbuild';
import { chromium, webkit } from 'playwright';
import {
  captureDomSurface,
  observeDomSurfaceMotion,
} from './dom-surface-observation.mjs';
const output =
  process.env.DESIGN_DOM_SURFACE_OUTPUT ?? 'artifacts/dom-surfaces';
await mkdir(output, { recursive: true });
const files = [
  'scripts/dom-surface-observation.mjs',
  'src/dom-surface.ts',
  'src/browser-dom-light.ts',
  'examples/dom-surfaces/proof-client.js',
  'examples/dom-surfaces/recipes.json',
  'scripts/prove-dom-surfaces.mjs',
];
const hashes = () =>
  Promise.all(
    files.map(async (path) => ({
      path,
      sha256: createHash('sha256')
        .update(await readFile(path))
        .digest('hex'),
    })),
  );
const report = {
  generatedAt: new Date().toISOString(),
  sources: await hashes(),
  checks: [],
  engines: [],
};
const bundle = (
  await build({
    entryPoints: ['examples/dom-surfaces/proof-client.js'],
    bundle: true,
    write: false,
    format: 'iife',
    globalName: 'DomProof',
    platform: 'browser',
    target: 'es2022',
  })
).outputFiles[0].text;
const recipes = JSON.parse(
  await readFile('examples/dom-surfaces/recipes.json', 'utf8'),
);
const check = (engine, name, detail) =>
  report.checks.push({ engine, name, passed: true, detail });
for (const [engine, browserType] of Object.entries({ chromium, webkit })) {
  const executablePath =
    engine === 'webkit'
      ? process.env.DESIGN_WEBKIT_EXECUTABLE
      : process.env.DESIGN_CHROMIUM;
  const browser = await browserType.launch({
    headless: true,
    ...(executablePath ? { executablePath } : {}),
  });
  try {
    const page = await browser.newPage({
      viewport: { width: 960, height: 1000 },
      deviceScaleFactor: 1,
    });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.setContent(
      '<!doctype html><html><head><meta charset="utf-8"></head><body></body></html>',
    );
    await page.addScriptTag({ content: bundle });
    await page.evaluate(
      (inputs) => (window.proof = DomProof.mount(inputs)),
      recipes,
    );
    await page.waitForTimeout(100);
    const runtime = {
      engine,
      version: browser.version(),
      playwright: '1.64.1',
    };
    const states = [];
    for (const x of [-1, 0, 1])
      for (const y of [-1, 0, 1]) {
        await page.evaluate(({ x, y }) => proof.pose(x, y), { x, y });
        const regions = await page.evaluate(() => proof.regions());
        await page.evaluate(() => proof.hideText(true));
        const bytes = await captureDomSurface(page, { fullPage: true });
        await page.evaluate(() => proof.hideText(false));
        const observed = await page.evaluate(
          async ({ png, regions }) => {
            const image = new Image();
            image.src = `data:image/png;base64,${png}`;
            await image.decode();
            const canvas = document.createElement('canvas');
            canvas.width = image.width;
            canvas.height = image.height;
            const context = canvas.getContext('2d');
            context.drawImage(image, 0, 0);
            const luminance = (rgb) =>
              rgb
                .map((c) => {
                  const v = c / 255;
                  return v <= 0.04045
                    ? v / 12.92
                    : ((v + 0.055) / 1.055) ** 2.4;
                })
                .reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i], 0);
            return regions.map((region) => {
              const foreground = region.color
                  .match(/[\d.]+/g)
                  .slice(0, 3)
                  .map(Number),
                fg = luminance(foreground);
              const left = Math.max(0, Math.floor(region.x)),
                top = Math.max(0, Math.floor(region.y));
              const width = Math.min(
                  canvas.width - left,
                  Math.ceil(region.width),
                ),
                height = Math.min(
                  canvas.height - top,
                  Math.ceil(region.height),
                );
              const pixels = context.getImageData(
                left,
                top,
                width,
                height,
              ).data;
              let minimum = Infinity,
                maximum = 0,
                count = 0;
              for (let row = 1; row < height - 1; row++)
                for (let col = 1; col < width - 1; col++) {
                  const offset = (row * width + col) * 4;
                  const bg = luminance([
                    pixels[offset],
                    pixels[offset + 1],
                    pixels[offset + 2],
                  ]);
                  const ratio =
                    (Math.max(fg, bg) + 0.05) / (Math.min(fg, bg) + 0.05);
                  minimum = Math.min(minimum, ratio);
                  maximum = Math.max(maximum, ratio);
                  count++;
                }
              return {
                index: region.index,
                minimum,
                maximum,
                samples: count,
                foreground,
              };
            });
          },
          { png: bytes.toString('base64'), regions },
        );
        assert(
          observed
            .filter((r) => r.index < 4)
            .every((r) => r.minimum >= 4.5 && r.samples > 0),
          `${engine}: composite contrast failed at ${x},${y}: ${JSON.stringify(observed)}`,
        );
        assert(
          observed.filter((r) => r.index === 4).some((r) => r.minimum < 3),
          'Negative glass control must fail despite nominal opaque contrast21',
        );
        states.push({ x, y, observed });
        if (
          (x === -1 && y === -1) ||
          (x === 0 && y === 0) ||
          (x === 1 && y === 1)
        )
          await captureDomSurface(page, {
            path: `${output}/${engine}-${x}-${y}.png`,
            fullPage: true,
          });
      }
    check(
      engine,
      'nine actual composite lighting poses preserve authored text contrast',
      {
        poses: 9,
        minimum: Math.min(
          ...states.flatMap((s) =>
            s.observed.filter((r) => r.index < 4).map((r) => r.minimum),
          ),
        ),
        threshold: 4.5,
      },
    );
    check(
      engine,
      'translucent negative control distinguishes nominal and rendered contrast',
      {
        nominal: 21,
        renderedMinimum: Math.min(
          ...states.flatMap((s) =>
            s.observed.filter((r) => r.index === 4).map((r) => r.minimum),
          ),
        ),
      },
    );
    const motion = await page.evaluate(() => {
      const c = proof.controllers[0],
        el = proof.cards[0];
      const before = c.stats.geometryReads;
      el.dispatchEvent(
        new PointerEvent('pointermove', { clientX: 500, clientY: 400 }),
      );
      const start = performance.now();
      for (let i = 0; i < 120; i++) c.sample(1 / 60);
      const ms = performance.now() - start;
      const angle = el.style.getPropertyValue('--dt-rotate-y');
      const recipe = proof.recipes[1];
      const frames = c.stats.frames;
      c.updateRecipe(recipe);
      return {
        before,
        after: c.stats.geometryReads,
        frames,
        angle,
        updatePreservedAngle:
          angle === el.style.getPropertyValue('--dt-rotate-y'),
        milliseconds120StyleUpdates: ms,
      };
    });
    assert.equal(motion.before, motion.after);
    assert(motion.frames >= 120);
    assert.notEqual(motion.angle, '0deg');
    assert(motion.updatePreservedAngle);
    check(
      engine,
      'retained motion has no layout reads per frame and recipe updates preserve state',
      motion,
    );
    const reducedMedia = await observeDomSurfaceMotion(page, 'reduce');
    const reduced = await page.evaluate(() => {
      const c = proof.controllers[0],
        before = c.stats.styleWrites;
      c.sample(0.5);
      return {
        status: c.status,
        transform: getComputedStyle(proof.cards[0]).transform,
        before,
        after: c.stats.styleWrites,
      };
    });
    assert.equal(reduced.status, 'paused');
    assert.equal(reduced.transform, 'none');
    assert.equal(reduced.before, reduced.after);
    check(engine, 'reduced motion pauses driver and resets transform', {
      ...reduced,
      media: reducedMedia,
    });
    const resumedMedia = await observeDomSurfaceMotion(page, 'no-preference');
    check(
      engine,
      'CSS, retained media query and controllers observe motion preference restoration',
      resumedMedia,
    );
    await page.evaluate(() => scrollTo(0, 2400));
    await page.waitForTimeout(100);
    const offscreen = await page.evaluate(() => ({
      status: proof.controllers[0].status,
      offscreen: proof.controllers[0].stats.offscreen,
    }));
    assert.equal(offscreen.status, 'paused');
    assert(offscreen.offscreen);
    check(engine, 'offscreen observer suspends lighting updates', offscreen);
    const disposal = await page.evaluate(() => {
      proof.controllers.forEach((c) => c.dispose());
      return {
        statuses: proof.controllers.map((c) => c.status),
        retainedVariables: proof.cards.some((el) =>
          el.style.getPropertyValue('--dt-light-x'),
        ),
      };
    });
    assert(disposal.statuses.every((v) => v === 'disposed'));
    assert(!disposal.retainedVariables);
    check(
      engine,
      'dispose removes owned variables and stops controllers',
      disposal,
    );
    assert.deepEqual(errors, []);
    const capabilities = await page.evaluate(() => ({
      backdropFilter: CSS.supports('backdrop-filter', 'blur(1px)'),
      prefixedBackdropFilter: CSS.supports(
        '-webkit-backdrop-filter',
        'blur(1px)',
      ),
      pointer: typeof PointerEvent === 'function',
      secureContext: isSecureContext,
    }));
    report.engines.push({
      runtime,
      states,
      motion,
      reduced,
      offscreen,
      disposal,
      capabilities,
    });
    process.stdout.write(
      `${engine}: ${report.checks.filter((c) => c.engine === engine).length} checks passed\n`,
    );
  } finally {
    await browser.close();
  }
}
assert.deepEqual(await hashes(), report.sources, 'Source changed during proof');
report.limits = [
  'Screenshot background pixels are measured with foreground spans hidden, preserving their boxes and shields; opaque computed ink is compared against those pixels. Antialiased glyph pixels are not the foreground oracle.',
  'Nine authored poses and one backdrop do not certify every motion path or user-supplied backdrop.',
  '120 synchronous updates measure JS arithmetic/style writes only, not paint/compositor time, frame pacing, thermal behavior, or hardware Safari.',
  'Playwright WebKit is not physical Safari or an iPhone sensor test.',
];
await writeFile(`${output}/proof.json`, JSON.stringify(report, null, 2));
await writeFile(
  `${output}/summary.json`,
  JSON.stringify(
    {
      generatedAt: report.generatedAt,
      sources: report.sources,
      runtimes: report.engines.map((e) => e.runtime),
      checks: report.checks,
      limits: report.limits,
    },
    null,
    2,
  ),
);
process.stdout.write(
  `DOM surfaces: ${report.checks.length} passed; ${output}/summary.json\n`,
);
