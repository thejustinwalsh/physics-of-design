import { readFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { parseState } from '../dist/state.js';
import { proofHtml } from '../dist/emission.js';
if (!process.argv[2] || !process.argv[3])
  throw new Error('usage: node scripts/render-proof.mjs STATE_JSON OUTPUT_PNG');
const state = parseState(JSON.parse(await readFile(process.argv[2], 'utf8')));
const browser = await chromium.launch({
  headless: true,
  ...(process.env.DESIGN_CHROMIUM
    ? { executablePath: process.env.DESIGN_CHROMIUM }
    : {}),
});
try {
  const page = await browser.newPage({
    viewport: {
      width: Math.ceil(state.viewport.width),
      height: Math.ceil(state.viewport.height),
    },
    deviceScaleFactor: 1,
  });
  await page.setContent(await proofHtml(state, false));
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
  await mkdir(path.dirname(process.argv[3]), { recursive: true });
  await page.screenshot({ path: process.argv[3], fullPage: true });
} finally {
  await browser.close();
}
