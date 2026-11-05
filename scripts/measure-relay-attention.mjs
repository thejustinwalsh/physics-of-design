import assert from 'node:assert/strict';
import http from 'node:http';
import path from 'node:path';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { chromium, webkit } from 'playwright';
import { analyzeComposition } from '../dist/composition.js';
import { hash } from '../dist/identity.js';
import {
  snapshotVerificationSources,
  verificationSourceFields,
} from './verification-sources.mjs';
import { initialState, namespace } from '../examples/relay/app/src/model.mjs';
import { overviewVariants } from '../examples/relay/app/src/design/attention-policy.mjs';
const root = process.cwd(),
  before = snapshotVerificationSources(root);
const source = verificationSourceFields(before, before).sourceIdentity;
const directory = path.resolve('artifacts/relay-integration/static');
const output = path.resolve(
  process.env.DESIGN_ATTENTION_OUTPUT ??
    `artifacts/relay-attention/matrix-${source.slice(0, 12)}`,
);
await mkdir(output, { recursive: true });
const fixture = JSON.parse(
  await readFile('experiments/relay/shared/fixtures.json', 'utf8'),
);
const exported = JSON.parse(
  await readFile('artifacts/relay-integration/static-receipt.json', 'utf8'),
);
assert.equal(exported.passed, true);
assert.equal(
  exported.sourceIdentity,
  source,
  'Produce current static export before measurement',
);
const scenarios = [
  { id: 'small-phone', width: 320, height: 740, scale: 1 },
  { id: 'phone', width: 390, height: 844, scale: 1 },
  { id: 'phone-large', width: 390, height: 844, scale: 1.5 },
  { id: 'phone-copy', width: 390, height: 844, scale: 1, longText: true },
  { id: 'ipad', width: 834, height: 1194, scale: 1 },
  { id: 'ipad-large', width: 834, height: 1194, scale: 1.5 },
  { id: 'desktop', width: 1440, height: 1000, scale: 1 },
  { id: 'short-landscape', width: 844, height: 320, scale: 1.5 },
];
const report = {
  version: 1,
  startedAt: new Date().toISOString(),
  sourceIdentity: source,
  scope:
    'Actual compiled Relay Chromium/WebKit flex layouts and geometric task-frame exposure. Reduced-motion measurement matrix; no gaze, occlusion, native, human preference or motion-performance inference.',
  scenarios,
  variants: overviewVariants,
  cells: [],
  failures: [],
};
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    const pathname = decodeURIComponent(url.pathname);
    const file = path.resolve(
      directory,
      '.' + (!path.extname(pathname) ? '/index.html' : pathname),
    );
    if (!file.startsWith(directory + path.sep))
      throw Error('Outside static root');
    const bytes = await readFile(file);
    res.setHeader(
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
    res.end(bytes);
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise((resolve, reject) => {
  server.once('error', reject);
  server.listen(0, '127.0.0.1', resolve);
});
const url = `http://127.0.0.1:${server.address().port}/overview`;
try {
  for (const engine of [chromium, webkit]) {
    const browser = await engine.launch({ headless: true });
    try {
      for (const scenario of scenarios) {
        const context = await browser.newContext({
          viewport: { width: scenario.width, height: scenario.height },
          reducedMotion: 'reduce',
        });
        try {
          for (const variant of overviewVariants) {
            const page = await context.newPage();
            const errors = [];
            page.on('pageerror', (error) => errors.push(error.message));
            const state = initialState(fixture);
            Object.assign(state.preferences, {
              overviewVariant: variant.id,
              textScale: scenario.scale,
              longText: !!scenario.longText,
              reducedMotion: 'reduce',
            });
            await page.addInitScript(
              ({ namespace, state }) =>
                localStorage.setItem(namespace, JSON.stringify(state)),
              { namespace, state },
            );
            try {
              await page.goto(url);
              await page.waitForFunction(
                ({ source, variant, width, height }) => {
                  const r = globalThis.__RELAY_CAPTURE__?.();
                  return (
                    r?.hydrated &&
                    r.fontLoaded &&
                    r.sourceIdentity === source &&
                    r.attentionChoice.id === variant &&
                    Math.abs(r.measuredRoot?.width - width) < 1 &&
                    Math.abs(r.measuredRoot?.height - height) < 1
                  );
                },
                {
                  source,
                  variant: variant.id,
                  width: scenario.width,
                  height: scenario.height,
                },
              );
              await page.evaluate(() => document.fonts.ready);
              const facts = await page.evaluate(() => {
                const ids = [
                  'relay-task-viewport',
                  'diagnose-checkout',
                  'relay-overview-summary',
                  'relay-overview-incident',
                  'relay-latency-chart',
                ];
                const boxes = Object.fromEntries(
                  ids.map((id) => {
                    const nodes = document.querySelectorAll(
                      `[data-testid="${id}"]`,
                    );
                    if (nodes.length !== 1)
                      throw Error(
                        `Expected one current ${id}, got ${nodes.length}`,
                      );
                    const r = nodes[0].getBoundingClientRect();
                    return [
                      id,
                      { x: r.x, y: r.y, width: r.width, height: r.height },
                    ];
                  }),
                );
                return {
                  boxes,
                  receipt: globalThis.__RELAY_CAPTURE__(),
                  scrollWidth: document.documentElement.scrollWidth,
                  clientWidth: document.documentElement.clientWidth,
                  text: document.querySelector(
                    '[data-testid="relay-overview-incident"]',
                  ).textContent,
                };
              });
              assert.equal(errors.length, 0, JSON.stringify(errors));
              assert.ok(facts.scrollWidth <= facts.clientWidth + 1);
              assert.equal(
                facts.receipt.preferences.longText,
                !!scenario.longText,
              );
              const frame = facts.boxes['relay-task-viewport'];
              assert.ok(frame.width > 0 && frame.height > 0);
              const rectangles = Object.entries(facts.boxes)
                .filter(([id]) => id !== 'relay-task-viewport')
                .map(([id, box]) => ({
                  id,
                  box: { ...box, x: box.x - frame.x, y: box.y - frame.y },
                }));
              const input = {
                viewport: { width: frame.width, height: frame.height },
                rectangles,
                exposureRules: [
                  {
                    id: 'initial-action',
                    member: 'diagnose-checkout',
                    minimumVisibleFraction: 1,
                    latestEndFraction: 0.65,
                    mode: 'preference',
                    source:
                      'Relay DESIGN.md task-priority experiment; authored target, not a universal standard',
                  },
                ],
                context: {
                  flow: 'column',
                  source: `${engine.name()} actual DOM rectangles; task scroll host, initial offset`,
                },
              };
              const analysis = analyzeComposition(input);
              const cell = {
                scenario: `${engine.name()}-${scenario.id}`,
                engine: engine.name(),
                input: scenario,
                variant: variant.id,
                sourceIdentity: source,
                contentIdentity: hash(facts.text),
                frame,
                rectangles,
                analysis,
                attentionChoice: facts.receipt.attentionChoice,
              };
              report.cells.push(cell);
              if (scenario.id === 'phone' || scenario.id === 'ipad')
                await page.screenshot({
                  path: path.join(output, `${cell.scenario}-${variant.id}.png`),
                });
            } catch (error) {
              report.failures.push({
                scenario: `${engine.name()}-${scenario.id}`,
                variant: variant.id,
                error: String(error.stack ?? error),
              });
              await page
                .screenshot({
                  path: path.join(
                    output,
                    `failed-${engine.name()}-${scenario.id}-${variant.id}.png`,
                  ),
                })
                .catch(() => {});
              throw error;
            } finally {
              await page.close();
            }
          }
        } finally {
          await context.close();
        }
      }
    } finally {
      await browser.close();
    }
  }
} finally {
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
  Object.assign(
    report,
    verificationSourceFields(before, snapshotVerificationSources(root)),
  );
  report.passed =
    report.failures.length === 0 &&
    report.cells.length === scenarios.length * overviewVariants.length * 2 &&
    report.sourceStable;
  report.identity = hash({
    source,
    scenarios,
    variants: overviewVariants,
    cells: report.cells,
  });
  report.completedAt = new Date().toISOString();
  await writeFile(
    path.join(output, 'report.json'),
    JSON.stringify(report, null, 2) + '\n',
  );
  console.log(
    JSON.stringify({
      passed: report.passed,
      cells: report.cells.length,
      sourceStable: report.sourceStable,
      identity: report.identity,
      output,
      failures: report.failures,
    }),
  );
}
assert.equal(report.passed, true);
