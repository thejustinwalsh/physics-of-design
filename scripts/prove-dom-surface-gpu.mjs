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
  process.env.DESIGN_DOM_GPU_OUTPUT ?? 'artifacts/dom-surfaces-gpu';
await mkdir(output, { recursive: true });
const files = [
  'scripts/dom-surface-observation.mjs',
  'src/dom-surface.ts',
  'src/browser-dom-light.ts',
  'src/dom-surface-gpu.ts',
  'src/dom-surface-shading.ts',
  'src/surface.ts',
  'examples/dom-surfaces/gpu-proof-client.js',
  'examples/dom-surfaces/gpu-recipes.json',
  'scripts/prove-dom-surface-gpu.mjs',
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
  limits: [
    'Observed Playwright Chromium/WebKit pixels; physical Safari power, refresh, thermal and sensor behavior remain unverified.',
    'The shader shares the headless Lambert/GGX conventions. Ambient fill, procedural microstructure, point-light normalization, and Reinhard display mapping are authored; no full light transport or energy-conservation claim.',
    'Frame interval observations include screenshot overhead and are not a GPU timing benchmark. JS update timing excludes GPU completion, paint and compositing.',
    'Contrast covers the recorded real DOM copy at sampled poses/exposures. It cannot certify every supplied color, backdrop or motion path.',
  ],
};
const check = (engine, name, passed, detail) =>
  report.checks.push({ engine, name, passed, detail });
