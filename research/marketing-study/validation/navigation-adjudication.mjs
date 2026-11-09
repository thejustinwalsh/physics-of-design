import { chromium, webkit } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const [trialArgument, originsArgument] = process.argv.slice(2);
if (!trialArgument || !originsArgument) {
  console.error('Usage: node research/marketing-study/validation/navigation-adjudication.mjs TRIAL_DIR ORIGINS_JSON');
  process.exit(2);
}
const trial = path.resolve(trialArgument);
const { arms } = JSON.parse(await fs.readFile(path.join(trial, 'manifest.json'), 'utf8'));
const { origins } = JSON.parse(await fs.readFile(path.resolve(originsArgument), 'utf8'));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const out = path.join(trial, 'evaluation');
await fs.mkdir(out, { recursive: true });
const viewports = [[320,740],[390,844],[768,1024],[834,1112],[1024,768],[1440,900],[1920,1080],[2560,1440],[240,480],[900,160]];
const concepts = {
  features: /feature|tool|capabilit|what.*(?:get|do|build)/i,
  howItWorks: /how\s+(?:it\s+)?works|workflow|process/i,
  getStarted: /get\s*started|\bstart\b|begin|\btry\b|join|sign\s*up|install|quickstart/i,
};
const report = {
  version: 1, startedAt: new Date().toISOString(),
  evaluatorCodeHash: hash(await fs.readFile(fileURLToPath(import.meta.url))),
  scope: 'Read-only supplementary navigation adjudication. Frozen pages and original evaluator are unchanged. Each concept starts on a fresh page, opens an actual visible menu if needed, and clicks existing same-page anchors. No aesthetic ratings.',
  criteria: { features: concepts.features.source, howItWorks: concepts.howItWorks.source, getStarted: concepts.getStarted.source },
  timing: 'Target must overlap viewport and its top/bottom geometry remain within 2 CSS pixels for 3 samples, 150ms apart; maximum 8 seconds. Original 650ms condition is recorded at first sample after that threshold.',
  sourceHashesScope: 'Bytes of frozen public delivery files; no private context or condition instructions included.',
  publicSourceHashes: {}, originalRawSnapshots: [], runs: [], infrastructureErrors: [],
};
async function publicHashes(root, relative = '') {
  const found = [];
  for (const entry of await fs.readdir(path.join(root, relative), { withFileTypes: true })) {
    const name = path.posix.join(relative, entry.name);
    if (entry.isDirectory()) found.push(...await publicHashes(root, name));
    else if (entry.isFile()) found.push({ path: name, sha256: hash(await fs.readFile(path.join(root, name))) });
    else found.push({ path: name, skipped: 'Not a regular file; not dereferenced' });
  }
  return found.sort((a,b) => a.path.localeCompare(b.path));
}
for (const { id } of arms) {
  if (!/^[A-Za-z0-9_-]+$/.test(id)) throw new Error('Unsafe ID');
  const url = new URL(origins[id]);
  if (!['http:','https:'].includes(url.protocol) || url.pathname !== '/' || url.username || url.password || url.search || url.hash) throw new Error('Root http(s) origin required');
  try { report.publicSourceHashes[id] = await publicHashes(path.join(trial, 'frozen', id, 'public')); }
  catch (error) { report.publicSourceHashes[id] = { unavailable: error.message }; }
}
async function rawSnapshot(phase) {
  for (let attempt = 0; attempt < 4; attempt++) try {
    const bytes = await fs.readFile(path.join(out, 'report.json'));
    const raw = JSON.parse(bytes);
    const snapshot = { phase, readAt: new Date().toISOString(), sha256: hash(bytes), completedAt: raw.completedAt || null, runs: raw.arms.flatMap(arm => arm.runs.map(run => ({ id: arm.id, engine: run.engine, viewport: run.viewport, hardFailures: run.hardFailures, anchors: run.anchors, anchorConcepts: run.anchorConcepts, executionError: run.executionError }))) };
    report.originalRawSnapshots.push(snapshot);
    return snapshot;
  } catch (error) {
    if (attempt === 3) { const snapshot = { phase, unavailable: error.message }; report.originalRawSnapshots.push(snapshot); return snapshot; }
    await new Promise(resolve => setTimeout(resolve, 250));
  }
}
const save = () => fs.writeFile(path.join(out, 'navigation-adjudication.json'), JSON.stringify(report, null, 2));
await rawSnapshot('before supplementary probe');
async function inventory(page) {
  return page.evaluate(() => {
    const visible = e => {
      const r = e.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0) return false;
      for (let a = e; a; a = a.parentElement) { const s = getComputedStyle(a); if (s.display === 'none' || s.visibility === 'hidden' || Number(s.opacity) === 0) return false; }
      return true;
    };
    return {
      hash: location.hash, scrollY,
      links: [...document.querySelectorAll('a')].map((a, index) => {
        let target = null, samePage = false;
        try {
          const u = new URL(a.href), here = new URL(location.href);
          samePage = u.origin === here.origin && u.pathname === here.pathname && u.search === here.search && !!u.hash;
          if (samePage) { const id = decodeURIComponent(u.hash.slice(1)); const e = document.getElementById(id) || document.getElementsByName(id)[0]; target = e ? { id, tag: e.tagName, heading: e.matches('h1,h2,h3') ? e.textContent.trim() : e.querySelector('h1,h2,h3')?.textContent.trim(), text: e.textContent.trim().slice(0, 180) } : null; }
        } catch {}
        return { index, label: (a.getAttribute('aria-label') || a.textContent || '').trim(), href: a.getAttribute('href'), visible: visible(a), samePage, target };
      }),
      toggles: [...document.querySelectorAll('button,[role="button"],[aria-controls]')].map((e, index) => ({ index, label: (e.getAttribute('aria-label') || e.textContent || e.getAttribute('title') || '').trim(), expanded: e.getAttribute('aria-expanded'), controls: e.getAttribute('aria-controls'), visible: visible(e) })),
    };
  });
}
async function targetState(page, id) {
  return page.evaluate(id => {
    const e = document.getElementById(id) || document.getElementsByName(id)[0];
    if (!e) return { absent: true, hash: location.hash, scrollY };
    const r = e.getBoundingClientRect();
    let visible = r.width > 0 && r.height > 0;
    for (let a = e; a; a = a.parentElement) { const s = getComputedStyle(a); if (s.display === 'none' || s.visibility === 'hidden' || Number(s.opacity) === 0) visible = false; }
    return { hash: location.hash, scrollY, target: { id, top: r.top, bottom: r.bottom, width: r.width, height: r.height }, visible, inViewport: visible && r.bottom > 0 && r.top < innerHeight };
  }, id);
}
for (const { id } of arms) for (const [engineName, engine] of Object.entries({ chromium, webkit })) {
  let browser;
  try { browser = await engine.launch({ headless: true }); }
  catch (error) { report.infrastructureErrors.push({ id, engine: engineName, error: error.message }); await save(); continue; }
  try {
    for (const [width,height] of viewports) {
      const run = { id, engine: engineName, viewport: { width, height }, concepts: {} };
      report.runs.push(run);
      for (const [concept, regex] of Object.entries(concepts)) {
        const observation = { attempts: [], pageErrors: [], status: 'unverified' };
        run.concepts[concept] = observation;
        const context = await browser.newContext({ viewport: { width, height } });
        const page = await context.newPage();
        page.on('pageerror', error => observation.pageErrors.push(error.message));
        try {
          await page.goto(origins[id], { waitUntil: 'load', timeout: 30000 });
          await page.evaluate(() => document.fonts.ready);
          await page.waitForTimeout(250);
          observation.before = await inventory(page);
          let current = observation.before;
          let candidates = current.links.filter(link => regex.test(link.label) && link.samePage && link.visible);
          const toggle = current.toggles.find(button => button.visible && /menu|navigation|\bnav\b/i.test(button.label) && button.expanded !== 'true' && !/close/i.test(button.label));
          if (toggle) {
            const hiddenMatches = current.links.some(link => regex.test(link.label) && link.samePage && !link.visible);
            if (!candidates.length || hiddenMatches) {
              observation.menuToggle = toggle;
              try { await page.locator('button,[role="button"],[aria-controls]').nth(toggle.index).click({ timeout: 3500 }); await page.waitForTimeout(350); }
              catch (error) { observation.menuError = error.message; }
              current = await inventory(page);
              observation.afterMenu = current;
              candidates = current.links.filter(link => regex.test(link.label) && link.samePage && link.visible);
            }
          }
          observation.candidates = candidates;
          for (const candidate of candidates) {
            const attempt = { link: candidate, before: await inventory(page) };
            observation.attempts.push(attempt);
            if (!candidate.target) { attempt.status = 'missing target'; continue; }
            try {
              await page.locator('a').nth(candidate.index).click({ timeout: 4000 });
              const start = Date.now();
              let prior, stable = 0;
              attempt.samples = [];
              while (Date.now() - start < 8000) {
                const sample = { elapsedMs: Date.now() - start, ...await targetState(page, candidate.target.id) };
                attempt.samples.push(sample);
                if (sample.elapsedMs >= 650 && !attempt.at650ms) attempt.at650ms = sample;
                const close = prior?.target && sample.target && Math.abs(sample.target.top - prior.target.top) <= 2 && Math.abs(sample.target.bottom - prior.target.bottom) <= 2;
                stable = sample.inViewport && close ? stable + 1 : 0;
                prior = sample;
                if (stable >= 3 && sample.elapsedMs >= 650) break;
                await page.waitForTimeout(150);
              }
              attempt.after = await targetState(page, candidate.target.id);
              attempt.afterMenuState = (await inventory(page)).toggles;
              attempt.status = attempt.after.inViewport && stable >= 3 ? 'working' : 'target not visible and settled within 8 seconds';
              if (attempt.status === 'working') { observation.status = 'working'; observation.workingLink = candidate; break; }
            } catch (error) { attempt.status = 'click error'; attempt.error = error.message; }
          }
          if (observation.status !== 'working') observation.status = candidates.length ? 'unusable existing link' : 'missing visible same-page concept link after menu attempt';
          observation.after = await inventory(page);
          if (width <= 390 || observation.status !== 'working') {
            const filename = `navigation-${id}-${engineName}-${width}x${height}-${concept}.png`;
            await page.screenshot({ path: path.join(out, filename), timeout: 15000 });
            observation.screenshot = filename;
          }
        } catch (error) { observation.executionError = error.message; }
        finally { await context.close(); await save(); }
      }
    }
  } finally { await browser.close(); }
}
const finalRaw = await rawSnapshot('after supplementary probe');
for (const run of report.runs) {
  const raw = finalRaw.runs?.find(candidate => candidate.id === run.id && candidate.engine === run.engine && candidate.viewport.width === run.viewport.width && candidate.viewport.height === run.viewport.height);
  run.originalRaw = raw || { unavailable: 'Matching original run not present in final raw snapshot' };
  for (const [concept, observation] of Object.entries(run.concepts)) {
    observation.originalFailure = raw?.hardFailures?.filter(failure => failure.includes(`anchor for ${concept}`)) || [];
    if (observation.executionError) observation.adjudication = 'Unverified supplementary execution error';
    else if (observation.status !== 'working') observation.adjudication = 'Actual missing or unusable existing same-page link remains a failure';
    else if (observation.originalFailure.length) {
      const label = observation.workingLink?.label || '';
      const originalRegex = concept === 'features' ? /feature|capabilit|what.*(?:get|do|build)/i : concept === 'getStarted' ? /get\s*started|start|begin|try|join|sign\s*up/i : concepts.howItWorks;
      const causes = [];
      if (observation.menuToggle) causes.push('closed menu discovery');
      if (!originalRegex.test(label)) causes.push('equivalent label classification');
      if (observation.attempts.some(attempt => attempt.status === 'working' && attempt.at650ms && !attempt.at650ms.inViewport)) causes.push('target timing');
      observation.adjudication = `Supplementary working observation; raw failure retained; possible harness differences: ${causes.join(', ') || 'not isolated'}`;
    } else observation.adjudication = 'Supplementary working observation; no matching original anchor failure in captured raw run';
  }
}
report.completedAt = new Date().toISOString();
report.summary = { runs: report.runs.length, working: report.runs.flatMap(run => Object.values(run.concepts)).filter(item => item.status === 'working').length, failures: report.runs.flatMap(run => Object.values(run.concepts)).filter(item => item.status !== 'working').length, infrastructureErrors: report.infrastructureErrors.length };
await save();
console.log(JSON.stringify({ report: path.join(out, 'navigation-adjudication.json'), ...report.summary }, null, 2));
if (report.infrastructureErrors.length || report.runs.some(run => Object.values(run.concepts).some(item => item.executionError))) process.exitCode = 1;
