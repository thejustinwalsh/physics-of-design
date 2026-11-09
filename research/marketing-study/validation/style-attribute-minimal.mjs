// Source-free browser control for CSSOM serialization versus attribute equality.
import { chromium, webkit } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
const [trialArgument] = process.argv.slice(2);
if (!trialArgument) throw new Error('Usage: node research/marketing-study/validation/style-attribute-minimal.mjs TRIAL_DIR');
const report = { version: 1, codeSHA256: createHash('sha256').update(await fs.readFile(fileURLToPath(import.meta.url))).digest('hex'), scope: 'Synthetic DOM only; no study origin, stylesheet, script or source loaded.', results: [] };
for (const [name, engine] of Object.entries({ chromium, webkit })) {
  const browser = await engine.launch({ headless: true });
  try {
    const page = await browser.newPage();
    const samples = await page.evaluate(() => ['no intermediate attribute read', 'computed style read', 'serialized attribute read'].map(read => {
      const element = document.createElement('p');
      element.textContent = 'Synthetic';
      document.body.append(element);
      const original = element.getAttribute('style'), originalFont = getComputedStyle(element).fontSize;
      element.style.setProperty('font-size', '32px', 'important');
      if (read === 'computed style read') getComputedStyle(element).fontSize;
      if (read === 'serialized attribute read') element.getAttribute('style');
      element.removeAttribute('style');
      return { read, original, restored: element.getAttribute('style'), normalizedCSS: element.style.cssText, originalFont, restoredFont: getComputedStyle(element).fontSize };
    }));
    report.results.push({ engine: name, samples });
  } finally { await browser.close(); }
}
report.completedAt = new Date().toISOString();
const output = path.join(path.resolve(trialArgument), 'evaluation', 'style-attribute-minimal.json');
await fs.writeFile(output, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
