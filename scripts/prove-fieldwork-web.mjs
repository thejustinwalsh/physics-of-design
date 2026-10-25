import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import path from 'node:path';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { analyzeComposition } from '../dist/index.js';
let server;
let base = process.env.FIELDWORK_URL;
if (!base) {
  const root = path.resolve('artifacts/fieldwork/web');
  server = createServer(async (request, response) => {
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
      const ext = path.extname(target);
      response.writeHead(200, {
        'content-type':
          {
            '.html': 'text/html',
            '.js': 'application/javascript',
            '.png': 'image/png',
            '.ttf': 'font/ttf',
          }[ext] ?? 'application/octet-stream',
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
  base = `http://127.0.0.1:${server.address().port}`;
}

const directory =
  process.env.FIELDWORK_PROOF_DIR ?? 'artifacts/fieldwork/proof-web-v2';
await mkdir(directory, { recursive: true });
const browser = await chromium.launch({ headless: true });
const observations = [];
try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(String(error)));
  for (const width of [390, 834, 1440])
    for (const view of ['cover', 'issue', 'story'])
      for (const textScale of [1, 2]) {
        await page.setViewportSize({ width, height: width < 700 ? 844 : 1000 });
        await page.goto(`${base}/?view=${view}&textScale=${textScale}`);
        await page.waitForFunction(() => window.__FIELDWORK_READY__);
        await page.evaluate(async () => {
          await document.fonts.ready;
          await Promise.all(
            [...document.images].map((image) => image.decode()),
          );
        });
        const measurement = await page.evaluate(() => ({
          plan: window.__FIELDWORK_PLAN__,
          viewport: {
            width: innerWidth,
            height: document.documentElement.scrollHeight,
          },
          horizontalOverflow: Math.max(
            0,
            document.documentElement.scrollWidth - innerWidth,
          ),
          textOverflow: [...document.querySelectorAll('h1,h2,h3,p')]
            .filter((element) => element.scrollWidth > element.clientWidth + 1)
            .map((element) => ({
              text: element.textContent,
              overflow: element.scrollWidth - element.clientWidth,
            })),
          rectangles: [...document.querySelectorAll('[data-region]')].map(
            (element) => {
              const b = element.getBoundingClientRect();
              return {
                id: element.dataset.region,
                box: {
                  x: b.x,
                  y: b.y + scrollY,
                  width: b.width,
                  height: b.height,
                },
              };
            },
          ),
          artwork: [...document.querySelectorAll('[data-artwork]')].map(
            (element, index) => {
              const b = element.getBoundingClientRect();
              return {
                id: 'media-' + index,
                peer: !!element.closest('article[data-region]'),
                box: {
                  x: b.x,
                  y: b.y + scrollY,
                  width: b.width,
                  height: b.height,
                },
              };
            },
          ),
          fonts: [...document.querySelectorAll('h1,h2,p')]
            .slice(0, 5)
            .map((element) => ({
              text: element.textContent,
              family: getComputedStyle(element).fontFamily,
              size: getComputedStyle(element).fontSize,
            })),
        }));
        const file = `${view}-${width}-${textScale}`;
        await page.screenshot({
          path: `${directory}/${file}.png`,
          fullPage: true,
        });
        const composition = analyzeComposition({
          viewport: measurement.viewport,
          rectangles: measurement.rectangles,
          readingOrder: measurement.rectangles.map((rect) => rect.id),
        });
        const peers = measurement.artwork.filter((item) => item.peer);
        const aligned =
          measurement.plan.columns === 1 ? measurement.artwork : peers;
        const constraints =
          aligned.length < 2
            ? []
            : [
                {
                  id: 'media-alignment',
                  members: aligned.map((item) => item.id),
                  axis: measurement.plan.columns === 1 ? 'left' : 'top',
                  tolerance: 1,
                  source: 'authored shared media rails or equivalent peer row',
                },
                ...(measurement.plan.columns === 1
                  ? [
                      {
                        id: 'media-right',
                        members: aligned.map((item) => item.id),
                        axis: 'right',
                        tolerance: 1,
                        source: 'authored shared mobile gutter',
                      },
                    ]
                  : [
                      {
                        id: 'peer-width',
                        members: aligned.map((item) => item.id),
                        axis: 'width',
                        tolerance: 1,
                        source: 'equivalent secondary media frames',
                      },
                    ]),
              ];
        const mediaAlignment = analyzeComposition({
          viewport: measurement.viewport,
          rectangles: measurement.artwork.map(({ id, box }) => ({ id, box })),
          constraints,
        });
        assert.ok(
          mediaAlignment.constraints.every((check) => check.pass),
          `${file}: media alignment ${JSON.stringify(mediaAlignment.constraints)}`,
        );
        observations.push({
          view,
          width,
          textScale,
          measurement,
          composition,
          mediaAlignment,
        });
        assert.equal(
          measurement.horizontalOverflow,
          0,
          `${file}: horizontal overflow`,
        );
        assert.equal(
          measurement.textOverflow.length,
          0,
          `${file}: text overflow ${JSON.stringify(measurement.textOverflow)}`,
        );
      }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`${base}/?density=0.9&textScale=1.3`);
  await page
    .getByRole('link', { name: 'Explore the outside issue', exact: true })
    .click();
  await page.getByRole('heading', { name: 'The outside issue.' }).waitFor();
  const [popup] = await Promise.all([
    page.context().waitForEvent('page'),
    page
      .getByRole('link', {
        name: 'Read The art of looking longer',
        exact: true,
      })
      .click({ modifiers: ['ControlOrMeta'] }),
  ]);
  await popup
    .getByRole('heading', { name: 'The art of looking longer', exact: true })
    .waitFor();
  await popup.close();
  await page
    .getByRole('link', {
      name: 'Read The art of looking longer',
      exact: true,
    })
    .click();
  await page
    .getByRole('heading', { name: 'The art of looking longer', exact: true })
    .waitFor();
  assert.equal(
    await page.evaluate(() => window.__FIELDWORK_PLAN__.request.textScale),
    1.3,
  );
  await page.goBack();
  await page.getByRole('heading', { name: 'The outside issue.' }).waitFor();
  await page.goForward();
  await page
    .getByRole('heading', { name: 'The art of looking longer', exact: true })
    .waitFor();
  await page.evaluate(() => scrollTo(0, 500));
  await page.waitForTimeout(200);
  await page.goBack();
  await page.getByRole('heading', { name: 'The outside issue.' }).waitFor();
  await page.goForward();
  await page
    .getByRole('heading', { name: 'The art of looking longer', exact: true })
    .waitFor();
  assert.ok(
    Math.abs((await page.evaluate(() => scrollY)) - 500) < 3,
    'Browser restores story reading position',
  );
  await page
    .getByRole('button', { name: 'Get field notes', exact: false })
    .first()
    .click();
  await page.getByLabel('Email address').fill('reader@example.test');
  await page.getByRole('button', { name: 'Keep me curious' }).click();
  await page.getByText('No email has been sent', { exact: false }).waitFor();
  assert.equal(
    await page.evaluate(() => localStorage.getItem('fieldwork-preview-email')),
    'reader@example.test',
  );
  assert.deepEqual(errors, []);
  await writeFile(
    `${directory}/summary.json`,
    JSON.stringify(
      {
        passed: true,
        scenarios: observations.length,
        interactions: [
          'issue navigation',
          'story navigation',
          'browser Back/Forward and reading-position restoration',
          'real route link opens story in a new tab',
          'design-parameter continuity',
          'local-only sign-up confirmation',
        ],
        observations,
        scope:
          'Real compiled React/StyleX Chromium rendering and interactions. Composition descriptors are not aesthetic validation.',
      },
      null,
      2,
    ) + '\n',
  );
  console.log(
    `Passed ${observations.length} complete-composition browser scenarios and interaction flows.`,
  );
} catch (error) {
  await writeFile(
    `${directory}/failure.json`,
    JSON.stringify({ error: String(error), observations }, null, 2),
  );
  throw error;
} finally {
  await browser.close();
  if (server) await new Promise((resolve) => server.close(resolve));
}
