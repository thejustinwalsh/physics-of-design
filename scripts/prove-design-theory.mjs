import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { chromium, webkit } from 'playwright';
import { profileList } from '../examples/design-theory/profiles.js';

const root = path.resolve('artifacts/vela/web/design-theory');
const output =
  process.env.DESIGN_THEORY_PROOF_DIR ?? 'artifacts/design-theory/proof';
await mkdir(output, { recursive: true });
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    const target = path.resolve(
      root,
      '.' + (url.pathname === '/' ? '/index.html' : url.pathname),
    );
    if (!target.startsWith(root + path.sep)) {
      res.writeHead(403).end();
      return;
    }
    const data = await readFile(target);
    res.writeHead(200, {
      'content-type':
        {
          '.html': 'text/html',
          '.js': 'application/javascript',
          '.svg': 'image/svg+xml',
          '.ttf': 'font/ttf',
          '.txt': 'text/plain',
        }[path.extname(target)] ?? 'application/octet-stream',
    });
    res.end(data);
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise((resolve, reject) => {
  server.once('error', reject);
  server.listen(0, '127.0.0.1', resolve);
});
const base = `http://127.0.0.1:${server.address().port}`;
const report = {
  capturedAt: new Date().toISOString(),
  implementation: {},
  observations: [],
  failures: [],
};
const filesUnder = async (directory) => {
  const entries = await readdir(directory, { withFileTypes: true });
  return (
    await Promise.all(
      entries.map((entry) =>
        entry.isDirectory()
          ? filesUnder(path.join(directory, entry.name))
          : path.join(directory, entry.name),
      ),
    )
  )
    .flat()
    .sort();
};
for (const file of [
  ...(await filesUnder('examples/design-theory')),
  ...(await filesUnder('artifacts/vela/web/design-theory')),
  ...[
    'motion',
    'motion-dynamics',
    'browser-tilt',
    'surface',
    'material-relations',
    'wireframe',
    'prose',
    'math-expression',
    'media-geometry',
    'design-field',
    'design-context',
    'dom-surface',
    'browser-dom-light',
  ].map((name) => `src/${name}.ts`),
  'DESIGN.md',
  'examples/design-field/brief.json',
  'examples/design-field/measurements.json',
  'examples/design-field/gallery-session.json',
  'scripts/build-design-theory.mjs',
  'scripts/prove-design-theory.mjs',
  'package-lock.json',
])
  report.implementation[file] = createHash('sha256')
    .update(await readFile(file))
    .digest('hex');
const check = (ok, label) => {
  if (!ok) report.failures.push(label);
};
// Default DOM visibility checks reject a blank/uniform paint, not a particular
// palette complexity. Actual light response and composite contrast have separate
// endpoint/pose proofs. The previous >60-color oracle belonged to the 3D hero.
// Decode the screenshot in an isolated browser canvas. This observes the
// composited pixels, not a draw-call counter or a WebGL readback.
async function visibleColors(page, screenshot, box) {
  return page.evaluate(
    async ({ png, box }) => {
      const image = new Image();
      image.src = `data:image/png;base64,${png}`;
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = image.width;
      canvas.height = image.height;
      const context = canvas.getContext('2d');
      context.drawImage(image, 0, 0);
      const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
      const colors = new Set();
      let changed = 0,
        sampled = 0;
      const x0 = Math.max(0, Math.ceil(box.x)),
        x1 = Math.min(canvas.width, Math.floor(box.x + box.width));
      const y0 = Math.max(0, Math.ceil(box.y)),
        y1 = Math.min(canvas.height, Math.floor(box.y + box.height));
      for (let y = y0; y < y1; y += 2)
        for (let x = x0; x < x1; x += 2) {
          const i = (y * canvas.width + x) * 4;
          sampled++;
          if (
            Math.hypot(data[i] - 243, data[i + 1] - 241, data[i + 2] - 232) > 30
          )
            changed++;
          colors.add(`${data[i] >> 3},${data[i + 1] >> 3},${data[i + 2] >> 3}`);
        }
      return {
        quantizedColors: colors.size,
        changedFraction: changed / sampled,
      };
    },
    { png: screenshot.toString('base64'), box },
  );
}
const luminance = (hex) => {
  const channels = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
};
report.opaquePanelContrast = profileList.map((p) => ({
  profile: p.id,
  ratios: Object.fromEntries(
    [
      ['ink', 'paper'],
      ['muted', 'paper'],
      ['accent', 'paper'],
      ['ink', 'soft'],
      ['muted', 'soft'],
    ].map(([fg, bg]) => {
      const a = luminance(p[fg]),
        b = luminance(p[bg]);
      return [fg + '/' + bg, (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)];
    }),
  ),
}));
for (const entry of report.opaquePanelContrast)
  for (const [pair, ratio] of Object.entries(entry.ratios))
    check(ratio >= 4.5, entry.profile + ' ' + pair + ' text contrast below4.5');
