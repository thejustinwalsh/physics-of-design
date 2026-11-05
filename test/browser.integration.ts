import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseState } from '../dist/state.js';
import { BrowserRenderer } from '../dist/measurement.js';
import { scoreRelations } from '../dist/factors.js';
import { perturb } from '../dist/graph.js';
import { relax } from '../dist/search.js';
import { proofHtml } from '../dist/emission.js';
import { chromium, webkit } from 'playwright';
import { transformAsync } from '@babel/core';
import stylexPlugin from '@stylexjs/babel-plugin';
import { planBento } from '../dist/bento.js';
import { build } from 'esbuild';
import {
  snapshotVerificationSources,
  verificationSourceFields,
} from '../scripts/verification-sources.mjs';
import { hash } from '../dist/identity.js';
import {
  resolveOutputBindings,
  checkOutputBindings,
} from '../dist/output-bindings.js';
import type { collectBrowserOutputBindings } from '../dist/browser-output-bindings.js';
import { resolveLayout } from '../dist/responsive.js';
import { analyzeMediaFile } from '../dist/media.js';
const hero = () =>
  parseState(JSON.parse(readFileSync('examples/hero.json', 'utf8')));

for (const engine of [chromium, webkit])
  test(
    `${engine.name()} bento StyleX agrees with predicted flex boxes across widths, RTL and enlarged changed content`,
    { timeout: 120000 },
    async () => {
      const before = snapshotVerificationSources(process.cwd());
      const browser = await engine.launch({ headless: true });
      try {
        const page = await browser.newPage();
        const cases = [];
        for (const width of [0.5, 320, 390, 768, 834, 1440, 1920])
          for (const scale of [1, 2])
            for (const direction of ['ltr', 'rtl'] as const) {
              const tiny = width < 1;
              const height = tiny ? 0.5 : 1200 * scale;
              const input = {
                width,
                height,
                gap: tiny ? 0 : 16,
                unit: 'css-px',
                direction,
                regions: Array.from({ length: tiny ? 2 : 4 }, (_, i) => ({
                  id: `surface-${i}`,
                  minWidth: tiny ? 0.001 : 160 * scale,
                  minHeight: tiny ? 0.001 : 150 * scale,
                  basis: 'authored',
                  source: [
                    'test:conservative content minima, not native measurement',
                  ],
                  aspect: {
                    min: 0.8,
                    max: 2.5,
                    source: ['test:brief proportions'],
                  },
                  areaWeight: [3, 2, 1, 1][i],
                })),
              };
              const result = planBento(input);
              assert.equal(result.status, 'proposed');
              for (const candidate of result.candidates.slice(0, 2)) {
                const emitted = candidate.styles;
                assert.ok(emitted.stylex.source);
                assert.equal(emitted.reactNative.source, null);
                const source = `${emitted.stylex.source}
import React from 'react';import {createRoot} from 'react-dom/client';import {flushSync} from 'react-dom';
const tree=${JSON.stringify(candidate.tree)}, keys=${JSON.stringify(emitted.styleKeys)};
function frame(node,path='root') {return React.createElement('section',{...stylex.props(styles[keys[path]]),'data-node':path,'data-region':node.kind==='region'?node.id:undefined},node.kind==='split'?node.children.map((child,i)=>React.cloneElement(frame(child,path+'.'+i),{key:i})):${tiny}?null:React.createElement('div',{className:'card'},React.createElement('strong',null,node.id+' · incident response'),React.createElement('p',null,${JSON.stringify(scale === 2 ? 'Changed content: Checkout-api needs a closer investigation after the connection pool saturated during this synthetic incident.' : 'Checkout-api · 1,850 ms p95 · synthetic incident')},),React.createElement('span',null,'Target 450 ms · Open investigation →')));}
const root=createRoot(document.getElementById('app'));flushSync(()=>root.render(frame(tree)));export const dispose=()=>root.unmount();`;
                const compiled = await transformAsync(source, {
                  filename: 'bento-specimen.jsx',
                  babelrc: false,
                  configFile: false,
                  plugins: [
                    [stylexPlugin, { dev: false, runtimeInjection: true }],
                  ],
                });
                assert.ok(compiled?.code);
                const bundled = await build({
                  stdin: {
                    contents: compiled.code,
                    resolveDir: process.cwd(),
                    sourcefile: 'bento-specimen.jsx',
                  },
                  bundle: true,
                  format: 'iife',
                  globalName: 'BentoSpecimen',
                  platform: 'browser',
                  write: false,
                  define: { 'process.env.NODE_ENV': '"production"' },
                });
                await page.evaluate('globalThis.BentoSpecimen?.dispose()');
                await page.setViewportSize({
                  width: Math.ceil(width),
                  height: Math.ceil(height + 16),
                });
                await page.setContent(
                  `<style>body{margin:0;font:${14 * scale}px/${1.4} system-ui}.card{box-sizing:border-box;padding:12px;min-width:0}p{margin:8px 0}</style><div id="app"></div>`,
                );
                await page.addScriptTag({
                  content: bundled.outputFiles[0]!.text,
                });
                const actual = await page.evaluate(() =>
                  [...document.querySelectorAll('[data-region]')].map(
                    (element) => {
                      const b = element.getBoundingClientRect();
                      return {
                        id: element.getAttribute('data-region'),
                        box: {
                          x: b.x,
                          y: b.y,
                          width: b.width,
                          height: b.height,
                        },
                        scrollWidth: element.scrollWidth,
                        scrollHeight: element.scrollHeight,
                        clientWidth: element.clientWidth,
                        clientHeight: element.clientHeight,
                      };
                    },
                  ),
                );
                const expected = candidate.consequences.boxes;
                assert.deepEqual(
                  actual.map((item) => item.id),
                  expected.map((item) => item.id),
                );
                for (const [index, item] of actual.entries()) {
                  for (const key of ['x', 'y', 'width', 'height'] as const)
                    assert.ok(
                      Math.abs(item.box[key] - expected[index]!.box[key]) <
                        (tiny ? 0.02 : 1),
                      JSON.stringify({
                        engine: engine.name(),
                        width,
                        scale,
                        direction,
                        id: item.id,
                        key,
                        expected: expected[index]!.box,
                        actual: item.box,
                      }),
                    );
                  assert.ok(
                    item.scrollWidth <= item.clientWidth + 1,
                    'Changed text must not overflow horizontally',
                  );
                  assert.ok(
                    item.scrollHeight <= item.clientHeight + 1,
                    'Changed text must not be clipped vertically',
                  );
                }
                cases.push({
                  identity: result.identity,
                  renderedInputIdentity: hash({
                    source,
                    width,
                    height,
                    scale,
                    direction,
                    font: 'system-ui',
                  }),
                  width,
                  scale,
                  direction,
                  candidate: candidate.id,
                  expected,
                  actual,
                });
              }
            }
        await page.evaluate('globalThis.BentoSpecimen?.dispose()');
        const { mkdir, writeFile } = await import('node:fs/promises');
        await mkdir('artifacts/bento', { recursive: true });
        await writeFile(
          `artifacts/bento/${engine.name()}-flex.json`,
          JSON.stringify(
            {
              ...verificationSourceFields(
                before,
                snapshotVerificationSources(process.cwd()),
              ),
              scope:
                'Actual compiled React/StyleX flex geometry and content fit at declared widths, RTL and enlarged changed copy. No native or preference evidence.',
              cases,
            },
            null,
            2,
          ) + '\n',
        );
      } finally {
        await browser.close();
      }
    },
  );

