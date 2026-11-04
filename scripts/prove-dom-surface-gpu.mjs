#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { gzipSync } from 'node:zlib';
import { parseXwd, registerXwdSample, screenFiducials, assertVirtualScreenEnvironment } from './dom-surface-xwd.mjs';
import { build } from 'esbuild';
import { chromium, webkit } from 'playwright';
import {
  captureDomSurface,
  captureStaticDomSurface,
  observeDomSurfaceMotion,
  waitForDomSurfacePaint,
} from './dom-surface-observation.mjs';
const output =
  process.env.DESIGN_DOM_GPU_OUTPUT ?? 'artifacts/dom-surfaces-gpu';
const readbackDiagnostic =
  process.env.DESIGN_DOM_GPU_READBACK_DIAGNOSTIC === '1';
const transformDiagnostic =
  process.env.DESIGN_DOM_GPU_TRANSFORM_DIAGNOSTIC === 'none';
const headedDiagnostic =
  process.env.DESIGN_DOM_GPU_HEADED_DIAGNOSTIC === '1';
const osScreenDiagnostic =
  process.env.DESIGN_DOM_GPU_OS_SCREEN_DIAGNOSTIC === '1';
const repeatDrawDiagnostic =
  process.env.DESIGN_DOM_GPU_REPEAT_DRAW_DIAGNOSTIC === '1';
if (repeatDrawDiagnostic) assert(osScreenDiagnostic, 'Repeat-draw comparison requires independent virtual-screen capture');
if (osScreenDiagnostic) {
  assertVirtualScreenEnvironment({ headed: headedDiagnostic });
  assert(!readbackDiagnostic && !transformDiagnostic, 'OS-screen case must keep the default fixture and omit readback');
}
const transformDiagnosticCss =
  '.proof-card.dt-dom-surface{transform:none!important}';
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
  'scripts/dom-surface-xwd.mjs',
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
  browserMode: headedDiagnostic ? 'headed' : 'headless',
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
if (osScreenDiagnostic)
  report.osScreenDiagnostic = {
    kind: 'xvfb-root-xwd',
    command: ['xwd', '-root', '-silent'],
    display: process.env.DISPLAY,
    fiducials: screenFiducials,
    caveat: 'Independent virtual X11 screen pixels bracket the existing settled protocol-screenshot sequence. XWD capture and synchronous gzip add observation time; this is not a physical screen or a timing benchmark.',
  };
if (repeatDrawDiagnostic)
  report.limits.push('Diagnostic-only: after the normal renderer settles, submit one identical fullscreen draw and flush before each of the eight GGX comparisons. Original renderer draw statistics omit this probe submission. No production fix or performance result follows.');
if (headedDiagnostic)
  report.limits.push(
    'Headed diagnostic changes browser display participation but retains the same Playwright screenshot API. An Xvfb snapshot is not an observation of a physical screen or a performance benchmark.',
  );
if (transformDiagnostic)
  report.fixtureDiagnostic = {
    kind: 'ancestor-transform-none',
    css: transformDiagnosticCss,
    caveat:
      'Fixture-only layer-topology comparison in a separate browser run. A changed screenshot result would implicate the ancestor transform path, without establishing live compositor behavior or a production fix.',
  };
if (readbackDiagnostic)
  report.diagnostic = {
    kind: 'same-stack-readback',
    outputUniformValues: ['lit', 'diffuse', 'specular', 'normal', 'roughness'],
    caveat:
      'Diagnostic-only synchronous readPixels/uniform queries perturb execution and can hide the timing failure. Compare with the separately executed uninstrumented control; this is not a production fix or GPU timing benchmark.',
    engines: [],
  };
