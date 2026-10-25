import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import assert from 'node:assert/strict';
import path from 'node:path';
import { sourceIdentity } from './source-identity.mjs';
const exec = promisify(execFile), platform = process.argv.includes('--ios') ? 'ios' : 'android';
const calibrate = process.argv.includes('--calibrate');
const output = 'artifacts/expo-design-theory', nativePlatform = `native-${platform}`;
const source = await sourceIdentity(), actions = [], receipts = [];
const adb = path.resolve('artifacts/runtime/android-sdk/platform-tools/adb');
const idb = path.resolve('artifacts/ios-input-driver/runtime/venv/bin/idb');
const idbArgs = ['--companion', 'localhost:10882'];
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
await mkdir(`${output}/native-cells`, { recursive: true });
await mkdir(`${output}/native-round2`, { recursive: true });
async function latest(predicate = () => true, after = 0) {
  for (let i = 0; i < 100; i++) {
    const r = JSON.parse(await readFile(`${output}/${nativePlatform}-latest.json`, 'utf8'));
    if (r.sourceIdentity === source && Date.parse(r.deliveredAt) > after && predicate(r)) return r;
    await delay(300);
  }
  throw Error(`No fresh ${nativePlatform} receipt matching requested state`);
}
async function screenshot(name) {
  const file = `${output}/native-round2/${platform}-${name}.png`;
  if (platform === 'android') await writeFile(file, (await exec(adb, ['-s', 'emulator-5554', 'exec-out', 'screencap', '-p'], { encoding: 'buffer', maxBuffer: 10000000 })).stdout);
  else await exec(idb, [...idbArgs, 'screenshot', file]);
  return file;
}
async function tap(target, predicate) {
  let r = await latest(), b = r.boxes[target]; assert.ok(b, `Missing native target ${target}`);
  for (let i = 0; i < 6 && (b.y < r.safeArea.top || b.y + b.height > r.viewport.height - r.safeArea.bottom); i++) {
    const down = b.y < r.safeArea.top;
    if (platform === 'android') await exec(adb, ['-s', 'emulator-5554', 'shell', 'input', 'swipe', '500', down ? '700' : '1900', '500', down ? '1900' : '700', '400']);
    else await exec(idb, [...idbArgs, 'ui', 'swipe', '200', down ? '250' : '700', '200', down ? '700' : '250', '--duration', '0.4']);
    r = await latest(() => true, Date.now()); b = r.boxes[target];
  }
  assert.ok(b.y >= 0 && b.y + b.height <= r.viewport.height + 1, `Offscreen target ${target}`);
  const started = Date.now(), x = b.x + b.width / 2, y = b.y + b.height / 2;
  if (platform === 'android') {
    const remote = `/sdcard/expo-${target}.xml`;
    await exec(adb, ['-s', 'emulator-5554', 'shell', 'uiautomator', 'dump', remote]);
    const xml = (await exec(adb, ['-s', 'emulator-5554', 'exec-out', 'cat', remote])).stdout;
    await writeFile(`${output}/native-round2/android-${actions.length}-accessibility.xml`, xml);
    const node = [...xml.matchAll(/<node\b[^>]*>/g)].map((m) => m[0]).find((n) => n.includes(`resource-id="${target}"`));
    assert.ok(node, `No actual Android native accessibility ID ${target}`);
    const bounds = node.match(/bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/).slice(1).map(Number);
    const expected = [b.x * r.viewport.scale, (b.y - r.boxes.root.y) * r.viewport.scale, (b.x + b.width) * r.viewport.scale, (b.y + b.height - r.boxes.root.y) * r.viewport.scale];
    assert.ok(bounds.every((v, i) => Math.abs(v - expected[i]) < 3), `Native/AX bounds mismatch ${target}: ${bounds}/${expected}`);
    await exec(adb, ['-s', 'emulator-5554', 'shell', 'input', 'tap', String(Math.round((bounds[0] + bounds[2]) / 2)), String(Math.round((bounds[1] + bounds[3]) / 2))]);
  } else await exec(process.execPath, ['scripts/ios-input-driver.mjs', 'tap-id', target]);
  const next = await latest(predicate, started);
  actions.push({ target, method: platform === 'android' ? 'adb-native-input-with-independent-uiautomator-bounds' : 'idb-native-hid-with-independent-ax-id', before: { filter: r.filter, selected: r.selected, textScale: r.textScale }, after: { filter: next.filter, selected: next.selected, textScale: next.textScale, reviewed: next.reviewed }, box: b, observedAt: next.observedAt });
  return next;
}
let error = null;
try {
  let r = await latest();
  if (r.selected) await tap('back', (v) => v.selected === null);
  if (r.enlarged) await tap('enlarge', (v) => !v.enlarged);
  await tap('filter-all', (v) => v.filter === 'all');
  r = await latest(); receipts.push({ name: 'normal', receipt: r, screenshot: await screenshot('normal') });
  await writeFile(`${output}/native-cells/${nativePlatform}-1.json`, JSON.stringify(r, null, 2));
  r = await tap('enlarge', (v) => v.textScale === 2);
  receipts.push({ name: 'enlarged', receipt: r, screenshot: await screenshot('enlarged') });
  await writeFile(`${output}/native-cells/${nativePlatform}-2.json`, JSON.stringify(r, null, 2));
  await tap('enlarge', (v) => v.textScale === 1);
  if (!calibrate) {
    await tap('filter-review', (v) => v.filter === 'review');
    await tap('row-inlet', (v) => v.selected === 'inlet');
    r = await latest(); receipts.push({ name: 'detail', receipt: r, screenshot: await screenshot('detail') });
    await tap('mark-reviewed', (v) => v.selected === null && v.reviewed.includes('inlet'));
    await tap('filter-all', (v) => v.filter === 'all');
    await tap('long-text', (v) => v.longText);
    r = await latest(); receipts.push({ name: 'reviewed-long-text', receipt: r, screenshot: await screenshot('reviewed-long-text') });
  }
} catch (e) { error = { message: e.message, stack: e.stack }; }
const generated = JSON.parse(await readFile('experiments/expo-design-theory/src/design.generated.json', 'utf8'));
const checks = [];
for (const { name, receipt: r } of receipts.filter((r) => ['normal', 'enlarged'].includes(r.name))) {
  const v = generated.values[r.scenario];
  checks.push({ name: `${name}-source-and-result`, passed: r.sourceIdentity === source && (calibrate || r.resultIdentity === generated.identity && r.phase === 'resolved-kernels') });
  const overflow = Object.entries(r.boxes).filter(([id, b]) => !id.startsWith('probe-') && b.width > 0 && (b.x < -1 || b.x + b.width > r.viewport.width + 1));
  checks.push({ name: `${name}-horizontal-containment`, passed: overflow.length === 0, detail: overflow });
  if (!calibrate) {
    checks.push({ name: `${name}-actual-region-widths`, passed: !!v && Math.abs(r.boxes.list.width - v['regions.list.width']) < .6 && Math.abs(r.boxes.detail.width - v['regions.detail.width']) < .6, measured: { list: r.boxes.list.width, detail: r.boxes.detail.width }, expected: v && { list: v['regions.list.width'], detail: v['regions.detail.width'] } });
    checks.push({ name: `${name}-actual-line-height`, passed: !!v && Math.abs(r.boxes['line-height-probe'].height - v['row.lineHeight']) < 1, measured: r.boxes['line-height-probe'].height, expected: v?.['row.lineHeight'] });
    checks.push({ name: `${name}-row-minimum`, passed: !!v && r.boxes['row-inlet'].height + .6 >= v['row.rowHeight'], measured: r.boxes['row-inlet'].height, expectedMinimum: v?.['row.rowHeight'] });
  }
}
const report = { version: 1, platform: nativePlatform, calibrate, sourceIdentity: source, resultIdentity: generated.identity, designIdentity: generated.designIdentity ?? null, generatedAt: new Date().toISOString(), sourceStable: source === await sourceIdentity(), actions, receipts, checks, error, scope: 'Actual native app, native touch injection, actual native host-node rectangles. Declared style values remain distinct from measured geometry. iOS/Android virtual devices, not physical hardware power or full accessibility audit.' };
await writeFile(`${output}/${nativePlatform}-${calibrate ? 'calibration' : 'proof'}.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify({ platform, actions: actions.length, receipts: receipts.length, checks, error }, null, 2));
if (error || checks.some((c) => !c.passed)) process.exitCode = 1;
