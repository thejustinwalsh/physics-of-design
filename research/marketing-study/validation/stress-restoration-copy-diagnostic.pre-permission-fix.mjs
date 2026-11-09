import { chromium, webkit } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
const [trialArgument, originsArgument] = process.argv.slice(2);
if (!trialArgument || !originsArgument) throw new Error('Usage: node research/marketing-study/validation/stress-restoration-copy-diagnostic.mjs TRIAL_DIR ORIGINS_JSON');
const trial = path.resolve(trialArgument);
const { arms } = JSON.parse(await fs.readFile(path.join(trial, 'manifest.json'), 'utf8'));
const { origins } = JSON.parse(await fs.readFile(path.resolve(originsArgument), 'utf8'));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const output = path.join(trial, 'evaluation', 'stress-restoration-copy-diagnostic.json');
const report = { version: 1, startedAt: new Date().toISOString(), codeSHA256: hash(await fs.readFile(fileURLToPath(import.meta.url))), scope: 'Read-only fresh-context reproduction of the original temporary DOM stress/restore operations, both engines at phone390 and desktop1440 for first manifest arm; includes the preceding real copy-button action. Records exact attribute mismatches, computed text sizes and resize outcomes. No source or original report repairs. Runtime changes below are the same temporary browser-only probes as the original evaluator.', runs: [], infrastructureErrors: [] };
const save = () => fs.writeFile(output, JSON.stringify(report, null, 2));
const settle = async page => { await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))); await page.waitForTimeout(200); };
async function prepare(page, origin) {
  await page.goto(origin, { waitUntil: 'load', timeout: 30000 });
  await page.evaluate(() => document.fonts.ready);
  await settle(page);
  const copy = page.getByRole('button', { name: /copy/i }).first();
  if (await copy.count() && await copy.isVisible()) {
    await copy.click({ timeout: 4000 });
    await page.waitForTimeout(300);
  }
  // Reproduce the original preceding reduced-motion traversal, then scroll top.
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const targets = page.locator('h1,h2,h3,section,[role="region"]');
  for (let i = 0; i < await targets.count(); i++) {
    await targets.nth(i).evaluate(e => e.scrollIntoView({ block: 'center', behavior: 'instant' }));
    await settle(page);
  }
  await page.evaluate(() => scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' }));
  await settle(page);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));
}
async function begin(page, key, kind) {
  return page.evaluate(({ key, kind }) => {
    const hero = document.querySelector('h1');
    const elements = [...document.querySelectorAll('body *')].filter(e => [...e.childNodes].some(n => n.nodeType === Node.TEXT_NODE && n.textContent.trim()));
    const styles = elements.map((element, index) => {
      const r = element.getBoundingClientRect();
      return { element, index, original: element.getAttribute('style'), fontSize: parseFloat(getComputedStyle(element).fontSize), originalRect: { x: r.x + scrollX, y: r.y + scrollY, width: r.width, height: r.height } };
    });
    const saved = { hero, nodes: hero ? [...hero.childNodes] : [], styles, html: document.body.innerHTML, text: document.body.textContent };
    Object.defineProperty(window, key, { value: saved, configurable: true });
    if (kind === 'enlargedText') for (const { element, fontSize } of styles) element.style.setProperty('font-size', `${fontSize * 2}px`, 'important');
    else if (kind === 'changedHeading' && hero) hero.replaceChildren(document.createTextNode(`${hero.textContent} — built for every ambitious team, across every project and every working day`));
    return { textElements: elements.length };
  }, { key, kind });
}
async function sample(page, key, phase, restore = false) {
  return page.evaluate(({ key, phase, restore }) => {
    const saved = window[key];
    const identity = ({ element, index }) => ({ index, tag: element.tagName, id: element.id, class: String(element.className), text: element.textContent.trim().slice(0, 60), connected: element.isConnected, inHero: !!saved.hero?.contains(element) });
    const mismatches = () => saved.styles.filter(({ element, original }) => element.getAttribute('style') !== original).map(entry => {
      const { element, original } = entry;
      const normalized = document.createElement('span');
      if (original !== null) normalized.setAttribute('style', original);
      return { ...identity(entry), original, restored: element.getAttribute('style'), originalNormalizedCSS: normalized.style.cssText, restoredNormalizedCSS: element.style.cssText, normalizedEqual: normalized.style.cssText === element.style.cssText };
    });
    let beforeHeroReattachment;
    if (restore) {
      for (const { element, original } of saved.styles) {
        if (original === null) element.removeAttribute('style'); else element.setAttribute('style', original);
      }
      beforeHeroReattachment = mismatches();
      if (saved.hero) saved.hero.replaceChildren(...saved.nodes);
    }
    const attributeMismatches = mismatches();
    const fontMismatches = saved.styles.flatMap(entry => {
      const current = parseFloat(getComputedStyle(entry.element).fontSize);
      return Math.abs(current - entry.fontSize) > 0.1 ? [{ ...identity(entry), originalFontSize: entry.fontSize, currentFontSize: current }] : [];
    });
    const geometryMismatches = saved.styles.flatMap(entry => {
      const r = entry.element.getBoundingClientRect();
      const current = { x: r.x + scrollX, y: r.y + scrollY, width: r.width, height: r.height };
      return Object.keys(current).some(key => Math.abs(current[key] - entry.originalRect[key]) > 1) ? [{ ...identity(entry), before: entry.originalRect, after: current }] : [];
    });
    const currentText = document.body.textContent;
    let textDiff;
    if (saved.text !== currentText) {
      let start = 0;
      while (start < Math.min(saved.text.length, currentText.length) && saved.text[start] === currentText[start]) start++;
      textDiff = { firstDifference: start, originalLength: saved.text.length, currentLength: currentText.length, before: saved.text.slice(Math.max(0, start - 90), start + 130), after: currentText.slice(Math.max(0, start - 90), start + 130) };
    }
    return {
      phase, textDiff, textRestored: saved.text === document.body.textContent,
      nodesRestored: !saved.hero || saved.nodes.length === saved.hero.childNodes.length && saved.nodes.every((node, index) => saved.hero.childNodes[index] === node),
      bodyHTMLMatchesBaseline: saved.html === document.body.innerHTML,
      attributeMismatchCount: attributeMismatches.length, attributeMismatches: attributeMismatches.slice(0, 12),
      beforeHeroReattachmentMismatchCount: beforeHeroReattachment?.length, beforeHeroReattachmentMismatches: beforeHeroReattachment?.slice(0, 12),
      nonEquivalentCSSMismatchCount: attributeMismatches.filter(entry => !entry.normalizedEqual).length,
      fontMismatchCount: fontMismatches.length, fontMismatches: fontMismatches.slice(0, 12),
      geometryMismatchCount: geometryMismatches.length, geometryMismatches: geometryMismatches.slice(0, 8),
      viewport: { width: innerWidth, height: innerHeight }, scrollY,
    };
  }, { key, phase, restore });
}
async function resizeRoundTrip(page, viewport) {
  await page.setViewportSize({ width: viewport.width === 390 ? 1440 : 390, height: 844 });
  await settle(page);
  await page.setViewportSize(viewport);
  await settle(page);
}
for (const { id } of arms.slice(0, 1)) for (const [engineName, engine] of Object.entries({ chromium, webkit })) {
  let browser;
  try { browser = await engine.launch({ headless: true }); }
  catch (error) { report.infrastructureErrors.push({ id, engine: engineName, error: error.message }); await save(); continue; }
  try {
    for (const viewport of [{ width: 390, height: 844 }, { width: 1440, height: 900 }]) {
      const run = { id, engine: engineName, viewport, pageErrors: [], probes: [] };
      report.runs.push(run);
      const context = await browser.newContext({ viewport });
      try { await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: origins[id] }); } catch {}
      const page = await context.newPage();
      page.on('pageerror', error => run.pageErrors.push(error.message));
      try {
        await prepare(page, origins[id]);
        const keys = [];
        for (const kind of ['enlargedText', 'changedHeading']) {
          const key = `__restorationDiagnostic_${Date.now()}_${Math.random().toString(36).slice(2)}`;
          keys.push(key);
          const probe = { kind, before: await begin(page, key, kind) };
          run.probes.push(probe);
          try {
            await settle(page);
            // Original inspect() includes font/style/geometry queries before screenshot.
            await page.evaluate(() => [...document.querySelectorAll('body *')].forEach(e => { getComputedStyle(e).opacity; e.getBoundingClientRect(); }));
            await page.screenshot({ timeout: 15000 });
          } finally {
            probe.immediate = await sample(page, key, 'immediate restoration', true);
            await settle(page);
            probe.settled = await sample(page, key, 'after two RAF plus 200ms');
          }
        }
        await resizeRoundTrip(page, viewport);
        run.afterFollowingResize = await sample(page, keys[0], 'after both probes and subsequent resize round trip');
        for (const key of keys) await page.evaluate(key => { delete window[key]; }, key);
        // Fresh matched page: distinguish ordinary resize/animation effects from probe residue.
        const control = await context.newPage();
        control.on('pageerror', error => run.pageErrors.push(error.message));
        try {
          await prepare(control, origins[id]);
          const key = '__noStressResizeControl';
          await begin(control, key, 'no mutation');
          await resizeRoundTrip(control, viewport);
          run.noStressResizeControl = await sample(control, key, 'fresh page, resize only');
        } finally { await control.close(); }
      } catch (error) { run.executionError = error.message; }
      finally { await context.close(); await save(); }
    }
  } finally { await browser.close(); }
}
report.completedAt = new Date().toISOString();
report.summary = {
  runs: report.runs.length, infrastructureErrors: report.infrastructureErrors.length,
  executionErrors: report.runs.filter(run => run.executionError).length,
  probesWithImmediateAttributeMismatch: report.runs.flatMap(run => run.probes).filter(probe => probe.immediate?.attributeMismatchCount).length,
  probesWithSettledNonEquivalentCSS: report.runs.flatMap(run => run.probes).filter(probe => probe.settled?.nonEquivalentCSSMismatchCount).length,
  probesWithSettledFontMismatch: report.runs.flatMap(run => run.probes).filter(probe => probe.settled?.fontMismatchCount).length,
};
await save();
console.log(JSON.stringify({ report: output, ...report.summary }, null, 2));
if (report.summary.infrastructureErrors || report.summary.executionErrors) process.exitCode = 1;