for (const engine of [chromium, webkit])
  test(
    `${engine.name()} baseline inspection preserves React text ownership and cleans up rejected probes`,
    { timeout: 60000 },
    async () => {
      const compiled = await build({
        stdin: {
          contents: `
      import React, {useState} from 'react';
      import {createRoot} from 'react-dom/client';
      import {flushSync} from 'react-dom';
      import {collectTypographyElement} from './dist/typography-browser.js';
      let update;
      function Text(){const [value,setValue]=useState(['Checkout','production']);update=setValue;return React.createElement('p',{id:'label',style:{fontSize:'20px',lineHeight:'30px',width:'250px'}},value[0],' · ',value[1]);}
      export const mount=()=>{const root=createRoot(document.getElementById('app'));flushSync(()=>root.render(React.createElement(Text)));};
      export const change=()=>flushSync(()=>update(['Inventory','staging']));
      export {collectTypographyElement};
    `,
          resolveDir: process.cwd(),
        },
        bundle: true,
        format: 'iife',
        globalName: 'LiveTypography',
        platform: 'browser',
        write: false,
        define: { 'process.env.NODE_ENV': '"production"' },
      });
      const browser = await engine.launch({ headless: true });
      try {
        const page = await browser.newPage();
        const errors: string[] = [];
        page.on('pageerror', (error) => errors.push(error.message));
        await page.setContent('<div id="app"></div>');
        await page.addScriptTag({ content: compiled.outputFiles[0]!.text });
        const result: any = await page.evaluate(`(()=>{
        LiveTypography.mount();
        const label=document.querySelector('#label');
        const original=[...label.childNodes];
        if(original.length!==3)throw Error('Fixture must have three React-owned adjacent Text objects');
        const measurement=LiveTypography.collectTypographyElement(label);
        const preserved=original.every((node,index)=>node===label.childNodes[index]);
        LiveTypography.change();
        const changed=label.textContent;
        const afterEdit=original.every((node,index)=>node===label.childNodes[index]);
        const bounding=HTMLElement.prototype.getBoundingClientRect;
        let rejection='';
        HTMLElement.prototype.getBoundingClientRect=function(){if(this.style.display==='inline-block' && this.style.width==='0px')throw Error('injected baseline probe failure');return bounding.call(this);};
        try {LiveTypography.collectTypographyElement(label);}catch(error){rejection=String(error);}finally{HTMLElement.prototype.getBoundingClientRect=bounding;}
        return {preserved,afterEdit,changed,baselines:measurement.lines.map(line=>line.baseline),rejection,clean:label.childNodes.length===3 && original.every((node,index)=>node===label.childNodes[index]) && label.textContent==='Inventory · staging'};
      })()`);
        assert.equal(result.preserved, true);
        assert.equal(result.afterEdit, true);
        assert.equal(result.changed, 'Inventory · staging');
        assert.ok(
          result.baselines.some((baseline: number | null) => baseline !== null),
        );
        assert.match(result.rejection, /injected baseline probe failure/);
        assert.equal(result.clean, true);
        assert.deepEqual(errors, []);
      } finally {
        await browser.close();
      }
    },
  );

