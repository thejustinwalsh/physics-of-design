import assert from 'node:assert/strict';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { chromium, webkit } from 'playwright';
import { build } from 'esbuild';
import { hash } from '../dist/identity.js';
import {
  resolveOutputBindings,
  checkOutputBindings,
} from '../dist/output-bindings.js';
import { plotAnatomy } from '../examples/relay/app/src/design/plot-anatomy.mjs';
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
  const palettes = JSON.parse(
    await readFile(
      'examples/relay/app/src/design/palette.generated.json',
      'utf8',
    ),
  );
  const collector = await build({
    stdin: {
      contents:
        "export {collectBrowserOutputBindings} from './dist/browser-output-bindings.js'",
      resolveDir: process.cwd(),
    },
    bundle: true,
    platform: 'browser',
    format: 'iife',
    globalName: 'RelayBindingProbe',
    write: false,
  });
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
            // Wait for the current root after a viewport change before deciding
            // whether this destination lives in the rail, tabs or Menu.
            if (id.startsWith('nav-'))
              await page.waitForFunction(() => {
                const r = globalThis.__RELAY_CAPTURE__?.();
                return (
                  r?.measuredRoot?.status === 'current' &&
                  Math.abs(r.measuredRoot.width - innerWidth) < 1 &&
                  Math.abs(r.measuredRoot.height - innerHeight) < 1 &&
                  Math.abs(r.geometry.inputs.width - innerWidth) < 1 &&
                  Math.abs(r.geometry.inputs.height - innerHeight) < 1
                );
              });
            if (id.startsWith('nav-') && !(await page.getByTestId(id).count()))
              await page.getByTestId('nav-menu').click();
            await page.getByTestId(id).click();
          };
          const fill = (id, value) => page.getByTestId(id).fill(value);
          const verifyPaletteBindings = async (receipt, direction, theme) => {
            const expected = {
              designIdentity: exported.briefIdentity,
              sourceIdentity: source,
              inputIdentity: palettes.inputIdentity,
            };
            const current = {
              designIdentity: receipt.briefIdentity,
              sourceIdentity: receipt.sourceIdentity,
              inputIdentity: receipt.paletteIdentity.inputIdentity,
              resultIdentity: receipt.paletteIdentity.resultIdentity,
            };
            const bucket = 48 - receipt.context.range / 5;
            assert.notEqual(
              bucket,
              receipt.context.bucket,
              'Probe a nonselected data bucket',
            );
            const scenarioIdentity = hash({
              viewport: receipt.viewport,
              direction,
              theme,
              preferences: receipt.preferences,
            });
            const manifest = resolveOutputBindings({
              operation: 'resolve',
              current: expected,
              source: { value: palettes.directions },
              bindings: [
                ['canvas', 'relay-root', 'backgroundColor', 'canvas'],
                ['ink', 'relay-root', 'color', 'ink'],
                ['action', 'diagnose-checkout', 'backgroundColor', 'accent'],
                ['action-ink', 'diagnose-checkout', 'color', 'on-accent'],
                ['panel', 'relay-latency-chart', 'backgroundColor', 'panel'],
                [
                  'series',
                  `relay-latency-chart-data-bar-${bucket}`,
                  'backgroundColor',
                  'data',
                ],
                [
                  'comparison',
                  `relay-latency-chart-comparison-bar-${bucket}`,
                  'backgroundColor',
                  'comparison',
                ],
              ].map(([id, surface, property, token]) => ({
                id,
                scenario: scenario.id,
                scenarioIdentity,
                platform: 'web',
                unit: 'color',
                pointer: `/${direction}/${theme}/${token}`,
                target: {
                  surface,
                  property,
                  sourceLocation: 'examples/relay/app/src/ui.jsx',
                },
                tolerance: 0,
              })),
            });
            const observation = await page.evaluate(
              ({ manifest, context }) =>
                globalThis.RelayBindingProbe.collectBrowserOutputBindings(
                  manifest,
                  context,
                ),
              {
                manifest,
                context: {
                  current,
                  scenario: scenario.id,
                  scenarioIdentity,
                  resultRef: `artifacts/relay-integration/web/${scenario.id}-${direction}-${theme}-colors.json`,
                },
              },
            );
            const checked = checkOutputBindings({
              operation: 'check',
              manifest,
              current,
              observations: observation.observations,
            });
            await writeFile(
              path.join(
                output,
                `${scenario.id}-${direction}-${theme}-colors.json`,
              ),
              JSON.stringify({ manifest, observation, checked }, null, 2),
            );
            assert.ok(
              checked.entries.every((entry) => entry.status === 'pass'),
              JSON.stringify(checked.entries),
            );
            return checked.entries.length;
          };
          const verifyPlotBindings = async (receipt) => {
            const value = { plot: plotAnatomy };
            const scenarioIdentity = hash({
              viewport: receipt.viewport,
              root: receipt.measuredRoot,
              preferences: receipt.preferences,
            });
            const expected = {
              designIdentity: exported.briefIdentity,
              sourceIdentity: source,
              inputIdentity: exported.bindingInputIdentity,
            };
            const manifest = resolveOutputBindings({
              operation: 'resolve',
              current: expected,
              source: { value },
              bindings: [
                'relay-latency-chart-plot',
                'relay-request-chart-plot',
                'relay-error-chart-plot',
              ].flatMap((surface) =>
                ['height', 'gap', 'position', 'boxSizing'].map((property) => ({
                  id:
                    surface +
                    '-' +
                    property.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase()),
                  scenario: scenario.id,
                  scenarioIdentity,
                  platform: 'web',
                  unit: ['position', 'boxSizing'].includes(property)
                    ? 'token'
                    : 'css-px',
                  pointer: '/plot/' + property,
                  target: {
                    surface,
                    property,
                    sourceLocation: 'examples/relay/app/src/ui.jsx:plot',
                  },
                  tolerance: ['position', 'boxSizing'].includes(property)
                    ? 0
                    : 0.05,
                })),
              ),
            });
            // These identities come from the running app, independently of the
            // expected manifest. They are declarations, not authentication.
            const current = {
              designIdentity: receipt.briefIdentity,
              sourceIdentity: receipt.sourceIdentity,
              inputIdentity: receipt.bindingInputIdentity,
              resultIdentity: receipt.bindingResultIdentity,
            };
            const observation = await page.evaluate(
              ({ manifest, context }) =>
                globalThis.RelayBindingProbe.collectBrowserOutputBindings(
                  manifest,
                  context,
                ),
              {
                manifest,
                context: {
                  current,
                  scenario: scenario.id,
                  scenarioIdentity,
                  resultRef: `artifacts/relay-integration/web/${scenario.id}-plot-binding-observation.json`,
                },
              },
            );
            const checked = checkOutputBindings({
              operation: 'check',
              manifest,
              current,
              observations: observation.observations,
            });
            for (const [name, data] of Object.entries({
              manifest,
              observation,
              checked,
            }))
              await writeFile(
                path.join(output, `${scenario.id}-plot-binding-${name}.json`),
                JSON.stringify(data, null, 2),
              );
            assert.ok(
              checked.entries.every((entry) => entry.status === 'pass'),
              JSON.stringify(checked.entries),
            );
            return {
              bindings: checked.entries.length,
              scope:
                'Current authored anatomy property consistency; not a fresh selector recipe, authentication or design-quality score.',
            };
          };
          const capture = async () => {
            const current = await page.waitForFunction(() => {
              const receipt = globalThis.__RELAY_CAPTURE__?.();
              return receipt?.hydrated && receipt?.fontLoaded ? receipt : null;
            });
            try {
              return await current.jsonValue();
            } finally {
              await current.dispose();
            }
          };
          async function diagnose(name, error) {
            const file = `${scenario.id}-failed-${name.replaceAll(/[^a-z0-9]/gi, '-')}`;
            const diagnostic = await page
              .evaluate(() => ({
                receipt: globalThis.__RELAY_CAPTURE__?.() ?? null,
                url: location.href,
                title: document.title,
                bodyText: document.body.innerText.slice(0, 4096),
              }))
              .catch((failure) => ({ captureFailure: String(failure) }));
            await writeFile(
              path.join(output, file + '.json'),
              JSON.stringify(
                { error: String(error), diagnostic, errors },
                null,
                2,
              ),
            );
            await page
              .screenshot({ path: path.join(output, file + '.png') })
              .catch((failure) => {
                scenario.snapshots.push({
                  name: 'diagnostic-screenshot-failed',
                  error: String(failure),
                });
              });
            scenario.snapshots.push({
              name: 'failure-' + name,
              file: file + '.json',
              screenshot: file + '.png',
            });
          }
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
              await diagnose(name, error).catch((diagnosticError) => {
                steps.push({
                  name: 'failure-artifact',
                  status: 'failed',
                  error: String(diagnosticError),
                });
              });
              throw error;
            }
          }
          async function choose(id, value) {
            await click(id);
            await click(id + '-option-' + value);
          }
          try {
            await page.goto(url);
            await page.addScriptTag({ content: collector.outputFiles[0].text });
            await page.getByTestId('diagnose-checkout').waitFor();

            await step(
              'whole palette directions reach actual controls, data and material bases',
              async () => {
                const observed = [];
                for (const direction of Object.keys(palettes.directions)) {
                  for (const theme of ['dark', 'light']) {
                    await click('nav-settings');
                    await choose('settings-palette', direction);
                    await choose('settings-theme', theme);
                    await click('nav-overview');
                    await page.waitForFunction(
                      ({ direction, theme }) => {
                        const materials = globalThis.__RELAY_MATERIALS__?.();
                        return (
                          materials?.length === 3 &&
                          materials.every(
                            (item) =>
                              item.palette === direction &&
                              item.theme === theme,
                          )
                        );
                      },
                      { direction, theme },
                    );
                    const { receipt } = await snap(
                      `palette-${direction}-${theme}`,
                    );
                    assert.equal(receipt.preferences.palette, direction);
                    assert.equal(receipt.preferences.theme, theme);
                    const materialBases = await page.evaluate(() =>
                      globalThis.__RELAY_MATERIALS__().map((item) => ({
                        ...item,
                        cssBase: getComputedStyle(
                          document.querySelector(`[data-testid="${item.id}"]`),
                        )
                          .getPropertyValue('--dt-base')
                          .trim(),
                      })),
                    );
                    for (const material of materialBases) {
                      const token = {
                        substrate: 'panel',
                        navigation: 'canvas',
                        action: 'raised',
                      }[material.name];
                      assert.equal(
                        material.baseColor,
                        palettes.directions[direction][theme][token],
                      );
                      assert.equal(material.cssBase, material.baseColor);
                    }
                    observed.push({
                      direction,
                      theme,
                      bindings: await verifyPaletteBindings(
                        receipt,
                        direction,
                        theme,
                      ),
                      materialBases,
                    });
                  }
                }
                await click('nav-settings');
                await choose('settings-palette', palettes.defaultDirection);
                await choose('settings-theme', 'dark');
                await click('nav-overview');
                return {
                  observed,
                  scope:
                    'Actual computed role properties and material base variables; lit composite contrast and aesthetic preference require separate evidence.',
                };
              },
            );

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
                const slant = page.getByTestId('axis-slnt');
                await slant.fill('');
                await slant.press('-');
                assert.equal(
                  await slant.inputValue(),
                  '-',
                  'An intermediate sign must stay editable',
                );
                await slant.evaluate((element) => {
                  window.__AXIS_NODE__ = element;
                });
                await slant.press('5');
                await page.waitForFunction(
                  () =>
                    globalThis.__RELAY_CAPTURE__()?.preferences.axes?.slnt ===
                    -5,
                );
                assert.equal(await slant.inputValue(), '-5');
                assert.equal(
                  await slant.evaluate(
                    (element) =>
                      element === window.__AXIS_NODE__ &&
                      document.activeElement === element,
                  ),
                  true,
                  'Committing an axis must preserve the focused input node',
                );
                await slant.fill('0');
                await page.waitForFunction(
                  () =>
                    globalThis.__RELAY_CAPTURE__()?.preferences.axes?.slnt ===
                    0,
                );
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
                await page.waitForFunction((expected) => {
                  const current = globalThis.__RELAY_CAPTURE__?.();
                  return (
                    current?.viewport.width === expected &&
                    current?.measuredRoot.width === expected &&
                    current.geometry.inputs.width === expected
                  );
                }, width);
                return { before, after, embeddedRoot: embedded.measuredRoot };
              },
            );
            await step('continuous chart pointer and keyboard', async () => {
              if (!(await page.getByTestId('range-60').count()))
                await click('phone-range');
              await click('range-60');
              const plot = page.getByTestId('relay-latency-chart-plot');
              await plot.scrollIntoViewIfNeeded();
              const anatomy = await plot.evaluate((element) => ({
                height: element.getBoundingClientRect().height,
                position: getComputedStyle(element).position,
                gap: getComputedStyle(element).columnGap,
                bars: [...element.querySelectorAll('button')].map((button) => ({
                  box: button.getBoundingClientRect().toJSON(),
                  paints: [...button.children].map((child) => ({
                    height: child.getBoundingClientRect().height,
                    color: getComputedStyle(child).backgroundColor,
                  })),
                })),
              }));
              assert.equal(
                anatomy.position,
                'relative',
                'Actual StyleX plot styles must survive the custom interaction adapter',
              );
              assert.ok(anatomy.height >= 129 && anatomy.height <= 131);
              assert.equal(anatomy.gap, '2px');
              assert.ok(
                anatomy.bars.length >= 3 &&
                  anatomy.bars.every(
                    (bar) =>
                      bar.box.width > 0 &&
                      bar.box.height > 0 &&
                      bar.paints.some((paint) => paint.height > 0),
                  ),
                'Every data bucket must have an actual visible-height bar',
              );
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
              const bound = await verifyPlotBindings(receipt);
              assert.ok(receipt.context.bucket >= 44);
              const after = await plot.boundingBox();
              assert.equal(after.width, before.width);
              await page.waitForFunction(() =>
                globalThis
                  .__RELAY_MOTION__?.()
                  .every((motion) => motion.phase !== 'playing'),
              );
              await page.getByTestId('relay-latency-chart-previous').focus();
              await page.evaluate(() => {
                const cursor = document.querySelector(
                  '[data-testid="relay-latency-chart-cursor"]',
                );
                const selected = document.querySelector(
                  '[data-testid="relay-latency-chart-plot"] button[aria-pressed="true"]',
                );
                window.__CURSOR_FRAMES__ = [
                  {
                    time: performance.now(),
                    x: cursor.getBoundingClientRect().x,
                  },
                ];
                window.__CURSOR_BEFORE__ = selected
                  .getBoundingClientRect()
                  .toJSON();
                const sample = () => {
                  window.__CURSOR_FRAMES__.push({
                    time: performance.now(),
                    x: cursor.getBoundingClientRect().x,
                  });
                  if (window.__CURSOR_FRAMES__.length < 61)
                    requestAnimationFrame(sample);
                };
                requestAnimationFrame(sample);
              });
              await page.keyboard.press('Enter');
              await page.waitForFunction(
                () => window.__CURSOR_FRAMES__?.length === 61,
              );
              await page.waitForFunction(() =>
                globalThis
                  .__RELAY_MOTION__?.()
                  .every((motion) => motion.phase !== 'playing'),
              );
              const r = (await snap('keyboard-cursor')).receipt;
              assert.ok(r.context.bucket < receipt.context.bucket);
              const movement = await page.evaluate(() => {
                const cursor = document
                  .querySelector('[data-testid="relay-latency-chart-cursor"]')
                  .getBoundingClientRect();
                const selected = document
                  .querySelector(
                    '[data-testid="relay-latency-chart-plot"] button[aria-pressed="true"]',
                  )
                  .getBoundingClientRect();
                return {
                  frames: window.__CURSOR_FRAMES__,
                  before: window.__CURSOR_BEFORE__,
                  cursor: cursor.toJSON(),
                  selected: selected.toJSON(),
                  runtime: globalThis.__RELAY_MOTION__?.(),
                };
              });
              assert.ok(
                Math.abs(
                  movement.cursor.x +
                    movement.cursor.width / 2 -
                    movement.selected.x -
                    movement.selected.width / 2,
                ) < 0.2,
                'Actual cursor must align with the selected bucket center',
              );
              const first = movement.frames[0].x,
                last = movement.frames.at(-1).x;
              assert.ok(
                Math.abs(first - last) > 1 &&
                  movement.frames.some(
                    (frame) =>
                      frame.x > Math.min(first, last) + 0.1 &&
                      frame.x < Math.max(first, last) - 0.1,
                  ),
                'Actual intermediate cursor positions must be observed',
              );
              await writeFile(
                path.join(output, `${scenario.id}-cursor-motion.json`),
                JSON.stringify(movement, null, 2),
              );
              return {
                before,
                after,
                bucket: r.context.bucket,
                anatomy,
                motionFrames: movement.frames.length,
                propertyBindings: bound,
              };
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
              await click('relay-dialog-close');
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
                // Narrow rows reveal secondary actions through their actual
                // Details control; returning from edit starts collapsed.
                if (!(await page.getByTestId('toggle-' + ruleId).count()))
                  await click('expand-' + ruleId);
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
            await step(
              'short landscape retains a measured task viewport and reachable secondary controls',
              async () => {
                await click('nav-settings');
                await choose('settings-text', '1.5');
                for (const shortHeight of [390, 320]) {
                  await page.setViewportSize({
                    width: 844,
                    height: shortHeight,
                  });
                  await page.waitForFunction(
                    () =>
                      globalThis.__RELAY_CAPTURE__?.()?.geometry.values
                        .compactChrome === 1,
                  );
                  await click('nav-overview');
                  const receipt = (await snap(`landscape-${shortHeight}-large`))
                    .receipt;
                  const task = receipt.boxes['relay-task-viewport'];
                  assert.ok(
                    task &&
                      task.height >= receipt.geometry.values.minimumTaskHeight,
                    JSON.stringify({ task, policy: receipt.geometry }),
                  );
                  assert.ok(
                    task.y >= 0 && task.y + task.height <= shortHeight + 1,
                  );
                  assert.equal(receipt.geometry.values.wide, 0);
                  assert.equal(
                    await page.getByTestId('relay-navigation').count(),
                    0,
                  );
                  await click('nav-menu');
                  await click('global-filters-open');
                  await page.getByTestId('global-team').waitFor();
                  const checkDialog = async (id) => {
                    const ids = [
                      id,
                      id + '-header',
                      id + '-title',
                      id + '-close',
                      id + '-body',
                    ];
                    const boxes = await Promise.all(
                      ids.map((key) => page.getByTestId(key).boundingBox()),
                    );
                    const [panel, header, title, close, body] = boxes;
                    const inside = (child, parent) =>
                      child &&
                      parent &&
                      child.width > 0 &&
                      child.height > 0 &&
                      child.x >= parent.x - 1 &&
                      child.y >= parent.y - 1 &&
                      child.x + child.width <= parent.x + parent.width + 1 &&
                      child.y + child.height <= parent.y + parent.height + 1;
                    assert.ok(
                      inside(panel, {
                        x: 0,
                        y: 0,
                        width: 844,
                        height: shortHeight,
                      }),
                      'Dialog stays inside current viewport',
                    );
                    assert.ok(inside(header, panel) && inside(body, panel));
                    assert.ok(inside(title, header) && inside(close, header));
                    assert.ok(
                      header.y + header.height <= body.y + 1,
                      'Dialog header/body do not overlap',
                    );
                    assert.ok(
                      title.x + title.width <= close.x + 1,
                      'Title and Close do not overlap',
                    );
                  };
                  await checkDialog('relay-dialog');
                  await page.getByTestId('global-team').click();
                  await page.getByTestId('global-team-dialog').waitFor();
                  await checkDialog('global-team-dialog');
                  await page.getByTestId('global-team-dialog-close').click();
                  await checkDialog('relay-dialog');
                  await page.getByTestId('relay-dialog-close').click();
                  await click('nav-menu');
                  await click('phone-range');
                  await click('range-60');
                  await click('command-open');
                  await page.getByTestId('command-query').waitFor();
                  await checkDialog('relay-command-settings');
                  await page
                    .getByTestId('relay-command-settings-close')
                    .click();
                }
                await page.setViewportSize({ width: 1440, height: 1000 });
                await click('nav-settings');
                await choose('settings-text', '1');
                await click('nav-overview');
              },
            );
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
            if (!steps.length) await diagnose('startup', error).catch(() => {});
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
