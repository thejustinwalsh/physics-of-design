import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import path from 'node:path';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { inflateSync } from 'node:zlib';
import { chromium } from 'playwright';
import { convertColor, analyzePalette } from '../dist/palette.js';

const directory = process.env.VELA_PROOF_DIR ?? 'artifacts/vela/proof-web';
await mkdir(directory, { recursive: true });
const root = path.resolve('artifacts/vela/web');
const server = createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(
      new URL(request.url ?? '/', 'http://localhost').pathname,
    );
    const target = path.resolve(
      root,
      '.' + (pathname === '/' ? '/index.html' : pathname),
    );
    if (!target.startsWith(root + path.sep)) {
      response.writeHead(403);
      response.end();
      return;
    }
    const bytes = await readFile(target);
    response.writeHead(200, {
      'content-type':
        {
          '.html': 'text/html',
          '.js': 'application/javascript',
          '.ttf': 'font/ttf',
        }[path.extname(target)] ?? 'application/octet-stream',
    });
    response.end(bytes);
  } catch {
    response.writeHead(404);
    response.end();
  }
});
await new Promise((resolve, reject) => {
  server.once('error', reject);
  server.listen(0, '127.0.0.1', resolve);
});
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ headless: true });
const observations = [],
  errors = [],
  failures = [];