for (const engine of [chromium, webkit])
  test(
    `${engine.name()} live inspection follows current elements without overlay feedback or stale identities`,
    { timeout: 60000 },
    async () => {
      const bundle = await build({
        stdin: {
          contents:
            "export { createBrowserElementInspector } from './dist/browser-inspection.js'",
          resolveDir: process.cwd(),
        },
        bundle: true,
        format: 'iife',
        globalName: 'LiveInspector',
        platform: 'browser',
        write: false,
      });
      const browser = await engine.launch({ headless: true });
      try {
        const page = await browser.newPage({
          viewport: { width: 800, height: 600 },
        });
        const errors: string[] = [];
        page.on('pageerror', (error) => errors.push(error.message));
        await page.setContent(
          `<style>body{margin:0}#target{width:123.5px;height:40px;padding:4px;border:1px solid;box-sizing:content-box}#other{width:80px;height:30px}[data-design-inspection-ui]{position:fixed;right:0;top:0}</style><div id="scroller" style="overflow:auto;height:180px"><div id="target" data-testid="target"><div data-design-inspection-ui id="drawing"></div></div><div style="height:800px"></div></div><div id="other"></div>`,
        );
        await page.addScriptTag({ content: bundle.outputFiles[0]!.text });
        await page.evaluate(
          `window.receipts=[];window.inspector=LiveInspector.createBrowserElementInspector({targetId:'target',context:{sourceIdentity:'browser-test-source',inputKey:'a'},onSample:receipt=>{window.receipts.push(receipt);window.inspector.update({targetId:receipt.targetId,context:receipt.context});document.querySelector('#drawing').textContent=String(receipt.sequence);}});`,
        );
        await page.waitForFunction(
          `window.receipts.at(-1)?.contentBox?.width===123.5 && window.receipts.at(-1)?.intersection?.isIntersecting && !window.inspector.stats().pendingFrame`,
        );
        const initial: any = await page.evaluate(`window.receipts.at(-1)`);
        assert.equal(initial.status, 'measured');
        assert.equal(initial.box.width, 133.5);
        assert.equal(initial.computed.paddingLeft, '4px');
        assert.equal(
          initial.contentBox.coordinateSpace,
          'local-content-css-px',
        );
        const quiet: any = await page.evaluate(`window.inspector.stats()`);
        await page.waitForTimeout(100);
        assert.equal(
          await page.evaluate(`window.inspector.stats().reads`),
          quiet.reads,
          'Inspection UI writes must not create a read loop',
        );

        const changed: any = await page.evaluate(
          `document.querySelector('#target').style.width='201.25px';window.inspector.read()`,
        );
        assert.equal(changed.box.width, 211.25);
        assert.equal(
          changed.contentBox,
          null,
          'A previous content observation must not impersonate the new layout',
        );
        await page.waitForFunction(
          `window.receipts.at(-1)?.contentBox?.width===201.25`,
        );
        await page.evaluate(
          `const replacement=document.querySelector('#target').cloneNode(true);replacement.style.width='225px';document.querySelector('#target').replaceWith(replacement);`,
        );
        await page.waitForFunction(`window.receipts.at(-1)?.box?.width===235`);
        const renamed: any = await page.evaluate(
          `document.querySelector('#target').id='renamed';document.querySelector('#renamed').removeAttribute('data-testid');window.inspector.read()`,
        );
        assert.equal(renamed.status, 'missing');
        assert.equal(renamed.box, null);

        await page.evaluate(
          `window.inspector.update({targetId:'other',context:{sourceIdentity:'browser-test-source',inputKey:'b'}});`,
        );
        await page.waitForFunction(
          `window.receipts.at(-1)?.targetId==='other' && window.receipts.at(-1)?.context.inputKey==='b' && window.receipts.at(-1)?.intersection?.isIntersecting`,
        );
        const duplicate: any = await page.evaluate(
          `document.body.appendChild(document.querySelector('#other').cloneNode(true));window.inspector.read()`,
        );
        assert.equal(duplicate.status, 'ambiguous');
        assert.equal(duplicate.box, null);
        await page.evaluate(
          `document.querySelectorAll('#other')[1].remove();window.inspector.update({targetId:'other',context:{sourceIdentity:'browser-test-source',inputKey:'c'}});`,
        );
        await page.waitForFunction(
          `window.receipts.at(-1)?.context.inputKey==='c' && window.receipts.at(-1)?.intersection?.isIntersecting`,
        );
        await page.evaluate(
          `window.moving=document.querySelector('#other').animate([{transform:'translateX(0px)'},{transform:'translateX(150px)'}],{duration:400,fill:'forwards'});window.inspector.invalidate();`,
        );
        await page.waitForFunction(`window.receipts.at(-1)?.box?.x>30`);
        await page.evaluate(`window.moving.finish()`);
        await page.waitForFunction(
          `window.receipts.at(-1)?.box?.x===150 && !window.inspector.stats().pendingFrame`,
        );
        const finished: any = await page.evaluate(`window.inspector.stats()`);
        await page.waitForTimeout(100);
        assert.equal(
          await page.evaluate(`window.inspector.stats().reads`),
          finished.reads,
          'An ended animation must release the frame loop',
        );

        await page.evaluate(
          `document.querySelector('#other').style.display='none'`,
        );
        await page.waitForFunction(`window.receipts.at(-1)?.status==='hidden'`);
        assert.equal(await page.evaluate(`window.receipts.at(-1).box`), null);
        const stopped: any = await page.evaluate(
          `window.inspector.dispose();window.inspector.dispose();window.inspector.stats()`,
        );
        await page.evaluate(
          `document.querySelector('#other').style.display='block';window.dispatchEvent(new Event('resize'));`,
        );
        await page.waitForTimeout(100);
        const disposed: any = await page.evaluate(`window.inspector.stats()`);
        assert.equal(disposed.reads, stopped.reads);
        assert.equal(disposed.observers, 0);
        assert.equal(disposed.pendingFrame, false);
        assert.equal(
          await page.evaluate(`window.inspector.read().status`),
          'disposed',
        );
        assert.deepEqual(errors, []);
      } finally {
        await browser.close();
      }
    },
  );

