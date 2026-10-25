import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium, webkit } from 'playwright';
import { createHash } from 'node:crypto';
const root = path.resolve('artifacts/vela/web/design-theory');
const output =
  process.env.GALLERY_INTERACTION_DIR ?? 'artifacts/design-theory/interactions';
const capture = process.env.GALLERY_CAPTURE !== '0';
await mkdir(output, { recursive: true });
const server = createServer(async (req, res) => {
  try {
    const p = path.resolve(
      root,
      '.' +
        (new URL(req.url, 'http://localhost').pathname.endsWith('/')
          ? new URL(req.url, 'http://localhost').pathname + 'index.html'
          : new URL(req.url, 'http://localhost').pathname),
    );
    if (!p.startsWith(root + path.sep)) {
      res.writeHead(403).end();
      return;
    }
    const data = await readFile(p);
    res
      .writeHead(200, {
        'content-type':
          {
            '.html': 'text/html',
            '.js': 'application/javascript',
            '.svg': 'image/svg+xml',
            '.ttf': 'font/ttf',
          }[path.extname(p)] ?? 'application/octet-stream',
      })
      .end(data);
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const report = {
  generatedAt: new Date().toISOString(),
  captureMode: capture
    ? 'video-trace-screenshots'
    : 'no-video-no-trace-no-drag-screenshots',
  invasiveCaptureIntervals: [],
  scenarios: [],
  actions: [],
  runtime: [],
  sources: [],
  errors: [],
  limits: [
    'Local automated pointer trajectories and captured frames, not a human smoothness rating or physical-device benchmark.',
    'Trace, video and screenshot capture add overhead; frame timings are observations, not controlled comparative benchmarks.',
  ],
};
for (const file of [
  'examples/design-theory/web.jsx',
  'examples/design-theory/LayoutPreview.jsx',
  'examples/design-theory/Surface.jsx',
  'examples/design-theory/runtime.js',
  'examples/design-theory/InteractionRange.jsx',
  'examples/design-theory/HeroMaterial.jsx',
  'examples/design-theory/useDomMaterial.js',
  'src/browser-dom-light.ts',
  'src/dom-surface-gpu.ts',
  'examples/design-theory/FieldSession.jsx',
  'examples/design-theory/field-entry.jsx',
  'scripts/build-design-theory.mjs',
  'artifacts/vela/web/design-theory/field/app.js',
  'examples/design-theory/DomMaterialStudy.jsx',
  'examples/design-field/gallery-session.json',
  'artifacts/vela/web/design-theory/app.js',
])
  report.sources.push({
    path: file,
    sha256: createHash('sha256')
      .update(await readFile(file))
      .digest('hex'),
  });
const check = (passed, label, detail) => {
  report.actions.push({ passed, label, detail });
  if (!passed) report.errors.push({ label, detail });
};
try {
  for (const [engine, type] of Object.entries(
    process.env.GALLERY_ENGINE === 'webkit' ? { webkit } : { chromium },
  )) {
    const browser = await type.launch({
      headless: true,
      ...(engine === 'webkit' && process.env.DESIGN_WEBKIT_EXECUTABLE
        ? { executablePath: process.env.DESIGN_WEBKIT_EXECUTABLE }
        : {}),
    });
    try {
      for (const width of (process.env.GALLERY_WIDTHS ?? '390,834,1440')
        .split(',')
        .map(Number)) {
        const context = await browser.newContext({
          viewport: { width, height: 900 },
          ...(capture
            ? {
                recordVideo: {
                  dir: output,
                  size: { width: Math.min(width, 1440), height: 900 },
                },
              }
            : {}),
        });
        await context.addInitScript(() => {
          window.__webglRequests = 0;
          window.__threeWebglRequests = 0;
          window.__workerRequests = 0;
          const getContext = HTMLCanvasElement.prototype.getContext;
          HTMLCanvasElement.prototype.getContext = function (kind, ...args) {
            if (kind === 'webgl' || kind === 'webgl2') {
              window.__webglRequests++;
              if (this.closest('[data-surface]')) window.__threeWebglRequests++;
            }
            return getContext.call(this, kind, ...args);
          };
          const NativeWorker = window.Worker;
          if (NativeWorker)
            window.Worker = class extends NativeWorker {
              constructor(...args) {
                super(...args);
                window.__workerRequests++;
              }
            };
        });
        if (capture)
          await context.tracing.start({
            screenshots: false,
            snapshots: true,
            sources: false,
          });
        const page = await context.newPage();
        page.on('pageerror', (e) =>
          report.errors.push({ engine, width, message: e.message }),
        );
        await page.goto(`http://127.0.0.1:${server.address().port}/`);
        await page.waitForFunction(() => window.__DESIGN_THEORY__?.ready);
        await page.evaluate(() => document.fonts.ready);
        await page.waitForTimeout(300);
        if (capture)
          await page.screenshot({
            path: `${output}/${engine}-${width}-hero.png`,
          });
        for (const name of [
          'Layout gutter',
          'Layout content gap',
          'Motion damping',
          'Material roughness',
          'Material metalness',
          'Normal texture scale',
          'Normal texture amplitude',
          'Surface finish roughness',
          'Image focal point',
        ]) {
          const slider = page.getByRole('slider', { name, exact: true });
          if (!(await slider.count())) {
            report.errors.push({ engine, width, missing: name });
            continue;
          }
          await slider.scrollIntoViewIfNeeded();
          await page.waitForTimeout(850);
          const b = await slider.boundingBox();
          await page.evaluate((name) => {
            const el = [...document.querySelectorAll('input[type=range]')].find(
              (e) => e.getAttribute('aria-label') === name,
            );
            const samples = [],
              tasks = [];
            let last = performance.now(),
              active = true;
            const tick = (t) => {
              if (!active) return;
              const r = el.getBoundingClientRect();
              samples.push({
                t,
                dt: t - last,
                x: r.x,
                y: r.y,
                width: r.width,
                value: Number(el.value),
                scrollY: window.scrollY,
                height: document.documentElement.scrollHeight,
              });
              last = t;
              requestAnimationFrame(tick);
            };
            requestAnimationFrame(tick);
            let observer = null;
            if (PerformanceObserver.supportedEntryTypes.includes('longtask')) {
              observer = new PerformanceObserver((list) =>
                tasks.push(
                  ...list
                    .getEntries()
                    .map((e) => ({ start: e.startTime, duration: e.duration })),
                ),
              );
              observer.observe({ type: 'longtask' });
            }
            window.__dragProbe = {
              stop() {
                active = false;
                observer?.disconnect();
                return {
                  samples,
                  tasks,
                  longTaskObserverSupported:
                    PerformanceObserver.supportedEntryTypes.includes(
                      'longtask',
                    ),
                };
              },
            };
          }, name);
          await page.mouse.move(b.x + 8, b.y + b.height / 2);
          await page.mouse.down();
          for (let i = 0; i <= 36; i++) {
            await page.mouse.move(
              b.x + 8 + ((b.width - 16) * i) / 36,
              b.y + b.height / 2,
            );
            await page.waitForTimeout(16);
            if (capture && i === 18 && name === 'Layout gutter') {
              const start = await page.evaluate(() => performance.now());
              await page.screenshot({
                path: `${output}/${engine}-${width}-gutter-mid.png`,
              });
              const end = await page.evaluate(() => performance.now());
              report.invasiveCaptureIntervals.push({
                engine,
                width,
                name,
                start,
                end,
              });
            }
          }
          await page.mouse.up();
          await page.waitForTimeout(150);
          const data = await page.evaluate(() => window.__dragProbe.stop());
          const ys = data.samples.map((s) => s.y),
            xs = data.samples.map((s) => s.x),
            scroll = data.samples.map((s) => s.scrollY),
            dts = data.samples
              .map((s) => s.dt)
              .filter((n) => n >= 0)
              .sort((a, b) => a - b);
          report.scenarios.push({
            engine,
            width,
            name,
            frameSamples: data.samples.length,
            railMovement: {
              x: Math.max(...xs) - Math.min(...xs),
              y: Math.max(...ys) - Math.min(...ys),
            },
            scrollMovement: Math.max(...scroll) - Math.min(...scroll),
            frameIntervalP95: dts[Math.floor(dts.length * 0.95)],
            maxFrameInterval: Math.max(...dts),
            longTasks: data.tasks,
            longTaskObserverSupported: data.longTaskObserverSupported,
            samples: data.samples,
          });
          const railY = Math.max(...ys) - Math.min(...ys);
          check(railY <= 1, `${engine}/${width}/${name}: stationary rail`, {
            movement: railY,
          });
          const final = await slider.evaluate((el) => ({
            value: Number(el.value),
            min: Number(el.min),
            max: Number(el.max),
          }));
          check(
            (final.value - final.min) / (final.max - final.min) >= 0.95,
            `${engine}/${width}/${name}: pointer reaches endpoint`,
            final,
          );
        }
        const beforeActivation = await page.evaluate(() => ({
          webgl: window.__webglRequests,
          threeWebgl: window.__threeWebglRequests,
          workers: window.__workerRequests,
        }));
        check(
          beforeActivation.webgl <= 2 &&
            beforeActivation.threeWebgl === 0 &&
            beforeActivation.workers === 0,
          `${engine}/${width}: only bounded DOM planes; no Three initialization during unrelated manipulation`,
          beforeActivation,
        );
        for (const id of ['studio', 'utility', 'editorial']) {
          await page.locator(`[data-profile-choice="${id}"]`).click();
          check(
            (await page
              .locator('[data-profile]')
              .getAttribute('data-profile')) === id,
            `${engine}/${width}: apply ${id}`,
          );
        }
        for (const label of ['Landscape', 'Square', 'Portrait']) {
          const button = page.getByRole('button', { name: label, exact: true });
          await button.click();
          check(
            (await button.getAttribute('aria-pressed')) === 'true',
            `${engine}/${width}: ${label} crop`,
          );
        }
        await page
          .getByRole('checkbox', { name: 'Show the authored focal point' })
          .uncheck();
        check(
          (await page.locator('[data-crop-frame] circle').count()) === 0,
          `${engine}/${width}: focal annotation off`,
        );
        await page
          .getByRole('checkbox', { name: 'Show the authored focal point' })
          .check();
        await page
          .getByRole('button', { name: 'Inspect relationships', exact: true })
          .click();
        for (const scenario of ['390', '834', '960']) {
          await page
            .getByLabel('Layout viewport', { exact: true })
            .selectOption(scenario);
          await page.getByLabel('Inspect layout region').selectOption('image');
          await page.waitForTimeout(100);
          check(
            (await page
              .locator('[data-wireframe-node="image"]')
              .getAttribute('aria-pressed')) === 'true',
            `${engine}/${width}/${scenario}: select current image geometry`,
          );
        }
        const regionIdentity = await page
          .locator('[data-wireframe-node]')
          .evaluateAll((nodes) =>
            nodes.map((g) => ({
              id: g.dataset.wireframeNode,
              label: g.querySelector('text').textContent.trim(),
              option: [
                ...document.querySelector(
                  'select[aria-label="Inspect layout region"]',
                ).options,
              ]
                .find((o) => o.value === g.dataset.wireframeNode)
                ?.textContent.trim()
                .slice(0, 2),
            })),
          );
        check(
          regionIdentity.every((n) => n.label === n.option),
          `${engine}/${width}: semantic region numbers agree across overlay and selector`,
          regionIdentity,
        );
        const badges = await page
          .locator('[data-wireframe-node]')
          .evaluateAll((nodes) =>
            nodes.map((g) => ({
              id: g.dataset.wireframeNode,
              badge: g.querySelector('path').getBoundingClientRect().right,
              content: g.querySelector('rect').getBoundingClientRect().left,
            })),
          );
        check(
          badges.every((b) => b.badge <= b.content - 4),
          `${engine}/${width}: geometry badges stay outside semantic regions`,
          badges,
        );
        if (width > 800) {
          const detailsBox = await page
            .locator('[data-layout-details]')
            .boundingBox();
          const previewBox = await page
            .locator('[data-layout-preview]')
            .boundingBox();
          check(
            detailsBox.x >= previewBox.x + previewBox.width &&
              detailsBox.y < previewBox.y + previewBox.height,
            `${engine}/${width}: inspector remains beside current composition`,
            { detailsBox, previewBox },
          );
        }
        await page
          .getByLabel('Layout viewport', { exact: true })
          .selectOption('390');
        await page.getByText('Edit the real headline', { exact: true }).click();
        const editedHeadline =
          'A longer field note\nabout ordinary objects\nand the extraordinary stories\nwe keep finding inside them.';
        await page
          .getByRole('textbox', { name: 'Story headline', exact: true })
          .fill(editedHeadline);
        await page.waitForTimeout(100);
        const fit = await page
          .locator('[data-design-node="title"]')
          .evaluate((el) => ({
            scroll: el.scrollHeight,
            client: el.clientHeight,
            text: el.innerText,
          }));
        check(
          fit.scroll <= fit.client + 1,
          `${engine}/${width}: changed headline fits its recomputed region`,
          fit,
        );
        if (capture) {
          await page
            .getByLabel('Inspect layout region')
            .scrollIntoViewIfNeeded();
          await page.screenshot({
            path: `${output}/${engine}-${width}-inspection.png`,
          });
        }
        const exported = page.waitForEvent('download');
        await page
          .getByRole('button', {
            name: 'Export inputs + receipt ↓',
            exact: true,
          })
          .click();
        const file = await exported;
        const payload = JSON.parse(await readFile(await file.path(), 'utf8'));
        check(
          payload.receipt.maxError <= 1,
          `${engine}/${width}: exported current DOM matches proposal`,
          {
            maxError: payload.receipt.maxError,
            screen: payload.receipt.screen,
          },
        );
        check(
          payload.content.title === editedHeadline &&
            payload.receipt.content.title === editedHeadline,
          `${engine}/${width}: receipt binds edited content`,
        );
        check(
          payload.receipt.nodes.every(
            (n) => n.box.y + n.box.height <= payload.receipt.screen.height + 1,
          ),
          `${engine}/${width}: content growth extends the authored canvas`,
        );
        const drawing = page.waitForEvent('download');
        await page
          .getByRole('button', { name: 'Drawing.svg ↓', exact: true })
          .click();
        check(
          (await readFile(await (await drawing).path(), 'utf8')).includes(
            '<svg',
          ),
          `${engine}/${width}: drawing export`,
        );
        await page
          .getByRole('slider', { name: 'Motion damping', exact: true })
          .focus();
        await page.keyboard.press('End');
        await page
          .getByRole('slider', { name: 'Material roughness', exact: true })
          .focus();
        await page.keyboard.press('End');
        await page
          .getByRole('slider', { name: 'Layout gutter', exact: true })
          .focus();
        await page.keyboard.press('End');
        await page
          .getByRole('button', { name: 'Keep this direction', exact: false })
          .click();
        await page
          .getByRole('textbox', { name: 'Story headline', exact: true })
          .fill('Temporary alternate');
        await page
          .getByRole('slider', { name: 'Motion damping', exact: true })
          .focus();
        await page.keyboard.press('Home');
        await page
          .getByRole('slider', { name: 'Layout gutter', exact: true })
          .focus();
        await page.keyboard.press('Home');
        await page.getByRole('button', { name: /^Replay / }).click();
        check(
          (await page
            .getByRole('slider', { name: 'Motion damping', exact: true })
            .inputValue()) === '35' &&
            (await page
              .getByRole('slider', { name: 'Layout gutter', exact: true })
              .inputValue()) === '64',
          `${engine}/${width}: edited motion and layout replay`,
        );
        check(
          (await page
            .getByRole('textbox', { name: 'Story headline', exact: true })
            .inputValue()) === editedHeadline,
          `${engine}/${width}: replay restores real content`,
        );
        for (const button of await page.locator('[data-workflow-step]').all()) {
          await button.click();
          check(
            (await button.getAttribute('aria-pressed')) === 'true',
            `${engine}/${width}: workflow step`,
          );
        }
        const download = page.waitForEvent('download');
        await page
          .getByRole('button', { name: 'Download motion.json ↓', exact: true })
          .click();
        const motion = JSON.parse(
          await readFile(await (await download).path(), 'utf8'),
        );
        check(
          motion.spring.damping === 35,
          `${engine}/${width}: motion export reflects edits`,
        );
        await page
          .getByRole('button', { name: 'Copy CLI command ↗', exact: true })
          .click();
        await page.waitForTimeout(100);
        check(
          (await page
            .getByRole('button', { name: 'Command copied ✓', exact: true })
            .count()) === 1 ||
            (await page
              .getByText(
                'Clipboard access is unavailable. Select and copy the command below.',
                { exact: true },
              )
              .count()) === 1,
          `${engine}/${width}: copy action succeeds or offers explicit selectable fallback`,
        );
        await page
          .getByRole('button', { name: 'Change direction', exact: false })
          .click();
        await page.locator('[data-enable-tilt]').click();
        const anchors = await page
          .locator('a[href^="#"]')
          .evaluateAll((nodes) =>
            nodes.map((n) => ({
              href: n.getAttribute('href'),
              valid:
                n.getAttribute('href') === '#' ||
                !!document.getElementById(n.getAttribute('href').slice(1)),
            })),
          );
        check(
          anchors.every((a) => a.valid),
          `${engine}/${width}: internal destinations exist`,
          anchors,
        );
        const study = page.getByRole('group', { name: 'Choose a material' });
        for (const name of ['Paper', 'Enamel', 'Brushed metal', 'Soft glass']) {
          const button = study.getByRole('button', { name, exact: true });
          await button.click();
          check(
            (await button.getAttribute('aria-pressed')) === 'true',
            `${engine}/${width}: DOM material ${name}`,
          );
        }
        for (const name of [
          'Light from left',
          'Light from right',
          'Follow pointer',
        ]) {
          const button = page.getByRole('button', { name, exact: true });
          await button.click();
          check(
            (await button.getAttribute('aria-pressed')) === 'true',
            `${engine}/${width}: ${name} retarget control`,
          );
        }
        await page
          .getByRole('button', { name: 'Keep this direction', exact: false })
          .click();
        await study.getByRole('button', { name: 'Paper', exact: true }).click();
        await page.getByRole('button', { name: /^Replay / }).click();
        check(
          (await study
            .getByRole('button', { name: 'Soft glass', exact: true })
            .getAttribute('aria-pressed')) === 'true',
          `${engine}/${width}: replay restores selected DOM finish`,
        );
        const surface = page.locator('.dom-study-card');
        await surface.scrollIntoViewIfNeeded();
        const surfaceBox = await surface.boundingBox();
        await page.mouse.move(
          surfaceBox.x + surfaceBox.width * 0.2,
          surfaceBox.y + surfaceBox.height * 0.3,
        );
        await page.waitForTimeout(200);
        if (capture)
          await page.screenshot({
            path: `${output}/${engine}-${width}-dom-light-left.png`,
          });
        await page.mouse.move(
          surfaceBox.x + surfaceBox.width * 0.8,
          surfaceBox.y + surfaceBox.height * 0.7,
        );
        await page.waitForTimeout(250);
        if (capture)
          await page.screenshot({
            path: `${output}/${engine}-${width}-dom-light-right.png`,
          });
        check(
          (await page.locator('[data-field-session]').count()) === 0 &&
            (await page.locator('[data-field-summary]').count()) === 1,
          `${engine}/${width}: gallery has compact evidence without duplicate field composition`,
        );
        await page
          .getByRole('link', { name: 'Open the design field', exact: false })
          .first()
          .click();
        await page.locator('[data-field-session]').waitFor();
        await page.evaluate(() => document.fonts.ready);
        if (capture)
          await page.screenshot({
            path: `${output}/${engine}-${width}-field-landing.png`,
          });
        check(
          new URL(page.url()).pathname.endsWith('/field/'),
          `${engine}/${width}: field opens as separate workspace`,
        );
        const field = page.locator('[data-field-session]');
        for (const name of ['Phone', 'iPad', 'Desktop', 'Phone · 2× text']) {
          const button = field.getByRole('button', { name, exact: true });
          await button.click();
          check(
            (await button.getAttribute('aria-pressed')) === 'true',
            `${engine}/${width}: field scenario ${name}`,
          );
        }
        await field
          .getByText('Inspect relationships, costs and saved evidence', {
            exact: true,
          })
          .click();
        const alternative = field.getByRole('combobox', {
          name: 'Retained reading alternative',
        });
        const readingLabels = await alternative
          .locator('option')
          .allTextContents();
        check(
          readingLabels.every(
            (label) =>
              label.includes('title') &&
              label.includes('body') &&
              label.includes('leading') &&
              !label.includes('preference cost'),
          ),
          `${engine}/${width}: reading labels expose outcomes rather than cost`,
        );
        const original = await alternative.inputValue();
        await alternative.selectOption(original === '0' ? '1' : '0');
        check(
          (
            await field.locator('[data-field-evidence-status]').textContent()
          ).includes('stale'),
          `${engine}/${width}: conditioning invalidation`,
        );
        await field
          .getByRole('button', { name: '2 · Image & finish', exact: true })
          .click();
        await field
          .getByRole('button', { name: 'Show image & finish', exact: true })
          .click();
        const consequence = await field
          .locator('[data-field-media]')
          .evaluate((el) => {
            const r = el.getBoundingClientRect(),
              p = el.closest('[data-field-preview]').getBoundingClientRect();
            return {
              visibleHeight: Math.max(
                0,
                Math.min(r.bottom, p.bottom) - Math.max(r.top, p.top),
              ),
              height: r.height,
            };
          });
        check(
          consequence.visibleHeight >= Math.min(consequence.height, 100),
          `${engine}/${width}: phone 2× expression consequences are reachable`,
          consequence,
        );
        check(
          (await field.locator('[data-field-relationships] table').count()) ===
            0,
          `${engine}/${width}: relationships use readable records`,
        );
        await field
          .getByRole('button', { name: 'Show type & action', exact: true })
          .click();
        await field
          .getByRole('button', { name: 'Show image & finish', exact: true })
          .click();
        if (capture) {
          await field.locator('[data-field-preview]').scrollIntoViewIfNeeded();
          await page.screenshot({
            path: `${output}/${engine}-${width}-field-consequence.png`,
          });
        }
        const expression = field.getByRole('combobox', {
          name: 'Retained expression alternative',
        });
        const expressionLabels = await expression
          .locator('option')
          .allTextContents();
        check(
          expressionLabels.every(
            (label) =>
              label.includes('image') &&
              label.includes('finish') &&
              !label.includes('preference cost'),
          ),
          `${engine}/${width}: expression labels expose outcomes rather than cost`,
        );
        await expression.selectOption(
          (await expression.inputValue()) === '0' ? '1' : '0',
        );
        await field
          .getByRole('button', { name: 'Restore saved choice', exact: true })
          .click();
        check(
          (
            await field.locator('[data-field-evidence-status]').textContent()
          ).includes('Saved choice:'),
          `${engine}/${width}: restore exact field choice`,
        );
        const choiceDownload = page.waitForEvent('download');
        await field
          .getByRole('button', { name: 'Export current choice', exact: true })
          .click();
        const choice = JSON.parse(
          await readFile(await (await choiceDownload).path(), 'utf8'),
        );
        check(
          choice.status === 'saved-choice-copy' && choice.neuralCalls === 0,
          `${engine}/${width}: current comparison export records no live inference`,
          choice,
        );
        await field
          .getByText('Actual call ledger, source identity and replay', {
            exact: true,
          })
          .click();
        const evidenceDownload = page.waitForEvent('download');
        await field
          .getByRole('button', { name: 'Export saved evidence', exact: true })
          .click();
        const evidence = JSON.parse(
          await readFile(await (await evidenceDownload).path(), 'utf8'),
        );
        check(
          evidence.selection.neuralCalls === 2,
          `${engine}/${width}: saved field evidence retains two real selector calls`,
          { identity: evidence.identity, selection: evidence.selection },
        );
        const fieldAssets = await field
          .locator('[data-field-preview] img')
          .evaluateAll((images) =>
            images.every((img) => img.complete && img.naturalWidth > 0),
          );
        check(
          fieldAssets,
          `${engine}/${width}: standalone field image assets load`,
        );
        await page.locator('[data-field-return]').click();
        await page.waitForFunction(() => window.__DESIGN_THEORY__?.ready);
        check(
          (await page.locator('[data-field-summary]').count()) === 1 &&
            (await page.locator('[data-field-session]').count()) === 0,
          `${engine}/${width}: return link restores main gallery`,
        );
        await page.goBack();
        await page.locator('[data-field-session]').waitFor();
        await page.goForward();
        await page.waitForFunction(() => window.__DESIGN_THEORY__?.ready);
        check(
          (await page.locator('[data-field-summary]').count()) === 1,
          `${engine}/${width}: browser back and forward preserve route destinations`,
        );
        if (capture)
          await page.screenshot({
            path: `${output}/${engine}-${width}-final.png`,
            fullPage: true,
          });
        report.runtime.push({
          engine,
          width,
          surfaces: await page.evaluate(
            () => window.__DESIGN_THEORY__.runtime.stats.surfaces,
          ),
        });
        if (capture)
          await context.tracing.stop({
            path: `${output}/${engine}-${width}-trace.zip`,
          });
        await context.close();
      }
      // Deliberately unavailable worker: default remains static; only the visible
      // user action may initialize the expensive main-thread renderer.
      const fallbackContext = await browser.newContext({
        viewport: { width: 320, height: 900 },
        reducedMotion: 'reduce',
      });
      await fallbackContext.addInitScript(() => {
        window.Worker = undefined;
      });
      const fallbackPage = await fallbackContext.newPage();
      await fallbackPage.goto(`http://127.0.0.1:${server.address().port}/`);
      const hero = fallbackPage.locator('[data-surface="material"]');
      await fallbackPage.locator('[data-activate-3d="material"]').click();
      await fallbackPage
        .locator('[data-load-3d="material"]')
        .waitFor({ state: 'visible' });
      check(
        (await hero.getAttribute('data-renderer')) === 'static',
        `${engine}/320: worker failure stays static until requested`,
      );
      await hero.scrollIntoViewIfNeeded();
      const before = await hero.screenshot({
        path: `${output}/${engine}-320-static-fallback.png`,
      });
      await fallbackPage.locator('[data-load-3d="material"]').click();
      await fallbackPage.waitForFunction(
        () =>
          document.querySelector('[data-surface="material"]').dataset
            .renderer === 'main',
        {},
        { timeout: 30000 },
      );
      await fallbackPage.waitForTimeout(150);
      const after = await hero.screenshot({
        path: `${output}/${engine}-320-explicit-main.png`,
      });
      const pixels = await fallbackPage.evaluate(
        async ({ before, after }) => {
          const decode = async (png) => {
            const image = new Image();
            image.src = `data:image/png;base64,${png}`;
            await image.decode();
            const canvas = document.createElement('canvas');
            canvas.width = image.width;
            canvas.height = image.height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(image, 0, 0);
            return ctx.getImageData(0, 0, canvas.width, canvas.height).data;
          };
          const a = await decode(before),
            b = await decode(after),
            colors = new Set();
          let changed = 0,
            total = 0;
          for (let i = 0; i < Math.min(a.length, b.length); i += 16) {
            total++;
            if (
              Math.hypot(
                a[i] - b[i],
                a[i + 1] - b[i + 1],
                a[i + 2] - b[i + 2],
              ) > 30
            )
              changed++;
            colors.add(`${b[i] >> 3}/${b[i + 1] >> 3}/${b[i + 2] >> 3}`);
          }
          return { changedFraction: changed / total, colors: colors.size };
        },
        { before: before.toString('base64'), after: after.toString('base64') },
      );
      check(
        pixels.changedFraction > 0.04 && pixels.colors > 60,
        `${engine}/320: explicit fallback paints actual 3D pixels`,
        pixels,
      );
      const lostContext = await hero.evaluate((el) => {
        const canvas = el.querySelector('canvas');
        const context = canvas?.getContext('webgl2');
        const extension = context?.getExtension('WEBGL_lose_context');
        if (!extension) return false;
        extension.loseContext();
        return true;
      });
      if (lostContext) {
        await fallbackPage
          .locator('[data-load-3d="material"]')
          .waitFor({ state: 'visible' });
        check(
          (await hero.getAttribute('data-renderer')) === 'static',
          `${engine}/320: context loss exposes explicit retry`,
        );
        await fallbackPage.locator('[data-load-3d="material"]').click();
        await fallbackPage.waitForFunction(
          () =>
            document.querySelector('[data-surface="material"]').dataset
              .renderer === 'main',
          {},
          { timeout: 30000 },
        );
        check(
          true,
          `${engine}/320: explicit context-loss retry restores renderer`,
        );
      }
      check(
        await fallbackPage.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
        `${engine}/320: reflow without horizontal page overflow`,
      );
      const registration = fallbackPage.locator('[data-registration-band]');
      await registration.scrollIntoViewIfNeeded();
      await fallbackPage.waitForTimeout(100);
      const transform = await registration
        .locator('[aria-hidden="true"]')
        .evaluate((el) => getComputedStyle(el).transform);
      check(
        transform === 'matrix(1, 0, 0, 1, 0, 0)' || transform === 'none',
        `${engine}/320: reduced-motion registration is static`,
        transform,
      );
      await fallbackContext.close();
    } finally {
      await browser.close();
    }
  }
} catch (error) {
  report.errors.push({ kind: 'harness-exception', message: String(error) });
} finally {
  server.close();
  await writeFile(`${output}/report.json`, JSON.stringify(report, null, 2));
}
console.log(
  JSON.stringify(
    {
      output,
      scenarios: report.scenarios.map(({ samples, ...s }) => s),
      errors: report.errors,
    },
    null,
    2,
  ),
);
if (report.errors.length) process.exitCode = 1;