try {
  for (const [name, engine] of [
    ['chromium', chromium],
    ['webkit', webkit],
  ]) {
    let browser;
    try {
      browser = await engine.launch({
        headless: true,
        ...(name === 'webkit' && process.env.DESIGN_WEBKIT_EXECUTABLE
          ? { executablePath: process.env.DESIGN_WEBKIT_EXECUTABLE }
          : {}),
      });
      const page = await browser.newPage({
        viewport: { width: 1440, height: 1000 },
        reducedMotion: 'reduce',
      });
      const errors = [];
      page.on('pageerror', (e) => errors.push(String(e)));
      for (const width of [320, 390, 834, 1440]) {
        await page.setViewportSize({ width, height: width < 500 ? 900 : 1000 });
        await page.goto(base);
        await page.waitForFunction(() => window.__DESIGN_THEORY__?.ready);
        await page.evaluate(() => document.fonts.ready);
        await page.waitForFunction(
          () =>
            [...document.querySelectorAll('[data-surface]')].every(
              (el) => el.dataset.renderer !== 'initializing',
            ),
          {},
          { timeout: 15000 },
        );
        await page.locator('[data-hero-material][data-dom-surface]').waitFor();
        await page.waitForTimeout(500);
        const initialScreenshot = await page.screenshot({
          path: `${output}/${name}-${width}-initial.png`,
        });
        const initialHeroPixels = await visibleColors(
          page,
          initialScreenshot,
          await page.locator('[data-hero-material]').boundingBox(),
        );
        check(
          initialHeroPixels.quantizedColors > 8 &&
            initialHeroPixels.changedFraction > 0.04,
          `${name}/${width}: initial reduced-motion DOM material not visible (${JSON.stringify(initialHeroPixels)})`,
        );
        const geometry = await page.evaluate(() => ({
          width: innerWidth,
          scrollWidth: document.documentElement.scrollWidth,
          headings: [...document.querySelectorAll('h1,h2')].map((el) => ({
            text: el.textContent,
            width: el.getBoundingClientRect().width,
            right: el.getBoundingClientRect().right,
          })),
          surfaces: window.__DESIGN_THEORY__.runtime.stats.surfaces,
          bodyText: document.body.innerText.length,
          borders: {
            header: getComputedStyle(document.querySelector('header'))
              .borderBottomWidth,
            profile: getComputedStyle(
              document.querySelector('[data-profile-choice]'),
            ).borderTopWidth,
          },
        }));
        check(
          geometry.scrollWidth <= width + 1,
          `${name}/${width}: horizontal overflow ${geometry.scrollWidth}`,
        );
        check(
          geometry.headings.every((h) => h.right <= width + 1),
          `${name}/${width}: heading outside viewport`,
        );
        check(
          geometry.bodyText > 3000,
          `${name}/${width}: incomplete page content`,
        );
        check(
          Object.values(geometry.surfaces).every(
            (s) => s.renderer === 'static' && s.frames === 0,
          ),
          `${name}/${width}: 3D initialized without explicit activation`,
        );
        check(
          geometry.borders.header === '1px' &&
            geometry.borders.profile === '1px',
          `${name}/${width}: intended borders were not emitted`,
        );
        check(
          (await page.locator('[data-surface] canvas').count()) === 0,
          `${name}/${width}: unexpected eager GPU canvas`,
        );
        await page.screenshot({
          path: `${output}/${name}-${width}-full.png`,
          fullPage: true,
        });
        await page.screenshot({
          path: `${output}/${name}-${width}-viewport.png`,
        });
        if (width === 1440)
          await page.screenshot({ path: `${output}/${name}-hero.png` });
        report.observations.push({
          engine: name,
          version: browser.version(),
          phase: 'responsive',
          initialHeroColors: initialHeroPixels.quantizedColors,
          initialHeroPixels,
          ...geometry,
        });
      }
      const initialFrameRegressions = [];
      for (const width of [320, 320, 320, 834]) {
        const fresh = await browser.newPage({
          viewport: { width, height: 900 },
          reducedMotion: 'reduce',
        });
        fresh.on('pageerror', (e) => errors.push(String(e)));
        await fresh.goto(base);
        await fresh.evaluate(() => document.fonts.ready);
        await fresh.waitForFunction(() => window.__DESIGN_THEORY__?.ready);
        await fresh.locator('[data-hero-material][data-dom-surface]').waitFor();
        await fresh.waitForTimeout(200);
        const bytes = await fresh.screenshot({
          path: `${output}/${name}-first-frame-${initialFrameRegressions.length}-${width}.png`,
        });
        const pixels = await visibleColors(
          fresh,
          bytes,
          await fresh.locator('[data-hero-material]').boundingBox(),
        );
        const stats = await fresh.evaluate(
          () => window.__DESIGN_THEORY__.runtime.stats.surfaces,
        );
        check(
          pixels.quantizedColors > 8 && pixels.changedFraction > 0.04,
          `${name}/${width}: fresh-page initial pixels missing ${JSON.stringify(pixels)}`,
        );
        initialFrameRegressions.push({ width, pixels, stats });
        await fresh.close();
      }
      await page.locator('[data-profile-choice="studio"]').click();
      await page.waitForFunction(() =>
        document.querySelector('[data-profile="studio"]'),
      );
      const studio = await page.locator('h1').evaluate((el) => ({
        font: getComputedStyle(el).fontFamily,
        tracking: getComputedStyle(el).letterSpacing,
        color: getComputedStyle(el).color,
      }));
      await page.locator('[data-profile-choice="utility"]').click();
      const utility = await page.locator('h1').evaluate((el) => ({
        font: getComputedStyle(el).fontFamily,
        tracking: getComputedStyle(el).letterSpacing,
        color: getComputedStyle(el).color,
      }));
      check(
        studio.color !== utility.color,
        `${name}: profile palette did not change`,
      );
      await page.locator('[data-profile-choice="editorial"]').click();
      const editorial = await page.locator('h1').evaluate((el) => ({
        font: getComputedStyle(el).fontFamily,
        tracking: getComputedStyle(el).letterSpacing,
        color: getComputedStyle(el).color,
      }));
      check(
        studio.tracking !== editorial.tracking,
        `${name}: profile typography did not change`,
      );
      await page.getByRole('slider', { name: 'Motion damping' }).focus();
      await page.keyboard.press('End');
      const downloadEvent = page.waitForEvent('download');
      await page.getByRole('button', { name: 'Download motion.json' }).click();
      const downloaded = await downloadEvent;
      const exportedMotion = JSON.parse(
        await readFile(await downloaded.path(), 'utf8'),
      );
      check(
        exportedMotion.spring.damping === 35,
        `${name}: export did not preserve edited damping`,
      );
      await page.getByRole('slider', { name: 'Material roughness' }).focus();
      await page.keyboard.press('End');
      await page
        .getByRole('textbox', { name: 'Design brief' })
        .fill(
          'A calm editorial field guide with tactile materials and clear hierarchy.',
        );
      await page
        .getByRole('button', { name: 'Keep this direction', exact: true })
        .click();
      await page.locator('[data-profile-choice="studio"]').click();
      await page
        .getByRole('button', {
          name: `Replay ${profileList.find((p) => p.id === 'editorial').name}`,
          exact: true,
        })
        .click();
      check(
        (await page
          .getByRole('textbox', { name: 'Design brief' })
          .inputValue()) ===
          'A calm editorial field guide with tactile materials and clear hierarchy.',
        `${name}: saved replay changed brief`,
      );
      check(
        Number(
          await page
            .getByRole('slider', { name: 'Motion damping' })
            .inputValue(),
        ) === 35,
        `${name}: saved replay lost edited damping`,
      );
      check(
        Number(
          await page
            .getByRole('slider', { name: 'Material roughness' })
            .inputValue(),
        ) === 0.95,
        `${name}: saved replay lost edited material roughness`,
      );
      await page.getByRole('button', { name: 'Portrait', exact: true }).click();
      check(
        (await page
          .locator('[data-crop-frame] svg')
          .getAttribute('viewBox')) === '0 0 270 340',
        `${name}: portrait crop not applied`,
      );
      await page.getByRole('slider', { name: 'Image focal point' }).focus();
      await page.keyboard.press('Home');
      await page
        .getByRole('button', { name: 'Inspect relationships', exact: true })
        .click();
      await page
        .getByRole('combobox', { name: 'Layout viewport' })
        .selectOption('390');
      const before = await page
        .locator('[data-wireframe] [data-wireframe-node="title"] rect')
        .getAttribute('width');
      await page.getByRole('slider', { name: 'Layout gutter' }).focus();
      await page.keyboard.press('End');
      const after = await page
        .locator('[data-wireframe] [data-wireframe-node="title"] rect')
        .getAttribute('width');
      check(
        Number(after) < Number(before),
        `${name}: wireframe gutter did not recompute`,
      );
      const origin = await page.locator('[data-wireframe]').evaluate((el) => ({
        hostTop: el.getBoundingClientRect().top,
        svgTop: el.getBoundingClientRect().top,
        scrollTop: el.scrollTop,
      }));
      check(
        origin.scrollTop === 0 && origin.svgTop >= origin.hostTop,
        `${name}: inspector origin inaccessible`,
      );
      const layoutComparisons = [];
      let clippingFixture;
      for (const hostWidth of [320, 1440])
        for (const spacing of [
          { gutter: 32, gap: 28 },
          { gutter: 64, gap: 48 },
        ])
          for (const viewport of ['390', '834', '960']) {
            await page.setViewportSize({ width: hostWidth, height: 1000 });
            for (const [label, value] of [
              ['Layout gutter', spacing.gutter],
              ['Layout content gap', spacing.gap],
            ]) {
              const slider = page.getByRole('slider', { name: label });
              await slider.fill(String(value));
            }
            await page
              .getByRole('combobox', { name: 'Layout viewport' })
              .selectOption(viewport);
            await page.waitForFunction(
              ({ width, gutter, gap }) => {
                const observed = JSON.parse(
                  document.querySelector('[data-layout-receipt]').dataset
                    .layoutInputs || 'null',
                );
                return (
                  document.querySelector('#gallery').dataset.layoutMeasured ===
                    'true' &&
                  observed?.width === width &&
                  observed.gutter === gutter &&
                  observed.gap === gap
                );
              },
              { width: Number(viewport), ...spacing },
            );
            if (
              !clippingFixture &&
              viewport === '390' &&
              spacing.gutter === 32
            ) {
              clippingFixture = await page
                .locator('[data-layout-title-measure]')
                .evaluate((el) => {
                  const copy = el.cloneNode(true);
                  copy.style.height = '190px';
                  document.body.append(copy);
                  const box = copy.getBoundingClientRect();
                  const result = {
                    authoredHeight: 190,
                    naturalHeight: el.getBoundingClientRect().height,
                    scrollHeight: copy.scrollHeight,
                    paragraphBottom:
                      copy.querySelector('p').getBoundingClientRect().bottom -
                      box.top,
                  };
                  copy.remove();
                  return result;
                });
              check(
                clippingFixture.paragraphBottom > 190,
                `${name}: old190px fixture did not reproduce clipping`,
              );
            }
            const expected = await page
              .locator('[data-wireframe]')
              .evaluate((el) =>
                [...el.querySelectorAll('[data-wireframe-node]')].map(
                  (node) => {
                    const rect = node.querySelector('rect');
                    return {
                      id: node.dataset.wireframeNode,
                      box: Object.fromEntries(
                        ['x', 'y', 'width', 'height'].map((key) => [
                          key,
                          Number(rect.getAttribute(key)),
                        ]),
                      ),
                    };
                  },
                ),
              );
            await page
              .getByRole('button', { name: 'Design', exact: true })
              .click();
            await page.waitForTimeout(100);
            const actual = await page
              .locator('[data-layout-preview]')
              .evaluate((el) => {
                const origin = el.getBoundingClientRect(),
                  scale = Number(el.dataset.previewScale);
                return [...el.querySelectorAll('[data-design-node]')].map(
                  (node) => {
                    const r = node.getBoundingClientRect();
                    return {
                      id: node.dataset.designNode,
                      box: {
                        x: (r.x - origin.x) / scale,
                        y: (r.y - origin.y) / scale,
                        width: r.width / scale,
                        height: r.height / scale,
                      },
                    };
                  },
                );
              });
            const contentFit = await page
              .locator('[data-design-node="title"]')
              .evaluate((el) => {
                const box = el.getBoundingClientRect();
                const children = [...el.children].map((child) => {
                  const r = child.getBoundingClientRect();
                  const range = document.createRange();
                  range.selectNodeContents(child);
                  const text = range.getBoundingClientRect();
                  return {
                    tag: child.tagName,
                    bottom: r.bottom - box.bottom,
                    right: r.right - box.right,
                    textBottom: text.bottom - box.bottom,
                    textRight: text.right - box.right,
                  };
                });
                return {
                  scrollHeight: el.scrollHeight,
                  clientHeight: el.clientHeight,
                  overflow: getComputedStyle(el).overflow,
                  children,
                };
              });
            check(
              contentFit.scrollHeight <= contentFit.clientHeight + 1 &&
                contentFit.overflow !== 'hidden' &&
                contentFit.children.every(
                  (child) =>
                    child.bottom <= 1 &&
                    child.right <= 1 &&
                    child.textBottom <= 1 &&
                    child.textRight <= 1,
                ),
              `${name}/${hostWidth}/${viewport}/${spacing.gutter}: title content overflow ${JSON.stringify(contentFit)}`,
            );
            const errors = expected.map((node) => ({
              id: node.id,
              maxError: Math.max(
                ...Object.keys(node.box).map((key) =>
                  Math.abs(
                    node.box[key] -
                      actual.find((n) => n.id === node.id).box[key],
                  ),
                ),
              ),
            }));
            check(
              errors.every((node) => node.maxError < 1),
              `${name}/${viewport}: design/diagram geometry mismatch ${JSON.stringify(errors)}`,
            );
            layoutComparisons.push({
              hostWidth,
              spacing,
              viewport,
              expected,
              actual,
              errors,
              contentFit,
            });
            await page
              .getByRole('button', {
                name: 'Inspect relationships',
                exact: true,
              })
              .click();
          }
      await page.setViewportSize({ width: 1440, height: 1000 });
      await page
        .locator('[data-wireframe] [data-wireframe-node="image"]')
        .click();
      await page.locator('#materials').scrollIntoViewIfNeeded();
      await page.getByRole('slider', { name: 'Material roughness' }).focus();
      await page.keyboard.press('End');
      check(
        (await page
          .getByRole('slider', { name: 'Material roughness' })
          .inputValue()) === '.95' ||
          Number(
            await page
              .getByRole('slider', { name: 'Material roughness' })
              .inputValue(),
          ) === 0.95,
        `${name}: roughness control not wired`,
      );
      await page.getByRole('slider', { name: 'Normal texture scale' }).focus();
      await page.keyboard.press('End');
      await page
        .getByRole('slider', { name: 'Normal texture amplitude' })
        .focus();
      await page.keyboard.press('End');
      await page.waitForTimeout(250);
      await page
        .locator('#materials')
        .screenshot({ path: `${output}/${name}-material.png` });
      await page.locator('#motion').scrollIntoViewIfNeeded();
      await page.locator('[data-retarget]').click();
      await page.waitForTimeout(50);
      const reducedA = await page
        .locator('[data-motion-ball]')
        .getAttribute('data-position');
      await page.waitForTimeout(150);
      const reducedB = await page
        .locator('[data-motion-ball]')
        .getAttribute('data-position');
      check(
        reducedA === reducedB,
        `${name}: reduced motion did not settle immediately`,
      );
      await page.emulateMedia({ reducedMotion: 'no-preference' });
      await page.goto(base);
      await page.waitForFunction(() => window.__DESIGN_THEORY__?.ready);
      await page.locator('#motion').scrollIntoViewIfNeeded();
      await page.waitForTimeout(700);
      await page.locator('[data-motion-ball]').evaluate((el) => {
        const before = Number(el.getAttribute('data-position'));
        const trace = [{ time: performance.now(), position: before }];
        const observer = new MutationObserver(() => {
          const position = Number(el.getAttribute('data-position'));
          if (Number.isFinite(position) && trace.at(-1).position !== position)
            trace.push({ time: performance.now(), position });
        });
        observer.observe(el, {
          attributes: true,
          attributeFilter: ['data-position'],
        });
        window.__GALLERY_MOTION_TRACE__ = {
          before,
          trace,
          stop: () => observer.disconnect(),
        };
      });
      await page.locator('[data-retarget]').click();
      let moving = true;
      try {
        await page.waitForFunction(
          () => {
            const t = window.__GALLERY_MOTION_TRACE__;
            return t.trace.some(
              (p) =>
                Math.abs(p.position - t.before) > 0.02 &&
                p.position > 0.02 &&
                p.position < 0.98,
            );
          },
          {},
          { timeout: 5000 },
        );
      } catch {
        moving = false;
      }
      const motionTrace = await page.evaluate(() => {
        const t = window.__GALLERY_MOTION_TRACE__;
        t.stop();
        return {
          before: t.before,
          samples: t.trace,
          maxSampleGapMs: Math.max(
            0,
            ...t.trace.slice(1).map((p, i) => p.time - t.trace[i].time),
          ),
        };
      });
      report.observations.push({
        engine: name,
        kind: 'normal-motion-event-trace',
        ...motionTrace,
      });
      check(moving, `${name}: normal spring motion not visible`);
      const button = page.locator('[data-retarget]');
      await button.hover();
      await page.mouse.down();
      await page.waitForTimeout(90);
      const pressed = await button.evaluate(
        (el) => getComputedStyle(el).transform,
      );
      await page.mouse.up();
      check(
        pressed !== 'none' && pressed !== 'matrix(1, 0, 0, 1, 0, 0)',
        `${name}: GSAP press feedback not visible`,
      );
      await page.mouse.wheel(0, 450);
      await page.waitForTimeout(400);
      const progress = await page
        .locator('[data-scroll-line]')
        .evaluate((el) => getComputedStyle(el).transform);
      check(
        progress !== 'matrix(0, 0, 0, 1, 0, 0)',
        `${name}: scroll progress did not update`,
      );
      report.observations.push({
        engine: name,
        phase: 'interaction',
        studio,
        utility,
        editorial,
        exportedMotion,
        initialFrameRegressions,
        clippingFixture,
        layoutComparisons,
        inspectorOrigin: origin,
        reducedPositions: [reducedA, reducedB],
        movingPositions: motionTrace.samples.map((s) => s.position),
        pressed,
        stats: await page.evaluate(
          () => window.__DESIGN_THEORY__.runtime.stats,
        ),
        errors,
      });
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.goto(base + '/?mainRenderer=1');
      await page.waitForFunction(
        () =>
          [...document.querySelectorAll('[data-surface]')].length === 1 &&
          [...document.querySelectorAll('[data-surface]')].every(
            (el) => el.dataset.renderer === 'main',
          ),
        {},
        { timeout: 15000 },
      );
      check(errors.length === 0, `${name}: page errors: ${errors.join(' | ')}`);
    } catch (error) {
      report.failures.push(`${name}: ${error.stack ?? error}`);
    } finally {
      await browser?.close();
    }
  }
} finally {
  await new Promise((resolve) => server.close(resolve));
  for (const [file, expected] of Object.entries(report.implementation)) {
    const actual = createHash('sha256')
      .update(await readFile(file))
      .digest('hex');
    check(actual === expected, `Implementation changed during proof: ${file}`);
  }
  await writeFile(`${output}/report.json`, JSON.stringify(report, null, 2));
}
console.log(
  JSON.stringify(
    {
      output,
      observations: report.observations.length,
      failures: report.failures,
    },
    null,
    2,
  ),
);
assert.equal(report.failures.length, 0, report.failures.join('\n'));