const check = (condition, message) => {
  if (!condition) failures.push(message);
};
// Chromium emits 8-bit RGB/RGBA screenshots. The first pixel has zero left/upper predictors for every PNG filter.
function pixelHex(png) {
  const chunks = [];
  let colorType;
  for (let offset = 8; offset < png.length;) {
    const length = png.readUInt32BE(offset),
      type = png.toString('ascii', offset + 4, offset + 8);
    if (type === 'IHDR') {
      assert.equal(png.readUInt32BE(offset + 8), 1);
      assert.equal(png.readUInt32BE(offset + 12), 1);
      assert.equal(png[offset + 16], 8);
      colorType = png[offset + 17];
    }
    if (type === 'IDAT')
      chunks.push(png.subarray(offset + 8, offset + 8 + length));
    offset += length + 12;
  }
  assert.ok(
    colorType === 2 || colorType === 6,
    `unsupported PNG color type ${colorType}`,
  );
  const raw = inflateSync(Buffer.concat(chunks));
  return (
    '#' +
    [...raw.subarray(1, 4)]
      .map((value) => value.toString(16).padStart(2, '0'))
      .join('')
  );
}
try {
  const page = await browser.newPage();
  let proofPhase = 'initial';
  page.on('pageerror', async (error) => {
    const failure = {
      message: String(error),
      stack: error.stack,
      phase: proofPhase,
      url: page.url(),
    };
    errors.push(failure);
    try {
      failure.context = await page.evaluate(() => ({
        width: innerWidth,
        height: innerHeight,
        screen: window.__VELA__?.screen,
        lastResolved: window.__VELA__?.resolved?.values,
      }));
    } catch {}
  });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(base);
  for (const width of [390, 834, 1440])
    for (const scale of [1, 2, 2.143, 3.6])
      for (const view of [
        'today',
        'detail',
        'active',
        'complete',
        'insights',
        'profile',
      ]) {
        proofPhase = `${view}-${width}-${scale}`;
        await page.setViewportSize({
          width,
          height: width === 390 ? 844 : 1000,
        });
        await page.evaluate(() => localStorage.clear());
        await page.goto(
          `${base}/?view=${view === 'complete' ? 'detail' : view}&textScale=${scale}`,
        );
        await page.waitForFunction(() => window.__VELA_READY__);
        if (view === 'complete') {
          await page
            .getByRole('button', { name: 'Start session', exact: true })
            .click();
          await page.waitForFunction(() => window.__VELA__.elapsed >= 1);
          await page
            .getByRole('button', { name: 'Finish session', exact: true })
            .click();
          await page.waitForFunction(
            () => window.__VELA__.screen === 'complete',
          );
        }
        await page.evaluate(async () => {
          await document.fonts.ready;
          await Promise.all(
            document.getAnimations().map((a) => a.finished.catch(() => {})),
          );
        });
        const observation = await page.evaluate(() => ({
          primaryAction: (() => {
            const button = document.querySelector('[data-primary-action]');
            if (!button) return null;
            const r = button.getBoundingClientRect();
            const hit = document.elementFromPoint(
              r.x + r.width / 2,
              r.y + r.height / 2,
            );
            return {
              label: button.textContent,
              top: r.top,
              bottom: r.bottom,
              width: r.width,
              height: r.height,
              viewportHeight: innerHeight,
              unobscured: hit?.closest('[data-primary-action]') === button,
            };
          })(),
          focusScroll: (() => {
            const m = document.querySelector('[data-focus-scroll]');
            return m
              ? {
                  height: m.clientHeight,
                  contentHeight: m.scrollHeight,
                  top: m.scrollTop,
                }
              : null;
          })(),
          innerHorizontalOverflow: [
            ...document.querySelectorAll('main,[data-action-dock]'),
          ].map((e) => Math.max(0, e.scrollWidth - e.clientWidth)),
          screen: window.__VELA__.screen,
          policyIdentity: window.__VELA__.policyIdentity,
          resolution: window.__VELA__.resolved,
          horizontalOverflow: Math.max(
            0,
            document.documentElement.scrollWidth - innerWidth,
          ),
          textOverflow: [...document.querySelectorAll('h1,h2,p')]
            .filter((e) => e.scrollWidth > e.clientWidth + 1)
            .map((e) => ({
              text: e.textContent,
              by: e.scrollWidth - e.clientWidth,
            })),
          brokenDisplayWords: [
            ...document.querySelectorAll('h1,[data-timer]'),
          ].flatMap((element) => {
            const walker = document.createTreeWalker(
              element,
              NodeFilter.SHOW_TEXT,
            );
            const broken = [];
            while (walker.nextNode()) {
              const node = walker.currentNode;
              for (const match of node.textContent.matchAll(/\S+/gu)) {
                const range = document.createRange();
                range.setStart(node, match.index);
                range.setEnd(node, match.index + match[0].length);
                const lines = new Set(
                  [...range.getClientRects()].map(
                    (r) => Math.round(r.y * 2) / 2,
                  ),
                );
                if (lines.size > 1)
                  broken.push({
                    text: match[0],
                    lines: lines.size,
                    kind: element.matches('[data-timer]') ? 'timer' : 'heading',
                  });
              }
            }
            return broken;
          }),
          navLabelOverflow: [
            ...document.querySelectorAll('nav button span'),
          ].flatMap((e) => {
            const label = e.getBoundingClientRect(),
              button = e.closest('button').getBoundingClientRect();
            return label.left < button.left - 1 ||
              label.right > button.right + 1
              ? [e.textContent]
              : [];
          }),
          actions: [
            ...document.querySelectorAll(
              'main button,[data-action-dock] button',
            ),
          ].map((e) => ({
            text: e.textContent,
            y: e.getBoundingClientRect().y + scrollY,
          })),
          smallControls: [...document.querySelectorAll('button')]
            .filter((e) => e.getClientRects().length > 0)
            .map((e) => ({
              text: e.textContent,
              width: e.getBoundingClientRect().width,
              height: e.getBoundingClientRect().height,
            }))
            .filter((b) => b.width < 43.5 || b.height < 43.5),
          heading: [...document.querySelectorAll('h1')].map((e) => ({
            text: e.textContent,
            y: e.getBoundingClientRect().y + scrollY,
            size: getComputedStyle(e).fontSize,
            width: e.getBoundingClientRect().width,
            height: e.getBoundingClientRect().height,
          })),
          colors: [...document.querySelectorAll('[data-color]')].map((e) => ({
            role: e.dataset.color,
            background: getComputedStyle(e).backgroundColor,
            foreground: getComputedStyle(e).color,
          })),
          regions: [...document.querySelectorAll('[data-region]')].map((e) => {
            const r = e.getBoundingClientRect();
            return {
              id: e.dataset.region,
              x: r.x,
              y: r.y + scrollY,
              width: r.width,
              height: r.height,
            };
          }),
          layoutDisplays: [
            ...document.querySelectorAll('main,aside,nav,section'),
          ].map((e) => getComputedStyle(e).display),
        }));
        const name = `${view}-${width}-${scale}`;
        if (['detail', 'active', 'complete'].includes(view)) {
          const action = observation.primaryAction;
          check(
            Boolean(
              action &&
              action.top >= 0 &&
              action.bottom <= action.viewportHeight + 1 &&
              action.height >= 44 &&
              action.width >= 44 &&
              action.unobscured,
            ),
            `${name}: primary action is not fully visible in first viewport: ${JSON.stringify(action)}`,
          );
          check(
            Boolean(
              observation.focusScroll &&
              observation.focusScroll.height > 0 &&
              observation.focusScroll.top === 0,
            ),
            `${name}: focused content has no initial scroll viewport`,
          );
        }
        check(
          observation.innerHorizontalOverflow.every((x) => x <= 1),
          `${name}: horizontal overflow within content/action scroll regions`,
        );
        check(
          observation.navLabelOverflow.length === 0,
          `${name}: navigation labels escape their controls: ${observation.navLabelOverflow.join(', ')}`,
        );
        if (
          view === 'today' &&
          observation.resolution.regions.today.screen.heroActionFirst === 1
        )
          check(
            observation.actions.find((a) => a.text === 'Open session')?.y <
              observation.heading[0].y,
            `${name}: compact primary action is below headline`,
          );
        if (view === 'insights') {
          const journal = observation.regions.find(
            (r) => r.id === 'local-history',
          );
          const sample = observation.regions.find(
            (r) => r.id === 'sample-week',
          );
          check(
            journal?.y < sample?.y,
            `${name}: sample chart precedes actual journal`,
          );
        }
        if (view === 'detail')
          check(
            !observation.regions.some((r) => r.id === 'session-card'),
            `${name}: duplicated promotional session card`,
          );
        const expectedHeading =
          observation.resolution.regions[view].screen.headingSize * scale;
        check(
          Math.abs(parseFloat(observation.heading[0].size) - expectedHeading) <
            0.05,
          `${name}: heading ignores semantic shared binding`,
        );
        await page.screenshot({
          path: `${directory}/${name}.png`,
          fullPage: true,
        });
        observations.push({ width, textScale: scale, ...observation });
        if (
          observation.focusScroll &&
          observation.focusScroll.contentHeight >
            observation.focusScroll.height + 1
        ) {
          const scrollProof = await page.evaluate(() => {
            const content = document.querySelector('[data-focus-scroll]');
            content.scrollTop = content.scrollHeight;
            const button = document.querySelector('[data-primary-action]'),
              r = button.getBoundingClientRect();
            return {
              scrolled: content.scrollTop > 0,
              primaryVisible: r.top >= 0 && r.bottom <= innerHeight + 1,
            };
          });
          check(
            scrollProof.scrolled && scrollProof.primaryVisible,
            `${name}: content scroll displaces persistent action`,
          );
          if (width === 390 && scale === 3.6)
            await page.screenshot({
              path: `${directory}/${name}-content-scrolled.png`,
              fullPage: true,
            });
        }
        check(observation.screen === view, `${name}: wrong screen`);
        check(
          observation.resolution.admissible,
          `${name}: shared runtime is not admissible`,
        );
        check(
          observation.horizontalOverflow <= 1,
          `${name}: horizontal overflow ${observation.horizontalOverflow}px`,
        );
        check(
          observation.textOverflow.length === 0,
          `${name}: text overflow ${JSON.stringify(observation.textOverflow)}`,
        );
        check(
          observation.brokenDisplayWords.filter(
            (word) => scale === 1 || word.kind === 'timer',
          ).length === 0,
          `${name}: fractured display words ${JSON.stringify(observation.brokenDisplayWords)}`,
        );
        check(
          observation.smallControls.length === 0,
          `${name}: small controls ${JSON.stringify(observation.smallControls)}`,
        );
        check(
          !observation.layoutDisplays.includes('grid'),
          `${name}: CSS grid used`,
        );
      }
  await writeFile(
    `${directory}/matrix.json`,
    JSON.stringify({ observations, errors, failures }, null, 2) + '\n',
  );
  console.log(`Captured ${observations.length} browser scenarios.`);

  proofPhase = 'compact-menu';
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${base}/?textScale=3.6`);
  await page.waitForFunction(() => window.__VELA_READY__);
  await page.getByRole('button', { name: 'Menu', exact: true }).click();
  await page.getByRole('dialog').waitFor({ state: 'visible' });
  await page.screenshot({
    path: `${directory}/menu-390-3.6.png`,
    fullPage: true,
  });
  for (let i = 0; i < 5; i++) await page.keyboard.press('Tab');
  check(
    await page.evaluate(() =>
      Boolean(document.activeElement?.closest('dialog')),
    ),
    'Compact menu failed to contain keyboard focus',
  );
  await page.keyboard.press('Escape');
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  check(
    await page.evaluate(() => document.activeElement?.textContent === 'Menu'),
    'Compact menu Escape did not restore opener focus',
  );
  await page.getByRole('button', { name: 'Menu', exact: true }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Profile', exact: true })
    .click();
  await page.waitForFunction(() => window.__VELA__.screen === 'profile');
  const menuProof = await page.evaluate(() => ({
    screen: window.__VELA__.screen,
    open: document.querySelector('dialog')?.open,
  }));
  check(!menuProof.open, 'Compact menu remained open after navigation');

  proofPhase = 'zero-discard';
  // Finishing an untouched deep-linked session must discard, not reward a zero-time entry.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => localStorage.clear());
  await page.goto(`${base}/?view=active`);
  await page.waitForFunction(() => window.__VELA_READY__);
  await page
    .getByRole('button', { name: 'Finish session', exact: true })
    .click();
  await page.waitForFunction(() => window.__VELA__.screen === 'today');
  const discarded = await page.evaluate(() => ({
    entries: window.__VELA__.preferences.entries,
    transitions: window.__VELA__.transitions,
    message: document.querySelector('[role=status]')?.textContent,
  }));
  check(
    discarded.entries.length === 0 &&
      discarded.transitions.some((t) => t.event === 'DISCARD') &&
      discarded.message?.includes('Nothing was added'),
    'Zero elapsed session was not explicitly discarded',
  );
  proofPhase = 'timer-navigation-persistence';
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto(base);
  await page.waitForFunction(() => window.__VELA_READY__);
  await page.getByRole('button', { name: 'Open session', exact: true }).click();
  await page.waitForFunction(() => window.__VELA__.screen === 'detail');
  await page.waitForTimeout(80);
  const spatialMotion = await page.locator('main').evaluate((e) => ({
    transform: getComputedStyle(e).transform,
    animations: window.__VELA__.animations,
  }));
  check(
    spatialMotion.transform !== 'none',
    'Normal navigation did not execute spatial motion',
  );
  await page
    .getByRole('button', { name: 'Start session', exact: true })
    .click();
  await page.waitForFunction(() => window.__VELA__.screen === 'active');
  await page.getByRole('button', { name: 'Pause', exact: true }).focus();
  await page.waitForFunction(() => window.__VELA__.elapsed >= 1);
  check(
    (await page.evaluate(() => document.activeElement?.textContent)) ===
      'Pause',
    'Timer updates stole keyboard focus',
  );
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  const paused = await page.evaluate(() => window.__VELA__.elapsed);
  await page.waitForTimeout(350);
  check(
    Math.abs((await page.evaluate(() => window.__VELA__.elapsed)) - paused) <
      0.01,
    'Paused timer advanced',
  );
  await page.getByRole('button', { name: 'Resume', exact: true }).click();
  await page.waitForFunction(
    (before) => window.__VELA__.elapsed > before + 0.3,
    paused,
  );
  await page
    .getByRole('button', { name: 'Finish session', exact: true })
    .click();
  await page.waitForFunction(() => window.__VELA__.screen === 'complete');
  const saved = await page.evaluate(() => ({
    entries: window.__VELA__.preferences.entries,
    transitions: window.__VELA__.transitions,
  }));
  check(
    saved.entries.length === 1 && saved.entries[0].seconds >= 1,
    'Finished session did not persist elapsed time',
  );
  await page
    .getByRole('button', { name: 'View your journal', exact: true })
    .click();
  await page.waitForFunction(() => window.__VELA__.screen === 'insights');
  await page.getByRole('button', { name: 'Profile', exact: true }).click();
  await page
    .getByRole('button', { name: 'Reduce motion', exact: true })
    .click();
  await page.getByRole('button', { name: 'Deep cobalt', exact: true }).click();
  await page.getByRole('button', { name: 'Today', exact: true }).click();
  await page.waitForTimeout(50);
  const reducedMotion = await page.locator('main').evaluate((e) => ({
    transform: getComputedStyle(e).transform,
    opacity: getComputedStyle(e).opacity,
    animations: window.__VELA__.animations,
  }));
  check(
    reducedMotion.transform === 'none',
    'Reduced-motion navigation retained a spatial transform',
  );
  const accent = await page
    .getByRole('button', { name: 'Open session', exact: true })
    .evaluate((e) => getComputedStyle(e).backgroundColor);
  check(
    accent === 'rgb(61, 68, 232)',
    'Action accent did not change to the emitted cobalt token',
  );
  await page.reload();
  await page.waitForFunction(() => window.__VELA_READY__);
  const restored = await page.evaluate(() => window.__VELA__.preferences);
  check(
    restored.motion === 'reduced' &&
      restored.accent === 'cobalt' &&
      restored.entries.length === 1,
    'Local preferences/session failed reload',
  );

  proofPhase = 'unavailable-viewport-boundary';
  const boundaryPage = await browser.newPage({
    viewport: { width: 390, height: 844 },
  });
  boundaryPage.on('pageerror', (error) =>
    errors.push({
      phase: 'unavailable-viewport-boundary',
      message: String(error),
      stack: error.stack,
    }),
  );
  await boundaryPage.addInitScript(() => {
    window.__testWidthDescriptor = Object.getOwnPropertyDescriptor(
      window,
      'innerWidth',
    );
    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      value: 0,
    });
  });
  await boundaryPage.goto(base);
  await boundaryPage.locator('[data-waiting-viewport]').waitFor();
  check(
    await boundaryPage.evaluate(
      () => !window.__VELA_READY__ && !window.__VELA__,
    ),
    'Zero initial geometry evaluated the design program',
  );
  await boundaryPage.evaluate(() => {
    Object.defineProperty(window, 'innerWidth', window.__testWidthDescriptor);
    dispatchEvent(new Event('resize'));
  });
  await boundaryPage.waitForFunction(
    () =>
      window.__VELA_READY__ && window.__VELA__.resolved.values.width === 390,
  );
  await boundaryPage.evaluate(() => {
    window.__testHeightDescriptor = Object.getOwnPropertyDescriptor(
      window,
      'innerHeight',
    );
    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      value: 0,
    });
    Object.defineProperty(window, 'innerHeight', {
      configurable: true,
      value: 0,
    });
    dispatchEvent(new Event('resize'));
  });
  await boundaryPage.waitForTimeout(50);
  const deferredViewport = await boundaryPage.evaluate(() => ({
    raw: { width: innerWidth, height: innerHeight },
    lastResolved: {
      width: window.__VELA__.resolved.values.width,
      height: window.__VELA__.resolved.values.height,
    },
    mounted: Boolean(document.querySelector('[data-screen]')),
    rejections: window.__VELA_VIEWPORT_REJECTIONS__,
  }));
  check(
    deferredViewport.mounted &&
      deferredViewport.lastResolved.width === 390 &&
      deferredViewport.lastResolved.height === 844 &&
      deferredViewport.rejections.length >= 2,
    'Unavailable resize destroyed the last valid view or was not recorded',
  );
  await boundaryPage.evaluate(() => {
    Object.defineProperty(window, 'innerWidth', window.__testWidthDescriptor);
    Object.defineProperty(window, 'innerHeight', window.__testHeightDescriptor);
  });
  await boundaryPage.setViewportSize({ width: 834, height: 1000 });
  await boundaryPage.waitForFunction(
    () =>
      window.__VELA__.resolved.values.width === 834 &&
      window.__VELA__.resolved.values.height === 1000,
  );
  const recoveredViewport = await boundaryPage.evaluate(() => ({
    width: window.__VELA__.resolved.values.width,
    height: window.__VELA__.resolved.values.height,
    admissible: window.__VELA__.resolved.admissible,
  }));
  check(
    recoveredViewport.admissible,
    'Positive viewport failed to recover after unavailable geometry',
  );
  await boundaryPage.close();

  const storageRecovery = [];
  const priorJournal = {
    accent: 'cobalt', motion: 'system', checkIn: 'steady',
    entries: [{ id: 'prior-valid-session', seconds: 127, completedAt: '2026-10-24T12:00:00.000Z' }],
  };
  for (const fault of ['throw', 'corrupt-json', 'invalid-schema']) {
    const storagePage = await browser.newPage({ viewport: { width: 390, height: 844 } });
    storagePage.on('pageerror', (error) => errors.push({ message: String(error), phase: `storage-${fault}` }));
    await storagePage.addInitScript(({ fault, priorJournal }) => {
      const key = 'vela-web-local-v1';
      const originalGet = Storage.prototype.getItem;
      const originalSet = Storage.prototype.setItem;
      const initial = fault === 'corrupt-json' ? '{broken' : fault === 'invalid-schema' ? JSON.stringify({ entries: [] }) : JSON.stringify(priorJournal);
      originalSet.call(localStorage, key, initial);
      const state = window.__STORAGE_FAULT__ = {
        readBlocked: fault === 'throw', failSave: false, writes: [], initial,
        readRaw: () => originalGet.call(localStorage, key),
        repair: () => { state.readBlocked = false; originalSet.call(localStorage, key, JSON.stringify(priorJournal)); },
      };
      Storage.prototype.getItem = function (name) {
        if (name === key && state.readBlocked) throw new Error('Injected storage read failure');
        return originalGet.call(this, name);
      };
      Storage.prototype.setItem = function (name, value) {
        if (name === key) {
          state.writes.push(value);
          if (state.failSave) throw new Error('Injected storage write failure');
        }
        return originalSet.call(this, name, value);
      };
    }, { fault, priorJournal });
    await storagePage.goto(base);
    await storagePage.getByRole('button', { name: 'Retry restore', exact: true }).waitFor();
    await storagePage.getByRole('button', { name: 'Retry restore', exact: true }).click();
    const blocked = await storagePage.evaluate(() => ({
      writes: window.__STORAGE_FAULT__.writes.length,
      unchanged: window.__STORAGE_FAULT__.readRaw() === window.__STORAGE_FAULT__.initial,
      restore: window.__VELA__.storage.restore,
      sessionActions: document.querySelectorAll('[data-screen]').length,
    }));
    check(blocked.writes === 0 && blocked.unchanged && blocked.restore === 'blocked' && blocked.sessionActions === 0,
      `${fault}: failed restoration wrote data or exposed journal mutations`);
    await storagePage.screenshot({ path: `${directory}/restore-error-${fault}.png`, fullPage: true });
    await storagePage.evaluate(() => window.__STORAGE_FAULT__.repair());
    await storagePage.getByRole('button', { name: 'Retry restore', exact: true }).click();
    await storagePage.waitForFunction(() => window.__VELA__.storage.restore === 'ready');
    const recovered = await storagePage.evaluate(() => ({
      preferences: window.__VELA__.preferences,
      writes: window.__STORAGE_FAULT__.writes.length,
    }));
    check(JSON.stringify(recovered.preferences) === JSON.stringify(priorJournal) && recovered.writes === 0,
      `${fault}: restore retry lost prior history or rewrote untouched storage`);
    const result = { fault, blocked, recovered };
    if (fault === 'throw') {
      await storagePage.getByRole('button', { name: 'Profile', exact: true }).click();
      await storagePage.evaluate(() => { window.__STORAGE_FAULT__.failSave = true; });
      await storagePage.getByRole('button', { name: 'Electric lime', exact: true }).click();
      await storagePage.getByRole('button', { name: 'Retry save', exact: true }).waitFor();
      await storagePage.getByRole('button', { name: 'Retry save', exact: true }).click();
      const unsaved = await storagePage.evaluate(() => ({
        memory: window.__VELA__.preferences,
        disk: JSON.parse(window.__STORAGE_FAULT__.readRaw()),
        restore: window.__VELA__.storage.restore,
        saveError: window.__VELA__.storage.saveError,
      }));
      check(unsaved.memory.accent === 'lime' && unsaved.disk.accent === 'cobalt' &&
        unsaved.memory.entries[0].id === 'prior-valid-session' && unsaved.restore === 'ready' && Boolean(unsaved.saveError),
        'Save failure lost in-memory data, changed disk, or was confused with restore failure');
      await storagePage.screenshot({ path: `${directory}/save-error.png`, fullPage: true });
      await storagePage.evaluate(() => { window.__STORAGE_FAULT__.failSave = false; });
      await storagePage.getByRole('button', { name: 'Retry save', exact: true }).click();
      await storagePage.waitForFunction(() => !window.__VELA__.storage.saveError);
      const savedRetry = await storagePage.evaluate(() => JSON.parse(window.__STORAGE_FAULT__.readRaw()));
      check(savedRetry.accent === 'lime' && savedRetry.entries[0].id === 'prior-valid-session',
        'Save retry did not persist current changes with prior history');
      await storagePage.getByRole('button', { name: 'Today', exact: true }).click();
      await storagePage.getByRole('button', { name: 'Open session', exact: true }).click();
      await storagePage.getByRole('button', { name: 'Start session', exact: true }).click();
      await storagePage.waitForFunction(() => window.__VELA__.elapsed >= 1);
      await storagePage.evaluate(() => { window.__STORAGE_FAULT__.failSave = true; });
      await storagePage.getByRole('button', { name: 'Finish session', exact: true }).click();
      await storagePage.getByRole('button', { name: 'Retry save', exact: true }).waitFor();
      const unsavedSession = await storagePage.evaluate(() => ({
        memory: window.__VELA__.preferences.entries,
        disk: JSON.parse(window.__STORAGE_FAULT__.readRaw()).entries,
        receipt: document.querySelector('[data-region="saved-session"]')?.textContent,
      }));
      check(unsavedSession.memory.length === 2 && unsavedSession.disk.length === 1 &&
        unsavedSession.memory[1].id === 'prior-valid-session' && unsavedSession.receipt.includes('Kept in this tab') &&
        !unsavedSession.receipt.includes('Saved to your local journal'),
        'Unsaved session lost history or falsely claimed durable storage');
      await storagePage.evaluate(() => { window.__STORAGE_FAULT__.failSave = false; });
      await storagePage.getByRole('button', { name: 'Retry save', exact: true }).click();
      await storagePage.waitForFunction(() => !window.__VELA__.storage.saveError);
      const durableSession = await storagePage.evaluate(() => JSON.parse(window.__STORAGE_FAULT__.readRaw()).entries);
      check(durableSession.length === 2 && durableSession[1].id === 'prior-valid-session',
        'Session save retry failed to retain new and prior history');
      result.unsavedSession = unsavedSession;
      result.durableSession = durableSession;
      result.unsaved = unsaved;
      result.savedRetry = savedRetry;
    }
    storageRecovery.push(result);
    await storagePage.close();
  }

  proofPhase = 'palette';
  const palettePage = await browser.newPage({
    viewport: { width: 100, height: 100 },
    deviceScaleFactor: 1,
  });
  const pixel = async (html) => {
    await palettePage.setContent(
      `<style>body{margin:0}div{width:100px;height:100px}</style>${html}`,
    );
    return pixelHex(
      await palettePage.screenshot({
        clip: { x: 5, y: 5, width: 1, height: 1 },
      }),
    );
  };
  const palette = [];
  for (const color of [
    'color(display-p3 1 0 0)',
    'oklch(0.7 0.2 220)',
    'lab(55% 65 -40)',
    'hsl(245 80% 55%)',
  ]) {
    const result = convertColor({ color });
    const observed = await pixel(
      `<div style="background:${result.emitted.css}"></div>`,
    );
    palette.push({
      input: color,
      emitted: result.emitted,
      observed,
      measurementRef: result.measurementRef,
    });
    check(
      observed === result.emitted.hex,
      `Emitted fallback ${color}: expected ${result.emitted.hex}, got ${observed}`,
    );
  }
  const alpha = convertColor({
    color: 'rgb(255 0 0 / 0.5)',
    backdrop: '#ffffff',
  });
  const alphaObserved = await pixel(
    `<div style="background:white"><div style="background:${alpha.emitted.css}"></div></div>`,
  );
  palette.push({
    input: 'red 0.5 over white',
    expected: alpha.composite.hex,
    observed: alphaObserved,
  });
  check(
    alphaObserved === alpha.composite.hex,
    `Single alpha compositing: expected ${alpha.composite.hex}, got ${alphaObserved}`,
  );
  const layers = analyzePalette({
    system: {
      tokens: {
        foreground: 'rgb(255 255 255 / .5)',
        background: 'rgb(0 0 0 / .5)',
        paper: '#ffffff',
      },
      roles: [
        {
          id: 'layer',
          foreground: 'foreground',
          background: 'background',
          backdrop: 'paper',
          use: 'text',
          source: ['browser pixel regression'],
        },
      ],
    },
  });
  const layerObserved = await pixel(
    `<div style="background:white"><div style="background:${layers.tokens.background.emitted.css}"><div style="background:${layers.tokens.foreground.emitted.css}"></div></div></div>`,
  );
  palette.push({
    input: 'white 0.5 over black 0.5 over white',
    expected: layers.checks[0].effectiveForeground,
    observed: layerObserved,
  });
  check(
    layerObserved === layers.checks[0].effectiveForeground,
    `Layered alpha compositing: expected ${layers.checks[0].effectiveForeground}, got ${layerObserved}`,
  );
  const adjacent = analyzePalette({
    system: {
      tokens: {
        control: 'rgb(0 0 0 / .5)',
        paper: '#ffffff',
        neighbor: '#000000',
      },
      roles: [
        {
          id: 'control',
          foreground: 'control',
          background: 'paper',
          adjacentBackgrounds: ['neighbor'],
          use: 'non-text',
          source: ['browser pixel regression'],
        },
      ],
    },
  });
  const adjacentObserved = await pixel(
    `<div style="background:white"><div style="background:${adjacent.tokens.control.emitted.css}"></div></div>`,
  );
  palette.push({
    input: 'black 0.5 over white compared with black neighbor',
    expected: adjacent.checks.map((x) => x.effectiveForeground),
    observed: adjacentObserved,
  });
  check(
    adjacent.checks.every((x) => x.effectiveForeground === adjacentObserved),
    'Adjacent comparison recomposited a physically unchanged foreground',
  );
  await palettePage.close();

  check(errors.length === 0, `Browser errors: ${JSON.stringify(errors)}`);
  const report = {
    browser: browser.version(),
    scenarios: observations.length,
    observations,
    interactions: {
      saved,
      discarded,
      menuProof,
      storageRecovery,
      deferredViewport,
      recoveredViewport,
      paused,
      restored,
      spatialMotion,
      reducedMotion,
      accent,
    },
    palette,
    errors,
    failures,
    scope:
      'Chromium, React and compiled StyleX only. Actual browser measurements, task navigation, spring/fade animation and local persistence. Mathematical predictions are not native evidence or a human visual preference result.',
  };
  await writeFile(
    `${directory}/report.json`,
    JSON.stringify(report, null, 2) + '\n',
  );
  console.log(
    JSON.stringify(
      {
        scenarios: observations.length,
        screenshots: directory,
        palette,
        failures,
      },
      null,
      2,
    ),
  );
  assert.equal(failures.length, 0, failures.join('\n'));
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
