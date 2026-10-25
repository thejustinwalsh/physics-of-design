import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { build } from 'esbuild';
import { chromium, webkit } from 'playwright';
const root = path.resolve('artifacts/vela/web/design-theory');
const output =
  process.env.GALLERY_MATERIAL_OUTPUT ??
  'artifacts/design-theory/material-integration';
await mkdir(output, { recursive: true });
const harness = (
  await build({
    stdin: {
      contents: `import React from 'react';import{createRoot}from'react-dom/client';import{HeroMaterial}from'./HeroMaterial.jsx';import{DomMaterialStudy}from'./DomMaterialStudy.jsx';import{profiles}from'./profiles.js';import{getRuntime}from'./runtime.js';const root=createRoot(document.getElementById('root'));root.render(<><HeroMaterial profile={profiles.editorial} roughness={.32} damping={13}/><DomMaterialStudy/></>);window.integration={runtime:getRuntime(),unmount(){root.unmount();getRuntime().dispose()}};`,
      resolveDir: path.resolve('examples/design-theory'),
      loader: 'jsx',
    },
    bundle: true,
    write: false,
    format: 'iife',
    define: { 'process.env.NODE_ENV': '"production"' },
  })
).outputFiles[0].text;
const server = createServer(async (req, res) => {
  try {
    const name = new URL(req.url, 'http://local').pathname;
    if (name === '/harness.js') {
      res.setHeader('Content-Type', 'application/javascript');
      res.end(harness);
      return;
    }
    if (name === '/harness.html') {
      res.setHeader('Content-Type', 'text/html');
      res.end(
        '<body style="margin:0;font:16px Arial;background:#f2f0e6"><div id="root"></div><script src="harness.js"></script>',
      );
      return;
    }
    const p = path.resolve(
      root,
      '.' + (name.endsWith('/') ? name + 'index.html' : name),
    );
    if (!p.startsWith(root + path.sep)) throw Error('path');
    res.setHeader(
      'Content-Type',
      {
        '.html': 'text/html',
        '.js': 'application/javascript',
        '.svg': 'image/svg+xml',
        '.ttf': 'font/ttf',
      }[path.extname(p)] ?? 'application/octet-stream',
    );
    res.end(await readFile(p));
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const url = `http://127.0.0.1:${server.address().port}`;
const files = [
  'src/browser-dom-light.ts',
  'src/dom-surface-gpu.ts',
  'src/dom-surface-shading.ts',
  'examples/design-theory/useDomMaterial.js',
  'examples/design-theory/HeroMaterial.jsx',
  'examples/design-theory/DomMaterialStudy.jsx',
  'examples/design-theory/web.jsx',
  'examples/dom-surfaces/gpu-recipes.json',
  'artifacts/vela/web/design-theory/app.js',
];
const hashes = () =>
  Promise.all(
    files.map(async (p) => ({
      path: p,
      sha256: createHash('sha256')
        .update(await readFile(p))
        .digest('hex'),
    })),
  );
const report = {
  sources: await hashes(),
  checks: [],
  errors: [],
  contrast: [],
  limits: [
    'Local Chromium/WebKit composites, not physical Safari performance, power or sensors.',
    'Screenshots perturb presentation; this run makes no timing benchmark claim.',
    'Contrast compares opaque computed foreground ink with actual text-hidden composite background over the recorded regions/poses; not whole-site accessibility certification.',
  ],
};
function check(passed, label, detail) {
  report.checks.push({ passed, label, detail });
  if (!passed) report.errors.push({ label, detail });
}
async function contrast(page, card) {
  const regions = await card.evaluate((el) => {
    const base = el.getBoundingClientRect();
    return [...el.querySelectorAll('[data-material-contrast]')].map((n) => {
      const r = n.getBoundingClientRect();
      const out = {
        text: n.textContent,
        color: getComputedStyle(n).color,
        x: r.x - base.x,
        y: r.y - base.y,
        width: r.width,
        height: r.height,
      };
      n.style.visibility = 'hidden';
      return out;
    });
  });
  const bytes = await card.screenshot();
  await card
    .locator('[data-material-contrast]')
    .evaluateAll((ns) =>
      ns.forEach((n) => n.style.removeProperty('visibility')),
    );
  return page.evaluate(
    async ({ png, regions }) => {
      const img = new Image();
      img.src = 'data:image/png;base64,' + png;
      await img.decode();
      const c = document.createElement('canvas');
      c.width = img.width;
      c.height = img.height;
      const ctx = c.getContext('2d');
      ctx.drawImage(img, 0, 0);
      const lum = (rgb) =>
        rgb
          .map((v) => {
            v /= 255;
            return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
          })
          .reduce((a, v, i) => a + v * [0.2126, 0.7152, 0.0722][i], 0);
      return regions.map((r) => {
        const fg = lum(
          r.color
            .match(/[\d.]+/g)
            .slice(0, 3)
            .map(Number),
        );
        let minimum = 21,
          samples = 0;
        const x0 = Math.max(0, Math.ceil(r.x)),
          y0 = Math.max(0, Math.ceil(r.y)),
          w = Math.max(0, Math.min(Math.floor(r.width), c.width - x0)),
          h = Math.max(0, Math.min(Math.floor(r.height), c.height - y0));
        const d = ctx.getImageData(x0, y0, Math.max(1, w), Math.max(1, h)).data;
        for (let y = 1; y < h - 1; y++)
          for (let x = 1; x < w - 1; x++) {
            const i = (y * w + x) * 4,
              bg = lum([d[i], d[i + 1], d[i + 2]]);
            minimum = Math.min(
              minimum,
              (Math.max(fg, bg) + 0.05) / (Math.min(fg, bg) + 0.05),
            );
            samples++;
          }
        return { text: r.text, minimum, samples };
      });
    },
    { png: bytes.toString('base64'), regions },
  );
}
async function difference(page, a, b) {
  return page.evaluate(
    async ({ a, b }) => {
      const decode = async (s) => {
        const i = new Image();
        i.src = 'data:image/png;base64,' + s;
        await i.decode();
        const c = document.createElement('canvas');
        c.width = i.width;
        c.height = i.height;
        const x = c.getContext('2d');
        x.drawImage(i, 0, 0);
        return x.getImageData(0, 0, c.width, c.height).data;
      };
      const x = await decode(a),
        y = await decode(b);
      let changed = 0,
        total = 0;
      for (let i = 0; i < Math.min(x.length, y.length); i += 16) {
        total++;
        if (
          Math.hypot(x[i] - y[i], x[i + 1] - y[i + 1], x[i + 2] - y[i + 2]) > 18
        )
          changed++;
      }
      return { changedFraction: changed / total };
    },
    { a: a.toString('base64'), b: b.toString('base64') },
  );
}
try {
  for (const [engine, type] of Object.entries(
    process.env.GALLERY_MATERIAL_ENGINE === 'chromium'
      ? { chromium }
      : process.env.GALLERY_MATERIAL_ENGINE === 'webkit'
        ? { webkit }
        : { chromium, webkit },
  )) {
    const browser = await type.launch({
      headless: true,
      ...(engine === 'webkit' && process.env.DESIGN_WEBKIT_EXECUTABLE
        ? { executablePath: process.env.DESIGN_WEBKIT_EXECUTABLE }
        : {}),
    });
    try {
      for (const width of (
        process.env.GALLERY_MATERIAL_WIDTHS ?? '390,834,1440'
      )
        .split(',')
        .map(Number)) {
        const page = await browser.newPage({
          viewport: { width, height: 900 },
        });
        page.on('pageerror', (e) =>
          report.errors.push({ engine, width, error: e.message }),
        );
        await page.goto(url);
        await page.waitForFunction(() => window.__DESIGN_THEORY__?.ready);
        await page.evaluate(() => document.fonts.ready);
        const hero = page.locator('[data-hero-material]');
        await hero.scrollIntoViewIfNeeded();
        await page.waitForFunction(
          () =>
            window.__DESIGN_THEORY__.runtime.stats.domSurfaces?.hero.renderer
              .status === 'ready',
        );
        await page.screenshot({
          path: `${output}/${engine}-${width}-hero.png`,
        });
        for (const profile of ['editorial', 'studio', 'utility']) {
          await page.locator(`[data-profile-choice="${profile}"]`).click();
          await hero.scrollIntoViewIfNeeded();
          await page.waitForTimeout(160);
          const observed = await contrast(page, hero);
          report.contrast.push({
            engine,
            width,
            kind: 'hero',
            profile,
            observed,
          });
          check(
            observed.every((r) => r.samples > 0 && r.minimum >= 4.5),
            `${engine}/${width}/${profile}: hero composite contrast`,
            observed,
          );
        }
        const tabs = page.getByRole('group', { name: 'Choose a material' }),
          card = page.locator('.dom-study-card');
        for (const name of ['Paper', 'Enamel', 'Brushed metal', 'Soft glass']) {
          await tabs.getByRole('button', { name, exact: true }).click();
          await card.scrollIntoViewIfNeeded();
          await page.waitForFunction(
            () =>
              window.__DESIGN_THEORY__.runtime.stats.domSurfaces?.study.renderer
                .status === 'ready',
          );
          await page.waitForTimeout(150);
          for (const direction of [
            'Light from left',
            'Light from right',
            'Follow pointer',
          ]) {
            await page
              .getByRole('button', { name: direction, exact: true })
              .click();
            await page.waitForTimeout(350);
            const observed = await contrast(page, card);
            report.contrast.push({
              engine,
              width,
              kind: name,
              direction,
              observed,
            });
            check(
              observed.every((r) => r.samples > 0 && r.minimum >= 4.5),
              `${engine}/${width}/${name}/${direction}: composite contrast`,
              observed,
            );
          }
          await card.screenshot({
            path: `${output}/${engine}-${width}-${name.replaceAll(' ', '-')}.png`,
          });
        }
        await tabs.getByRole('button', { name: 'Enamel', exact: true }).click();
        await page
          .getByRole('button', { name: 'Light from left', exact: true })
          .click();
        await card.scrollIntoViewIfNeeded();
        await page.waitForTimeout(400);
        const before = await card.screenshot();
        await page
          .getByRole('button', { name: 'Light from right', exact: true })
          .click();
        await page.waitForTimeout(400);
        const after = await card.screenshot();
        const moved = await difference(page, before, after);
        check(
          moved.changedFraction > 0.02,
          `${engine}/${width}: light retarget changes actual pixels`,
          moved,
        );
        const slider = page.getByRole('slider', {
          name: 'Surface finish roughness',
          exact: true,
        });
        await slider.scrollIntoViewIfNeeded();
        await page.waitForTimeout(120);
        const statsBefore = await page.evaluate(() =>
          JSON.parse(
            JSON.stringify(window.__DESIGN_THEORY__.runtime.stats.domSurfaces),
          ),
        );
        const rail = await slider.boundingBox();
        await page.mouse.move(rail.x + 8, rail.y + rail.height / 2);
        await page.mouse.down();
        let maxRail = 0;
        for (let i = 0; i <= 24; i++) {
          await page.mouse.move(
            rail.x + 8 + ((rail.width - 16) * i) / 24,
            rail.y + rail.height / 2,
          );
          await page.waitForTimeout(16);
          const b = await slider.boundingBox();
          maxRail = Math.max(maxRail, Math.abs(b.y - rail.y));
        }
        await page.mouse.up();
        await page.waitForTimeout(150);
        const statsAfter = await page.evaluate(() =>
          JSON.parse(
            JSON.stringify(window.__DESIGN_THEORY__.runtime.stats.domSurfaces),
          ),
        );
        check(
          maxRail <= 1,
          `${engine}/${width}: roughness drag keeps rail stable`,
          { maxRail },
        );
        check(
          statsAfter.study.renderer.textureUploads ===
            statsBefore.study.renderer.textureUploads &&
            statsAfter.study.renderer.programBuilds ===
              statsBefore.study.renderer.programBuilds,
          `${engine}/${width}: scalar drag does not rebuild texture/program`,
          {
            before: statsBefore.study.renderer,
            after: statsAfter.study.renderer,
          },
        );
        check(
          statsAfter.study.renderer.programBuilds === 1,
          `${engine}/${width}: all material tabs retain one program`,
          statsAfter.study.renderer,
        );
        await page.emulateMedia({ reducedMotion: 'reduce' });
        await card.scrollIntoViewIfNeeded();
        await page.waitForTimeout(200);
        const paused = await page.evaluate(
          () =>
            window.__DESIGN_THEORY__.runtime.stats.domSurfaces.study.renderer
              .draws,
        );
        await page
          .getByRole('button', { name: 'Light from left', exact: true })
          .click();
        await page.waitForTimeout(250);
        const still = await page.evaluate(
          () =>
            window.__DESIGN_THEORY__.runtime.stats.domSurfaces.study.renderer
              .draws,
        );
        check(
          still === paused,
          `${engine}/${width}: reduced motion holds static plane`,
          { paused, still },
        );
        await page.emulateMedia({ reducedMotion: 'no-preference' });
        await hero.scrollIntoViewIfNeeded();
        await page.waitForTimeout(150);
        const off = await page.evaluate(
          () =>
            window.__DESIGN_THEORY__.runtime.stats.domSurfaces.study.renderer
              .draws,
        );
        await page.waitForTimeout(200);
        const offAfter = await page.evaluate(
          () => window.__DESIGN_THEORY__.runtime.stats.domSurfaces.study,
        );
        check(
          offAfter.adapter.offscreen && offAfter.renderer.draws === off,
          `${engine}/${width}: offscreen study submits no frames`,
          offAfter,
        );
        await page.close();
      }
      const page = await browser.newPage({
        viewport: { width: 1100, height: 1600 },
      });
      await page.goto(url + '/harness.html');
      await page.waitForFunction(
        () => window.integration?.runtime.stats.domSurfaces?.study,
      );
      await page.waitForTimeout(150);
      await page.evaluate(() => {
        Object.defineProperty(document, 'hidden', {
          configurable: true,
          value: true,
        });
        document.dispatchEvent(new Event('visibilitychange'));
      });
      const hiddenBefore = await page.evaluate(
        () => integration.runtime.stats.domSurfaces.hero.renderer.draws,
      );
      await page.waitForTimeout(200);
      const hiddenAfter = await page.evaluate(
        () => integration.runtime.stats.domSurfaces.hero.renderer.draws,
      );
      check(
        hiddenBefore === hiddenAfter,
        `${engine}: synthetic visibility-hidden branch stops plane draws`,
        {
          hiddenBefore,
          hiddenAfter,
          scope:
            'document.hidden override exercises adapter event branch, not OS background scheduling',
        },
      );
      const disposed = await page.evaluate(() => {
        const r = integration.runtime;
        integration.unmount();
        return {
          receipts: r.stats.domSurfaces,
          canvases: document.querySelectorAll('.dt-dom-light-canvas').length,
        };
      });
      check(
        disposed.canvases === 0 &&
          Object.values(disposed.receipts).every(
            (r) => r.disposed && r.renderer.status === 'disposed',
          ),
        `${engine}: component unmount disposes both planes`,
        disposed,
      );
      await page.close();
      const fallback = await browser.newPage({
        viewport: { width: 390, height: 900 },
      });
      await fallback.addInitScript(() => {
        const original = HTMLCanvasElement.prototype.getContext;
        HTMLCanvasElement.prototype.getContext = function (kind, ...args) {
          return kind === 'webgl2' ? null : original.call(this, kind, ...args);
        };
      });
      await fallback.goto(url);
      await fallback.waitForFunction(
        () =>
          window.__DESIGN_THEORY__?.runtime.stats.domSurfaces?.hero.renderer
            .status === 'fallback',
      );
      const fallbackHero = fallback.locator('[data-hero-material]');
      await fallbackHero.scrollIntoViewIfNeeded();
      const fallbackContrast = await contrast(fallback, fallbackHero);
      check(
        fallbackContrast.every((r) => r.samples > 0 && r.minimum >= 4.5),
        `${engine}: unavailable WebGL keeps readable CSS hero`,
        fallbackContrast,
      );
      await fallbackHero.screenshot({
        path: `${output}/${engine}-fallback.png`,
      });
      await fallback.close();
    } finally {
      await browser.close();
    }
  }
} catch (e) {
  report.errors.push({ error: String(e) });
} finally {
  check(
    JSON.stringify(report.sources) === JSON.stringify(await hashes()),
    'source identity unchanged',
  );
  server.close();
  await writeFile(`${output}/report.json`, JSON.stringify(report, null, 2));
}
console.log(
  JSON.stringify({ checks: report.checks.length, errors: report.errors }),
);
if (report.errors.length) process.exitCode = 1;
