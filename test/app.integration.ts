import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { build } from 'esbuild';
import { chromium } from 'playwright';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { appHtml } from '../dist/mcp.js';

test(
  'real MCP App SDK host bridge renders, edits, recomputes, compares and records a human tie-break',
  { timeout: 120000 },
  async () => {
    const client = new Client({
      name: 'specimen-app-integration',
      version: '1',
    });
    const browser = await chromium.launch({ headless: true });
    try {
      await client.connect(
        new StdioClientTransport({
          command: process.execPath,
          args: ['dist/cli.js', 'mcp'],
          cwd: process.cwd(),
        }),
      );
      const state = JSON.parse(readFileSync('examples/hero.json', 'utf8'));
      const initial = await client.callTool({
        name: 'design_specimen',
        arguments: { command: 'proof', input: { state, interactive: true } },
      });
      const page = await browser.newPage({
        viewport: { width: 1280, height: 1100 },
      });
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(e.message));
      await page.exposeFunction(
        'serverTool',
        async (params: any) => await client.callTool(params),
      );
      await page.setContent(
        '<html><body><iframe id="app" style="width:100%;height:1000px"></iframe></body></html>',
      );
      await page.evaluate((result) => {
        (window as any).__INITIAL_RESULT__ = result;
      }, initial);
      const host = await build({
        entryPoints: ['scripts/mcp-host.ts'],
        bundle: true,
        write: false,
        format: 'iife',
        target: 'es2023',
      });
      await page.addScriptTag({ content: host.outputFiles[0]!.text });
      await page.locator('#app').evaluate(
        (frame, html) => {
          (frame as HTMLIFrameElement).srcdoc = html;
        },
        await appHtml(),
      );
      await page.waitForFunction(() => Boolean((window as any).__HOST_READY__));
      const app = page.frameLocator('#app'),
        proof = app.frameLocator('iframe');
      await proof.locator('[data-block="title"]').waitFor();
      assert.equal(
        await proof.locator('[data-block="title"]').textContent(),
        state.blocks[0].text,
      );
      await proof.getByLabel('title size', { exact: true }).fill('104');
      await proof
        .getByLabel('title size', { exact: true })
        .dispatchEvent('change');
      await app
        .getByRole('button', { name: 'Recompute coupled alternatives' })
        .click();
      await app
        .locator('#choices option')
        .first()
        .waitFor({ state: 'attached', timeout: 90000 });
      await app.locator('#choose').click();
      await page.waitForFunction(() =>
        Boolean((window as any).__HUMAN_CHOICE__),
      );
      assert.match(
        JSON.stringify(
          await page.evaluate(() => (window as any).__HUMAN_CHOICE__),
        ),
        /Human art-direction tie-break/,
      );
      const choices = await app.locator('#choices option').count();
      assert.ok(choices >= 2);
      await app.locator('#choices').selectOption({ index: 1 });
      await proof.getByLabel('title size', { exact: true }).waitFor();
      assert.deepEqual(errors, []);
    } finally {
      await browser.close();
      await client.close();
    }
  },
);

test(
  'MCP App projects exact component dimensions and analytic motion samples through the real host bridge',
  { timeout: 60000 },
  async () => {
    const client = new Client({ name: 'contract-inspector', version: '1' }),
      browser = await chromium.launch({ headless: true });
    try {
      await client.connect(
        new StdioClientTransport({
          command: process.execPath,
          args: ['dist/cli.js', 'mcp'],
          cwd: process.cwd(),
        }),
      );
      const fixture = {
        id: 'inspect-row',
        platform: 'web',
        unit: 'css-px',
        stateRef: 'fixture',
        contentRef: 'fixture',
        viewport: { width: 390, height: 844, textScale: 1 },
        source: ['fixture'],
        availableWidth: 320,
        border: 1,
        padding: { inline: 16, top: 12, bottom: 12 },
        gaps: { leading: 8, trailing: 8 },
        text: {
          id: 'label',
          fontRef: 'fixture',
          minWidth: 100,
          measuredHeight: null,
          measurement: null,
          source: ['fixture'],
        },
        minHitSize: 44,
      };
      const cases = [
        { command: 'component inspect', input: fixture, selector: 'svg' },
        {
          command: 'motion proof',
          input: {
            spring: { mass: 1, stiffness: 170, damping: 18 },
            coordinate: { unit: 'dp', from: 24, to: 0 },
            sampleCount: 9,
          },
          selector: '#time',
        },
      ];
      const host = await build({
        entryPoints: ['scripts/mcp-host.ts'],
        bundle: true,
        write: false,
        format: 'iife',
        target: 'es2023',
      });
      for (const entry of cases) {
        const initial = await client.callTool({
          name: 'design_specimen',
          arguments: { command: entry.command, input: entry.input },
        });
        assert.ok(!initial.isError, JSON.stringify(initial.content));
        const page = await browser.newPage();
        const errors: string[] = [];
        page.on('pageerror', (e) => errors.push(e.message));
        await page.exposeFunction('serverTool', async (params: any) =>
          client.callTool(params),
        );
        await page.setContent(
          '<iframe id="app" style="width:100%;height:1000px"></iframe>',
        );
        await page.evaluate((result) => {
          (window as any).__INITIAL_RESULT__ = result;
        }, initial);
        await page.addScriptTag({ content: host.outputFiles[0]!.text });
        await page.locator('#app').evaluate(
          (frame, html) => {
            (frame as HTMLIFrameElement).srcdoc = html;
          },
          await appHtml(),
        );
        await page.waitForFunction(() =>
          Boolean((window as any).__HOST_READY__),
        );
        const proof = page.frameLocator('#app').frameLocator('iframe');
        await proof.locator(entry.selector).waitFor();
        if (entry.command === 'component inspect') {
          assert.ok(
            (await proof.locator('body').textContent())?.includes('Unknown'),
          );
        } else {
          await proof.locator('#time').fill('4');
          await proof.locator('#time').dispatchEvent('input');
          const text = await proof.locator('#facts').textContent();
          assert.ok(text?.includes('energyDerivative'));
        }
        assert.deepEqual(errors, []);
        await page.close();
      }
    } finally {
      await browser.close();
      await client.close();
    }
  },
);
