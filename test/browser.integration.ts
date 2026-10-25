import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseState } from '../dist/state.js';
import { BrowserRenderer } from '../dist/measurement.js';
import { scoreRelations } from '../dist/factors.js';
import { perturb } from '../dist/graph.js';
import { relax } from '../dist/search.js';
import { proofHtml } from '../dist/emission.js';
import { chromium } from 'playwright';
import { resolveLayout } from '../dist/responsive.js';
const hero = () =>
  parseState(JSON.parse(readFileSync('examples/hero.json', 'utf8')));

test(
  'real StyleX/React rendering, thresholds, spacing tolerance and stale measurements',
  { timeout: 60000 },
  async () => {
    const renderer = new BrowserRenderer();
    try {
      const s = hero(),
        m = await renderer.measure(s, { probes: true });
      assert.equal(m.engine, 'chromium/react/stylex');
      assert.ok(m.feasible, JSON.stringify(m.issues));
      assert.ok(m.textSpacing.tested);
      assert.ok(m.blocks[0]!.lines.length > 0);
      const titleLines = m.blocks[0]!.lines;
      assert.equal(titleLines.length, 2);
      const cadence = titleLines[1]!.y - titleLines[0]!.y;
      const resolved = resolveLayout(s).state;
      assert.ok(
        Math.abs(
          cadence -
            resolved.blocks[0]!.size *
              resolved.blocks[0]!.leading *
              s.viewport.textScale,
        ) < 0.1,
        `rendered line cadence ${cadence} must match requested leading`,
      );
      assert.ok(m.blocks[0]!.thresholds!.narrower.bracket);
      const [low, high] = m.blocks[0]!.thresholds!.narrower.bracket!;
      assert.ok(high - low <= 0.25);
      const narrower = resolveLayout(s).state;
      narrower.blocks[0]!.measure = low - 0.5;
      const next = await renderer.measure(narrower, { spacing: false });
      assert.notDeepEqual(
        next.blocks[0]!.lines.map((l) => l.text),
        m.blocks[0]!.lines.map((l) => l.text),
      );
      assert.throws(
        () => scoreRelations(perturb(s, '/blocks/0/size', 104).state, m),
        /stale/,
      );
      const broken = hero();
      broken.blocks[0]!.maxHeight = 10;
      const clipped = await renderer.measure(broken);
      assert.ok(!clipped.feasible);
      assert.ok(clipped.issues.some((i) => i.code === 'clipping'));
    } finally {
      await renderer.close();
    }
  },
);
test(
  'search keeps multiple viable alternatives at unseen widths and text scaling',
  { timeout: 120000 },
  async () => {
    const renderer = new BrowserRenderer();
    try {
      const s = hero();
      s.padding = 24;
      const result = await relax(s, renderer, {
        maxCandidates: 3,
        widths: [360, 767, 1280],
        textScales: [1, 2],
      });
      assert.equal(result.candidates.length, 3);
      assert.ok(
        result.viableIds.length >= 2,
        JSON.stringify(result.candidates.map((c) => c.measurement.issues)),
      );
      assert.ok(result.paretoIds.length >= 1);
      assert.equal(result.selection, null);
      assert.ok(result.candidates.every((c) => c.responsive.length >= 5));
    } finally {
      await renderer.close();
    }
  },
);
test(
  'editable proof exposes real baseline guides, font comparisons and dependency effects',
  { timeout: 60000 },
  async () => {
    const browser = await chromium.launch({
      headless: true,
      ...(process.env.DESIGN_CHROMIUM
        ? { executablePath: process.env.DESIGN_CHROMIUM }
        : {}),
    });
    try {
      const page = await browser.newPage({
        viewport: { width: 1280, height: 1000 },
      });
      await page.setContent(await proofHtml(hero(), true));
      await page.evaluate(async () => {
        await document.fonts.ready;
      });
      const text = await page.locator('[data-block="title"]').textContent();
      await page
        .getByRole('button', { name: 'Baseline guides', exact: true })
        .click();
      assert.ok((await page.locator('#baselines > div').count()) > 0);
      assert.equal(
        await page.locator('[data-block="title"]').textContent(),
        text,
      );
      await page.getByLabel('title size', { exact: true }).fill('104');
      await page
        .getByLabel('title size', { exact: true })
        .dispatchEvent('change');
      assert.match(
        (await page.locator('#status').textContent())!,
        /tracking:title/,
      );
      await page
        .getByLabel('title font comparison', { exact: true })
        .selectOption('1');
      assert.match(
        (await page.locator('#status').textContent())!,
        /metrics:title/,
      );
    } finally {
      await browser.close();
    }
  },
);
test(
  'unseen localized content reflows; missing-script fallback is explicitly rejected',
  { timeout: 60000 },
  async () => {
    const renderer = new BrowserRenderer();
    try {
      const s = hero();
      s.viewport.width = 375;
      s.viewport.textScale = 1.8;
      s.padding = 24;
      s.blocks[0]!.text = 'Raum für außergewöhnliche Gedanken';
      s.blocks[0]!.language = 'de';
      s.blocks[1]!.text =
        'Découvrez une nouvelle façon de réfléchir, créer et partager vos idées.';
      s.blocks[1]!.language = 'fr';
      const m = await renderer.measure(s);
      assert.ok(m.feasible, JSON.stringify(m.issues));
      s.blocks[0]!.text = '设计';
      const missing = await renderer.measure(s);
      assert.equal(missing.feasible, false);
      assert.ok(missing.issues.some((i) => i.code === 'glyph-coverage'));
    } finally {
      await renderer.close();
    }
  },
);

