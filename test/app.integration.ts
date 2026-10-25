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
      const firstSession = await proof
        .locator('body')
        .evaluate(() => (window as any).__DESIGN_FRAME_SESSION__);
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
      await page.waitForFunction(
        () =>
          document
            .querySelector<HTMLIFrameElement>('#app')
            ?.contentDocument?.querySelector<HTMLButtonElement>('#choose')
            ?.disabled === false,
      );
      const previousStatus = await app.locator('#status').textContent();
      await proof
        .locator('body')
        .evaluate(
          (_, payload) =>
            parent.postMessage(
              { physicsDesignState: payload.state, session: payload.session },
              '*',
            ),
          { state, session: firstSession },
        );
      await page.waitForTimeout(50);
      assert.equal(
        await app.locator('#status').textContent(),
        previousStatus,
        'An obsolete specimen frame must not dirty the new view',
      );
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

test(
  'MCP App edits whole-layout equations, recomputes dependent geometry and shares selected nodes',
  { timeout: 60000 },
  async () => {
    const client = new Client({ name: 'wireframe-host', version: '1' }),
      browser = await chromium.launch({ headless: true });
    try {
      await client.connect(
        new StdioClientTransport({
          command: process.execPath,
          args: ['dist/cli.js', 'mcp'],
          cwd: process.cwd(),
        }),
      );
      const initial = await client.callTool({
        name: 'design_specimen',
        arguments: {
          command: 'wireframe inspect',
          input: JSON.parse(
            readFileSync('examples/wireframe/hero.json', 'utf8'),
          ),
        },
      });
      assert.ok(!initial.isError, JSON.stringify(initial.content));
      const page = await browser.newPage({
        viewport: { width: 1280, height: 1100 },
      });
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
      await proof.locator('[data-variable="headingHeight"]').waitFor();
      const body = () => proof.locator('[data-wireframe-node="body"] rect');
      assert.equal(await body().getAttribute('y'), '216');
      await proof.locator('[data-variable="headingHeight"]').fill('200');
      await proof
        .locator('[data-variable="headingHeight"]')
        .dispatchEvent('change');
      await page.waitForFunction(() =>
        (JSON.stringify((window as any).__HUMAN_CHOICE__) ?? '').includes(
          'headingHeight',
        ),
      );
      await body().waitFor();
      await page.waitForFunction(() => {
        const app =
          document.querySelector<HTMLIFrameElement>('#app')?.contentDocument;
        const proof =
          app?.querySelector<HTMLIFrameElement>('iframe')?.contentDocument;
        return (
          proof
            ?.querySelector('[data-wireframe-node="body"] rect')
            ?.getAttribute('y') === '296'
        );
      });
      await proof.locator('[data-wireframe-node="image"]').click();
      await page.waitForFunction(
        () =>
          (JSON.stringify((window as any).__HUMAN_CHOICE__) ?? '').includes(
            'selectedNode',
          ) &&
          (JSON.stringify((window as any).__HUMAN_CHOICE__) ?? '').includes(
            'image',
          ),
      );
      assert.deepEqual(errors, []);
    } finally {
      await browser.close();
      await client.close();
    }
  },
);

