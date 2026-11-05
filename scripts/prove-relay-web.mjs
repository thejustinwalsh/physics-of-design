import assert from 'node:assert/strict';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { chromium, webkit } from 'playwright';
import {
  resolveRelayFrame,
  inspectRelayFrame,
} from '../examples/relay/app/src/design/layout-policy.mjs';
import {
  snapshotVerificationSources,
  verificationSourceFields,
} from './verification-sources.mjs';

/** Current-product renderer proof. Regression flow adapted from the retained
 * Sol script; root added current explicit capture, isolated static serving,
 * source binding, actual-element lifecycle and cross-size/task coverage.
 * This is execution evidence, not independent design or human preference.
 */
export async function proveRelayWeb() {
  const output = path.resolve('artifacts/relay-integration/web');
  const directory = path.resolve('artifacts/relay-integration/static');
  await mkdir(output, { recursive: true });
  const before = snapshotVerificationSources(process.cwd());
  const source = verificationSourceFields(before, before).sourceIdentity;
  const exported = JSON.parse(
    await readFile('artifacts/relay-integration/static-receipt.json', 'utf8'),
  );
  assert.equal(exported.passed, true);
  assert.equal(
    exported.sourceIdentity,
    source,
    'Run the current static producer before its browser proof',
  );
  const report = {
    version: 1,
    recordedAt: new Date().toISOString(),
    sourceIdentity: source,
    scope:
      'Current Expo web export, actual Chromium/WebKit product interactions and geometry. No native execution, physical Safari, human preference or token advantage claim.',
    scenarios: [],
    failures: [],
  };
  const server = http.createServer(async (request, response) => {
    try {
      const pathname = decodeURIComponent(
        new URL(request.url, 'http://localhost').pathname,
      );
      const file = path.resolve(
        directory,
        '.' +
          (pathname === '/' || !path.extname(pathname)
            ? '/index.html'
            : pathname),
      );
      if (!file.startsWith(directory + path.sep)) throw Error('outside root');
      const bytes = await readFile(file);
      response.setHeader(
        'content-type',
        {
          '.html': 'text/html',
          '.js': 'text/javascript',
          '.css': 'text/css',
          '.ttf': 'font/ttf',
          '.png': 'image/png',
          '.json': 'application/json',
        }[path.extname(file)] ?? 'application/octet-stream',
      );
      response.end(bytes);
    } catch {
      response.writeHead(404).end();
    }
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const url = `http://127.0.0.1:${server.address().port}`;
  try {
    for (const engine of [chromium, webkit]) {
      const browser = await engine.launch({ headless: true });
      try {
        for (const [form, width, height] of [
          ['desktop', 1440, 1000],
          ['phone', 390, 844],
          ['ipad', 834, 1194],
        ]) {
          const context = await browser.newContext({
            viewport: { width, height },
            reducedMotion: 'no-preference',
          });
          const page = await context.newPage();
          page.setDefaultTimeout(15000);
          const errors = [],
            steps = [];
          const scenario = {
            id: `${engine.name()}-${form}`,
            steps,
            errors,
            snapshots: [],
          };
          report.scenarios.push(scenario);
          page.on('pageerror', (error) => errors.push(error.message));
          const click = async (id) => {
            if (id.startsWith('nav-') && !(await page.getByTestId(id).count()))
              await page.getByTestId('nav-menu').click();
            await page.getByTestId(id).click();
          };
          const fill = (id, value) => page.getByTestId(id).fill(value);
          const capture = async () => {
            await page.waitForFunction(
              () =>
                typeof globalThis.__RELAY_CAPTURE__ === 'function' &&
                globalThis.__RELAY_CAPTURE__()?.hydrated &&
                globalThis.__RELAY_CAPTURE__()?.fontLoaded,
            );
            return page.evaluate(() => globalThis.__RELAY_CAPTURE__());
          };
          async function snap(name, screen = true) {
            const receipt = await capture();
            assert.equal(receipt.sourceIdentity, source);
            const geometry = await page.evaluate(() => ({
              scrollWidth: document.documentElement.scrollWidth,
              width: innerWidth,
              overflow: Array.from(
                document.querySelectorAll('button,input,textarea'),
              )
                .filter((element) => {
                  const box = element.getBoundingClientRect();
                  return (
                    box.width > 0 &&
                    (box.left < -0.5 || box.right > innerWidth + 0.5)
                  );
                })
                .map((element) => ({
                  id: element.getAttribute('data-testid'),
                  rect: element.getBoundingClientRect().toJSON(),
                })),
            }));
            const file = `${scenario.id}-${name}`;
            await writeFile(
              path.join(output, file + '.json'),
              JSON.stringify({ receipt, geometry, errors }, null, 2),
            );
            if (screen)
              await page.screenshot({ path: path.join(output, file + '.png') });
            scenario.snapshots.push({
              name,
              file: file + '.json',
              screenshot: screen ? file + '.png' : null,
            });
            return { receipt, geometry };
          }
          async function step(name, run) {
            const started = performance.now();
            try {
              const result = await run();
              steps.push({
                name,
                status: 'passed',
                ms: performance.now() - started,
                result: result ?? null,
              });
            } catch (error) {
              steps.push({
                name,
                status: 'failed',
                ms: performance.now() - started,
                error: String(error),
              });
              await snap('failed-' + name.replaceAll(/[^a-z0-9]/gi, '-'));
              throw error;
            }
          }
          async function choose(id, value) {
            await click(id);
            await click(id + '-option-' + value);
          }
          try {
            await page.goto(url);
            await page.getByTestId('diagnose-checkout').waitFor();

            await step(
              'live inspection follows actual target and leaves workspace usable',
              async () => {
                await page.setViewportSize({ width: 1440, height: 1000 });
                await click('nav-overview');
                await click('inspect-open');
                await page.getByTestId('inspection-drawing').waitFor();
                await choose('inspection-surface', 'relay-latency-chart');
                const drawing = page.getByTestId('inspection-drawing');
                const compare = async () => {
                  await page.waitForFunction(() => {
                    const target = document.querySelector(
                      '[data-testid="relay-latency-chart"]',
                    );
                    const rectangle = document.querySelector(
                      '[data-testid="inspection-drawing"] rect',
                    );
                    return (
                      target &&
                      rectangle &&
                      Math.abs(
                        target.getBoundingClientRect().width -
                          Number(rectangle.getAttribute('width')),
                      ) < 0.02
                    );
                  });
                  const actual = await page
                    .getByTestId('relay-latency-chart')
                    .boundingBox();
                  const measured = await drawing
                    .locator('rect')
                    .first()
                    .evaluate((element) =>
                      Object.fromEntries(
                        ['x', 'y', 'width', 'height'].map((key) => [
                          key,
                          Number(element.getAttribute(key)),
                        ]),
                      ),
                    );
                  for (const key of ['x', 'y', 'width', 'height'])
                    assert.ok(
                      Math.abs(actual[key] - measured[key]) < 0.1,
                      `${key}: drawing must follow actual element`,
                    );
                  return { actual, measured };
                };
                const before = await compare();
                await page.setViewportSize({ width: 834, height: 1194 });
                const after = await compare();
                assert.notEqual(before.actual.width, after.actual.width);
                await page.getByTestId('inspection-close').click();
                assert.equal(await drawing.count(), 0);
                await page.setViewportSize({ width: 1440, height: 1000 });
                await page.evaluate(() => {
                  document.getElementById('root').style.width = '900px';
                });
                await page.waitForFunction(
                  () =>
                    globalThis.__RELAY_CAPTURE__()?.geometry.inputs.width ===
                    900,
                );
                const embedded = await capture();
                assert.equal(embedded.viewport.width, 1440);
                assert.equal(embedded.measuredRoot.width, 900);
                assert.equal(embedded.geometry.rendererRootObserved, true);
                await page.evaluate(() => {
                  document.getElementById('root').style.removeProperty('width');
                });
                await page.waitForFunction(
                  () =>
                    globalThis.__RELAY_CAPTURE__()?.geometry.inputs.width ===
                    1440,
                );
                await page.setViewportSize({ width: width, height: height });
                return { before, after, embeddedRoot: embedded.measuredRoot };
              },
            );
            await step('continuous chart pointer and keyboard', async () => {
              if (!(await page.getByTestId('range-60').count()))
                await click('phone-range');
              await click('range-60');
              const plot = page.getByTestId('relay-latency-chart-plot');
              const before = await plot.boundingBox();
              await page.mouse.move(
                before.x + before.width * 0.1,
                before.y + 30,
              );
              await page.mouse.down();
              for (let n = 2; n <= 9; n++)
                await page.mouse.move(
                  before.x + (before.width * n) / 10,
                  before.y + 30,
                  {
                    steps: 4,
                  },
                );
              await page.mouse.up();
              const { receipt } = await snap('pointer-cursor');
              assert.ok(receipt.context.bucket >= 44);
              const after = await plot.boundingBox();
              assert.equal(after.width, before.width);
              await page.getByTestId('relay-latency-chart-previous').focus();
              await page.keyboard.press('Enter');
              const r = (await snap('keyboard-cursor')).receipt;
              assert.ok(r.context.bucket < receipt.context.bucket);
              return { before, after, bucket: r.context.bucket };
            });
            await step('primary diagnosis and coordination', async () => {
              await click('diagnose-checkout');
              await click('service-incident-INC-1042');
              await choose('incident-owner', 'member-01');
              await click('incident-ack');
              await click('incident-investigate');
              await click('incident-trace-trace-000001');
              await click('span-span-4');
              assert.match(
                await page.getByTestId('selected-span').innerText(),
                /cache.pool.acquire.*1,?340/,
              );
              await snap('pool-span');
              await click('back');
              await fill(
                'incident-note',
                'Raised the demo inventory-cache pool limit; verifying recovery.',
              );
              await click('incident-note-add');
              await fill(
                'incident-resolution',
                'Synthetic mitigation verified; follow-up pool sizing review scheduled.',
              );
              await click('incident-resolve');
              const { receipt: r } = await snap('primary-resolved');
              assert.equal(r.activeCount, 21);
              assert.equal(r.unassignedCount, 9);
              assert.equal(r.primary.assigneeId, 'member-01');
              assert.equal(r.primary.status, 'resolved');
              assert.ok(r.primary.resolvedAt);
              assert.equal(r.alert001.status, 'healthy');
              assert.equal(r.alert001.incidentId, null);
              assert.equal(r.service001.p95Ms, 1850);
              for (const kind of [
                'assigned',
                'acknowledged',
                'investigating',
                'note',
                'resolved',
              ])
                assert.equal(
                  r.primary.timeline.filter((e) => e.kind === kind).length,
                  1,
                );
              return { active: r.activeCount, unassigned: r.unassignedCount };
            });
            await step('persistence and linked queue', async () => {
              await page.reload();
              const r = (await snap('reload')).receipt;
              assert.equal(r.primary.status, 'resolved');
              await click('nav-incidents');
              await fill('local-search', 'INC-1042');
              assert.match(
                await page.getByTestId('row-INC-1042').innerText(),
                /resolved/,
              );
              await snap('incident-queue');
            });
            await step('filter sort page select and saved views', async () => {
              await click('nav-services');
              await click('page-next');
              await click('select-page');
              await click('table-filters');
              await choose('sort-key', 'p95Ms');
              await choose('sort-direction', 'desc');
              await click('dialog-close');
              await click('save-view');
              await fill('view-name', 'Proof slow services');
              await click('view-save-confirm');
              let r = (await snap('services-selected-view')).receipt;
              assert.equal(r.tableState.services.selected.length, 15);
              const view = r.savedViews.find(
                (v) => v.name === 'Proof slow services',
              );
              assert.ok(view);
              await click('table-reset');
              await click('replay-' + view.id);
              assert.match(
                await page.locator('body').innerText(),
                /Sort: p95Ms desc/,
              );
              await click('delete-' + view.id);
              await fill('local-search', 'no matches for proof');
              await snap('empty');
              await click('empty-reset');
              await click('nav-traces');
              await fill('local-search', 'trace-000001');
              await click('open-trace-000001');
              await click('span-span-3');
              await snap('trace-route');
            });
            await step(
              'rule validation create edit cancel toggle evaluate',
              async () => {
                await click('nav-alerts');
                await click('new-alert');
                await fill('rule-name', '');
                await fill('rule-threshold', '-1');
                await click('rule-save');
                assert.match(
                  await page.locator('body').innerText(),
                  /greater than zero/,
                );
                await fill('rule-name', 'Proof weighted errors');
                await choose('rule-metric', 'errorRate');
                await fill('rule-threshold', '101');
                await click('rule-save');
                assert.match(
                  await page.locator('body').innerText(),
                  /between 0 and 100/,
                );
                await fill('rule-threshold', '2');
                await click('rule-save');
                await fill('local-search', 'Proof weighted errors');
                await snap('created-alert');
                const open = page.locator(
                  'button[data-testid^="open-local-alert-"]',
                );
                const ruleId = (await open.getAttribute('data-testid')).slice(
                  5,
                );
                await open.click();
                await fill('rule-name', 'Unsaved replacement');
                await click('rule-cancel');
                await fill('local-search', 'Proof weighted errors');
                assert.match(
                  await page.locator('body').innerText(),
                  /Proof weighted errors/,
                );
                await click('toggle-' + ruleId);
                assert.match(await page.locator('body').innerText(), /muted/);
                await click('evaluate-rules');
                await snap('evaluated-rules');
              },
            );
            await step('command keyboard focus restoration', async () => {
              await page.getByTestId('command-open').focus();
              await page.keyboard.press('Control+k');
              await fill('command-query', 'checkout-api');
              await page.keyboard.press('ArrowDown');
              await page.keyboard.press('ArrowUp');
              await page.keyboard.press('Enter');
              await page.getByTestId('relay-service-detail').waitFor();
              await click('command-open');
              await page.keyboard.press('Escape');
              assert.equal(
                await page.evaluate(() =>
                  document.activeElement?.getAttribute('data-testid'),
                ),
                'command-open',
              );
              await snap('command-restored');
            });
            await step(
              'settings recovery storage failure and export',
              async () => {
                await click('nav-settings');
                await choose('settings-theme', 'light');
                await choose('settings-density', 'compact');
                await choose('settings-motion', 'reduce');
                await click('storage-failure');
                let r = (await snap('storage-fallback')).receipt;
                assert.equal(r.storageMode, 'in-memory fallback');
                await click('export-state');
                await click('storage-failure');
                await click('recovery-offline');
                await snap('offline');
                await click('recovery-error');
                await click('error-retry');
                await click('nav-settings');
                await click('recovery-loading');
                await click('loading-finish');
                await click('nav-settings');
                await choose('settings-text', '1.5');
                await click('settings-long-text');
                await snap('settings-enlarged');
              },
            );
            await step('responsive scenario matrix', async () => {
              for (const [name, width, height] of [
                ['small-phone', 320, 740],
                ['phone', 390, 844],
                ['narrow', 768, 900],
                ['ipad', 834, 1194],
                ['desktop', 1440, 1000],
                ['wide', 1920, 1080],
              ]) {
                await page.setViewportSize({ width, height });
                await click('nav-overview');
                const s = await snap(name + '-light-large');
                assert.equal(
                  s.geometry.overflow.length,
                  0,
                  JSON.stringify(s.geometry.overflow),
                );
                await click('nav-services');
                await snap(name + '-inventory');
              }
              await click('nav-settings');
              await choose('settings-theme', 'dark');
              await choose('settings-text', '1');
              await page.setViewportSize({ width: 1440, height: 1000 });
              await click('nav-overview');
              await snap('desktop-final');
            });
            await step('reset restores fixture', async () => {
              await click('nav-settings');
              await click('reset-demo');
              await click('confirm-demo-action');
              const r = (await snap('reset')).receipt;
              assert.equal(r.activeCount, 22);
              assert.equal(r.primary.status, 'triggered');
              assert.equal(r.savedViews.length, 2);
            });

            if (form === 'desktop')
              await step(
                'calculated regime boundaries and interiors reach the actual renderer',
                async () => {
                  const validations = [];
                  await page.setViewportSize({ width: 1920, height: 1080 });
                  await click('nav-settings');
                  await click('settings-long-text');
                  for (const scale of [1, 1.5]) {
                    await choose('settings-text', String(scale));
                    for (const theme of ['dark', 'light']) {
                      await choose('settings-theme', theme);
                      const baseline = await capture();
                      const frame = resolveRelayFrame(baseline.geometry.inputs);
                      const maps = ['workWidth', 'columns'].map(
                        (output) => inspectRelayFrame(frame, output).regimes,
                      );
                      const widths = [
                        ...new Set(maps.flatMap((map) => map.validationInputs)),
                      ].sort((a, b) => a - b);
                      await click('nav-overview');
                      for (const requestedWidth of widths) {
                        await page.evaluate((width) => {
                          document.getElementById('root').style.width =
                            `${width}px`;
                        }, requestedWidth);
                        // CSS layout may quantize a requested fractional width. Bind the
                        // calculation to observed local content width, not the request.
                        await page.waitForFunction(() => {
                          const receipt = globalThis.__RELAY_CAPTURE__();
                          return (
                            receipt?.measuredRoot?.status === 'current' &&
                            Math.abs(
                              receipt.measuredRoot.width -
                                document
                                  .getElementById('root')
                                  .getBoundingClientRect().width,
                            ) < 0.02
                          );
                        });
                        const receipt = await capture();
                        const observed = await page.evaluate(() => {
                          const main = document.querySelector(
                            '[data-testid="relay-workspace"]',
                          );
                          const style = getComputedStyle(main);
                          return {
                            contentWidth:
                              main.getBoundingClientRect().width -
                              parseFloat(style.paddingLeft) -
                              parseFloat(style.paddingRight),
                            direction: getComputedStyle(
                              document.querySelector(
                                '[data-testid="relay-comparison-charts"]',
                              ),
                            ).flexDirection,
                            documentWidth: document.documentElement.scrollWidth,
                            viewportWidth: innerWidth,
                          };
                        });
                        assert.equal(
                          observed.direction,
                          receipt.geometry.values.columns === 1
                            ? 'column'
                            : 'row',
                        );
                        assert.ok(
                          Math.abs(
                            observed.contentWidth -
                              receipt.geometry.values.workWidth,
                          ) < 0.6,
                          JSON.stringify({
                            requestedWidth,
                            observed,
                            geometry: receipt.geometry,
                          }),
                        );
                        assert.ok(
                          observed.documentWidth <= observed.viewportWidth + 1,
                        );
                        validations.push({
                          scale,
                          theme,
                          requestedWidth,
                          observedWidth: receipt.measuredRoot.width,
                          columns: receipt.geometry.values.columns,
                          observed,
                        });
                      }
                      await page.evaluate(() =>
                        document
                          .getElementById('root')
                          .style.removeProperty('width'),
                      );
                      await click('nav-settings');
                    }
                  }
                  await writeFile(
                    path.join(output, `${scenario.id}-regime-validation.json`),
                    JSON.stringify(
                      {
                        validations,
                        scope:
                          'Finite actual renderer samples derived from expression regime brackets/interiors; no continuous renderer guarantee.',
                      },
                      null,
                      2,
                    ),
                  );
                  return {
                    samples: validations.length,
                    scope:
                      'Actual finite geometry checks; all other content and platform conditions remain separate obligations.',
                  };
                },
              );

            assert.equal(errors.length, 0, errors.join('\n'));
          } catch (error) {
            report.failures.push({
              scenario: scenario.id,
              message: String(error),
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
    report.failures.push({ phase: 'runner', message: String(error) });
  } finally {
    await new Promise((resolve) => server.close(resolve));
    Object.assign(
      report,
      verificationSourceFields(
        before,
        snapshotVerificationSources(process.cwd()),
      ),
    );
    report.passed =
      report.sourceStable &&
      report.failures.length === 0 &&
      report.scenarios.length === 6 &&
      report.scenarios.every(
        (scenario) =>
          scenario.steps.length > 0 &&
          scenario.steps.every((step) => step.status === 'passed') &&
          scenario.errors.length === 0,
      );
    await writeFile(
      path.join(output, 'report.json'),
      JSON.stringify(report, null, 2) + '\n',
    );
  }
  console.log(
    JSON.stringify({
      relayWeb: report.passed,
      scenarios: report.scenarios.length,
      steps: report.scenarios.reduce(
        (sum, scenario) => sum + scenario.steps.length,
        0,
      ),
      failures: report.failures,
      sourceStable: report.sourceStable,
    }),
  );
  assert.equal(
    report.passed,
    true,
    'Current Relay browser proof failed; see artifacts/relay-integration/web/report.json',
  );
  return report;
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  await proveRelayWeb();
