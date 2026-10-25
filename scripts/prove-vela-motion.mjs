import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const directory =
  process.env.VELA_MOTION_PROOF_DIR ?? 'artifacts/vela/proof-motion';
await mkdir(directory, { recursive: true });
const root = path.resolve('artifacts/vela/web');
const sources = [
  'examples/vela/web.jsx',
  'examples/vela/web-motion.js',
  'src/motion-dynamics.ts',
  'src/motion.ts',
  'artifacts/vela/web/app.js',
  'examples/vela/design.generated.json',
  'package-lock.json',
  'scripts/build-vela.mjs',
  'scripts/prove-vela-motion.mjs',
];
const implementationProvenance = Object.fromEntries(
  await Promise.all(
    sources.map(async (file) => [
      file,
      createHash('sha256')
        .update(await readFile(file))
        .digest('hex'),
    ]),
  ),
);
const server = createServer(async (request, response) => {
  try {
    const pathname = new URL(request.url ?? '/', 'http://localhost').pathname;
    const file = path.resolve(
      root,
      '.' + (pathname === '/' ? '/index.html' : decodeURIComponent(pathname)),
    );
    if (!file.startsWith(root + path.sep)) {
      response.writeHead(403).end();
      return;
    }
    response.setHeader(
      'content-type',
      {
        '.html': 'text/html',
        '.js': 'application/javascript',
        '.ttf': 'font/ttf',
      }[path.extname(file)] ?? 'application/octet-stream',
    );
    response.end(await readFile(file));
  } catch {
    response.writeHead(404).end();
  }
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ headless: true });
const errors = [],
  observations = [];
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
page.on('pageerror', (error) => errors.push(String(error)));
const inspect = async (label) => {
  const state = await page.evaluate(() => ({
    screen: window.__VELA__?.screen,
    policyIdentity: window.__VELA__?.policyIdentity,
    motion: window.__VELA_WEB_MOTION__,
    mainTransform: getComputedStyle(document.querySelector('main')).transform,
    elements: [
      ...document.querySelectorAll(
        '[data-motion-heading],[data-motion-card],[data-region="saved-session"] svg',
      ),
    ].map((element) => ({
      name: element.dataset.region ?? element.tagName,
      transform: getComputedStyle(element).transform,
      opacity: Number(getComputedStyle(element).opacity),
      bounds: element.getBoundingClientRect().toJSON(),
    })),
    horizontalOverflow: Math.max(
      0,
      document.documentElement.scrollWidth - innerWidth,
    ),
  }));
  observations.push({ label, ...state });
  return state;
};
const settle = async () => {
  await page.waitForFunction(
    () =>
      window.__VELA_WEB_MOTION__?.activeScenes === 0 &&
      window.__VELA_WEB_MOTION__?.activePresses === 0,
  );
  await page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .map((animation) => animation.finished.catch(() => {})),
    ),
  );
};
const navigate = async (name, screen) => {
  await page.getByRole('button', { name, exact: true }).click({ force: true });
  await page.waitForFunction(
    (value) => window.__VELA__?.screen === value,
    screen,
  );
};
try {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto(base);
  await page.waitForFunction(
    () => window.__VELA_READY__ && window.__VELA_WEB_MOTION__,
  );
  await settle();
  await navigate('Open session', 'detail');
  await page.waitForTimeout(70);
  const entry = await inspect('detail-entering');
  assert.ok(
    entry.elements.some((element) => element.transform !== 'none'),
    'Entry must visibly translate a GSAP-owned descendant',
  );
  assert.ok(
    entry.motion.events.some(
      (event) =>
        event.kind === 'scene-start' &&
        event.screen === 'detail' &&
        !event.reduced,
    ),
  );
  await page.screenshot({ path: `${directory}/detail-entering.png` });
  await settle();
  assert.ok(
    (await inspect('detail-settled')).elements.every(
      (element) => element.transform === 'none',
    ),
    'Settled entrance must remove inline transforms',
  );
  const startButton = page.getByRole('button', {
    name: 'Start session',
    exact: true,
  });
  await startButton.scrollIntoViewIfNeeded();
  const bounds = await startButton.boundingBox();
  await page.mouse.move(
    bounds.x + bounds.width / 2,
    bounds.y + bounds.height / 2,
  );
  await page.mouse.down();
  await page.waitForTimeout(100);
  const pressed = await startButton.evaluate((element) => {
    const matrix = new DOMMatrix(getComputedStyle(element).transform);
    return { scaleX: matrix.a, scaleY: matrix.d };
  });
  assert.ok(
    pressed.scaleX < 0.995 && pressed.scaleX > 0.94,
    `Pointer hold must produce bounded spring press response: ${JSON.stringify(pressed)}`,
  );
  // Release outside the button to inspect recovery without starting the session.
  await page.mouse.move(5, 5);
  await page.mouse.up();
  await page.waitForFunction(
    () => window.__VELA_WEB_MOTION__.activePresses === 0,
  );
  assert.equal(
    await startButton.evaluate(
      (element) => getComputedStyle(element).transform,
    ),
    'none',
  );
  await navigate('Start session', 'active');
  await page.waitForFunction(() => window.__VELA__.elapsed >= 1);
  await navigate('Finish session', 'complete');
  await page.waitForTimeout(100);
  const complete = await inspect('completion-entering');
  assert.ok(
    complete.elements.some(
      (element) =>
        element.name === 'saved-session' && element.transform !== 'none',
    ),
    'Success receipt must visibly move',
  );
  assert.ok(
    complete.motion.events.some((event) => event.kind === 'completion-start'),
  );
  await page.screenshot({ path: `${directory}/completion-entering.png` });
  await settle();
  await page.screenshot({ path: `${directory}/completion-settled.png` });
  assert.equal((await inspect('completion-settled')).motion.activeScenes, 0);

  // Rapid navigation interrupts active timelines; each old scene must clean up.
  await navigate('View your journal', 'insights');
  await navigate('Profile', 'profile');
  await navigate('Today', 'today');
  await settle();
  const rapid = await inspect('rapid-navigation-settled');
  assert.equal(rapid.motion.activeScenes, 0);
  assert.equal(rapid.motion.activePresses, 0);
  assert.ok(
    rapid.motion.events.filter((event) => event.kind === 'cleanup').length >= 5,
  );
  assert.ok(rapid.elements.every((element) => element.transform === 'none'));

  // Browser preference changes during a transition must remove all spatial channels.
  await navigate('Open session', 'detail');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.waitForFunction(() => window.__VELA__?.reducedMotion === true);
  await page.waitForTimeout(30);
  const reduced = await inspect('reduced-motion-interruption');
  assert.equal(reduced.mainTransform, 'none');
  assert.ok(
    reduced.elements.every((element) => element.transform === 'none'),
    'Reduced motion must remove descendant spatial transforms',
  );
  await settle();
  const reducedButton = page.getByRole('button', {
    name: 'Start session',
    exact: true,
  });
  await reducedButton.scrollIntoViewIfNeeded();
  const reducedBounds = await reducedButton.boundingBox();
  await page.mouse.move(
    reducedBounds.x + reducedBounds.width / 2,
    reducedBounds.y + reducedBounds.height / 2,
  );
  await page.mouse.down();
  await page.waitForTimeout(80);
  assert.equal(
    await reducedButton.evaluate(
      (element) => getComputedStyle(element).transform,
    ),
    'none',
  );
  await page.mouse.move(5, 5);
  await page.mouse.up();
  await page.screenshot({ path: `${directory}/reduced-motion.png` });

  // Phone entry/settled geometry retains the existing persistent action dock.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto(`${base}/?view=detail`);
  await page.waitForFunction(
    () => window.__VELA_READY__ && window.__VELA_WEB_MOTION__,
  );
  await settle();
  const phone = await inspect('phone-settled');
  assert.equal(phone.horizontalOverflow, 0);
  const phoneAction = await page
    .getByRole('button', { name: 'Start session', exact: true })
    .boundingBox();
  assert.ok(phoneAction.y >= 0 && phoneAction.y + phoneAction.height <= 844);
  await page.screenshot({ path: `${directory}/phone-detail.png` });
  assert.deepEqual(errors, []);
  const report = {
    createdAt: new Date().toISOString(),
    browser: browser.version(),
    implementationProvenance,
    pressed,
    observations,
    errors,
    scope:
      'Fresh Chromium evidence for additive GSAP entry stagger, held-target spring press response, completion receipt/check motion, interruption cleanup, system reduced motion and phone geometry. The existing handoff identity and historical browser/native evidence are not rewritten.',
  };
  await writeFile(
    `${directory}/report.json`,
    JSON.stringify(report, null, 2) + '\n',
  );
  console.log(
    JSON.stringify({
      directory,
      observations: observations.length,
      pressed,
      errors,
    }),
  );
} catch (error) {
  await writeFile(
    `${directory}/failed-attempt.json`,
    JSON.stringify(
      { error: String(error), errors, observations, implementationProvenance },
      null,
      2,
    ) + '\n',
  );
  throw error;
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
