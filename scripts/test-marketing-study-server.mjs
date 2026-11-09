// Synthetic fixture only: never reads any study build or evaluator output.
// Run: node scripts/test-marketing-study-server.mjs
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import net from 'node:net';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const script = fileURLToPath(new URL('./serve-marketing-study.mjs', import.meta.url));
const fixture = await fs.mkdtemp(path.join(os.tmpdir(), 'neutral-study-server-test-'));
const ids = ['X1', 'Y2', 'Z3'];
const children = [];
let browser;
async function freePort() {
  const socket = net.createServer();
  await new Promise(resolve => socket.listen(0, '127.0.0.1', resolve));
  const port = socket.address().port;
  await new Promise(resolve => socket.close(resolve));
  return port;
}
async function launch(arguments_) {
  const child = spawn(process.execPath, [script, ...arguments_], { stdio: ['ignore', 'pipe', 'pipe'] });
  children.push(child);
  await new Promise((resolve, reject) => {
    child.stdout.once('data', resolve);
    child.once('exit', code => reject(new Error(`Server exited early: ${code}`)));
    child.stderr.once('data', data => reject(new Error(data.toString())));
  });
}
function request(port, route, method = 'GET') {
  return new Promise((resolve, reject) => {
    const query = http.request({ host: '127.0.0.1', port, path: route, method }, response => {
      const chunks = [];
      response.on('data', chunk => chunks.push(chunk));
      response.on('end', () => resolve({ status: response.statusCode, body: Buffer.concat(chunks).toString() }));
    });
    query.on('error', reject);
    query.end();
  });
}
try {
  await fs.writeFile(path.join(fixture, 'manifest.json'), JSON.stringify({ arms: ids.map(id => ({ id, workspace: '/private/secret' })) }));
  // Prepare before any public output exists, then prove later starts retain it.
  await promisify(execFile)(process.execPath, [script, fixture, '--prepare-plan']);
  const initialPlanBytes = await fs.readFile(path.join(fixture, 'review-plan.json'), 'utf8');
  const plan = JSON.parse(initialPlanBytes);
  assert.equal(plan.pairs.length, 3);
  assert.equal(new Set(plan.pairs.map(pair => [pair.left, pair.right].sort().join(':'))).size, 3);
  for (const id of ids) {
    const publicPath = path.join(fixture, 'frozen', id, 'public');
    await fs.mkdir(publicPath, { recursive: true });
    await fs.writeFile(path.join(publicPath, 'index.html'), '<html><h1>Fixture only</h1><p>Safe page</p></html>');
  }
  await fs.mkdir(path.join(fixture, 'frozen', 'X1', 'public', 'assets'));
  await fs.writeFile(path.join(fixture, 'frozen', 'X1', 'public', 'assets', 'test.css'), 'body{color:red}');
  await fs.mkdir(path.join(fixture, 'evaluation'));
  await fs.writeFile(path.join(fixture, 'evaluation', 'report.json'), 'private report');
  await fs.symlink(path.join(fixture, 'manifest.json'), path.join(fixture, 'frozen', 'X1', 'public', 'leak.json'));
  await fs.symlink(path.join(fixture, 'evaluation', 'report.json'), path.join(fixture, 'evaluation', 'leak.png'));
  const viewerPort = await freePort();
  const armPort = await freePort();
  await fs.writeFile(path.join(fixture, 'hosting.json'), JSON.stringify({ origins: { X1: `http://127.0.0.1:${armPort}/` } }));
  await Promise.all([launch([fixture, String(viewerPort)]), launch([fixture, String(armPort), '--arm', 'X1'])]);
  assert.equal(await fs.readFile(path.join(fixture, 'review-plan.json'), 'utf8'), initialPlanBytes);
  const routes = [
    ['/', 200], ['/X1/', 200], ['/manifest.json', 404], ['/review-plan.json', 404],
    ['/rawevents', 404], ['/X1/../manifest.json', 400], ['/X1/%2e%2e/manifest.json', 400],
    ['/X1/%2e%2e%2fmanifest.json', 400], ['/X1/%5c..%5cmanifest.json', 400],
    ['/%', 400], ['/X1/leak.json', 404], ['/screens/leak.png', 404],
  ];
  for (const [route, status] of routes) assert.equal((await request(viewerPort, route)).status, status, route);
  assert.equal((await request(viewerPort, '/', 'POST')).status, 405);
  for (const [route, status] of [['/', 200], ['/assets/test.css', 200], ['/manifest.json', 404], ['/Y2/', 404]]) {
    assert.equal((await request(armPort, route)).status, status, `root arm ${route}`);
  }
  console.log('PASS: root assets, stored plan preservation, 12 route/traversal cases and POST rejection');
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 320, height: 740 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${viewerPort}/`);
  assert.equal(await page.locator('#single').getAttribute('src'), `http://127.0.0.1:${armPort}/`);
  for (const width of [320, 390, 834, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `overflow at ${width}`);
    assert.equal(await page.locator('.pair-grid').evaluate(element => getComputedStyle(element).display), 'flex');
  }
  assert.equal(await page.locator('input[value=""]:checked').count(), 4, 'unanswered defaults');
  const defaultDownloadPromise = page.waitForEvent('download');
  await page.locator('#export').click();
  const defaultDownload = await defaultDownloadPromise;
  const defaultBytes = await fs.readFile(await defaultDownload.path(), 'utf8');
  const unanswered = JSON.parse(defaultBytes);
  for (const pair of unanswered.observations) for (const key of ['overall', 'hierarchy', 'coherence', 'motion']) assert.equal(pair[key], null);
  await page.locator('input[name="overall"][value="A"]').check();
  await page.locator('#pair').selectOption('1');
  assert.equal(await page.locator('input[name="overall"][value=""]:checked').count(), 1);
  await page.locator('#pair').selectOption('0');
  assert.equal(await page.locator('input[name="overall"][value="A"]:checked').count(), 1);
  const downloadPromise = page.waitForEvent('download');
  await page.locator('#export').click();
  const download = await downloadPromise;
  // Read the actual downloaded bytes, not merely a fired download event.
  const downloadedBytes = await fs.readFile(await download.path(), 'utf8');
  const exported = JSON.parse(downloadedBytes);
  assert.equal(downloadedBytes.endsWith('\n'), true, 'export ends in a real newline');
  assert.equal(exported.observations[0].overall, 'A');
  assert.equal(exported.observations[1].overall, null);
  assert.equal(exported.observations[0].hierarchy, null);
  assert.deepEqual(errors, []);
  console.log('PASS: flex at 320/390/834/1440 without overflow; null defaults; retained choices; actual JSON download bytes parse and end in newline');
} finally {
  await browser?.close();
  for (const child of children) {
    child.kill();
    if (child.exitCode === null && child.signalCode === null) await new Promise(resolve => child.once('exit', resolve));
  }
  await fs.rm(fixture, { recursive: true, force: true });
}
