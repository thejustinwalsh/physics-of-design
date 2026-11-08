import assert from 'node:assert/strict';
import http from 'node:http';
import path from 'node:path';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { chromium, webkit } from 'playwright';
import { analyzePalette } from '../dist/palette.js';
import {
  snapshotVerificationSources,
  verificationSourceFields,
} from './verification-sources.mjs';

const before = snapshotVerificationSources(process.cwd());
const directory = path.resolve('artifacts/vela/web'),
  output =
    process.env.VELA_DIRECTIONS_OUTPUT ??
    'artifacts/vela/fluid-directions-proof';
await mkdir(output, { recursive: true });
const report = {
  scope:
    'Actual two-engine Vela direction rendering, declared device samples, task flow, in-session switching and reduced-motion observations. No native execution, human preference or performance inference.',
  cells: [],
  flows: [],
  failures: [],
};
const server = http.createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(
      new URL(req.url, 'http://localhost').pathname,
    );
    const file = path.resolve(
      directory,
      '.' + (path.extname(pathname) ? pathname : '/index.html'),
    );
    if (!file.startsWith(directory + path.sep)) throw Error('Outside preview');
    const bytes = await readFile(file);
    res.setHeader(
      'content-type',
      {
        '.html': 'text/html',
        '.js': 'text/javascript',
        '.ttf': 'font/ttf',
        '.css': 'text/css',
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
const origin = `http://127.0.0.1:${server.address().port}`;
async function ready(page, direction) {
  await page.waitForFunction(
    (id) =>
      (globalThis.__VELA_READY__ &&
        globalThis.__VELA__?.direction?.id === id) ||
      !!document.querySelector('[data-waiting-viewport]'),
    direction,
    { timeout: 8000 },
  );
  assert.equal(
    await page.evaluate(() => !!globalThis.__VELA_READY__),
    true,
    'Viewport rejected before app initialization',
  );
  await page.evaluate(() => document.fonts.ready);
  await page.waitForFunction(
    () =>
      document.getAnimations().every((a) => a.playState !== 'running') &&
      (globalThis.__VELA_WEB_MOTION__?.activeScenes ?? 0) === 0,
    undefined,
    { timeout: 8000 },
  );
}
const capture = (page) =>
  page.evaluate(() => {
    const root = document.querySelector('[data-testid="vela-screen"]'),
      h = document.querySelector('main h1');
    const rect = root.getBoundingClientRect();
    const firstCard = document.querySelector('[data-motion-card]');
    const text = [];
    const opaqueBackground = (element) => {
      for (let e = element; e; e = e.parentElement) {
        const c = getComputedStyle(e).backgroundColor;
        if (!c.startsWith('rgba') && c !== 'transparent') return c;
        if (/^rgba\(.+,\s*1\)$/.test(c)) return c;
      }
      return null;
    };
    for (const e of document.querySelectorAll('h1,h2,h3,p,button,span')) {
      if (
        ![...e.childNodes].some(
          (n) => n.nodeType === Node.TEXT_NODE && n.textContent.trim(),
        )
      )
        continue;
      const r = e.getBoundingClientRect(),
        s = getComputedStyle(e);
      if (!r.width || !r.height || s.visibility === 'hidden') continue;
      text.push({
        text: e.textContent.slice(0, 90),
        foreground: s.color,
        background: opaqueBackground(e),
        size: parseFloat(s.fontSize),
        weight: parseFloat(s.fontWeight),
      });
    }
    return {
      direction: globalThis.__VELA__.direction,
      policyIdentity: globalThis.__VELA__.policyIdentity,
      admissible: globalThis.__VELA__.resolved.admissible,
      screen: globalThis.__VELA__.screen,
      running: globalThis.__VELA__.running,
      elapsed: globalThis.__VELA__.elapsed,
      preferences: globalThis.__VELA__.preferences,
      contentFixture: globalThis.__VELA__.contentFixture,
      heading: h?.textContent,
      fracturedWords: h
        ? [
            ...(function* () {
              const walker = document.createTreeWalker(h, NodeFilter.SHOW_TEXT);
              while (walker.nextNode()) {
                const node = walker.currentNode;
                for (const word of node.textContent.matchAll(/\S+/g)) {
                  const range = document.createRange();
                  range.setStart(node, word.index);
                  range.setEnd(node, word.index + word[0].length);
                  const tops = [...range.getClientRects()]
                    .filter((r) => r.width && r.height)
                    .map((r) => r.top);
                  if (tops.some((top) => Math.abs(top - tops[0]) > 0.5))
                    yield word[0];
                }
              }
            })(),
          ]
        : [],
      root: {
        width: rect.width,
        height: rect.height,
        background: getComputedStyle(root).backgroundColor,
      },
      headingSize: h ? getComputedStyle(h).fontSize : null,
      cardRadius: firstCard ? getComputedStyle(firstCard).borderRadius : null,
      overflow: document.documentElement.scrollWidth > innerWidth + 1,
      spatialAnimations: document
        .getAnimations()
        .filter((a) => a.playState === 'running')
        .flatMap((a) =>
          a.effect
            .getKeyframes()
            .filter((k) => k.transform && k.transform !== 'none'),
        ),
      text,
    };
  });
const hex = (css) => {
  const values = css?.match(/[\d.]+/g)?.map(Number);
  if (!values || values.length < 3 || (values.length > 3 && values[3] !== 1))
    throw Error(`Unresolved color ${css}`);
  return (
    '#' +
    values
      .slice(0, 3)
      .map((n) => Math.round(n).toString(16).padStart(2, '0'))
      .join('')
  );
};
try {
  for (const engine of [chromium, webkit]) {
    const browser = await engine.launch();
    try {
      for (const direction of ['momentum', 'field-notes'])
        for (const scenario of [
          { id: 'phone', width: 390, height: 844, scale: 1 },
          { id: 'small-enlarged', width: 320, height: 740, scale: 2 },
          { id: 'ipad', width: 834, height: 1194, scale: 1 },
          { id: 'desktop', width: 1440, height: 1000, scale: 1 },
          { id: 'full-hd', width: 1920, height: 1080, scale: 1 },
          { id: 'large-desktop', width: 2560, height: 1600, scale: 1 },
          { id: 'four-k', width: 3840, height: 2160, scale: 1 },
          { id: 'tall-phone', width: 390, height: 2000, scale: 1 },
          { id: 'short-window', width: 900, height: 160, scale: 1 },
          { id: 'narrow-window', width: 240, height: 480, scale: 1 },
          { id: 'tiny-window', width: 160, height: 240, scale: 1 },
          { id: 'narrow-enlarged', width: 240, height: 480, scale: 2 },
          { id: 'short-landscape', width: 844, height: 320, scale: 1.5 },
          { id: 'phone-extreme', width: 390, height: 844, scale: 3.6 },
          {
            id: 'phone-long-copy',
            width: 390,
            height: 844,
            scale: 1,
            copy: 'expanded',
          },
          {
            id: 'small-long-copy',
            width: 320,
            height: 740,
            scale: 2,
            copy: 'expanded',
          },
        ])
          for (const screen of [
            'today',
            'detail',
            'active',
            'complete',
            'insights',
            'profile',
          ]) {
            const context = await browser.newContext({
                viewport: { width: scenario.width, height: scenario.height },
                reducedMotion: 'reduce',
              }),
              cell = {
                engine: engine.name(),
                direction,
                scenario,
                screen,
                passed: false,
              };
            report.cells.push(cell);
            try {
              const page = await context.newPage(),
                errors = [];
              page.on('pageerror', (e) => errors.push(e.message));
              await page.goto(
                `${origin}/?direction=${direction}&view=${screen}&textScale=${scenario.scale}&copy=${scenario.copy ?? 'default'}`,
              );
              await ready(page, direction);
              const facts = await capture(page);
              cell.facts = facts;
              assert.equal(facts.screen, screen);
              assert.equal(facts.contentFixture, scenario.copy ?? 'default');
              assert.deepEqual(
                facts.fracturedWords,
                [],
                'Unintended word fracture',
              );
              assert.equal(facts.overflow, false, 'Horizontal overflow');
              assert.equal(
                facts.admissible,
                true,
                'Current runtime infeasible',
              );
              assert.deepEqual(errors, []);
              assert.equal(facts.spatialAnimations.length, 0);
              const checks = facts.text.map((row, i) => {
                const tokens = {
                  fg: hex(row.foreground),
                  bg: hex(row.background),
                };
                const analysis = analyzePalette({
                  system: {
                    tokens,
                    roles: [
                      {
                        id: 'text',
                        foreground: 'fg',
                        background: 'bg',
                        use:
                          row.size >= 24 ||
                          (row.size >= 18.6666666667 && row.weight >= 700)
                            ? 'large-text'
                            : 'text',
                        source: [
                          'Actual computed opaque Vela DOM colors; sampled final pose',
                        ],
                      },
                    ],
                  },
                });
                return {
                  index: i,
                  text: row.text,
                  status: analysis.summary.status,
                  checks: analysis.checks,
                };
              });
              cell.contrast = checks;
              assert.deepEqual(
                checks
                  .filter((c) => c.status !== 'pass')
                  .map((c) => ({ text: c.text, status: c.status })),
                [],
                'Actual sampled text contrast',
              );
              cell.passed = true;
            } catch (error) {
              cell.error = String(error);
              report.failures.push({
                engine: engine.name(),
                direction,
                scenario: scenario.id,
                screen,
                error: String(error),
              });
            } finally {
              await context.close();
              await writeFile(
                `${output}/partial.json`,
                JSON.stringify(report, null, 2),
              );
              console.log(
                JSON.stringify({
                  engine: engine.name(),
                  direction,
                  scenario: scenario.id,
                  screen,
                  passed: cell.passed,
                  error: cell.error,
                }),
              );
            }
          }
      const context = await browser.newContext({
          viewport: { width: 390, height: 844 },
          reducedMotion: 'reduce',
        }),
        flow = { engine: engine.name(), passed: false };
      report.flows.push(flow);
      try {
        const page = await context.newPage();
        await page.goto(origin);
        await ready(page, 'momentum');
        await page
          .getByRole('button', { name: 'Open session', exact: true })
          .click();
        await page
          .getByRole('button', { name: 'Start session', exact: true })
          .click();
        await page.waitForFunction(
          () =>
            globalThis.__VELA__?.screen === 'active' &&
            globalThis.__VELA__.running,
        );
        await page.waitForTimeout(350);
        const previous = await capture(page);
        await page
          .getByRole('button', { name: 'Change art direction', exact: true })
          .click();
        await ready(page, 'field-notes');
        const switched = await capture(page);
        assert.equal(switched.screen, 'active');
        assert.equal(switched.running, true);
        assert.ok(switched.elapsed >= previous.elapsed);
        assert.notEqual(switched.policyIdentity, previous.policyIdentity);
        flow.resizes = [];
        for (const viewport of [
          { width: 2560, height: 1600 },
          { width: 390, height: 2000 },
          { width: 900, height: 160 },
          { width: 240, height: 480 },
          { width: 1920, height: 1080 },
          { width: 390, height: 844 },
        ]) {
          await page.setViewportSize(viewport);
          await page.waitForFunction(
            ({ width, height }) =>
              globalThis.__VELA_LAST_RUNTIME_INPUT__?.width === width &&
              globalThis.__VELA_LAST_RUNTIME_INPUT__?.height === height,
            viewport,
          );
          const facts = await page.evaluate(() => ({
            screen: globalThis.__VELA__.screen,
            running: globalThis.__VELA__.running,
            elapsed: globalThis.__VELA__.elapsed,
            admissible: globalThis.__VELA__.resolved.admissible,
            boundary: globalThis.__VELA_VIEWPORT_BOUNDARY__.status,
            notice: !!document.querySelector('[data-waiting-viewport]'),
          }));
          assert.equal(facts.screen, 'active');
          assert.equal(facts.running, true);
          assert.ok(facts.elapsed >= switched.elapsed);
          assert.ok(facts.admissible);
          assert.equal(facts.boundary, 'current');
          assert.equal(facts.notice, false);
          flow.resizes.push({ viewport, facts });
        }

        await page.getByRole('button', { name: 'Pause', exact: true }).click();
        await page
          .getByRole('button', { name: 'Finish session', exact: true })
          .click();
        await page.waitForFunction(
          () => globalThis.__VELA__?.screen === 'complete',
        );
        const finished = await capture(page);
        assert.equal(finished.preferences.entries.length, 1);
        await page.reload();
        await ready(page, 'field-notes');
        const restored = await capture(page);
        assert.equal(restored.preferences.entries.length, 1);
        flow.passed = true;
        flow.evidence = { previous, switched, finished, restored };
      } catch (error) {
        flow.error = String(error);
        report.failures.push({
          engine: engine.name(),
          scenario: 'session-and-persistence',
          error: String(error),
        });
      } finally {
        await context.close();
      }
      const keyboardContext = await browser.newContext({
        viewport: { width: 390, height: 844 },
        reducedMotion: 'no-preference',
      });
      const keyboardFlow = {
        engine: engine.name(),
        kind: 'keyboard-anchor-switch',
        passed: false,
        samples: [],
      };
      report.flows.push(keyboardFlow);
      try {
        const page = await keyboardContext.newPage();
        await page.goto(
          `${origin}/?view=profile&direction=momentum&textScale=2`,
        );
        await ready(page, 'momentum');
        for (const direction of ['field-notes', 'momentum']) {
          const target = page.locator(`[data-direction-choice="${direction}"]`);
          await target.scrollIntoViewIfNeeded();
          await target.focus();
          const previous = await target.evaluate((e) => ({
            top: e.getBoundingClientRect().top,
            scrollY,
            animations: globalThis.__VELA__.animations.length,
          }));
          assert.ok(
            previous.scrollY > 0,
            'Establish a genuinely scrolled control',
          );
          await target.press('Space');
          await ready(page, direction);
          await page.evaluate(
            () =>
              new Promise((resolve) =>
                requestAnimationFrame(() => requestAnimationFrame(resolve)),
              ),
          );
          const next = await target.evaluate((e) => ({
            top: e.getBoundingClientRect().top,
            scrollY,
            focused: document.activeElement === e,
            projection: globalThis.__VELA_DIRECTION_SWITCH__,
            animations: globalThis.__VELA__.animations.length,
          }));
          assert.equal(next.focused, true);
          assert.equal(
            next.animations,
            previous.animations,
            'Direction changes must not replay page-entry transforms',
          );
          assert.ok(next.scrollY > 0, 'Do not reset the user to the top');
          if (!next.projection.clamped)
            assert.ok(
              Math.abs(next.top - previous.top) < 1,
              'Retain focused anchor where the current scroll range permits',
            );
          else
            assert.ok(
              next.projection.offset === 0 ||
                next.projection.offset === next.projection.maximumOffset,
              'Clamping must be explicit',
            );
          keyboardFlow.samples.push({ direction, previous, next });
        }
        keyboardFlow.passed = true;
      } catch (error) {
        keyboardFlow.error = String(error);
        report.failures.push({
          engine: engine.name(),
          scenario: 'keyboard-anchor-switch',
          error: String(error),
        });
      } finally {
        await keyboardContext.close();
      }
      // A physically tiny viewport cannot show a readable target at once, but
      // it still gets current geometry and must recover without a reload.
      for (const direction of ['momentum', 'field-notes']) {
        const context = await browser.newContext({
          viewport: { width: 1, height: 1 },
          reducedMotion: 'reduce',
        });
        const flow = {
          engine: engine.name(),
          direction,
          kind: 'tiny-live-recovery',
          passed: false,
        };
        report.flows.push(flow);
        try {
          const page = await context.newPage(),
            errors = [];
          page.on('pageerror', (error) => errors.push(error.message));
          await page.goto(`${origin}/?direction=${direction}`);
          await ready(page, direction);
          const tiny = await page.evaluate(() => ({
            width: globalThis.__VELA__.resolved.values.width,
            height: globalThis.__VELA__.resolved.values.height,
            admissible: globalThis.__VELA__.resolved.admissible,
            current: globalThis.__VELA_VIEWPORT_BOUNDARY__.status,
          }));
          assert.deepEqual(tiny, {
            width: 1,
            height: 1,
            admissible: true,
            current: 'current',
          });
          await page.setViewportSize({ width: 2560, height: 1600 });
          await page.waitForFunction(
            () =>
              globalThis.__VELA_LAST_RUNTIME_INPUT__?.width === 2560 &&
              globalThis.__VELA_LAST_RUNTIME_INPUT__?.height === 1600,
          );
          await page
            .getByRole('button', { name: 'Open session', exact: true })
            .click();
          await page
            .getByRole('button', { name: 'Start session', exact: true })
            .click();
          await page.waitForFunction(() => globalThis.__VELA__?.running);
          assert.deepEqual(errors, []);
          flow.passed = true;
          flow.tiny = tiny;
        } catch (error) {
          flow.error = String(error);
          report.failures.push({
            engine: engine.name(),
            direction,
            scenario: 'tiny-live-recovery',
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
  report.failures.push({ scenario: 'bootstrap', error: String(error) });
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
    flows: report.flows.map((f) => ({
      engine: f.engine,
      passed: f.passed,
      error: f.error,
    })),
    failures: report.failures,
  }),
);
assert.equal(report.passed, true);
