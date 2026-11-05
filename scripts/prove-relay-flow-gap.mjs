import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { chromium, webkit } from 'playwright';
import http from 'node:http';
import path from 'node:path';
import {
  snapshotVerificationSources,
  verificationSourceFields,
} from './verification-sources.mjs';
import { initialState, namespace } from '../examples/relay/app/src/model.mjs';

// Serve the immutable current Expo export before invoking this proof. This is
// renderer evidence, independent of the projection's own feasibility claim.
const before = snapshotVerificationSources(process.cwd());
const directory = path.resolve('artifacts/relay-integration/static');
const server = http.createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(
      new URL(request.url, 'http://localhost').pathname,
    );
    const file = path.resolve(
      directory,
      '.' + (path.extname(pathname) ? pathname : '/index.html'),
    );
    if (!file.startsWith(directory + path.sep)) throw Error('Outside preview');
    const bytes = await readFile(file);
    response.setHeader(
      'content-type',
      {
        '.html': 'text/html',
        '.js': 'text/javascript',
        '.css': 'text/css',
        '.ttf': 'font/ttf',
        '.png': 'image/png',
        '.svg': 'image/svg+xml',
      }[path.extname(file)] ?? 'application/octet-stream',
    );
    response.end(bytes);
  } catch {
    response.writeHead(404).end();
  }
});
const output =
  process.env.RELAY_GAP_OUTPUT ?? 'artifacts/relay-attention/flow-gap-proof';
await mkdir(output, { recursive: true });
const fixture = JSON.parse(
  await readFile('experiments/relay/shared/fixtures.json', 'utf8'),
);
const expected = JSON.parse(
  await readFile('artifacts/relay-integration/static-receipt.json', 'utf8'),
);
assert.equal(expected.passed, true);
assert.equal(
  expected.sourceIdentity,
  verificationSourceFields(before, before).sourceIdentity,
  'Export current sources first',
);
await new Promise((resolve, reject) => {
  server.once('error', reject);
  server.listen(0, '127.0.0.1', resolve);
});
const url =
  process.env.RELAY_PREVIEW_URL ?? `http://127.0.0.1:${server.address().port}`;
const report = {
  sourceIdentity: expected.sourceIdentity,
  url,
  scope:
    'Actual Chromium/WebKit host geometry, resize, initial-scroll protection, stationary reduced-motion observation counters and explicit manual/infeasible states. No native, occlusion, preference or performance inference.',
  cells: [],
  failures: [],
};
const current = (page) =>
  page.evaluate(() => {
    const capture = globalThis.__RELAY_CAPTURE__?.();
    const gap = capture?.layout?.find((r) => r.id === 'relay-content-gap');
    const node = document.querySelector('[data-testid="relay-content-flow"]');
    const frame = document.querySelector('[data-testid="relay-task-viewport"]');
    const action = document.querySelector('[data-testid="diagnose-checkout"]');
    return {
      gap,
      sourceIdentity: capture?.sourceIdentity,
      actualGap: node ? Number.parseFloat(getComputedStyle(node).rowGap) : null,
      scrollTop: frame?.scrollTop,
      frame: frame?.getBoundingClientRect().toJSON(),
      action: action?.getBoundingClientRect().toJSON(),
      overflow: document.documentElement.scrollWidth > innerWidth,
    };
  });
