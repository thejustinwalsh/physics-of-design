// Independent actual-DOM control: click Copy, then wait. No stress or resize.
import { chromium, webkit } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
const [trialArgument, originsArgument] = process.argv.slice(2);
if (!trialArgument || !originsArgument) throw new Error('Usage: node research/marketing-study/validation/copy-feedback-timing.mjs TRIAL_DIR ORIGINS_JSON');
const trial = path.resolve(trialArgument);
const { arms } = JSON.parse(await fs.readFile(path.join(trial, 'manifest.json'), 'utf8'));
const { origins } = JSON.parse(await fs.readFile(path.resolve(originsArgument), 'utf8'));
const id = arms[0].id;
const report = { version: 1, id, codeSHA256: createHash('sha256').update(await fs.readFile(fileURLToPath(import.meta.url))).digest('hex'), scope: 'First manifest arm, Chromium/WebKit phone390. Actual visible Copy click followed only by waiting. No enlargement, heading mutation or resize.', runs: [] };
for (const [engineName, engine] of Object.entries({ chromium, webkit })) {
  const browser = await engine.launch();
  try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await context.newPage();
    const run = { engine: engineName, pageErrors: [], samples: [] };
    report.runs.push(run);
    page.on('pageerror', error => run.pageErrors.push(error.message));
    try { await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: origins[id] }); }
    catch (error) { run.permissionDiagnostic = error.message; await context.clearPermissions(); }
    await page.goto(origins[id]);
    const button = page.getByRole('button', { name: /copy/i }).first();
    await button.click();
    const baseline = await page.evaluate(() => ({ text: document.body.textContent, hero: document.querySelector('h1')?.textContent }));
    run.afterClickLabel = await button.innerText();
    const start = Date.now();
    for (let i = 0; i < 16; i++) {
      await page.waitForTimeout(500);
      const current = await page.evaluate(() => ({ text: document.body.textContent, hero: document.querySelector('h1')?.textContent }));
      const sample = { elapsedMs: Date.now() - start, label: await button.innerText(), heroUnchanged: baseline.hero === current.hero };
      if (current.text !== baseline.text) {
        let first = 0;
        while (first < Math.min(current.text.length, baseline.text.length) && current.text[first] === baseline.text[first]) first++;
        sample.textDiff = { before: baseline.text.slice(Math.max(0, first - 50), first + 120), after: current.text.slice(Math.max(0, first - 50), first + 120) };
      }
      run.samples.push(sample);
      if (sample.textDiff) break;
    }
  } finally { await browser.close(); }
}
report.completedAt = new Date().toISOString();
const output = path.join(trial, 'evaluation', 'copy-feedback-timing.json');
await fs.writeFile(output, JSON.stringify(report, null, 2));
console.log(JSON.stringify({ report: output, observations: report.runs.map(run => ({ engine: run.engine, afterClickLabel: run.afterClickLabel, changed: run.samples.find(sample => sample.textDiff), pageErrors: run.pageErrors })) }, null, 2));