const bundle = (
  await build({
    entryPoints: ['examples/dom-surfaces/gpu-proof-client.js'],
    bundle: true,
    write: false,
    format: 'iife',
    globalName: 'DomProof',
    platform: 'browser',
    target: 'es2022',
  })
).outputFiles[0].text;
const inputs = JSON.parse(
  await readFile('examples/dom-surfaces/gpu-recipes.json', 'utf8'),
);
async function pixels(page, index = 1) {
  await page.evaluate(() => proof.hideText(true));
  const rect = await page.evaluate((i) => {
    const r = proof.cards[i].getBoundingClientRect();
    return {
      x: r.x + scrollX + 32,
      y: r.y + scrollY + 32,
      width: r.width - 64,
      height: r.height - 64,
    };
  }, index);
  const bytes = await captureDomSurface(page, { fullPage: true });
  await page.evaluate(() => proof.hideText(false));
  return page.evaluate(
    async ({ png, rect }) => {
      const image = new Image();
      image.src = `data:image/png;base64,${png}`;
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = image.width;
      canvas.height = image.height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(image, 0, 0);
      const w = Math.floor(rect.width),
        h = Math.floor(rect.height),
        data = ctx.getImageData(
          Math.round(rect.x),
          Math.round(rect.y),
          w,
          h,
        ).data;
      const values = [],
        rgb = [];
      let total = 0,
        mx = 0,
        my = 0,
        squares = 0,
        maximum = 0;
      const linear = (c) => {
        const v = c / 255;
        return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
      };
      for (let y = 0; y < h; y += 3)
        for (let x = 0; x < w; x += 3) {
          const i = (y * w + x) * 4;
          const l =
            linear(data[i]) * 0.2126 +
            linear(data[i + 1]) * 0.7152 +
            linear(data[i + 2]) * 0.0722;
          values.push(l);
          rgb.push(data[i], data[i + 1], data[i + 2]);
          total += l;
          mx += l * x;
          my += l * y;
          squares += l * l;
          maximum = Math.max(maximum, l);
        }
      const mean = total / values.length,
        cx = mx / Math.max(total, 1e-9),
        cy = my / Math.max(total, 1e-9);
      let spread = 0,
        k = 0;
      for (let y = 0; y < h; y += 3)
        for (let x = 0; x < w; x += 3)
          spread +=
            (values[k++] * ((x - cx) ** 2 + (y - cy) ** 2)) /
            Math.max(total, 1e-9);
      return {
        mean,
        std: Math.sqrt(Math.max(0, squares / values.length - mean * mean)),
        maximum,
        centroid: { x: cx, y: cy },
        spread: Math.sqrt(spread),
        halfMaximumArea:
          values.filter((v) => v > maximum * 0.5).length / values.length,
        width: w,
        height: h,
        rgb,
      };
    },
    { png: bytes.toString('base64'), rect },
  );
}
const compact = ({ rgb, ...metrics }) => metrics;
async function contrast(page) {
  const regions = await page.evaluate(() => proof.regions());
  await page.evaluate(() => proof.hideText(true));
  const bytes = await captureDomSurface(page, { fullPage: true });
  await page.evaluate(() => proof.hideText(false));
  return page.evaluate(
    async ({ png, regions }) => {
      const image = new Image();
      image.src = `data:image/png;base64,${png}`;
      await image.decode();
      const c = document.createElement('canvas');
      c.width = image.width;
      c.height = image.height;
      const ctx = c.getContext('2d');
      ctx.drawImage(image, 0, 0);
      const luminance = (rgb) =>
        rgb
          .map((c) => {
            const v = c / 255;
            return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
          })
          .reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i], 0);
      return regions.map((r) => {
        const fg = luminance(
          r.color
            .match(/[\d.]+/g)
            .slice(0, 3)
            .map(Number),
        );
        const w = Math.floor(r.width),
          h = Math.floor(r.height),
          data = ctx.getImageData(Math.round(r.x), Math.round(r.y), w, h).data;
        let minimum = 21,
          samples = 0;
        for (let y = 2; y < h - 2; y++)
          for (let x = 2; x < w - 2; x++) {
            const i = (y * w + x) * 4,
              bg = luminance([data[i], data[i + 1], data[i + 2]]);
            minimum = Math.min(
              minimum,
              (Math.max(fg, bg) + 0.05) / (Math.min(fg, bg) + 0.05),
            );
            samples++;
          }
        return { index: r.index, minimum, samples };
      });
    },
    { png: bytes.toString('base64'), regions },
  );
}
for (const [engine, type] of Object.entries({ chromium, webkit })) {
  const executablePath =
    engine === 'webkit'
      ? process.env.DESIGN_WEBKIT_EXECUTABLE
      : process.env.DESIGN_CHROMIUM;
  const browser = await type.launch({
    headless: true,
    ...(executablePath ? { executablePath } : {}),
  });
  try {
    const page = await browser.newPage({
      viewport: { width: 1100, height: 1250 },
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
      inputs,
    );
    await page.waitForFunction(() =>
      proof.controllers.every((c) => c.renderer.status !== 'initializing'),
    );
    const startup = await page.evaluate(() =>
      proof.controllers.map((c) => ({ ...c.renderer })),
    );
    check(
      engine,
      'four bounded GPU layers initialize',
      startup.every(
        (s) =>
          s.status === 'ready' && s.programBuilds === 1 && s.pixels <= 500000,
      ),
      startup,
    );
    if (!startup.every((s) => s.status === 'ready'))
      throw new Error(`${engine}: GPU unavailable ${JSON.stringify(startup)}`);
    await captureDomSurface(page, { path: `${output}/${engine}-lit.png` });
    const poses = [];
    for (const exposure of [1.2, 1.5, 2])
      for (const [x, y] of [
        [-1, -1],
        [0, 0],
        [1, 1],
      ]) {
        await page.evaluate(
          ({ x, y, exposure }) => {
            proof.recipes.forEach((_, i) => proof.change(i, { exposure }));
            proof.pose(x, y);
          },
          { x, y, exposure },
        );
        const observed = await contrast(page);
        poses.push({ x, y, exposure, observed });
      }
    check(
      engine,
      'real content contrast through nine pose/exposure combinations',
      poses.every((s) =>
        s.observed.every((r) => r.minimum >= 4.5 && r.samples > 0),
      ),
      {
        minimum: Math.min(
          ...poses.flatMap((s) => s.observed.map((r) => r.minimum)),
        ),
        threshold: 4.5,
        poses,
      },
    );
    await page.evaluate((inputs) => {
      inputs.forEach((r, i) => proof.replace(i, r));
      proof.pose(0, 0);
    }, inputs);
    await page.locator('#finish').focus();
    const beforeKeyboard = await page.locator('#finish').inputValue();
    await page.keyboard.press('ArrowRight');
    check(
      engine,
      'native roughness keyboard changes finish',
      Number(await page.locator('#finish').inputValue()) >
        Number(beforeKeyboard),
      {
        before: beforeKeyboard,
        after: await page.locator('#finish').inputValue(),
      },
    );
    const rail = await page.locator('#finish').boundingBox();
    await page.mouse.move(rail.x + 8, rail.y + rail.height / 2);
    await page.mouse.down();
    const dragBoxes = [];
    for (let i = 0; i <= 30; i++) {
      await page.mouse.move(
        rail.x + 8 + ((rail.width - 16) * i) / 30,
        rail.y + rail.height / 2,
      );
      dragBoxes.push(await page.locator('#finish').boundingBox());
    }
    await page.mouse.up();
    const dragStats = await page.evaluate(() => ({
      value: document.querySelector('#finish').value,
      renderer: { ...proof.controllers[1].renderer },
    }));
    check(
      engine,
      'continuous native pointer drag keeps rail fixed and retains GPU resources',
      dragBoxes.every(
        (r) => Math.abs(r.x - rail.x) < 0.1 && Math.abs(r.y - rail.y) < 0.1,
      ) &&
        Number(dragStats.value) > 0.95 &&
        dragStats.renderer.textureBuilds === 1 &&
        dragStats.renderer.programBuilds === 1,
      { rail, last: dragBoxes.at(-1), ...dragStats },
    );
    await page.locator('.proof-card button').first().click();
    check(
      engine,
      'live semantic DOM button operates',
      (await page.locator('#action-status').textContent()) ===
        'Inspecting Matte paper',
      await page.locator('#action-status').textContent(),
    );
    await page.evaluate(() => {
      proof.stop();
      proof.change(1, {
        roughness: 0.18,
        textureAmount: 0,
        roughnessVariation: 0,
        light: { x: 0, y: 0, z: 1.4, intensity: 0.8, ambient: 0 },
      });
      proof.pose(0, 0);
      proof.controllers[1].setOutput('specular');
    });
    const smooth = await pixels(page);
    await page.evaluate(() => proof.change(1, { roughness: 0.7 }));
    const rough = await pixels(page);
    check(
      engine,
      'roughness broadens actual specular response',
      rough.spread > smooth.spread * 1.2 && smooth.maximum > rough.maximum,
      { smooth: compact(smooth), rough: compact(rough) },
    );
    await page.evaluate(() => {
      proof.change(1, { roughness: 0.35, metalness: 0 });
      proof.controllers[1].setOutput('diffuse');
    });
    const dielectricDiffuse = await pixels(page);
    await page.evaluate(() => proof.change(1, { metalness: 1 }));
    const metalDiffuse = await pixels(page);
    check(
      engine,
      'metalness removes diffuse response with same reflectance and light',
      dielectricDiffuse.mean > 0.01 && metalDiffuse.maximum < 0.001,
      { dielectric: compact(dielectricDiffuse), metal: compact(metalDiffuse) },
    );
    await page.evaluate(() => {
      proof.controllers[1].setOutput('specular');
      proof.change(1, { metalness: 0 });
    });
    const dielectricSpec = await pixels(page);
    await page.evaluate(() => proof.change(1, { metalness: 1 }));
    const metalSpec = await pixels(page);
    check(
      engine,
      'metalness changes specular energy with same reflectance and light',
      metalSpec.mean > dielectricSpec.mean * 2,
      { dielectric: compact(dielectricSpec), metal: compact(metalSpec) },
    );
    await page.evaluate(() =>
      proof.change(1, {
        light: { x: 0, y: 0, z: 1.4, intensity: 0, ambient: 0 },
      }),
    );
    const zero = await pixels(page);
    check(
      engine,
      'zero-light negative control extinguishes driven response',
      zero.maximum < 0.001,
      compact(zero),
    );
    const parity = [];
    for (const metalness of [0, 1])
      for (const roughness of [0.3, 0.7])
        for (const pass of ['diffuse', 'specular']) {
          await page.evaluate(
            ({ metalness, roughness, pass }) => {
              proof.change(1, {
                metalness,
                roughness,
                textureAmount: 0,
                roughnessVariation: 0,
                light: {
                  x: 0.2,
                  y: -0.3,
                  z: 1.4,
                  intensity: 0.8,
                  ambient: 0,
                  kind: 'directional',
                },
              });
              proof.pose(0, 0);
              proof.controllers[1].setOutput(pass);
              proof.hideText(true);
            },
            { metalness, roughness, pass },
          );
          const oracle = await page.evaluate(
              (pass) => proof.oracle(1, pass),
              pass,
            ),
            png = (await captureDomSurface(page, { fullPage: true })).toString(
              'base64',
            );
          const observed = await page.evaluate(
            async ({ png, x, y }) => {
              const im = new Image();
              im.src = `data:image/png;base64,${png}`;
              await im.decode();
              const c = document.createElement('canvas');
              c.width = im.width;
              c.height = im.height;
              const ctx = c.getContext('2d');
              ctx.drawImage(im, 0, 0);
              return [...ctx.getImageData(x, y, 1, 1).data].slice(0, 3);
            },
            { png, ...oracle },
          );
          await page.evaluate(() => proof.hideText(false));
          parity.push({
            metalness,
            roughness,
            pass,
            expected: oracle.expected,
            observed,
            maxChannelError: Math.max(
              ...observed.map((v, i) => Math.abs(v - oracle.expected[i])),
            ),
          });
        }
    check(
      engine,
      'GPU diffuse/specular pixels agree with headless GGX oracle',
      parity.every((p) => p.maxChannelError < 3),
      parity,
    );
    await page.evaluate(() => {
      proof.change(0, { textureAmount: 0 });
      proof.controllers[0].setOutput('normal');
    });
    const flatNormal = await pixels(page, 0);
    await page.evaluate(() => proof.change(0, { textureAmount: 0.7 }));
    const grainNormal = await pixels(page, 0);
    check(
      engine,
      'intrinsic normal texture changes spatial response independently of color',
      grainNormal.std > flatNormal.std + 0.002,
      { flat: compact(flatNormal), textured: compact(grainNormal) },
    );
    await page.evaluate(() => {
      proof.controllers[0].setOutput('roughness');
      proof.change(0, { roughness: 0.5, roughnessVariation: 0 });
    });
    const flatRough = await pixels(page, 0);
    await page.evaluate(() => proof.change(0, { roughnessVariation: 0.3 }));
    const variedRough = await pixels(page, 0);
    check(
      engine,
      'intrinsic roughness variation is independent of scalar roughness',
      variedRough.std > flatRough.std + 0.01,
      { uniform: compact(flatRough), varied: compact(variedRough) },
    );
    await page.evaluate((inputs) => {
      inputs.forEach((r, i) => proof.replace(i, r));
      proof.controllers.forEach((c) => c.setOutput('lit'));
      proof.pose(0, 0);
    }, inputs);
    const retained = await page.evaluate(() => {
      const c = proof.controllers[1],
        before = {
          geometry: c.stats.geometryReads,
          texture: c.renderer.textureBuilds,
          programs: c.renderer.programBuilds,
        };
      const start = performance.now();
      for (let i = 0; i < 120; i++) {
        c.setLightTarget({ x: Math.sin(i / 20), y: 0 });
        c.sample(1 / 60);
      }
      return {
        before,
        after: {
          geometry: c.stats.geometryReads,
          texture: c.renderer.textureBuilds,
          programs: c.renderer.programBuilds,
        },
        milliseconds120Updates: performance.now() - start,
      };
    });
    check(
      engine,
      '120 changing light samples retain geometry texture and program',
      JSON.stringify(retained.before) === JSON.stringify(retained.after),
      retained,
    );
    // Real pointer input + distinct browser frames; screenshot sequence proves observed motion.
    await page.evaluate(() => {
      proof.change(1, {
        textureAmount: 0,
        roughnessVariation: 0,
        roughness: 0.25,
        light: { x: 0, y: 0, z: 1.4, intensity: 0.8, ambient: 0 },
      });
      proof.controllers[1].setOutput('specular');
      proof.controllers[1].setLightTarget(null);
    });
    const card = await page.locator('.proof-card').nth(1).boundingBox(),
      sequence = [];
    for (let i = 0; i < 7; i++) {
      await page.mouse.move(
        card.x + card.width * (0.1 + (0.8 * i) / 6),
        card.y + card.height * 0.5,
        { steps: 8 },
      );
      await page.evaluate(async () => {
        for (let n = 0; n < 8; n++) {
          await new Promise(requestAnimationFrame);
          proof.controllers[1].sample(1 / 60);
        }
      });
      const observed = await pixels(page);
      sequence.push({ step: i, ...compact(observed) });
      await captureDomSurface(page, {
        path: `${output}/${engine}-light-${i}.png`,
      });
    }
    check(
      engine,
      'observed pointer light sequence moves the specular centroid',
      sequence.at(-1).centroid.x - sequence[0].centroid.x > 30 &&
        sequence.every(
          (s, i) => i === 0 || s.centroid.x > sequence[i - 1].centroid.x,
        ),
      sequence,
    );
    await page.evaluate((inputs) => {
      inputs.forEach((r, i) => proof.replace(i, r));
      proof.controllers.forEach((c) => c.setOutput('lit'));
      proof.pose(0, 0);
    }, inputs);
    await captureDomSurface(page, { path: `${output}/${engine}-refined.png` });
    for (const width of [390, 820, 1440]) {
      await page.setViewportSize({ width, height: 1100 });
      await page.waitForTimeout(70);
      const layout = await page.evaluate(() => ({
        width: innerWidth,
        scrollWidth: document.documentElement.scrollWidth,
        cards: proof.cards.map((el) => {
          const r = el.getBoundingClientRect();
          return { x: r.x, width: r.width };
        }),
      }));
      check(
        engine,
        `real DOM reflow ${width}`,
        layout.scrollWidth <= width &&
          layout.cards.every((c) => c.x >= 0 && c.x + c.width <= width + 0.5),
        layout,
      );
      await captureDomSurface(page, {
        path: `${output}/${engine}-${width}.png`,
      });
    }
    await page.setViewportSize({ width: 1100, height: 1250 });
    const budget = await page.evaluate(() => {
      const card = proof.cards[0],
        style = card.getAttribute('style');
      card.style.flex = '0 0 4000px';
      card.style.height = '2000px';
      proof.controllers[0].refreshBounds();
      const canvas = card.querySelector('canvas'),
        result = {
          pixels: proof.controllers[0].renderer.pixels,
          width: canvas.width,
          height: canvas.height,
        };
      if (style === null) card.removeAttribute('style');
      else card.setAttribute('style', style);
      proof.controllers[0].refreshBounds();
      return result;
    });
    check(
      engine,
      'oversized surface respects the configured GPU pixel budget',
      budget.pixels <= 500000 && budget.width * budget.height === budget.pixels,
      budget,
    );
    await page.evaluate(() => {
      proof.cards[0].querySelector('h2').textContent =
        'Keep every observation in the archive.';
      document.body.style.fontSize = '22px';
    });
    const content = await page.evaluate(() =>
      proof.cards.map((el) => ({
        scroll: el.scrollWidth,
        width: el.clientWidth,
        contained: [...el.children]
          .filter((c) => c.tagName !== 'CANVAS')
          .every(
            (c) =>
              c.getBoundingClientRect().bottom <=
              el.getBoundingClientRect().bottom + 1,
          ),
        text: el.textContent,
      })),
    );
    check(
      engine,
      'changed HTML copy and enlarged text retain content without horizontal overflow',
      content.every((c) => c.scroll <= c.width && c.contained),
      content,
    );
    const reducedMedia = await observeDomSurfaceMotion(page, 'reduce');
    const reduced = await page.evaluate(() => {
      const c = proof.controllers[0],
        before = c.renderer.draws;
      c.sample(0.5);
      return {
        status: c.status,
        before,
        after: c.renderer.draws,
        transform: getComputedStyle(proof.cards[0]).transform,
      };
    });
    check(
      engine,
      'reduced motion holds a static lit DOM surface',
      reduced.status === 'paused' &&
        reduced.before === reduced.after &&
        reduced.transform === 'none',
      { ...reduced, media: reducedMedia },
    );
    const resumedMedia = await observeDomSurfaceMotion(page, 'no-preference');
    check(
      engine,
      'CSS, retained media query and controllers observe motion preference restoration',
      resumedMedia.css === false &&
        resumedMedia.retained === false &&
        resumedMedia.fresh === false &&
        resumedMedia.controllers.every((c) => !c.reduced),
      resumedMedia,
    );
    await page.evaluate(() => scrollTo(0, 2500));
    await page.waitForTimeout(100);
    const paused = await page.evaluate(() => {
      const c = proof.controllers[0],
        before = c.renderer.draws;
      c.setLightTarget({ x: 1, y: 1 });
      c.sample(0.5);
      return { status: c.status, before, after: c.renderer.draws };
    });
    check(
      engine,
      'offscreen lighting submits no GPU work',
      paused.status === 'paused' && paused.before === paused.after,
      paused,
    );
    await page.evaluate(() => scrollTo(0, 0));
    await page.waitForTimeout(100);
    const lost = await page.evaluate(async () => {
      const c = proof.cards[0].querySelector('canvas');
      const gl = c.getContext('webgl2'),
        ext = gl.getExtension('WEBGL_lose_context');
      if (!ext) return { supported: false };
      window.restoreExtension = ext;
      ext.loseContext();
      await new Promise((resolve) => setTimeout(resolve, 30));
      return {
        supported: true,
        status: proof.controllers[0].renderer.status,
        attribute: proof.cards[0].dataset.domRenderer,
        button: !!proof.cards[0].querySelector('button'),
      };
    });
    check(
      engine,
      'context loss reveals CSS fallback with live HTML',
      !lost.supported ||
        (lost.status === 'fallback' && lost.attribute === 'css' && lost.button),
      lost,
    );
    if (lost.supported) {
      await page.evaluate(() => window.restoreExtension.restoreContext());
      await page.waitForFunction(
        () => proof.controllers[0].renderer.status === 'ready',
      );
      const restored = await page.evaluate(() => ({
        ...proof.controllers[0].renderer,
      }));
      check(
        engine,
        'context restoration rebuilds resources using retained texture data',
        restored.programBuilds === 2 &&
          restored.textureBuilds === 1 &&
          restored.textureUploads === 2,
        restored,
      );
    }
    const fallbackPage = await browser.newPage({
      viewport: { width: 1100, height: 1250 },
    });
    await fallbackPage.setContent('<!doctype html><html><body></body></html>');
    await fallbackPage.evaluate(() => {
      const original = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (kind, ...args) {
        return kind === 'webgl2' ? null : original.call(this, kind, ...args);
      };
    });
    await fallbackPage.addScriptTag({ content: bundle });
    await fallbackPage.evaluate(
      (inputs) => (window.proof = DomProof.mount(inputs)),
      inputs,
    );
    await fallbackPage.waitForFunction(() =>
      proof.controllers.every((c) => c.renderer.status === 'fallback'),
    );
    const unsupported = await fallbackPage.evaluate(() => ({
      fallback: proof.controllers.every(
        (c) => c.renderer.status === 'fallback',
      ),
      cards: proof.cards.length,
      buttons: document.querySelectorAll('.proof-card button').length,
      canvasesHidden: [...document.querySelectorAll('canvas')].every(
        (c) => c.hidden,
      ),
    }));
    check(
      engine,
      'unavailable WebGL selects explicit CSS fallback with semantic content',
      unsupported.fallback &&
        unsupported.cards === 4 &&
        unsupported.buttons === 4 &&
        unsupported.canvasesHidden,
      unsupported,
    );
    await fallbackPage.close();
    const earlyPage = await browser.newPage({
      viewport: { width: 1100, height: 1250 },
    });
    await earlyPage.setContent('<!doctype html><html><body></body></html>');
    await earlyPage.evaluate(() => {
      window.gpuContextRequests = 0;
      const original = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (kind, ...args) {
        if (kind === 'webgl2') window.gpuContextRequests++;
        return original.call(this, kind, ...args);
      };
    });
    await earlyPage.addScriptTag({ content: bundle });
    await earlyPage.evaluate((inputs) => {
      window.proof = DomProof.mount(inputs);
      proof.dispose();
    }, inputs);
    await earlyPage.waitForTimeout(70);
    const earlyDisposed = await earlyPage.evaluate(() => ({
      contexts: gpuContextRequests,
      canvases: document.querySelectorAll('canvas').length,
      statuses: proof.controllers.map((c) => c.status),
    }));
    check(
      engine,
      'early disposal cancels pending optional GPU initialization',
      earlyDisposed.contexts === 0 &&
        earlyDisposed.canvases === 0 &&
        earlyDisposed.statuses.every((s) => s === 'disposed'),
      earlyDisposed,
    );
    await earlyPage.close();
    const disposal = await page.evaluate(() => {
      proof.dispose();
      return {
        canvases: document.querySelectorAll('.dt-dom-light-canvas').length,
        statuses: proof.controllers.map((c) => c.status),
      };
    });
    check(
      engine,
      'disposal removes decorative canvases and stops all controllers',
      disposal.canvases === 0 &&
        disposal.statuses.every((s) => s === 'disposed'),
      disposal,
    );
    check(engine, 'no uncaught browser errors', errors.length === 0, errors);
    report.engines.push({
      engine,
      version: browser.version(),
      startup,
      poses,
      sequence,
    });
  } catch (error) {
    check(engine, 'proof completed without interruption', false, String(error));
  } finally {
    await writeFile(`${output}/proof.json`, JSON.stringify(report, null, 2));
    await browser.close();
  }
  await writeFile(`${output}/proof.json`, JSON.stringify(report, null, 2));
  process.stdout.write(
    `${engine}: ${report.checks.filter((c) => c.engine === engine && c.passed).length} passed / ${report.checks.filter((c) => c.engine === engine).length}\n`,
  );
}
check(
  'source',
  'source freeze held during run',
  JSON.stringify(await hashes()) === JSON.stringify(report.sources),
  await hashes(),
);
await writeFile(`${output}/proof.json`, JSON.stringify(report, null, 2));
await writeFile(
  `${output}/summary.json`,
  JSON.stringify(
    {
      ...report,
      engines: report.engines.map(({ engine, version, startup }) => ({
        engine,
        version,
        startup,
      })),
    },
    null,
    2,
  ),
);
const failed = report.checks.filter((c) => !c.passed);
console.log(JSON.stringify(failed, null, 2));
assert.equal(
  failed.length,
  0,
  `${failed.length} GPU proof failures; retained report at ${output}/proof.json`,
);