async function captureVirtualScreen(page, stem, oracle) {
  assertVirtualScreenEnvironment({ headed: headedDiagnostic });
  const startedAt = new Date().toISOString();
  let artifact;
  try {
    const geometry = await page.evaluate((markers) => ({
      devicePixelRatio,
      viewport: { width: innerWidth, height: innerHeight },
      scroll: { x: scrollX, y: scrollY },
      markers: markers.map(m => {
        const r = document.getElementById(m.id).getBoundingClientRect();
        return { ...m, x: r.x, y: r.y, width: r.width, height: r.height };
      }),
    }), screenFiducials);
    assert(geometry.devicePixelRatio === 1, 'XWD diagnostic requires 1:1 CSS/device pixels');
    // proof.oracle returns viewport coordinates from getBoundingClientRect.
    // The existing full-page pixel oracle assumes this fixture remains unscrolled.
    assert(geometry.scroll.x === 0 && geometry.scroll.y === 0, 'XWD comparison requires the unchanged unscrolled oracle fixture');
    const point = { x: oracle.x, y: oracle.y };
    assert(point.x >= 0 && point.y >= 0 && point.x < geometry.viewport.width && point.y < geometry.viewport.height, 'Oracle pixel must be visible in the viewport');
    const { stdout } = await promisify(execFile)('xwd', ['-root', '-silent'], { encoding: 'buffer', maxBuffer: 64 * 1024 * 1024 });
    const capturedAt = new Date().toISOString(), compressed = gzipSync(stdout);
    const path = `${stem}.xwd.gz`;
    await writeFile(`${output}/${path}`, compressed);
    artifact = {
      path, rawByteLength: stdout.length,
      rawSha256: createHash('sha256').update(stdout).digest('hex'),
      byteLength: compressed.length,
      sha256: createHash('sha256').update(compressed).digest('hex'),
    };
    const sample = registerXwdSample(parseXwd(stdout), geometry.markers, point);
    return { startedAt, capturedAt, artifact, geometry, viewportPoint: point, ...sample,
      maxChannelError: Math.max(...sample.rgb.map((v, i) => Math.abs(v - oracle.expected[i]))) };
  } catch (error) {
    return { startedAt, failedAt: new Date().toISOString(), ...(artifact ? { artifact } : {}), error: String(error) };
  }
}
async function installReadbackDiagnostic(page) {
  await page.evaluate(() => {
    const trace = (window.__dtReadback = {
      current: null,
      sequence: 0,
      records: [],
      dropped: 0,
      runtime: null,
    });
    const original = WebGL2RenderingContext.prototype.drawArrays;
    const counts = new WeakMap();
    WebGL2RenderingContext.prototype.drawArrays = function (...args) {
      const result = original.apply(this, args);
      const sequence = ++trace.sequence;
      const canvasDraw = (counts.get(this) ?? 0) + 1;
      counts.set(this, canvasDraw);
      const canvas = this.canvas;
      if (
        !trace.current ||
        canvas.closest?.('.proof-card')?.dataset.index !== '1'
      )
        return result;
      if (trace.records.length >= 32) {
        trace.dropped++;
        return result;
      }
      const record = {
        sequence,
        canvasDraw,
        canvasIndex: 1,
        probeId: trace.current.id,
        requested: { ...trace.current },
      };
      const start = performance.now();
      try {
        const program = this.getParameter(this.CURRENT_PROGRAM);
        const uniform = (name) =>
          this.getUniform(program, this.getUniformLocation(program, name));
        record.uniforms = {
          output: uniform('uOutput'),
          roughness: uniform('uRoughness'),
          metalness: uniform('uMetalness'),
        };
        const rect = canvas.getBoundingClientRect();
        const x = Math.floor(rect.x + rect.width / 2);
        const y = Math.floor(rect.y + rect.height / 2);
        const width = this.drawingBufferWidth,
          height = this.drawingBufferHeight;
        const px = Math.min(
          width - 1,
          Math.max(0, Math.floor(((x + 0.5 - rect.x) * width) / rect.width)),
        );
        const py =
          height -
          1 -
          Math.min(
            height - 1,
            Math.max(
              0,
              Math.floor(((y + 0.5 - rect.y) * height) / rect.height),
            ),
          );
        record.screenshotPoint = { x: x + scrollX, y: y + scrollY };
        record.buffer = { width, height, x: px, y: py };
        record.defaultDrawFramebuffer =
          this.getParameter(this.DRAW_FRAMEBUFFER_BINDING) === null;
        record.defaultReadFramebuffer =
          this.getParameter(this.READ_FRAMEBUFFER_BINDING) === null;
        const rgba = new Uint8Array(4);
        this.readPixels(px, py, 1, 1, this.RGBA, this.UNSIGNED_BYTE, rgba);
        record.rawRgba = [...rgba];
        record.readError = this.getError();
        if (!trace.runtime) {
          const debug = this.getExtension('WEBGL_debug_renderer_info');
          trace.runtime = {
            contextAttributes: this.getContextAttributes(),
            vendor: this.getParameter(this.VENDOR),
            renderer: this.getParameter(this.RENDERER),
            unmaskedRenderer: debug
              ? this.getParameter(debug.UNMASKED_RENDERER_WEBGL)
              : null,
            userAgent: navigator.userAgent,
            devicePixelRatio,
          };
        }
      } catch (error) {
        record.error = String(error);
      }
      record.synchronousProbeMs = performance.now() - start;
      trace.records.push(record);
      return result;
    };
  });
}
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
  const { bytes, captureSha256 } = await captureStaticDomSurface(page, {
    fullPage: true,
  });
  await page.evaluate(() => proof.hideText(false));
  const metrics = await page.evaluate(
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
  return { ...metrics, captureSha256 };
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
    headless: !headedDiagnostic,
    ...(executablePath ? { executablePath } : {}),
  });
  let page;
  try {
    page = await browser.newPage({
      viewport: { width: 1100, height: 1250 },
      deviceScaleFactor: 1,
    });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.setContent(
      '<!doctype html><html><head><meta charset="utf-8"></head><body></body></html>',
    );
    if (transformDiagnostic)
      await page.addStyleTag({ content: transformDiagnosticCss });
    if (readbackDiagnostic) await installReadbackDiagnostic(page);
    await page.addScriptTag({ content: bundle });
    await page.evaluate(
      (inputs) => (window.proof = DomProof.mount(inputs)),
      inputs,
    );
    if (osScreenDiagnostic)
      await page.evaluate((markers) => {
        for (const m of markers) {
          const node = document.createElement('div');
          node.id = m.id;
          node.setAttribute('aria-hidden', 'true');
          node.style.cssText = `position:fixed;left:${m.x}px;top:${m.y}px;width:8px;height:8px;background:rgb(${m.rgb.join(',')});z-index:2147483647;pointer-events:none`;
          document.body.append(node);
        }
      }, screenFiducials);
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
    await page.evaluate(() => proof.stop());
    await waitForDomSurfacePaint(page);
    const batched = await page.evaluate(() => {
      const c = proof.controllers[1],
        before = c.renderer.draws;
      proof.change(1, { roughness: 0.7, metalness: 1 });
      c.setOutput('diffuse');
      proof.change(1, {
        roughness: 0.18,
        metalness: 0,
        textureAmount: 0,
        roughnessVariation: 0,
        light: { x: 0, y: 0, z: 1.4, intensity: 0.8, ambient: 0 },
      });
      proof.pose(0, 0);
      c.setOutput('specular');
      const canvas = proof.cards[1].querySelector('canvas');
      return { before, immediate: c.renderer.draws, bufferBefore: { width: canvas.width, height: canvas.height } };
    });
    const smooth = await pixels(page);
    const batchObservation = await page.evaluate(() => {
      const c = proof.controllers[1],
        draws = c.renderer.draws,
        canvas = proof.cards[1].querySelector('canvas');
      for (let i = 0; i < 20; i++) c.sample(0);
      return { draws, bufferAfter: { width: canvas.width, height: canvas.height } };
    });
    const afterBatch = batchObservation.draws;
    await waitForDomSurfacePaint(page);
    const afterUnchanged = await page.evaluate(
      () => proof.controllers[1].renderer.draws,
    );
    check(
      engine,
      'stopped clock coalesces edits plus final presentation and skips settled draws',
      batched.immediate === batched.before &&
        afterBatch === batched.before + 2 &&
        afterUnchanged === afterBatch,
      {
        ...batched,
        afterBatch,
        afterUnchanged,
        bufferAfter: batchObservation.bufferAfter,
        finalSpecular: compact(smooth),
      },
    );
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
          const probeId = `ggx-${parity.length}`;
          await page.evaluate(
            ({ metalness, roughness, pass, probeId }) => {
              if (window.__dtReadback)
                window.__dtReadback.current = {
                  id: probeId,
                  metalness,
                  roughness,
                  pass,
                };
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
            { metalness, roughness, pass, probeId },
          );
          const oracle = await page.evaluate(
            (pass) => proof.oracle(1, pass),
            pass,
          );
          const fixture = transformDiagnostic
            ? await page.evaluate(() => ({
                transform: getComputedStyle(proof.cards[1]).transform,
                cardRect: proof.cards[1].getBoundingClientRect().toJSON(),
                canvasRect: proof.cards[1]
                  .querySelector('canvas')
                  .getBoundingClientRect()
                  .toJSON(),
              }))
            : null;
          if (repeatDrawDiagnostic) {
            await waitForDomSurfacePaint(page);
            await page.evaluate(() => {
              const gl = proof.cards[1].querySelector('canvas').getContext('webgl2');
              if (!gl || gl.isContextLost()) throw Error('Missing live GPU context for repeat-draw comparison');
              // Same default framebuffer, program and uniforms as the settled renderer.
              gl.drawArrays(gl.TRIANGLES, 0, 3);
              gl.flush();
            });
            await waitForDomSurfacePaint(page);
          }
          let osBefore;
          if (osScreenDiagnostic) {
            await waitForDomSurfacePaint(page);
            osBefore = await captureVirtualScreen(page, `${engine}-${probeId}-before`, oracle);
          }
          const { bytes, captureSha256 } = await captureStaticDomSurface(page, {
            fullPage: true,
          });
          let osScreen;
          if (osScreenDiagnostic) {
            const after = await captureVirtualScreen(page, `${engine}-${probeId}-after`, oracle);
            const path = `${engine}-${probeId}-protocol.png`;
            await writeFile(`${output}/${path}`, bytes);
            osScreen = {
              before: osBefore, after,
              protocol: { path, byteLength: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') },
            };
          }
          const png = bytes.toString('base64');
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
          const diagnosticTrace = readbackDiagnostic
            ? await page.evaluate((probeId) => {
                const trace = window.__dtReadback;
                trace.current = null;
                return {
                  probeId,
                  drawSequences: trace.records
                    .filter((r) => r.probeId === probeId)
                    .map((r) => r.sequence),
                };
              }, probeId)
            : null;
          parity.push({
            metalness,
            roughness,
            pass,
            expected: oracle.expected,
            observed,
            captureSha256,
            ...(osScreen ? { osScreen, screenshotPoint: { x: oracle.x, y: oracle.y } } : {}),
            ...(fixture
              ? { fixture, screenshotPoint: { x: oracle.x, y: oracle.y } }
              : {}),
            ...(diagnosticTrace
              ? {
                  diagnosticTrace,
                  screenshotPoint: { x: oracle.x, y: oracle.y },
                }
              : {}),
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
    if (osScreenDiagnostic) {
      check(engine, 'virtual screen registers both fiducials before and after every GGX snapshot',
        parity.length === 8 && parity.every(p => !p.osScreen.before.error && !p.osScreen.after.error),
        parity.map(p => ({ pass: p.pass, metalness: p.metalness, roughness: p.roughness, ...p.osScreen })));
      for (const phase of ['before', 'after'])
        check(engine, `virtual screen ${phase} protocol snapshot agrees with CPU GGX oracle`,
          parity.every(p => p.osScreen[phase].maxChannelError < 3),
          parity.map(p => ({ expected: p.expected, ...p.osScreen[phase] })));
    }
    if (transformDiagnostic)
      check(
        engine,
        'fixture ancestor transform remains none for all GGX probes',
        parity.length === 8 &&
          parity.every((p) => p.fixture.transform === 'none'),
        parity.map(({ fixture, screenshotPoint }) => ({
          fixture,
          screenshotPoint,
        })),
      );
    if (readbackDiagnostic) {
      const trace = await page.evaluate(() => window.__dtReadback);
      check(
        engine,
        'diagnostic trace covers each selected screenshot probe at the same pixel',
        trace.dropped === 0 &&
          parity.every(
            (p) =>
              p.diagnosticTrace.drawSequences.length > 0 &&
              p.diagnosticTrace.drawSequences.every((sequence) => {
                const r = trace.records.find((r) => r.sequence === sequence);
                return (
                  !r.error &&
                  r.readError === 0 &&
                  r.rawRgba?.length === 4 &&
                  r.defaultReadFramebuffer &&
                  r.defaultDrawFramebuffer &&
                  r.screenshotPoint.x === p.screenshotPoint.x &&
                  r.screenshotPoint.y === p.screenshotPoint.y
                );
              }),
          ),
        { records: trace.records.length, dropped: trace.dropped },
      );
    }
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
    await page.bringToFront();
    await waitForDomSurfacePaint(page);
    const finalPresentationDisposal = await page.evaluate(() => new Promise(resolve => {
      const c = proof.controllers[0], before = c.renderer.draws;
      c.setOutput('roughness');
      requestAnimationFrame(() => {
        const first = c.renderer.draws;
        c.dispose();
        requestAnimationFrame(() => requestAnimationFrame(() => resolve({
          before, first, after: c.renderer.draws, status: c.status,
        })));
      });
    }));
    check(engine, 'disposal between changed draw and final presentation cancels the final submission',
      finalPresentationDisposal.first === finalPresentationDisposal.before + 1 &&
      finalPresentationDisposal.after === finalPresentationDisposal.first &&
      finalPresentationDisposal.status === 'disposed', finalPresentationDisposal);
    const disposal = await page.evaluate(async () => {
      const before = proof.controllers.map((c) => c.renderer.draws);
      proof.change(1, { roughness: 0.63 });
      proof.controllers[1].setOutput('normal');
      const queued = proof.controllers.map((c) => c.renderer.draws);
      proof.dispose();
      await new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      );
      return {
        before,
        queued,
        after: proof.controllers.map((c) => c.renderer.draws),
        canvases: document.querySelectorAll('.dt-dom-light-canvas').length,
        statuses: proof.controllers.map((c) => c.status),
      };
    });
    check(
      engine,
      'disposal cancels queued GPU submission and removes decorative canvases',
      disposal.canvases === 0 &&
        JSON.stringify(disposal.before) === JSON.stringify(disposal.queued) &&
        JSON.stringify(disposal.before) === JSON.stringify(disposal.after) &&
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
    if (readbackDiagnostic && page && !page.isClosed()) {
      try {
        report.diagnostic.engines.push({
          engine,
          version: browser.version(),
          trace: await page.evaluate(() => window.__dtReadback),
        });
      } catch (error) {
        report.diagnostic.engines.push({ engine, error: String(error) });
      }
    }
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