test('real local original raster decodes with source hash and full-resolution region evidence', async () => {
  const result = await analyzeMediaFile({
    file: 'native/assets/fieldwork/headland.png',
    sampleLimit: 32,
    provenance: {
      origin: 'original-generated',
      source: 'research/fieldwork-asset-provenance.json',
      expectedSha256:
        '8fee5f6272e740a888eb4212c52223758a7c94a2db4c234aa9b2ab389ce639a3',
    },
    contrastRegions: [
      {
        id: 'text',
        foreground: [1, 1, 1],
        region: { x: 0, y: 0, width: 0.1, height: 0.1 },
      },
    ],
  });
  assert.equal(result.width, 1536);
  assert.equal(result.height, 1024);
  assert.equal(result.mime, 'image/png');
  assert.equal(result.provenance.hashVerified, true);
  assert.equal(result.provenance.rightsStatus, 'unknown');
  assert.equal(result.contrastRegions[0]!.pixelsVisited, 154 * 103);
  assert.ok(result.sampledDescriptors.samples <= 32);
  assert.ok(result.metadataUnknown.includes('calibrated albedo'));
});

for (const engine of [chromium, webkit])
  test(
    `${engine.name()} collects actual binding properties and distinguishes transformed geometry, ambiguity and overrides`,
    { timeout: 60000 },
    async () => {
      const bundle = await build({
        stdin: {
          contents:
            "export { collectBrowserOutputBindings } from './dist/browser-output-bindings.js'",
          resolveDir: process.cwd(),
        },
        bundle: true,
        format: 'iife',
        globalName: 'BindingCollector',
        platform: 'browser',
        write: false,
      });
      const browser = await engine.launch({ headless: true });
      try {
        const page = await browser.newPage({
          viewport: { width: 834, height: 1000 },
        });
        await page.setContent(`<style>
        #box {box-sizing:border-box;display:flex;position:relative;flex-direction:row;width:120px;height:48px;min-height:48px;
          padding:4px 8px;gap:6px;font:16px/24px sans-serif;letter-spacing:normal;opacity:.75;
          color:#123;background:#eaf2f7;border:2px solid #456;transform:scale(1.5);transform-origin:0 0}
        #ambiguous {display:flex;row-gap:4px;column-gap:8px;line-height:normal;border:1px solid red;border-right-color:blue}
        #hidden {display:none}
      </style><div id="box" data-testid="box">Actual row</div>
      <div id="ambiguous">Automatic line height</div><div id="hidden">Hidden</div>
      <div data-testid="duplicate">One</div><div data-testid="duplicate">Two</div>`);
        await page.addScriptTag({ content: bundle.outputFiles[0]!.text });
        const cases = [
          ['font', 'box', 'fontSize', 16, 'css-px'],
          ['leading', 'box', 'lineHeight', 24, 'css-px'],
          ['tracking', 'box', 'letterSpacing', 0, 'css-px'],
          ['min-height', 'box', 'minHeight', 48, 'css-px'],
          ['height', 'box', 'height', 48, 'css-px'],
          ['width', 'box', 'width', 120, 'css-px'],
          ['pad-top', 'box', 'paddingTop', 4, 'css-px'],
          ['pad-left', 'box', 'paddingLeft', 8, 'css-px'],
          ['gap', 'box', 'gap', 6, 'css-px'],
          ['ink', 'box', 'color', '#112233', 'color'],
          ['background', 'box', 'backgroundColor', '#eaf2f7', 'color'],
          ['border', 'box', 'borderColor', '#445566', 'color'],
          ['opacity', 'box', 'opacity', 0.75, 'ratio'],
          ['direction', 'box', 'flexDirection', 'row', 'token'],
          ['containing-block', 'box', 'position', 'relative', 'token'],
          ['box-model', 'box', 'boxSizing', 'border-box', 'token'],
          ['spring', 'box', 'spring.mass', 1, 'spring-parameter'],
          ['normal', 'ambiguous', 'lineHeight', 24, 'css-px'],
          ['unequal-gap', 'ambiguous', 'gap', 4, 'css-px'],
          ['unequal-border', 'ambiguous', 'borderColor', '#ff0000', 'color'],
          ['hidden', 'hidden', 'width', 120, 'css-px'],
          ['duplicate', 'duplicate', 'width', 120, 'css-px'],
          ['missing', 'absent', 'width', 120, 'css-px'],
        ] as const;
        const value = Object.fromEntries(
          cases.map(([id, , , expected]) => [id, expected]),
        );
        const current = {
          designIdentity: hash('synthetic-design'),
          sourceIdentity: hash('synthetic-fixture-source'),
          inputIdentity: hash('synthetic-fixture-input'),
          resultIdentity: hash(value),
        };
        const manifest = resolveOutputBindings({
          operation: 'resolve',
          source: { value, identity: hash(value) },
          current,
          bindings: cases.map(([id, surface, property, , unit]) => ({
            id,
            scenario: 'tablet',
            scenarioIdentity: hash('synthetic-tablet'),
            platform: 'web',
            unit,
            pointer: `/${id}`,
            target: {
              surface,
              property,
              sourceLocation: 'test/browser.integration.ts',
            },
          })),
        });
        const context = {
          current,
          scenario: 'tablet',
          scenarioIdentity: hash('synthetic-tablet'),
          resultRef: `test:real-dom/${engine.name()}`,
        };
        const collect = () =>
          page.evaluate(
            ({ manifest, context }) =>
              (
                globalThis as unknown as {
                  BindingCollector: {
                    collectBrowserOutputBindings: typeof collectBrowserOutputBindings;
                  };
                }
              ).BindingCollector.collectBrowserOutputBindings(
                manifest,
                context,
              ),
            { manifest, context },
          );
        const receipt = await collect();
        const checked = checkOutputBindings({
          operation: 'check',
          manifest,
          current,
          observations: receipt.observations,
        });
        for (const entry of checked.entries.slice(0, 16))
          assert.equal(entry.status, 'pass', JSON.stringify(entry));
        assert.equal(checked.entries[16]!.status, 'unsupported');
        for (const entry of checked.entries.slice(17))
          assert.equal(entry.status, 'unknown', JSON.stringify(entry));
        assert.equal(receipt.geometry.box!.width, 180);
        assert.equal(receipt.viewport.width, 834);
        assert(
          receipt.observations.every((o) =>
            o.runtime.includes(
              engine.name() === 'webkit' ? 'AppleWebKit' : 'Chrome',
            ),
          ),
        );
        await page.locator('#box').evaluate((el) => {
          (el as HTMLElement).style.width = '122px';
        });
        const changed = await collect();
        assert.equal(
          checkOutputBindings({
            operation: 'check',
            manifest,
            current,
            observations: changed.observations,
          }).entries.find((e) => e.id === 'width')!.status,
          'override',
        );
        assert.equal(changed.geometry.box!.width, 183);
        const stale = checkOutputBindings({
          operation: 'check',
          manifest,
          current,
          observations: changed.observations.map((o) => ({
            ...o,
            current: { ...o.current, sourceIdentity: hash('changed-source') },
          })),
        });
        assert(stale.entries.every((e) => e.status === 'stale'));
      } finally {
        await browser.close();
      }
    },
  );

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
