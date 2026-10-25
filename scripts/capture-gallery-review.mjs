import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { chromium, webkit } from 'playwright';
const root = path.resolve('artifacts/vela/web/design-theory'),
  output =
    process.env.GALLERY_REVIEW_DIR ??
    'artifacts/design-theory/field-route-review';
await mkdir(output, { recursive: true });
const server = createServer(async (req, res) => {
  try {
    const name = new URL(req.url, 'http://local').pathname;
    const p = path.resolve(
      root,
      '.' + (name.endsWith('/') ? name + 'index.html' : name),
    );
    if (!p.startsWith(root + path.sep)) throw Error('path');
    res.setHeader(
      'Content-Type',
      {
        '.js': 'application/javascript',
        '.html': 'text/html',
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
const report = {
  source: [],
  checks: [],
  errors: [],
  limits: [
    'Read-only local browser route and visual closure checks; capture instrumentation is not performance evidence.',
  ],
};
for (const p of [
  'examples/design-theory/web.jsx',
  'examples/design-theory/LayoutPreview.jsx',
  'examples/design-theory/FieldSession.jsx',
  'examples/design-theory/field-entry.jsx',
  'scripts/build-design-theory.mjs',
  'artifacts/vela/web/design-theory/field/app.js',
  'examples/design-field/gallery-session.json',
  'artifacts/vela/web/design-theory/app.js',
])
  report.source.push({
    path: p,
    sha256: createHash('sha256')
      .update(await readFile(p))
      .digest('hex'),
  });
const check = (passed, label, detail) => {
  report.checks.push({ passed, label, detail });
  if (!passed) report.errors.push({ label, detail });
};
try {
  for (const [engine, type] of Object.entries({ chromium, webkit })) {
    const browser = await type.launch({
      headless: true,
      ...(engine === 'webkit' && process.env.DESIGN_WEBKIT_EXECUTABLE
        ? { executablePath: process.env.DESIGN_WEBKIT_EXECUTABLE }
        : {}),
    });
    try {
      for (const width of [390, 834, 1440]) {
        const page = await browser.newPage({
          viewport: { width, height: 900 },
        });
        page.on('pageerror', (e) =>
          report.errors.push({ engine, width, message: e.message }),
        );
        await page.goto(`http://127.0.0.1:${server.address().port}`);
        await page.waitForFunction(() => window.__DESIGN_THEORY__?.ready);
        await page.evaluate(() => document.fonts.ready);
        await page.locator('[data-field-summary]').scrollIntoViewIfNeeded();
        await page.screenshot({
          path: `${output}/${engine}-${width}-main-summary.png`,
        });
        await page
          .getByRole('link', { name: 'Open the design field', exact: false })
          .first()
          .click();
        const field = page.locator('[data-field-session]');
        await field.waitFor();
        await page.evaluate(() => document.fonts.ready);
        await page.screenshot({
          path: `${output}/${engine}-${width}-field-landing.png`,
        });
        await field
          .getByRole('button', { name: 'Phone · 2× text', exact: true })
          .click();
        await field
          .getByRole('button', { name: '2 · Image & finish', exact: true })
          .click();
        await field
          .getByRole('button', { name: 'Show image & finish', exact: true })
          .click();
        const reach = await field
          .locator('[data-field-media]')
          .evaluate((el) => {
            const a = el.getBoundingClientRect(),
              b = el.closest('[data-field-preview]').getBoundingClientRect();
            return {
              intersection: Math.max(
                0,
                Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top),
              ),
              height: a.height,
            };
          });
        check(
          reach.intersection >= Math.min(reach.height, 100),
          `${engine}/${width}: expression consequence reachable at2x`,
          reach,
        );
        await field.locator('[data-field-preview]').scrollIntoViewIfNeeded();
        await page.screenshot({
          path: `${output}/${engine}-${width}-consequence.png`,
        });
        await field
          .getByRole('button', { name: 'Show type & action', exact: true })
          .click();
        check(
          (await field
            .locator('[data-field-preview]')
            .evaluate((e) => e.scrollTop)) < 2,
          `${engine}/${width}: type return`,
        );
        await field
          .getByRole('button', { name: 'Show image & finish', exact: true })
          .click();
        await field
          .getByText('Inspect relationships, costs and saved evidence', {
            exact: true,
          })
          .click();
        const records = field.locator('[data-field-relationships]');
        check(
          (await records.locator('article').count()) > 0 &&
            (await records.locator('table').count()) === 0,
          `${engine}/${width}: factor records`,
        );
        await records.scrollIntoViewIfNeeded();
        await page.screenshot({
          path: `${output}/${engine}-${width}-records.png`,
        });
        await field
          .getByText('Actual call ledger, source identity and replay', {
            exact: true,
          })
          .click();
        await field
          .locator('[data-field-call-ledger]')
          .scrollIntoViewIfNeeded();
        await page.screenshot({
          path: `${output}/${engine}-${width}-ledger.png`,
        });
        await page.locator('[data-field-return]').click();
        await page.waitForFunction(() => window.__DESIGN_THEORY__?.ready);
        await page
          .getByRole('button', { name: 'Inspect relationships', exact: true })
          .click();
        await page.getByLabel('Inspect layout region').selectOption('image');
        await page.waitForTimeout(100);
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
          .evaluateAll((ns) =>
            ns.map((n) => ({
              id: n.dataset.wireframeNode,
              badge: n.querySelector('path').getBoundingClientRect().right,
              content: n.querySelector('rect').getBoundingClientRect().left,
            })),
          );
        check(
          badges.every((b) => b.badge <= b.content - 4),
          `${engine}/${width}: badges outside content`,
          badges,
        );
        await page
          .locator('[data-layout-preview]')
          .locator('..')
          .screenshot({ path: `${output}/${engine}-${width}-badges.png` });
        const preview = await page
            .locator('[data-layout-preview]')
            .boundingBox(),
          details = await page.locator('[data-layout-details]').boundingBox();
        if (width > 800)
          check(
            details.x >= preview.x + preview.width &&
              details.y < preview.y + preview.height,
            `${engine}/${width}: adjacent inspector`,
            { preview, details },
          );
        await page
          .getByLabel('Layout viewport', { exact: true })
          .scrollIntoViewIfNeeded();
        await page.screenshot({
          path: `${output}/${engine}-${width}-inspector.png`,
        });
        await page
          .locator('[data-surface="material"]')
          .scrollIntoViewIfNeeded();
        check(
          (await page
            .getByText('Activate 3D to light this form', { exact: true })
            .count()) === 1,
          `${engine}/${width}: static activation copy`,
        );
        await page.screenshot({
          path: `${output}/${engine}-${width}-static-material.png`,
        });
        await page.close();
      }
    } finally {
      await browser.close();
    }
  }
} catch (e) {
  report.errors.push({ message: String(e) });
} finally {
  server.close();
  await writeFile(`${output}/report.json`, JSON.stringify(report, null, 2));
}
console.log(
  JSON.stringify({ checks: report.checks.length, errors: report.errors }),
);
if (report.errors.length) process.exitCode = 1;