test(
  'one emitted flex specimen responds to actual container resizing across phone, iPad and desktop',
  { timeout: 60000 },
  async () => {
    const browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage({
        viewport: { width: 1440, height: 1000 },
      });
      await page.setContent(await proofHtml(hero(), true));
      await page.evaluate(() => document.fonts.ready);
      for (const [width, size] of [
        [390, 56],
        [834, 80],
        [1024, 88],
        [1440, 96],
        [507, 62.32432432432432],
      ]) {
        await page.setViewportSize({ width, height: 1000 });
        await page.waitForFunction(
          (expected) =>
            Math.abs(
              parseFloat(
                getComputedStyle(
                  document.querySelector('[data-block="title"]')!,
                ).fontSize,
              ) - expected,
            ) < 0.02,
          size,
        );
        assert.equal(
          await page
            .locator('#specimen')
            .evaluate((el) => getComputedStyle(el).display),
          'flex',
        );
        assert.ok(
          await page
            .locator('#specimen')
            .evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
        );
      }
      await page.getByLabel('title size', { exact: true }).fill('104');
      await page
        .getByLabel('title size', { exact: true })
        .dispatchEvent('change');
      await page.setViewportSize({ width: 390, height: 1000 });
      await page.waitForFunction(
        () =>
          Math.abs(
            parseFloat(
              getComputedStyle(document.querySelector('[data-block="title"]')!)
                .fontSize,
            ) -
              (104 * 56) / 88,
          ) < 0.02,
      );
    } finally {
      await browser.close();
    }
  },
);

test(
  'variable-font axes and Arabic shaping are verified in the actual browser',
  { timeout: 60000 },
  async () => {
    const renderer = new BrowserRenderer();
    try {
      const s = hero();
      s.viewport.width = 834;
      const manifest = JSON.parse(
        readFileSync('assets/fonts/manifest.json', 'utf8'),
      );
      const arabic = manifest.files.find((f: { file: string }) =>
        f.file.startsWith('NotoSansArabic['),
      ).file;
      for (const b of s.blocks) {
        b.font = {
          file: `assets/fonts/${arabic}`,
          family: 'Noto Sans Arabic',
          axes: { wght: 400 },
          opticalSizing: 'none',
        };
        b.weight = 400;
        b.direction = 'rtl';
        b.language = 'ar';
        b.trackingEm = 0;
      }
      s.blocks[0]!.text = 'مساحة للأفكار المهمة';
      s.blocks[1]!.text =
        'تتغير العلاقات بين الكلمات والمسافات مع حجم النافذة وحجم النص.';
      const measured = await renderer.measure(s);
      assert.ok(measured.feasible, JSON.stringify(measured.issues));
      assert.ok(
        measured.blocks.every(
          (b) =>
            b.lines
              .map((l) => l.text)
              .join('')
              .replace(/\s/gu, '').length > 0,
        ),
      );
    } finally {
      await renderer.close();
    }
  },
);

test(
  'palette choices reach actual StyleX colors and rendered text cannot evade contrast constraints',
  { timeout: 60000 },
  async () => {
    const state = hero();
    state.viewport.width = 390;
    state.colors = JSON.parse(readFileSync('examples/palette.json', 'utf8'));
    const renderer = new BrowserRenderer(),
      browser = await chromium.launch({ headless: true });
    try {
      assert.ok((await renderer.measure(state)).feasible);
      const page = await browser.newPage({
        viewport: { width: 390, height: 844 },
      });
      await page.setContent(await proofHtml(state, false));
      await page.evaluate(() => document.fonts.ready);
      const actual = await page.evaluate(() => ({
        ink: getComputedStyle(document.querySelector('[data-block="title"]')!)
          .color,
        canvas: getComputedStyle(
          document.querySelector('#root')!.firstElementChild!,
        ).backgroundColor,
        layout: getComputedStyle(document.querySelector('article')!).display,
      }));
      assert.deepEqual(actual, {
        ink: 'rgb(248, 243, 232)',
        canvas: 'rgb(16, 29, 50)',
        layout: 'flex',
      });
      state.colors!.tokens.ink = '#777777';
      state.colors!.tokens.canvas = '#ffffff';
      const rejected = await renderer.measure(state);
      assert.equal(rejected.feasible, false);
      assert.ok(
        rejected.issues.some(
          (issue) =>
            issue.code === 'text-contrast' && issue.block === 'subtitle',
        ),
      );
      const facts = scoreRelations(state, rejected);
      assert.equal(facts.colors.hardConstraintsPass, false);
      assert.ok(facts.composition.whitespace);
    } finally {
      await renderer.close();
      await browser.close();
    }
  },
);
