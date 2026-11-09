import { chromium, webkit } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';

// This evaluator reads only manifest metadata and browser output. It never writes
// into an arm workspace, imports arm code, or assigns aesthetic scores.
const [trialArgument, baseArgument, ...extraArguments] = process.argv.slice(2);
if (!trialArgument || !baseArgument) {
  console.error('Usage: node scripts/evaluate-marketing-study.mjs TRIAL_DIRECTORY BASE_URL [--origins JSON_FILE]');
  process.exit(2);
}
const trial = path.resolve(trialArgument);
const base = new URL(baseArgument);
if (extraArguments.length && (extraArguments.length !== 2 || extraArguments[0] !== '--origins')) throw new Error('Expected --origins JSON_FILE');
const origins = extraArguments.length ? JSON.parse(await fs.readFile(path.resolve(extraArguments[1]), 'utf8')).origins : null;
const manifest = JSON.parse(await fs.readFile(path.join(trial, 'manifest.json'), 'utf8'));
if (!Array.isArray(manifest.arms) || !manifest.arms.length) throw new Error('manifest.arms must be a nonempty array');
for (const arm of manifest.arms) {
  if (!arm.id || !/^[a-zA-Z0-9_-]+$/.test(arm.id)) throw new Error('Each arm requires a safe unique id');
  if (origins) {
    const url = new URL(origins[arm.id]);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new Error('Each arm origin must be an http(s) root URL');
  }
}
if (new Set(manifest.arms.map(a => a.id)).size !== manifest.arms.length) throw new Error('Duplicate arm ids');
const output = path.join(trial, 'evaluation');
await fs.mkdir(output, { recursive: true });
const viewports = [
  { name: 'small-phone', width: 320, height: 740 },
  { name: 'phone', width: 390, height: 844 },
  { name: 'small-tablet', width: 768, height: 1024 },
  { name: 'tablet', width: 834, height: 1112 },
  { name: 'landscape-tablet', width: 1024, height: 768 },
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'large-desktop', width: 1920, height: 1080 },
  { name: 'wide', width: 2560, height: 1440 },
  { name: 'narrow-stress', width: 240, height: 480 },
  { name: 'short-stress', width: 900, height: 160 },
];
const report = {
  schemaVersion: 1, startedAt: new Date().toISOString(), baseURL: base.href, origins,
  methodology: {
    scoring: 'No aesthetic scores. Observations and functional minimum failures are separate.',
    minimum: ['One page h1', 'Semantic sections or equivalent main landmarks', 'Meaningful img, svg or canvas',
      'Working same-page Features, How it works and Get started anchor concepts', 'Usable native scroll', 'No pageerrors or horizontal overflow'],
    viewports, motion: 'Five scroll positions, computed styles, actual bounding rectangles, canvas screenshot hashes and viewport frames. Changes are observations, not quality or causality claims.',
    limitations: ['No human preference measurement', 'External hrefs are inventoried, not followed',
      'Font availability checks do not prove the intended font rendered every glyph',
      'Canvas screenshot changes may reflect time as well as scrolling',
      'Keyboard traversal is sampled up to 60 tabs', 'Stress viewports are diagnostic; minimum failures apply at all tested viewports'],
  }, arms: [], infrastructureErrors: [],
};
const save = () => fs.writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
const digest = buffer => createHash('sha256').update(buffer).digest('hex');
const settle = async page => {
  await page.evaluate(() => document.fonts.ready).catch(() => {});
  await page.waitForTimeout(300);
};
async function inspect(page) {
  return page.evaluate(() => {
    const rect = el => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; };
    const shown = el => {
      const r = el.getBoundingClientRect(), s = getComputedStyle(el);
      if (!(r.width > 0 && r.height > 0 && s.display !== 'none' && s.visibility !== 'hidden')) return false;
      for (let e = el; e; e = e.parentElement) if (Number(getComputedStyle(e).opacity) === 0) return false;
      return true;
    };
    const elements = [...document.querySelectorAll('body *')];
    return {
      title: document.title, text: document.body.innerText,
      viewport: { width: innerWidth, height: innerHeight },
      scroll: { x: scrollX, y: scrollY, height: document.documentElement.scrollHeight, width: document.documentElement.scrollWidth },
      horizontalOverflow: document.documentElement.scrollWidth > innerWidth + 1,
      overflowElements: elements.filter(e => { const r = e.getBoundingClientRect(); return shown(e) && (r.right > innerWidth + 1 || r.left < -1); }).slice(0, 30).map(e => ({ tag: e.tagName, id: e.id, class: String(e.className), rect: rect(e) })),
      h1: [...document.querySelectorAll('h1')].map(e => ({ text: e.textContent, visible: shown(e), rect: rect(e) })),
      sections: [...document.querySelectorAll('section,main,[role="main"],[role="region"],article')].map(e => ({ tag: e.tagName, role: e.getAttribute('role'), id: e.id, label: e.getAttribute('aria-label'), heading: e.querySelector('h1,h2,h3')?.textContent, rect: rect(e) })),
      imagery: [...document.querySelectorAll('img,svg,canvas')].map(e => ({ tag: e.tagName, alt: e.getAttribute('alt'), ariaLabel: e.getAttribute('aria-label'), visible: shown(e), rect: rect(e) })),
      missingImages: [...document.images].filter(e => !e.complete || !e.naturalWidth).map(e => ({ src: e.currentSrc || e.src, alt: e.alt })),
      fonts: { status: document.fonts.status, faces: [...document.fonts].map(f => ({ family: f.family, status: f.status, style: f.style, weight: f.weight })) },
      links: [...document.querySelectorAll('a')].map((a, index) => ({ index, text: (a.innerText || a.getAttribute('aria-label') || '').trim(), href: a.getAttribute('href'), resolved: a.href, visible: shown(a) })),
    };
  });
}
async function motionFrame(page) {
  const sample = await page.evaluate(() => ({
    scrollY, timestamp: performance.now(),
    elements: [...document.querySelectorAll('body *')].map((e, index) => {
      const s = getComputedStyle(e), r = e.getBoundingClientRect();
      if (s.transform === 'none' && s.animationName === 'none' && !['CANVAS','SVG'].includes(e.tagName) && s.position !== 'sticky' && s.position !== 'fixed') return null;
      return { index, tag: e.tagName, id: e.id, class: String(e.className), transform: s.transform, translate: s.translate, rotate: s.rotate, scale: s.scale, opacity: s.opacity, animation: s.animationName, animationTimeline: s.animationTimeline, position: s.position, rect: { x: r.x, y: r.y, width: r.width, height: r.height } };
    }).filter(Boolean).slice(0, 300),
  }));
  sample.canvases = [];
  const canvases = page.locator('canvas');
  for (let i = 0; i < Math.min(await canvases.count(), 5); i++) {
    try { sample.canvases.push({ index: i, screenshotHash: digest(await canvases.nth(i).screenshot({ timeout: 3000 })) }); }
    catch (error) { sample.canvases.push({ index: i, unavailable: error.message }); }
  }
  return sample;
}
async function anchors(page, links) {
  const result = [];
  for (const link of links) {
    if (!link.href) continue;
    let url;
    try { url = new URL(link.resolved); } catch { continue; }
    const current = new URL(page.url());
    if (!url.hash || url.origin !== current.origin || url.pathname !== current.pathname || url.search !== current.search) continue;
    const observation = { text: link.text, href: link.href, visible: link.visible };
    const target = await page.evaluate(hash => {
      let id; try { id = decodeURIComponent(hash.slice(1)); } catch { return null; }
      const e = document.getElementById(id) || [...document.getElementsByName(id)][0];
      return e ? { id, tag: e.tagName, text: e.textContent?.trim().slice(0, 160) } : null;
    }, url.hash);
    observation.target = target;
    if (target && link.visible) {
      try {
        await page.locator('a').nth(link.index).click({ timeout: 4000 });
        await page.waitForTimeout(650);
        observation.after = await page.evaluate(id => {
          const e = document.getElementById(id) || [...document.getElementsByName(id)][0];
          const r = e?.getBoundingClientRect();
          return { hash: location.hash, scrollY, targetInViewport: !!r && r.bottom > 0 && r.top < innerHeight, targetTop: r?.top };
        }, target.id);
        observation.works = observation.after.targetInViewport;
      } catch (error) { observation.error = error.message; observation.works = false; }
    }
    result.push(observation);
  }
  return result;
}
async function keyboard(page) {
  await page.evaluate(() => { scrollTo(0, 0); document.activeElement?.blur(); });
  const visits = [];
  const count = Math.min(60, await page.locator('a,button,input,select,textarea,[tabindex]').count() + 3);
  for (let i = 0; i < count; i++) {
    await page.keyboard.press('Tab');
    visits.push(await page.evaluate(() => {
      const e = document.activeElement, r = e.getBoundingClientRect(), s = getComputedStyle(e);
      return { tag: e.tagName, id: e.id, text: (e.textContent || e.getAttribute('aria-label') || '').trim().slice(0, 120), href: e.getAttribute('href'), tabIndex: e.tabIndex, visible: r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none', inViewport: r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth, outline: `${s.outlineStyle} ${s.outlineWidth} ${s.outlineColor}`, boxShadow: s.boxShadow };
    }));
  }
  return { sampledTabs: count, visits };
}

async function layoutSettled(page) {
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await page.waitForTimeout(200);
}

async function stressProbe(page, kind, screenshot) {
  const key = `__neutralMarketingProbe_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const before = await page.evaluate(({ key, kind }) => {
    const hero = document.querySelector('h1');
    const elements = [...document.querySelectorAll('body *')].filter(e => [...e.childNodes].some(n => n.nodeType === Node.TEXT_NODE && n.textContent.trim()));
    const styles = elements.map(element => ({ element, original: element.getAttribute('style'), fontSize: parseFloat(getComputedStyle(element).fontSize) }));
    const saved = { hero, nodes: hero ? [...hero.childNodes] : [], styles, html: document.body.innerHTML, text: document.body.textContent };
    Object.defineProperty(window, key, { value: saved, configurable: true });
    if (kind === 'enlargedText') {
      // Compute every original size before mutating any element, avoiding compounded inheritance.
      for (const { element, fontSize } of styles) element.style.setProperty('font-size', `${fontSize * 2}px`, 'important');
    } else if (hero) {
      hero.replaceChildren(document.createTextNode(`${hero.textContent} — built for every ambitious team, across every project and every working day`));
    }
    return { textElementCount: elements.length, originalHeroText: saved.nodes.map(n => n.textContent).join('') };
  }, { key, kind });
  let observation, restoration;
  try {
    await layoutSettled(page);
    observation = await inspect(page);
    await screenshot(kind);
  } finally {
    restoration = await page.evaluate(key => {
      const saved = window[key];
      if (!saved) return { restored: false, reason: 'Probe state absent' };
      for (const { element, original } of saved.styles) {
        if (original === null) element.removeAttribute('style'); else element.setAttribute('style', original);
      }
      if (saved.hero) saved.hero.replaceChildren(...saved.nodes);
      const result = {
        originalNodeReferencesRestored: !saved.hero || saved.nodes.length === saved.hero.childNodes.length && saved.nodes.every((node, i) => saved.hero.childNodes[i] === node),
        inlineStylesRestored: saved.styles.every(({ element, original }) => element.getAttribute('style') === original),
        textRestored: saved.text === document.body.textContent,
        bodyHTMLMatchesBaseline: saved.html === document.body.innerHTML,
      };
      delete window[key];
      return result;
    }, key);
    await layoutSettled(page);
  }
  return { kind, before, observation, restoration };
}

async function copyAction(page, context, origin) {
  const result = { status: 'unknown', permission: 'not attempted' };
  try {
    await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin });
    result.permission = 'granted';
  } catch (error) { result.permission = 'unsupported or denied'; result.permissionError = error.message; }
  const buttons = page.locator('button,[role="button"],input[type="button"]');
  let candidate;
  for (let i = 0; i < await buttons.count(); i++) {
    const button = buttons.nth(i);
    const label = await button.evaluate(e => [e.textContent, e.getAttribute('aria-label'), e.getAttribute('title'), e.getAttribute('value')].filter(Boolean).join(' ').trim());
    if (/copy/i.test(label) && await button.isVisible()) { candidate = button; result.label = label; break; }
  }
  if (!candidate) return { ...result, status: 'absent', reason: 'No visible copy-labelled action found; no implementation hook used' };
  result.nearbyCode = await candidate.evaluate(e => [...(e.closest('section,article,main') || e.parentElement).querySelectorAll('code,pre')].map(n => n.textContent.trim()));
  const sentinel = `neutral-evaluator-${Date.now()}`;
  let clipboardAvailable = false;
  try {
    await page.evaluate(text => navigator.clipboard.writeText(text), sentinel);
    clipboardAvailable = await page.evaluate(() => navigator.clipboard.readText()) === sentinel;
  } catch (error) { result.backendError = error.message; }
  try {
    await candidate.click({ timeout: 4000 });
    await page.waitForTimeout(300);
    result.clicked = true;
    result.afterLabel = await candidate.innerText();
    if (clipboardAvailable) {
      result.clipboardText = await page.evaluate(() => navigator.clipboard.readText());
      result.status = result.clipboardText.trim() && result.clipboardText !== sentinel ? 'copied-nonempty-text' : 'failed';
      result.matchesNearbyCode = result.nearbyCode.some(code => code === result.clipboardText.trim());
    } else result.reason = 'Action clicked; clipboard backend unavailable, copied contents unknown';
  } catch (error) { result.status = 'unknown'; result.actionError = error.message; }
  return result;
}

async function reducedContent(page) {
  const count = await page.locator('h1,h2,h3,section,[role="region"]').count();
  const access = [];
  for (let i = 0; i < count; i++) {
    const locator = page.locator('h1,h2,h3,section,[role="region"]').nth(i);
    await locator.evaluate(e => e.scrollIntoView({ block: 'center', behavior: 'instant' }));
    await layoutSettled(page);
    access.push(await locator.evaluate(e => {
      const r = e.getBoundingClientRect();
      let visible = r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < innerHeight;
      for (let ancestor = e; ancestor; ancestor = ancestor.parentElement) {
        const style = getComputedStyle(ancestor);
        if (style.visibility === 'hidden' || style.display === 'none' || Number(style.opacity) === 0) visible = false;
      }
      return { tag: e.tagName, id: e.id, text: e.textContent.trim().slice(0, 180), visible, scrollY, rect: { top: r.top, bottom: r.bottom, height: r.height } };
    }));
  }
  await page.evaluate(() => scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' }));
  await layoutSettled(page);
  const bottom = await page.evaluate(() => ({ scrollY, maximum: Math.max(0, document.documentElement.scrollHeight - innerHeight), text: document.body.innerText }));
  return { access, bottom, reachedBottom: Math.abs(bottom.scrollY - bottom.maximum) <= 2 };
}

for (const arm of manifest.arms) {
  const armResult = { id: arm.id, workspace: arm.workspace, runs: [] };
  report.arms.push(armResult);
  for (const [engineName, engine] of Object.entries({ chromium, webkit })) {
    let browser;
    try { browser = await engine.launch({ headless: true }); }
    catch (error) { report.infrastructureErrors.push({ arm: arm.id, engine: engineName, error: error.message }); await save(); continue; }
    try {
      for (const viewport of viewports) {
        const name = `${arm.id}-${engineName}-${viewport.name}`;
        const run = { engine: engineName, viewport, url: origins ? new URL(origins[arm.id]).href : new URL(`${arm.id}/`, base.href.endsWith('/') ? base : `${base.href}/`).href, hardFailures: [], diagnostics: [], pageErrors: [], consoleErrors: [], failedRequests: [], httpErrors: [], screenshots: [] };
        armResult.runs.push(run);
        const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height }, reducedMotion: 'no-preference' });
        const page = await context.newPage();
        page.on('pageerror', error => run.pageErrors.push(error.message));
        page.on('console', msg => { if (msg.type() === 'error') run.consoleErrors.push(msg.text()); });
        page.on('requestfailed', request => run.failedRequests.push({ url: request.url(), resourceType: request.resourceType(), error: request.failure()?.errorText }));
        page.on('response', response => { if (response.status() >= 400) run.httpErrors.push({ url: response.url(), status: response.status() }); });
        const screenshot = async suffix => {
          const file = `${name}-${suffix}.png`;
          await page.screenshot({ path: path.join(output, file), fullPage: suffix === 'fullpage', animations: 'allow', timeout: 15000 });
          run.screenshots.push(file);
        };
        try {
          const response = await page.goto(run.url, { waitUntil: 'load', timeout: 30000 });
          run.navigationStatus = response?.status();
          await settle(page);
          run.initial = await inspect(page);
          if (run.navigationStatus >= 400) run.hardFailures.push('Navigation HTTP failure');
          if (run.initial.h1.length !== 1) run.hardFailures.push(`Expected one page h1; observed ${run.initial.h1.length}`);
          if (!run.initial.sections.length) run.hardFailures.push('No semantic sections or equivalent main landmarks');
          if (!run.initial.imagery.some(e => e.rect.width > 1 && e.rect.height > 1)) run.hardFailures.push('No rendered img/svg/canvas imagery');
          if (run.initial.horizontalOverflow) run.hardFailures.push('Horizontal overflow at initial layout');
          if (run.initial.missingImages.length) run.diagnostics.push('Missing or incomplete images');
          await screenshot('initial');
          if (['phone', 'desktop'].includes(viewport.name)) await screenshot('fullpage');
          run.motion = [];
          const maxScroll = await page.evaluate(() => Math.max(0, document.documentElement.scrollHeight - innerHeight));
          for (const fraction of [0, 0.25, 0.5, 0.75, 1]) {
            await page.evaluate(y => scrollTo({ top: y, behavior: 'instant' }), Math.round(maxScroll * fraction));
            await page.waitForTimeout(350);
            run.motion.push({ fraction, ...await motionFrame(page) });
            if (['phone', 'desktop'].includes(viewport.name)) await screenshot(`motion-${fraction}`);
          }
          run.motionChanges = run.motion.slice(1).map((frame, index) => {
            const prior = run.motion[index];
            return {
              fromFraction: prior.fraction, toFraction: frame.fraction,
              changedComputedStyles: frame.elements.flatMap(element => {
                const previous = prior.elements.find(e => e.index === element.index && e.tag === element.tag && e.id === element.id);
                if (!previous) return [];
                const properties = ['transform', 'translate', 'rotate', 'scale', 'opacity', 'animationTimeline'];
                const changes = properties.filter(key => previous[key] !== element[key]).map(key => ({ property: key, before: previous[key], after: element[key] }));
                return changes.length ? [{ index: element.index, tag: element.tag, id: element.id, changes }] : [];
              }),
              changedCanvasHashes: frame.canvases.filter(canvas => canvas.screenshotHash && prior.canvases.some(c => c.index === canvas.index && c.screenshotHash && c.screenshotHash !== canvas.screenshotHash)).map(c => c.index),
            };
          });
          await page.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));
          await page.mouse.move(Math.round(viewport.width / 2), Math.round(viewport.height / 2));
          const wheelBefore = await page.evaluate(() => scrollY);
          await page.mouse.wheel(0, 500);
          await page.waitForTimeout(500);
          run.nativeScroll = { scrollable: maxScroll > 0, before: wheelBefore, after: await page.evaluate(() => scrollY) };
          if (maxScroll > 0 && run.nativeScroll.after <= wheelBefore) run.hardFailures.push('Native wheel did not scroll scrollable content');
          await page.mouse.wheel(0, -500);
          await page.waitForTimeout(500);
          run.nativeScroll.afterWheelUp = await page.evaluate(() => scrollY);
          if (run.nativeScroll.after > 0 && run.nativeScroll.afterWheelUp >= run.nativeScroll.after) run.hardFailures.push('Native wheel up did not reverse scrolling');
          run.anchors = await anchors(page, run.initial.links);
          const concepts = { features: /feature|capabilit|what.*(?:get|do|build)/i, howItWorks: /how\s+(?:it\s+)?works|workflow|process/i, getStarted: /get\s*started|start|begin|try|join|sign\s*up/i };
          run.anchorConcepts = Object.fromEntries(Object.entries(concepts).map(([key, regex]) => [key, run.anchors.filter(a => regex.test(a.text))]));
          for (const [concept, observations] of Object.entries(run.anchorConcepts)) if (!observations.some(a => a.works)) run.hardFailures.push(`No working visible same-page anchor for ${concept}`);
          run.externalLinks = run.initial.links.filter(link => { try { return new URL(link.resolved).origin !== new URL(run.url).origin; } catch { return false; } });
          run.keyboard = await keyboard(page);
          run.copyAction = await copyAction(page, context, new URL(run.url).origin);
          if (run.copyAction.status === 'failed') run.diagnostics.push('Copy action did not change available clipboard to nonempty text');
          await page.emulateMedia({ reducedMotion: 'reduce' });
          await page.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));
          await settle(page);
          run.reducedMotion = await inspect(page);
          if (!run.reducedMotion.h1.some(h => h.visible)) run.diagnostics.push('No visible h1 in reduced-motion mode');
          await screenshot('reduced-motion');
          run.reducedMotionContent = await reducedContent(page);
          if (!run.reducedMotionContent.reachedBottom) run.diagnostics.push('Reduced-motion bottom content not reached');
          if (run.reducedMotionContent.access.some(item => !item.visible && item.text)) run.diagnostics.push('Reduced-motion heading or section content hidden when scrolled into view');
          await screenshot('reduced-motion-bottom');
          await page.emulateMedia({ reducedMotion: 'no-preference' });
          await page.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));
          // Separate asynchronous probes preserve original DOM node references and styles.
          run.contentStress = [];
          for (const kind of ['enlargedText', 'changedHeading']) run.contentStress.push(await stressProbe(page, kind, screenshot));
          const beforeResize = await page.evaluate(() => document.body.textContent);
          await page.setViewportSize({ width: viewport.width === 390 ? 1440 : 390, height: 844 });
          await settle(page);
          const resized = await inspect(page);
          await page.setViewportSize({ width: viewport.width, height: viewport.height });
          await settle(page);
          run.resize = { intermediate: { viewport: resized.viewport, horizontalOverflow: resized.horizontalOverflow, h1: resized.h1 }, textPreservedAfterReturn: beforeResize === await page.evaluate(() => document.body.textContent) };
          if (!run.resize.textPreservedAfterReturn) run.diagnostics.push('DOM text changed after resize round trip; inspect for responsive content or data updates');
          for (const probe of run.contentStress) {
            if (probe.observation.horizontalOverflow) run.diagnostics.push(`Horizontal overflow under ${probe.kind}`);
            if (!probe.restoration.originalNodeReferencesRestored || !probe.restoration.inlineStylesRestored || !probe.restoration.textRestored) run.diagnostics.push(`Probe restoration mismatch after ${probe.kind}`);
          }
        } catch (error) {
          run.executionError = { message: error.message, stack: error.stack };
          run.diagnostics.push('Run incomplete; consult executionError');
        } finally {
          if (run.pageErrors.length) run.hardFailures.push('Browser pageerrors observed');
          run.completedAt = new Date().toISOString();
          await context.close();
          await save();
        }
      }
    } finally { await browser.close(); }
  }
}
report.completedAt = new Date().toISOString();
report.summary = {
  arms: report.arms.length,
  runs: report.arms.flatMap(a => a.runs).length,
  hardFailureCount: report.arms.flatMap(a => a.runs).reduce((n, r) => n + r.hardFailures.length, 0),
  incompleteRuns: report.arms.flatMap(a => a.runs).filter(r => r.executionError).length,
  infrastructureErrors: report.infrastructureErrors.length,
};
await save();
console.log(JSON.stringify({ report: path.join(output, 'report.json'), ...report.summary }, null, 2));
if (report.summary.incompleteRuns || report.infrastructureErrors.length) process.exitCode = 1;