test(
  'wireframe host keeps newest geometry under delayed replies, selections, mode changes and server errors',
  { timeout: 60000 },
  async () => {
    const client = new Client({
      name: 'wireframe-ordering-review',
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
      const fixture = JSON.parse(
        readFileSync('examples/wireframe/hero.json', 'utf8'),
      );
      fixture.wireframe.variables.gutter.max = 300;
      fixture.wireframe.nodes.push({
        id: 'reported',
        label: 'Reported rectangle',
        evidence: 'renderer-reported',
        box: { x: 24, y: 700, width: 100, height: 50 },
        receipt: {
          renderer: 'Chromium',
          inputIdentity: 'original-input',
          receiptId: 'original-receipt',
        },
      });
      const resultFor = (input: any) =>
        client.callTool({
          name: 'design_execute',
          arguments: { command: 'wireframe inspect', input },
        });
      const initial = await resultFor(fixture);
      const page = await browser.newPage({
        viewport: { width: 1280, height: 1100 },
      });
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      let hold = false,
        completed = 0;
      const pending: { release: () => void; params: any }[] = [];
      const requests: any[] = [];
      await page.exposeFunction('serverTool', async (params: any) => {
        requests.push(params);
        if (hold)
          await new Promise<void>((resolve) =>
            pending.push({ release: resolve, params }),
          );
        const result = await client.callTool(params);
        completed++;
        return result;
      });
      await page.setContent(
        '<iframe id="app" style="width:100%;height:1000px"></iframe>',
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
        drawing = app.frameLocator('iframe');
      const waitGate = async (count: number) => {
        // Delays control ordering; they do not retry a failed product assertion.
        for (let i = 0; i < 200 && pending.length < count; i++)
          await new Promise((resolve) => setTimeout(resolve, 10));
        assert.equal(pending.length, count, 'Expected held server requests');
      };
      const waitCompleted = async (count: number) => {
        for (let i = 0; i < 200 && completed < count; i++)
          await new Promise((resolve) => setTimeout(resolve, 10));
        assert.equal(completed, count);
        // Let the real bridge deliver the already completed response to its iframe.
        await page.waitForTimeout(50);
      };
      const bodyY = () =>
        drawing.locator('[data-wireframe-node="body"] rect').getAttribute('y');
      const change = async (variable: string, value: string) => {
        const control = drawing.locator(`[data-variable="${variable}"]`);
        await control.fill(value);
        await control.dispatchEvent('change');
      };
      const waitY = async (value: string) =>
        page.waitForFunction((expected) => {
          const appDoc =
            document.querySelector<HTMLIFrameElement>('#app')?.contentDocument;
          return (
            appDoc
              ?.querySelector<HTMLIFrameElement>('iframe')
              ?.contentDocument?.querySelector(
                '[data-wireframe-node="body"] rect',
              )
              ?.getAttribute('y') === expected
          );
        }, value);
      const push = async (result: any) => {
        await page.evaluate(
          (result) => (window as any).__SET_RESULT__(result),
          result,
        );
        await drawing.locator('[data-variable="headingHeight"]').waitFor();
        await waitY(
          String(
            result._meta.result.nodes.find((node: any) => node.id === 'body')
              .box.y,
          ),
        );
      };
      await drawing.locator('[data-variable="headingHeight"]').waitFor();
      hold = true;
      await change('headingHeight', '200');
      await waitGate(1);
      await drawing.locator('[data-wireframe-node="image"]').click();
      await page.waitForFunction(
        () =>
          JSON.parse((window as any).__HUMAN_CHOICE__.content[0].text)
            .selectedNode === 'image',
      );
      pending.shift()!.release();
      await waitY('296');
      await app.locator('#choose').click();
      assert.equal(
        JSON.parse(
          await page.evaluate(
            () => (window as any).__HUMAN_CHOICE__.content[0].text,
          ),
        ).selectedNode,
        'image',
      );

      await push(initial);
      await change('headingHeight', '200');
      await waitGate(1);
      const replacement = structuredClone(fixture);
      replacement.wireframe.id = 'replacement-layout';
      replacement.wireframe.variables.headingHeight.value = 64;
      const newer = await resultFor(replacement);
      await push(newer);
      pending.shift()!.release();
      await waitCompleted(2);
      assert.equal(await bodyY(), '160');
      assert.match(
        (await drawing.locator('svg').getAttribute('aria-label'))!,
        /replacement-layout/,
      );

      await push(initial);
      await app.locator('#recompute').click();
      await waitGate(1);
      await change('headingHeight', '200');
      await waitGate(2);
      pending.splice(1, 1)[0]!.release();
      await waitY('296');
      pending.shift()!.release();
      await waitCompleted(4);
      assert.equal(await bodyY(), '296');
      assert.equal(
        await drawing.locator('[data-variable="headingHeight"]').inputValue(),
        '200',
      );

      // A delayed server error belongs to the old view, not its replacement.
      await push(initial);
      await change('gutter', '300');
      await waitGate(1);
      await push(newer);
      pending.shift()!.release();
      await waitCompleted(5);
      assert.ok(
        !(await app.locator('#status').textContent())!.includes(
          'Could not recompute',
        ),
      );
      assert.equal(await bodyY(), '160');
      hold = false;
      await push(initial);
      await change('gutter', '300');
      await app
        .locator('#status')
        .filter({ hasText: 'Could not recompute' })
        .waitFor();
      assert.equal(await bodyY(), '216');
      assert.equal(await app.locator('#choose').isDisabled(), true);

      // The frame cannot replace host-owned definitions or renderer receipt boxes.
      await push(initial);
      const oldSession = await drawing
        .locator('body')
        .evaluate(() => (window as any).__DESIGN_FRAME_SESSION__);
      const count = requests.length;
      await drawing.locator('body').evaluate(
        (_, wireframe) =>
          parent.postMessage(
            {
              designTheoryWireframeEdit: {
                session: (window as any).__DESIGN_FRAME_SESSION__,
                wireframeId: wireframe.id,
                variables: { gutter: 28 },
                selection: 'reported',
                nodes: wireframe.nodes.map((node: any) =>
                  node.id === 'reported'
                    ? { ...node, box: { ...node.box, width: 999 } }
                    : node,
                ),
              },
            },
            '*',
          ),
        fixture.wireframe,
      );
      await page.waitForTimeout(50);
      assert.equal(requests.length, count);
      assert.equal(
        await drawing
          .locator('[data-wireframe-node="reported"] rect')
          .getAttribute('width'),
        '100',
      );
      await change('gutter', '28');
      await page.waitForFunction(
        () =>
          document
            .querySelector<HTMLIFrameElement>('#app')
            ?.contentDocument?.querySelector<HTMLIFrameElement>('iframe')
            ?.contentDocument?.querySelector(
              '[data-wireframe-node="heading"] rect',
            )
            ?.getAttribute('x') === '28',
      );
      const sent = requests
        .at(-1)
        .arguments.input.wireframe.nodes.find(
          (node: any) => node.id === 'reported',
        );
      assert.equal(sent.box.width, 100);
      assert.equal(sent.receipt.receiptId, 'original-receipt');
      const newerCount = requests.length;
      await drawing.locator('body').evaluate(
        (_, session) =>
          parent.postMessage(
            {
              designTheoryWireframeEdit: {
                session,
                wireframeId: 'editorial-hero',
                variables: { gutter: 32 },
                selection: null,
              },
            },
            '*',
          ),
        oldSession,
      );
      await page.waitForTimeout(50);
      assert.equal(
        requests.length,
        newerCount,
        'Messages from a replaced frame session must be ignored',
      );
      // A different inspection mode must survive a pending wireframe response.
      await push(initial);
      hold = true;
      await change('headingHeight', '200');
      await waitGate(1);
      const beforeCompletion = completed;
      const inspection = await client.callTool({
        name: 'design_specimen',
        arguments: {
          command: 'motion proof',
          input: {
            spring: { mass: 1, stiffness: 170, damping: 18 },
            coordinate: { unit: 'dp', from: 24, to: 0 },
            sampleCount: 9,
          },
        },
      });
      assert.ok(!inspection.isError, JSON.stringify(inspection.content));
      await page.evaluate(
        (result) => (window as any).__SET_RESULT__(result),
        inspection,
      );
      await drawing.locator('#time').waitFor();
      pending.shift()!.release();
      await waitCompleted(beforeCompletion + 1);
      assert.equal(await drawing.locator('#time').count(), 1);
      assert.equal(await app.locator('#choose').isDisabled(), true);
      assert.equal(await app.locator('#recompute').isDisabled(), true);
      assert.deepEqual(errors, []);
    } finally {
      await browser.close();
      await client.close();
    }
  },
);
