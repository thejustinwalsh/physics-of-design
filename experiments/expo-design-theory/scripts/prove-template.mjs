import { readFile, writeFile, mkdir, open } from 'node:fs/promises';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';
import http from 'node:http';
import path from 'node:path';
import assert from 'node:assert/strict';
import { chromium, webkit } from 'playwright';
const exec = promisify(execFile), root = process.cwd(), output = path.resolve('artifacts/expo-template-smoke'), app = path.join(output, 'app');
const policy = JSON.parse(await readFile('experiments/relay/policy.json', 'utf8'));
assert.ok(policy.templateFiles.includes('src/useObservations.jsx'));
const launcher = await readFile('scripts/run-relay-builders.mjs', 'utf8');
const shell = launcher.match(/const SHELL = `([\s\S]*?)`;\n/)[1];
const sourceFiles = [];
for (const file of policy.templateFiles) {
  const bytes = await readFile(path.join(policy.templateRoot, file));
  await mkdir(path.dirname(path.join(app, file)), { recursive: true }); await writeFile(path.join(app, file), bytes);
  sourceFiles.push({ path: file, sha256: createHash('sha256').update(bytes).digest('hex') });
}
await writeFile(path.join(app, 'src/App.jsx'), shell);
sourceFiles.push({ path: 'src/App.jsx', sha256: createHash('sha256').update(shell).digest('hex') });
const sourceIdentity = createHash('sha256').update(JSON.stringify(sourceFiles)).digest('hex');
const env = { ...process.env, CI: '1', EXPO_NO_TELEMETRY: '1', EXPO_PUBLIC_DESIGN_SOURCE_HASH: sourceIdentity, EXPO_PUBLIC_DESIGN_OBSERVER: 'http://127.0.0.1:4334/observe', __UNSAFE_EXPO_HOME_DIRECTORY: path.resolve('artifacts/expo-home') };
const children = [], handles = [], receipts = {}, checks = [], errors = [];
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
async function command(name, cmd, args, cwd = app, extra = {}) {
  const log = await open(path.join(output, `${name}.log`), 'w'); handles.push(log);
  const child = spawn(cmd, args, { cwd, env: { ...env, ...extra }, detached: true, stdio: ['ignore', log.fd, log.fd] }); children.push(child);
  return child;
}
async function finished(child) { await new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', (code) => code === 0 ? resolve() : reject(Error(`Child failed ${code}`))); }); }
async function waitFor(fn, label) { for (let i = 0; i < 150; i++) { try { const v = await fn(); if (v) return v; } catch {} await delay(400); } throw Error(`No current ${label}`); }
const observer = http.createServer(async (req, res) => {
  if (req.method !== 'POST' || req.url !== '/observe') { res.writeHead(404).end(); return; }
  let body = ''; for await (const chunk of req) { body += chunk; if (body.length > 1000000) { res.writeHead(413).end(); return; } }
  try { const r = JSON.parse(body); if (r.sourceIdentity !== sourceIdentity) throw Error('source'); receipts[r.platform] = r; res.writeHead(204).end(); } catch { res.writeHead(400).end(); }
});
const webServer = http.createServer(async (req, res) => {
  try { const relative = new URL(req.url, 'http://localhost').pathname; const file = path.resolve(app, 'dist', `.${relative === '/' ? '/index.html' : relative}`); if (!file.startsWith(path.join(app, 'dist') + '/')) throw Error('path'); res.setHeader('content-type', ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' })[path.extname(file)] ?? 'application/octet-stream'); res.end(await readFile(file)); } catch { res.writeHead(404).end(); }
});
const nativeProof = [], webProof = [];
try {
  await finished(await command('npm-ci', 'npm', ['ci', '--no-audit', '--no-fund']));
  await finished(await command('web-export', process.execPath, ['node_modules/expo/bin/cli', 'export', '--platform', 'web']));
  await new Promise((r) => webServer.listen(0, '127.0.0.1', r));
  for (const [name, type] of [['chromium', chromium], ['webkit', webkit]]) {
    const browser = await type.launch(name === 'webkit' && process.env.DESIGN_WEBKIT_EXECUTABLE ? { executablePath: path.resolve(process.env.DESIGN_WEBKIT_EXECUTABLE) } : {});
    try {
      for (const width of [390, 820, 1440]) {
        const page = await browser.newPage({ viewport: { width, height: 1000 } });
        await page.goto(`http://127.0.0.1:${webServer.address().port}`);
        await page.waitForFunction(() => globalThis.__EXPO_DESIGN_PROOF__?.boxes?.['shell-button']?.height > 0);
        await page.getByTestId('shell-button').click();
        await page.waitForFunction(() => globalThis.__EXPO_DESIGN_PROOF__.presses === 1);
        const receipt = await page.evaluate(() => globalThis.__EXPO_DESIGN_PROOF__);
        await page.screenshot({ path: path.join(output, `${name}-${width}.png`) });
        webProof.push({ browser: name, width, receipt });
        checks.push({ name: `${name}-${width}-primitive-and-click`, passed: receipt.sourceIdentity === sourceIdentity && receipt.presses === 1 && receipt.boxes['shell-button'].height >= 48 });
        await page.close();
      }
    } finally { await browser.close(); }
  }
  await new Promise((r) => observer.listen(4334, '127.0.0.1', r));
  await command('metro', 'npm', ['run', 'start', '--', '--clear', '--port', '8107']);
  await command('proxy', process.execPath, ['scripts/metro-proxy.mjs'], root, { DESIGN_METRO_PROXY_PORT: '8108', DESIGN_METRO_UPSTREAM_PORT: '8107' });
  await waitFor(async () => (await (await fetch('http://127.0.0.1:8108/status')).text()) === 'packager-status:running', 'Metro');
  const adb = path.resolve('artifacts/runtime/android-sdk/platform-tools/adb');
  for (const port of [8107, 8108, 4334]) await exec(adb, ['-s', 'emulator-5554', 'reverse', `tcp:${port}`, `tcp:${port}`]);
  await exec(adb, ['-s', 'emulator-5554', 'shell', 'am', 'start', '-W', '-a', 'android.intent.action.VIEW', '-d', 'exp://127.0.0.1:8108', '-p', 'host.exp.exponent']);
  const ios = (await readFile('artifacts/runtime/iphone-udid.txt', 'utf8')).trim();
  await exec('xcrun', ['simctl', '--set', '/private/tmp/physics-design-simulators', 'launch', '--terminate-running-process', ios, 'host.exp.Exponent', '--initialUrl', 'exp://localhost:8107', '-EXDevMenuIsOnboardingFinished', 'YES', '-ExpoGoOnboardingFinished', 'YES']);
  for (const platform of ['native-ios', 'native-android']) {
    const before = await waitFor(() => receipts[platform]?.boxes?.['shell-button']?.height > 0 && receipts[platform], platform);
    const box = before.boxes['shell-button'];
    if (platform === 'native-ios') {
      // Native JS can report mounted geometry before Expo's presentation
      // transition exposes the application to accessibility/HID input.
      const tree = await waitFor(async () => { const a = JSON.parse((await exec(process.execPath, ['scripts/ios-input-driver.mjs', 'ax'])).stdout); return a.some((e) => e.AXUniqueId === 'shell-button') && a; }, 'iOS foreground shell accessibility');
      await writeFile(path.join(output, 'ios-accessibility.json'), JSON.stringify(tree, null, 2));
      await exec(process.execPath, ['scripts/ios-input-driver.mjs', 'tap-id', 'shell-button']);
    }
    else {
      await exec(adb, ['-s', 'emulator-5554', 'shell', 'uiautomator', 'dump', '/sdcard/template-shell.xml']);
      const xml = (await exec(adb, ['-s', 'emulator-5554', 'exec-out', 'cat', '/sdcard/template-shell.xml'])).stdout;
      await writeFile(path.join(output, 'android-accessibility.xml'), xml);
      const node = [...xml.matchAll(/<node\b[^>]*>/g)].map((m) => m[0]).find((n) => n.includes('resource-id="shell-button"'));
      assert.ok(node); const b = node.match(/bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/).slice(1).map(Number);
      await exec(adb, ['-s', 'emulator-5554', 'shell', 'input', 'tap', String(Math.round((b[0] + b[2]) / 2)), String(Math.round((b[1] + b[3]) / 2))]);
    }
    const after = await waitFor(() => receipts[platform]?.presses === 1 && receipts[platform], `${platform} actual button transition`);
    const screenshot = path.join(output, `${platform}.png`);
    if (platform === 'native-ios') await exec(process.execPath, ['scripts/ios-input-driver.mjs', 'screenshot', screenshot]);
    else await writeFile(screenshot, (await exec(adb, ['-s', 'emulator-5554', 'exec-out', 'screencap', '-p'], { encoding: 'buffer', maxBuffer: 10000000 })).stdout);
    nativeProof.push({ platform, before, after, screenshot });
    checks.push({ name: `${platform}-primitive-measurement-and-native-input`, passed: after.sourceIdentity === sourceIdentity && before.presses === 0 && after.presses === 1 && box.height >= 48 && box.x >= 0 && box.x + box.width <= after.viewport.width + 1 });
  }
} catch (e) { errors.push({ message: e.message, stack: e.stack }); }
finally {
  observer.close(); webServer.close();
  for (const child of children) if (child.exitCode === null) { try { process.kill(-child.pid, 'SIGTERM'); } catch {} }
  for (const h of handles) await h.close();
}
const proof = { version: 1, kind: 'independent-builder-template-smoke', complete: errors.length === 0 && checks.length === 8 && checks.every((c) => c.passed), sourceIdentity, sourceFiles, shellSourceIdentity: createHash('sha256').update(shell).digest('hex'), generatedAt: new Date().toISOString(), checks, web: webProof, native: nativeProof, errors, scope: 'Exact blank builder shell and copied configuration/primitive adapters. Actual production web export and native Expo Go primitives/HID interactions. Original spike UI proof is separate.' };
await writeFile(path.join(output, 'proof.json'), JSON.stringify(proof, null, 2));
console.log(JSON.stringify({ complete: proof.complete, sourceIdentity, checks, errors }, null, 2));
if (!proof.complete) process.exitCode = 1;