async function settled(page, phase) {
  await page.waitForFunction(
    (phase) =>
      globalThis
        .__RELAY_CAPTURE__?.()
        ?.layout?.some(
          (r) => r.id === 'relay-content-gap' && r.phase === phase,
        ),
    phase,
  );
  // Observe stability across multiple frames, not merely the first fit callback.
  await page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      ),
  );
  return current(page);
}
try {
  for (const engine of [chromium, webkit]) {
    const browser = await engine.launch();
    try {
      for (const scenario of [
        { id: 'responsive', width: 844, height: 312, scale: 1.5 },
        { id: 'manual', width: 844, height: 312, scale: 1.5, fixed: true },
        { id: 'infeasible', width: 844, height: 280, scale: 1.5 },
        { id: 'phone', width: 390, height: 844, scale: 1 },
        {
          id: 'ipad-copy',
          width: 834,
          height: 1194,
          scale: 1.5,
          longText: true,
        },
        { id: 'desktop', width: 1440, height: 1000, scale: 1 },
      ]) {
        const context = await browser.newContext({
          viewport: { width: scenario.width, height: scenario.height },
          reducedMotion: 'reduce',
        });
        const cell = {
          engine: engine.name(),
          scenario,
          passed: false,
          samples: [],
        };
        report.cells.push(cell);
        try {
          const page = await context.newPage(),
            errors = [];
          page.on('pageerror', (error) => errors.push(error.message));
          const state = initialState(fixture);
          Object.assign(state.preferences, {
            overviewVariant: 'response-action',
            textScale: scenario.scale,
            reducedMotion: 'reduce',
            longText: !!scenario.longText,
            responseSpacing: scenario.fixed ? 'fixed' : 'adaptive',
          });
          await page.addInitScript(
            ({ namespace, state }) =>
              localStorage.setItem(namespace, JSON.stringify(state)),
            { namespace, state },
          );
          await page.goto(url);
          const phase = scenario.fixed
            ? 'manual'
            : scenario.id === 'infeasible'
              ? 'needs-scroll'
              : 'measured-fit';
          const first = await settled(page, phase);
          cell.samples.push({ name: 'initial', ...first });
          assert.equal(first.sourceIdentity, expected.sourceIdentity);
          assert.equal(first.overflow, false);
          assert.equal(first.actualGap, first.gap.appliedGap);
          if (phase === 'measured-fit') {
            assert.equal(first.gap.measuredFit, true);
            assert.ok(first.action.bottom <= first.frame.bottom - 4);
            assert.ok(first.action.height >= 44);
          }
          if (scenario.id === 'manual') {
            assert.equal(first.actualGap, 20);
            assert.equal(first.gap.measuredFit, false);
          }
          if (scenario.id === 'infeasible')
            assert.equal(first.gap.exposure.gapProjection.status, 'infeasible');
          if (scenario.id === 'responsive') {
            assert.equal(first.actualGap, 12);
            await page.waitForTimeout(350);
            const idle = await current(page);
            assert.equal(
              idle.gap.observations,
              first.gap.observations,
              'No idle measurement loop',
            );
            assert.equal(idle.gap.observedAt, first.gap.observedAt);
            const immediate = await page.evaluate(() => {
              document.querySelector(
                '[data-testid="relay-task-viewport"]',
              ).scrollTop = 180;
              return globalThis
                .__RELAY_CAPTURE__()
                .layout.find((r) => r.id === 'relay-content-gap').phase;
            });
            assert.equal(
              immediate,
              'not-initial-position',
              'A synchronous capture cannot retain a fit claim after scrolling',
            );
            await settled(page, 'not-initial-position');
            await page.setViewportSize({ width: 844, height: 328 });
            const held = await settled(page, 'not-initial-position');
            cell.samples.push({ name: 'scrolled-resize', ...held });
            assert.equal(held.actualGap, 12);
            assert.equal(held.scrollTop, 180);
            await page.evaluate(() => {
              document.querySelector(
                '[data-testid="relay-task-viewport"]',
              ).scrollTop = 0;
            });
            const restored = await settled(page, 'measured-fit');
            cell.samples.push({ name: 'return-to-start', ...restored });
            assert.equal(restored.actualGap, 20);
            await page.setViewportSize({ width: 844, height: 312 });
            const shrunk = await settled(page, 'measured-fit');
            cell.samples.push({ name: 'shrink-again', ...shrunk });
            assert.equal(shrunk.actualGap, 12);
          }
          assert.deepEqual(errors, []);
          cell.passed = true;
        } catch (error) {
          cell.failure = String(error);
          report.failures.push({
            engine: engine.name(),
            scenario: scenario.id,
            error: String(error),
          });
        } finally {
          await context.close();
        }
      }
    } finally {
      await browser.close();
    }
  }
} catch (error) {
  report.failures.push({
    engine: 'proof',
    scenario: 'bootstrap-or-cleanup',
    error: String(error),
  });
} finally {
  await new Promise((resolve) => server.close(resolve));
}
Object.assign(
  report,
  verificationSourceFields(before, snapshotVerificationSources(process.cwd())),
);
report.passed = report.failures.length === 0 && report.sourceStable;
await writeFile(`${output}/report.json`, JSON.stringify(report, null, 2));
console.log(
  JSON.stringify({
    passed: report.passed,
    cells: report.cells.length,
    failures: report.failures,
  }),
);
assert.equal(report.passed, true);
