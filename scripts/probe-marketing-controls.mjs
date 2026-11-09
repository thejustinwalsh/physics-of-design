import { chromium, webkit } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';

const [trialArgument, originsArgument] = process.argv.slice(2);
if (!trialArgument || !originsArgument) {
  console.error('Usage: node scripts/probe-marketing-controls.mjs TRIAL_DIR ORIGINS_JSON');
  process.exit(2);
}
const trial = path.resolve(trialArgument);
const manifest = JSON.parse(await fs.readFile(path.join(trial, 'manifest.json'), 'utf8'));
const { origins } = JSON.parse(await fs.readFile(path.resolve(originsArgument), 'utf8'));
if (!Array.isArray(manifest.arms) || !manifest.arms.length) throw new Error('No manifest arms');
for (const { id } of manifest.arms) {
  if (!/^[A-Za-z0-9_-]+$/.test(id)) throw new Error('Unsafe arm ID');
  const url = new URL(origins[id]);
  if (!['http:', 'https:'].includes(url.protocol) || url.pathname !== '/' || url.search || url.hash || url.username || url.password) throw new Error('Expected root http(s) origin for each arm');
}
const output = path.join(trial, 'evaluation');
await fs.mkdir(output, { recursive: true });
const viewports = [{ name: 'phone', width: 390, height: 844 }, { name: 'tablet', width: 834, height: 1112 }, { name: 'desktop', width: 1440, height: 900 }];
const report = {
  version: 1, startedAt: new Date().toISOString(), origins, viewports,
  scope: {
    discovery: 'DOM input[type=range], input[type=color], input[type=radio], select; maximum first 20 of each per run; hidden/disabled controls recorded without synthetic interaction',
    range: 'Real mouse down, 12 separate continuous pointer moves with current geometry samples, mouse up; actual keyboard ArrowRight/Home/End. Repeated first operable range with reduced motion.',
    observations: 'Computed styles/text/SVG attributes for up to 200 main, SVG, canvas, headings, paragraph and inline-style elements outside the input node; visible canvas image hashes before/after. These are sampled DOM observations, not all-control truth.',
    causality: 'Outside-control changes and indirect animations cannot establish coupling. No aesthetic score, implementation hook, source inspection or repairs.',
    color: 'Native color popup is opened with a real click and keyboard attempted; backend restrictions may leave result unknown. No direct assignment to input.value.',
    stability: 'Tolerance 1 CSS pixel for current rail x/y/width/height. Document-space and viewport-space motion reported separately from automatic page scrolling.',
  }, runs: [], infrastructureErrors: [],
};
const save = () => fs.writeFile(path.join(output, 'controls.json'), JSON.stringify(report, null, 2));
const settle = async page => { await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))); await page.waitForTimeout(80); };
async function state(handle, type, index) {
  return handle.evaluate((element, { type, index }) => {
    const r = element.getBoundingClientRect(), style = getComputedStyle(element);
    const labelledBy = (element.getAttribute('aria-labelledby') || '').split(/\s+/).map(id => document.getElementById(id)?.textContent || '').join(' ');
    return {
      connected: element.isConnected, sameCurrentNode: document.querySelectorAll(type)[index] === element,
      tag: element.tagName, id: element.id, type: element.type, value: element.value, checked: element.checked,
      min: element.min, max: element.max, step: element.step, disabled: element.disabled,
      label: element.getAttribute('aria-label') || labelledBy.trim() || [...(element.labels || [])].map(label => label.textContent.trim()).join(' ') || null,
      rect: { x: r.x, y: r.y, width: r.width, height: r.height },
      documentRect: { x: r.x + scrollX, y: r.y + scrollY, width: r.width, height: r.height },
      scroll: { x: scrollX, y: scrollY }, focused: document.activeElement === element,
      visible: r.width > 0 && r.height > 0 && style.display !== 'none' && style.visibility !== 'hidden',
    };
  }, { type, index });
}
async function outside(page) {
  return page.evaluate(() => [...document.querySelectorAll('main,svg,canvas,h1,h2,h3,p,[style]')].filter(e => !e.matches('input,select,option')).slice(0, 200).map((element, index) => {
    const s = getComputedStyle(element), r = element.getBoundingClientRect();
    return {
      index, tag: element.tagName, id: element.id, text: ['P', 'H1', 'H2', 'H3'].includes(element.tagName) ? element.textContent.trim().slice(0, 200) : undefined,
      properties: { transform: s.transform, opacity: s.opacity, color: s.color, backgroundColor: s.backgroundColor, fontSize: s.fontSize, fontWeight: s.fontWeight, letterSpacing: s.letterSpacing, filter: s.filter, width: s.width, height: s.height, svgViewBox: element.getAttribute('viewBox'), svgD: element.getAttribute('d') },
      rect: { x: r.x, y: r.y, width: r.width, height: r.height },
    };
  }));
}
function changes(before, after) {
  return after.flatMap(current => {
    const previous = before.find(e => e.index === current.index && e.tag === current.tag && e.id === current.id);
    if (!previous) return [{ index: current.index, tag: current.tag, id: current.id, observation: 'Sampled node identity changed or new sample' }];
    const keys = Object.keys(current.properties).filter(key => previous.properties[key] !== current.properties[key]);
    const textChanged = previous.text !== current.text;
    return keys.length || textChanged ? [{ index: current.index, tag: current.tag, id: current.id, properties: keys.map(key => ({ key, before: previous.properties[key], after: current.properties[key] })), ...(textChanged ? { text: { before: previous.text, after: current.text } } : {}) }] : [];
  });
}
async function canvasHashes(page) {
  const result = [];
  const canvases = page.locator('canvas');
  for (let i = 0; i < Math.min(2, await canvases.count()); i++) {
    try {
      if (!(await canvases.nth(i).isVisible())) continue;
      const box = await canvases.nth(i).boundingBox(), viewport = page.viewportSize();
      if (!box || box.x < 0 || box.y < 0 || box.x + box.width > viewport.width || box.y + box.height > viewport.height) {
        result.push({ index: i, unavailable: 'Canvas not fully in current viewport; skipped to avoid auto-scrolling the control probe' });
        continue;
      }
      const buffer = await page.screenshot({ clip: box, timeout: 2000 });
      result.push({ index: i, hash: createHash('sha256').update(buffer).digest('hex') });
    } catch (error) { result.push({ index: i, unavailable: error.message }); }
  }
  return result;
}
function moved(before, after, key) {
  return ['x', 'y', 'width', 'height'].some(property => Math.abs(after[key][property] - before[key][property]) > 1);
}
async function rangeProbe(page, index, screenshot) {
  const type = 'input[type="range"]';
  const handle = await page.locator(type).nth(index).elementHandle();
  const result = { index, pointerSamples: [], keyboard: [] };
  if (!handle) return { ...result, unavailable: 'Input disappeared before probe' };
  try {
    result.discovered = await state(handle, type, index);
    if (!result.discovered.visible || result.discovered.disabled) return { ...result, skipped: 'Hidden or disabled' };
    await handle.scrollIntoViewIfNeeded();
    await settle(page);
    result.before = await state(handle, type, index);
    result.outsideBefore = await outside(page);
    result.canvasesBefore = await canvasHashes(page);
    await screenshot(`range-${index}-before`);
    const rail = result.before.rect;
    const startX = rail.x + Math.min(10, rail.width / 4), endX = rail.x + rail.width - Math.min(10, rail.width / 4), y = rail.y + rail.height / 2;
    await page.mouse.move(startX, y);
    await page.mouse.down();
    try {
      result.pointerDown = await state(handle, type, index);
      for (let step = 1; step <= 12; step++) {
        const pointer = { x: startX + (endX - startX) * step / 12, y };
        await page.mouse.move(pointer.x, pointer.y);
        await settle(page);
        const current = await state(handle, type, index);
        const hit = await handle.evaluate((element, { x, y }) => { const e = document.elementFromPoint(x, y); return e ? { tag: e.tagName, id: e.id, type: e.type, matchesCurrentInput: e === element } : null; }, pointer);
        result.pointerSamples.push({ step, pointer, hit, state: current, viewportRailMoved: moved(result.before, current, 'rect'), documentRailMoved: moved(result.before, current, 'documentRect'), outsideChanges: changes(result.outsideBefore, await outside(page)) });
      }
    } finally { await page.mouse.up(); }
    result.afterPointer = await state(handle, type, index);
    result.documentRailUnstableWhileActive = [result.pointerDown, ...result.pointerSamples.map(sample => sample.state)].some(current => moved(result.before, current, 'documentRect'));
    result.viewportRailMovedWhileActive = [result.pointerDown, ...result.pointerSamples.map(sample => sample.state)].some(current => moved(result.before, current, 'rect'));
    result.pageScrolledWhileActive = result.pointerSamples.some(sample => sample.state.scroll.x !== result.before.scroll.x || sample.state.scroll.y !== result.before.scroll.y);
    if (result.pageScrolledWhileActive) result.scrollNote = 'Viewport rail movement includes page scroll; document-space instability is reported independently.';
    result.missedOrReplacedNode = result.pointerSamples.some(sample => !sample.state.connected || !sample.state.sameCurrentNode);
    result.pointerTargetMisses = result.pointerSamples.filter(sample => !sample.hit?.matchesCurrentInput).map(sample => sample.step);
    if (result.pointerTargetMisses.length) result.pointerTargetNote = 'Pointer is outside current input geometry at these samples; native pointer capture may still deliver input events.';
    await handle.focus();
    for (const key of ['ArrowRight', 'Home', 'End']) {
      const before = await state(handle, type, index);
      await page.keyboard.press(key);
      await settle(page);
      const after = await state(handle, type, index);
      result.keyboard.push({ key, before, after, valueChanged: before.value !== after.value, outsideChanges: changes(result.outsideBefore, await outside(page)) });
    }
    result.after = await state(handle, type, index);
    result.outsideAfter = await outside(page);
    result.outsideChanges = changes(result.outsideBefore, result.outsideAfter);
    result.canvasesAfter = await canvasHashes(page);
    result.observableOutsideControlChanges = result.outsideChanges.length > 0 || result.pointerSamples.some(sample => sample.outsideChanges.length > 0) || result.canvasesAfter.some(canvas => canvas.hash && result.canvasesBefore.some(before => before.index === canvas.index && before.hash && before.hash !== canvas.hash));
    result.interpretation = 'Observed changes may include unrelated animation or responsive effects; this does not establish control coupling.';
    await screenshot(`range-${index}-after`);
  } catch (error) { result.error = error.message; }
  finally { await handle.dispose(); }
  return result;
}
async function otherProbe(page, type, index) {
  const handle = await page.locator(type).nth(index).elementHandle();
  if (!handle) return { index, unavailable: 'Node absent' };
  const result = { index, actions: [] };
  try {
    result.before = await state(handle, type, index);
    if (!result.before.visible || result.before.disabled) return { ...result, skipped: 'Hidden or disabled' };
    await handle.scrollIntoViewIfNeeded();
    const baseline = await outside(page);
    await handle.click({ timeout: 3000 });
    await settle(page);
    result.actions.push({ action: 'click', state: await state(handle, type, index), outsideChanges: changes(baseline, await outside(page)) });
    if (result.before.type === 'color') {
      // Native popup support varies. Keyboard attempts remain actual actions.
      for (const key of ['ArrowRight', 'Enter', 'Escape']) {
        await page.keyboard.press(key);
        await settle(page);
        result.actions.push({ action: key, state: await state(handle, type, index), outsideChanges: changes(baseline, await outside(page)) });
      }
      result.backendScope = 'Native color picker keyboard attempt; unchanged value is unknown, not proof of failed control.';
    } else {
      await page.keyboard.press('Escape');
      await handle.focus();
      for (const key of ['ArrowRight', 'ArrowDown', 'Home', 'End']) {
        await page.keyboard.press(key);
        await settle(page);
        result.actions.push({ action: key, state: await state(handle, type, index), outsideChanges: changes(baseline, await outside(page)) });
      }
    }
    await settle(page);
    result.after = await state(handle, type, index);
    result.outsideChanges = changes(baseline, await outside(page));
  } catch (error) { result.error = error.message; }
  finally { await handle.dispose(); }
  return result;
}

