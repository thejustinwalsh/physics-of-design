import http from 'node:http';
import path from 'node:path';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { chromium, webkit } from 'playwright';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { sourceIdentity } from '../experiments/expo-design-theory/scripts/source-identity.mjs';
const round = process.env.EXPO_DESIGN_ROUND ?? 'round2';
const output = `artifacts/expo-design-theory/${round}`;
await mkdir(output, { recursive: true });
const directory = path.resolve('experiments/expo-design-theory/dist');
const source = await sourceIdentity();
// This producer owns only an ephemeral web server and browser processes. It
// never boots, launches, or stops native runtimes, even without --web-only.
await new Promise((resolve, reject) => {
  const child = spawn(process.execPath, ['node_modules/expo/bin/cli', 'export', '--platform', 'web', '--output-dir', 'dist'], {
    cwd: path.resolve('experiments/expo-design-theory'),
    env: { ...process.env, CI: '1', EXPO_NO_TELEMETRY: '1', EXPO_PUBLIC_DESIGN_SOURCE_HASH: source, __UNSAFE_EXPO_HOME_DIRECTORY: path.resolve('artifacts/expo-home') },
    stdio: 'inherit',
  });
  child.on('error', reject); child.on('exit', (code) => code === 0 ? resolve() : reject(Error(`Expo export failed: ${code}`)));
});
const generated = JSON.parse(await readFile('experiments/expo-design-theory/src/design.generated.json', 'utf8'));
const designIdentity = createHash('sha256').update(await readFile('experiments/expo-design-theory/DESIGN.md')).digest('hex');
const server = http.createServer(async (req, res) => {
  try {
    const file = path.resolve(directory, `.${decodeURIComponent(req.url.split('?')[0] === '/' ? '/index.html' : req.url.split('?')[0])}`);
    if (!file.startsWith(directory + '/')) throw Error('outside root');
    res.setHeader('content-type', ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.ttf': 'font/ttf' })[path.extname(file)] ?? 'application/octet-stream');
    res.end(await readFile(file));
  } catch { res.writeHead(404).end(); }
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const url = `http://127.0.0.1:${server.address().port}`;
const report = { version: 1, round, sourceIdentity: source, designIdentity, resultIdentity: generated.identity, generatedAt: new Date().toISOString(), scenarios: [], checks: [], failures: [], scope: 'Actual Expo Web export in Playwright; separate native receipts required. No aesthetic score.' };
try {
  for (const [name, type] of [['chromium', chromium], ['webkit', webkit]]) {
    const browser = await type.launch(name === 'webkit' && process.env.DESIGN_WEBKIT_EXECUTABLE ? { executablePath: process.env.DESIGN_WEBKIT_EXECUTABLE } : {});
    try {
      for (const width of [390, 820, 1440]) {
        const page = await browser.newPage({ viewport: { width, height: 1000 }, reducedMotion: 'reduce' });
        const errors = []; page.on('pageerror', (error) => errors.push(error.message));
        await page.goto(url); await page.waitForFunction(() => globalThis.__EXPO_DESIGN_PROOF__?.boxes?.['probe-open']?.height > 0);
        for (const scale of [1, 2]) {
          if (scale === 2) { await page.getByTestId('enlarge').click(); await page.waitForFunction(() => globalThis.__EXPO_DESIGN_PROOF__.textScale === 2); }
          const receipt = await page.evaluate(() => ({ ...globalThis.__EXPO_DESIGN_PROOF__, documentWidth: document.documentElement.scrollWidth, boundStyles: Object.fromEntries(['row-inlet', 'filter-review'].map((id) => { const e = document.querySelector(`[data-testid="${id}"]`), s = getComputedStyle(e); return [id, { fontSize: s.fontSize, lineHeight: s.lineHeight, letterSpacing: s.letterSpacing, minHeight: s.minHeight, paddingTop: s.paddingTop, paddingBottom: s.paddingBottom }]; })) }));
          const scenario = { id: `${name}-${width}-${scale}`, browser: name, width, height: 1000, textScale: scale, receipt, errors: [...errors] };
          report.scenarios.push(scenario);
          await page.screenshot({ path: `${output}/${scenario.id}.png`, fullPage: true });
          const overflow = Object.entries(receipt.boxes).filter(([id, b]) => !id.startsWith('probe-') && id !== 'root' && b.x + b.width > width + 1);
          report.checks.push({ scenario: scenario.id, name: 'horizontal-containment', passed: receipt.documentWidth <= width + 1 && overflow.length === 0, detail: overflow });
          report.checks.push({ scenario: scenario.id, name: 'clean-runtime', passed: errors.length === 0, detail: errors });
          report.checks.push({ scenario: scenario.id, name: 'current-source', passed: receipt.sourceIdentity === source });
          if (generated.phase === 'resolved-kernels') {
            const v = generated.values[receipt.scenario];
            report.checks.push({ scenario: scenario.id, name: 'actual-bound-values', passed: !!v && Math.abs(parseFloat(receipt.boundStyles['row-inlet'].fontSize) - v['row.fontSize']) < .1 && Math.abs(receipt.boxes.list.width - v['regions.list.width']) < .6 && Math.abs(receipt.boxes['line-height-probe'].height - v['row.lineHeight']) < .6, detail: { scenario: receipt.scenario, fontSize: receipt.boundStyles['row-inlet'].fontSize, listWidth: receipt.boxes.list.width, lineHeight: receipt.boxes['line-height-probe'].height } });
          }
        }
        await page.getByTestId('long-text').click();
        await page.getByTestId('filter-review').click();
        await page.getByTestId('row-inlet').click();
        await page.waitForFunction(() => globalThis.__EXPO_DESIGN_PROOF__.selected === 'inlet');
        await page.screenshot({ path: `${output}/${name}-${width}-detail.png`, fullPage: true });
        await page.getByTestId('mark-reviewed').click();
        await page.waitForFunction(() => globalThis.__EXPO_DESIGN_PROOF__.selected === null && globalThis.__EXPO_DESIGN_PROOF__.reviewed.includes('inlet'));
        report.checks.push({ scenario: `${name}-${width}`, name: 'filter-detail-review-flow', passed: await page.getByTestId('row-inlet').count() === 0 });
        await page.getByTestId('filter-all').focus(); await page.keyboard.press('Enter');
        await page.waitForFunction(() => globalThis.__EXPO_DESIGN_PROOF__.filter === 'all');
        report.checks.push({ scenario: `${name}-${width}`, name: 'keyboard-filter', passed: await page.getByTestId('row-inlet').count() === 1 });
        await page.close();
      }
    } finally { await browser.close(); }
  }
} catch (error) { report.failures.push({ message: error.message, stack: error.stack }); }
finally { server.close(); await writeFile(`${output}/proof.json`, JSON.stringify(report, null, 2)); }
console.log(JSON.stringify({ output, checks: report.checks.length, failed: report.checks.filter((c) => !c.passed), errors: report.failures }, null, 2));
if (report.failures.length || report.checks.some((c) => !c.passed)) process.exitCode = 1;
