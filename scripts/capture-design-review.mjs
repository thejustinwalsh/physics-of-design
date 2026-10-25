import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { proofHtml, parseState } from '../dist/index.js';
const after = process.argv.includes('--after');
const root = after
  ? 'artifacts/review/astra-after'
  : 'artifacts/review/astra-input';
await mkdir(root, { recursive: true });
const browser = await chromium.launch({ headless: true });
const records = [];
try {
  for (const archetype of ['hero', 'editorial'])
    for (const variant of after ? ['original'] : ['original', 'relaxed']) {
      const state =
        variant === 'original'
          ? parseState(
              JSON.parse(await readFile(`examples/${archetype}.json`, 'utf8')),
            )
          : JSON.parse(
              await readFile(
                `artifacts/system/web/${archetype}-smooth.json`,
                'utf8',
              ),
            ).result.candidates[0].state;
      for (const width of [360, 390, 834, 1024, 1440]) {
        const next = {
          ...state,
          viewport: { ...state.viewport, width, height: 1000 },
        };
        const id = `${archetype}-${variant}-${width}`;
        const html = await proofHtml(next, false);
        await writeFile(`${root}/${id}.html`, html);
        const page = await browser.newPage({
          viewport: { width, height: 1000 },
        });
        await page.setContent(html);
        await page.evaluate(() => document.fonts.ready);
        await page.screenshot({ path: `${root}/${id}.png`, fullPage: true });
        await page.close();
        records.push({ id, archetype, variant, width, state: next });
      }
    }
  await writeFile(`${root}/manifest.json`, JSON.stringify(records, null, 2));
  await writeFile(
    `${root}/index.html`,
    `<!doctype html><html lang="en"><meta charset="utf-8"><h1>Typography specimens ${after ? 'after' : 'before'} responsive revision</h1><p>Two text-focused archetypes. Review links at the indicated viewport width. Fonts are licensed and embedded. These are specimens, without invented navigation or calls to action.</p><ul>${records.map((r) => `<li><a href="${r.id}.html">${r.id}</a> · <a href="${r.id}.png">capture</a></li>`).join('')}</ul></html>`,
  );
} finally {
  await browser.close();
}