for (const { id } of manifest.arms) for (const [engineName, engine] of Object.entries({ chromium, webkit })) {
  let browser;
  try { browser = await engine.launch({ headless: true }); }
  catch (error) { report.infrastructureErrors.push({ id, engine: engineName, error: error.message }); await save(); continue; }
  try {
    for (const viewport of viewports) {
      const run = { id, engine: engineName, viewport, url: origins[id], pageErrors: [], ranges: [], others: {}, screenshots: [] };
      report.runs.push(run);
      const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height } });
      const page = await context.newPage();
      page.on('pageerror', error => run.pageErrors.push({ message: error.message, phase: run.phase || 'navigation', viewport }));
      const screenshot = async suffix => {
        const filename = `controls-${id}-${engineName}-${viewport.name}-${suffix}.png`;
        await page.screenshot({ path: path.join(output, filename), timeout: 10000 });
        run.screenshots.push(filename);
      };
      try {
        await page.goto(origins[id], { waitUntil: 'load', timeout: 30000 });
        await settle(page);
        run.discoveredCounts = {};
        run.phase = 'range';
        const rangeCount = await page.locator('input[type="range"]').count();
        run.discoveredCounts.range = rangeCount;
        for (let index = 0; index < Math.min(rangeCount, 20); index++) run.ranges.push(await rangeProbe(page, index, screenshot));
        run.phase = 'other-controls';
        for (const type of ['input[type="color"]', 'input[type="radio"]', 'select']) {
          const count = await page.locator(type).count();
          run.discoveredCounts[type] = count;
          run.others[type] = [];
          for (let index = 0; index < Math.min(count, 20); index++) run.others[type].push(await otherProbe(page, type, index));
        }
        const repeat = run.ranges.find(range => range.before && !range.skipped && !range.error);
        run.phase = 'reduced-motion';
        await page.emulateMedia({ reducedMotion: 'reduce' });
        await settle(page);
        if (repeat) run.reducedMotion = await rangeProbe(page, repeat.index, suffix => screenshot(`reduced-${suffix}`));
        else {
          const alternative = Object.entries(run.others).flatMap(([type, controls]) => controls.filter(control => control.before && !control.skipped && !control.error).map(control => ({ type, index: control.index })))[0];
          run.reducedMotion = alternative ? { type: alternative.type, ...await otherProbe(page, alternative.type, alternative.index) } : { unverified: 'No operable sampled control available to repeat' };
        }
      } catch (error) { run.executionError = error.message; }
      finally { await context.close(); await save(); }
    }
  } finally { await browser.close(); }
}
report.completedAt = new Date().toISOString();
report.summary = {
  runs: report.runs.length, infrastructureErrors: report.infrastructureErrors.length,
  incompleteRuns: report.runs.filter(run => run.executionError).length,
  sampledRanges: report.runs.reduce((sum, run) => sum + run.ranges.length, 0),
  unstableRangeObservations: report.runs.flatMap(run => run.ranges).filter(range => range.documentRailUnstableWhileActive).length,
};
await save();
console.log(JSON.stringify({ report: path.join(output, 'controls.json'), ...report.summary }, null, 2));
if (report.summary.infrastructureErrors || report.summary.incompleteRuns) process.exitCode = 1;
