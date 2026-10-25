import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { build } from 'esbuild';
import { chromium, webkit } from 'playwright';
import { parseState } from '../dist/state.js';
import { proofHtml } from '../dist/emission.js';
import { execute } from '../dist/commands.js';

// Exercise the shipped editor, not a copy of its drawing implementation.
for (const [engine, browserType] of Object.entries({ chromium, webkit })) {
  test(
    `${engine}: editor skips unsafe Arabic baselines and preserves every grapheme rectangle`,
    { timeout: 60000 },
    async () => {
      const localWebkit = 'artifacts/runtime/playwright/webkit-2370/pw_run.sh';
      const executablePath =
        engine === 'webkit'
          ? (process.env.DESIGN_WEBKIT_EXECUTABLE ??
            (existsSync(localWebkit) ? localWebkit : undefined))
          : process.env.DESIGN_CHROMIUM;
      const browser = await browserType.launch({
        headless: true,
        ...(executablePath ? { executablePath } : {}),
      });
      try {
        const state = parseState(
          JSON.parse(readFileSync('examples/hero.json', 'utf8')),
        );
        delete state.responsive;
        Object.assign(state.blocks[0]!, {
          text: 'العربيةالعربيةالعربيةالعربية',
          font: {
            file: 'assets/fonts/NotoSansArabic[wdth,wght].ttf',
            family: 'Noto Sans Arabic',
            axes: {},
            opticalSizing: 'auto',
          },
          size: 32,
          weight: 400,
          trackingEm: 0,
          leading: 1.5,
          measure: 60,
          direction: 'rtl',
          language: 'ar',
        });
        const page = await browser.newPage({
          viewport: { width: 1280, height: 1000 },
        });
        await page.setContent(await proofHtml(state, true));
        await page.evaluate(async () => {
          await document.fonts.ready;
        });
        const bundle = await build({
          entryPoints: ['dist/typography-browser.js'],
          bundle: true,
          write: false,
          format: 'iife',
          globalName: 'ReviewTypography',
          platform: 'browser',
        });
        await page.addScriptTag({ content: bundle.outputFiles[0]!.text });
        const snapshot = () =>
          page.locator('[data-block="title"]').evaluate((el) => {
            const box = el.getBoundingClientRect();
            const node = el.firstChild!;
            return {
              text: el.textContent,
              box: { width: box.width, height: box.height },
              fragments: [
                ...new Intl.Segmenter('ar', {
                  granularity: 'grapheme',
                }).segment(el.textContent!),
              ].map((part) => {
                const range = document.createRange();
                range.setStart(node, part.index);
                range.setEnd(node, part.index + part.segment.length);
                return [...range.getClientRects()].map((r) => ({
                  x: r.x - box.x,
                  y: r.y - box.y,
                  width: r.width,
                  height: r.height,
                }));
              }),
            };
          });
        const before = await snapshot();
        const expected = await page
          .locator('[data-block="title"]')
          .evaluate((el) =>
            (window as any).ReviewTypography.collectTypographyElement(el),
          );
        assert.ok(
          expected.lines.some((line: any) => line.baseline === null),
          'fixture must exercise rejected probes',
        );
        assert.ok(
          expected.lines.some((line: any) =>
            line.attempts.some((attempt: any) => !attempt.geometryUnchanged),
          ),
          'fixture must expose shaping/wrapping perturbation',
        );
        assert.deepEqual(
          await snapshot(),
          before,
          'collector restores text and every original Range rectangle',
        );
        await page
          .getByRole('button', { name: 'Baseline guides', exact: true })
          .click();
        const guides = await page
          .locator('[data-baseline-block="title"]')
          .evaluateAll((nodes) =>
            nodes.map((node) => Number((node as HTMLElement).dataset.baseline)),
          );
        assert.deepEqual(
          guides,
          expected.lines
            .filter((line: any) => line.baseline !== null)
            .map((line: any) => line.baseline),
        );
        const evidence = JSON.parse(
          (await page
            .locator('[data-block="title"]')
            .getAttribute('data-baseline-evidence'))!,
        );
        assert.equal(
          evidence.unavailable,
          expected.lines.filter((line: any) => line.baseline === null).length,
        );
        assert.deepEqual(
          await snapshot(),
          before,
          'enabling guides preserves the original layout',
        );
        await page
          .getByRole('button', { name: 'Baseline guides', exact: true })
          .click();
        assert.equal(await page.locator('#baselines').count(), 0);
        assert.deepEqual(await snapshot(), before);

        // Uniform font metrics provide an independent ownership invariant: baseline
        // minus selection-top is unchanged by wrapping. Tall Arabic selection boxes
        // overlap at tight leading, so mere containment can accept the previous line.
        for (const text of [
          'العربيةالعربيةالعربيةالعربية',
          'العَرَبِيَّة لَا مرحبًا بكم في العالم',
        ]) {
          const readings = await page
            .locator('[data-block="title"]')
            .evaluate((el, text) => {
              const element = el as HTMLElement;
              element.textContent = text;
              element.style.width = '1000px';
              element.style.lineHeight = '48px';
              const wide = (
                window as any
              ).ReviewTypography.collectTypographyElement(element);
              element.style.width = '30px';
              element.style.lineHeight = '24px';
              const narrow = (
                window as any
              ).ReviewTypography.collectTypographyElement(element);
              return { wide, narrow };
            }, text);
          assert.equal(readings.wide.lines.length, 1);
          assert.notEqual(readings.wide.lines[0].baseline, null);
          const reference =
            readings.wide.lines[0].baseline -
            readings.wide.lines[0].rangeBounds.y;
          const accepted = readings.narrow.lines.filter(
            (line: any) => line.baseline !== null,
          );
          for (const line of accepted)
            assert.ok(
              Math.abs(line.baseline - line.rangeBounds.y - reference) <=
                1 / 64,
              `baseline belongs to another overlapping line: ${JSON.stringify({ engine, line: line.index, reference, observed: line.baseline - line.rangeBounds.y })}`,
            );
          await page
            .getByRole('button', { name: 'Baseline guides', exact: true })
            .click();
          const drawn = await page
            .locator('[data-baseline-block="title"]')
            .evaluateAll((nodes) =>
              nodes.map((node) =>
                Number((node as HTMLElement).dataset.baseline),
              ),
            );
          assert.deepEqual(
            drawn,
            accepted.map((line: any) => line.baseline),
            'editor draws only baselines assigned to the correct line',
          );
          await page
            .getByRole('button', { name: 'Baseline guides', exact: true })
            .click();
        }

        // Public state permits long text; the editor must not invoke the expensive probe on it.
        await page.locator('[data-block="title"]').evaluate((el) => {
          el.textContent = 'x'.repeat(4097);
        });
        await page
          .getByRole('button', { name: 'Baseline guides', exact: true })
          .click();
        assert.equal(
          await page.locator('[data-baseline-block="title"]').count(),
          0,
        );
        assert.match(
          (await page
            .locator('[data-block="title"]')
            .getAttribute('data-baseline-evidence'))!,
          /exceeds probe budget/,
        );

        const responsive = parseState(
          JSON.parse(readFileSync('examples/hero.json', 'utf8')),
        );
        responsive.viewport.width = 390;
        responsive.viewport.textScale = 2;
        await page.setViewportSize({ width: 390, height: 1000 });
        await page.setContent(await proofHtml(responsive));
        await page.evaluate(async () => {
          await document.fonts.ready;
        });
        const actual = await page
          .locator('[data-block="title"]')
          .evaluate((el) => {
            const style = getComputedStyle(el);
            return {
              fontSize: style.fontSize,
              letterSpacing: style.letterSpacing,
              lineHeight: style.lineHeight,
              width: el.getBoundingClientRect().width,
            };
          });
        const receipt: any = await execute('typography inspect', {
          state: responsive,
          blockId: 'title',
          engine,
          render: true,
        });
        assert.equal(receipt.renderer.computed.fontSize, actual.fontSize);
        assert.equal(
          receipt.renderer.computed.letterSpacing,
          actual.letterSpacing,
        );
        assert.equal(receipt.renderer.computed.lineHeight, actual.lineHeight);
        assert.equal(receipt.renderer.box.width, actual.width);
        assert.equal(
          receipt.resolution.effectiveSize,
          Number.parseFloat(actual.fontSize),
        );
      } finally {
        await browser.close();
      }
    },
  );
}
