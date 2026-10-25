import { nativeSourceIdentity } from './native-source-identity.mjs';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, stat } from 'node:fs/promises';
import path from 'node:path';
const exec = promisify(execFile),
  adb = path.resolve('artifacts/runtime/android-sdk/platform-tools/adb'),
  device = 'emulator-5554';
const expectedSource = await nativeSourceIdentity();
const runId = `flows-${Date.now()}`;
const directory = `artifacts/vela/flows-android/${runId}`;
const metroHost = process.env.FIELDWORK_ANDROID_HOST ?? '127.0.0.1:8088';
await mkdir(directory, { recursive: true });
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const quote = (value) => "'" + value.replaceAll("'", "'\\''") + "'";
let proofId = runId,
  receipt,
  receiptObservedAt;
const events = [];
async function latest(predicate = () => true, after = 0) {
  const file = `artifacts/fieldwork/native-observations/request-${createHash('sha256').update(proofId).digest('hex')}.json`;
  for (let i = 0; i < 100; i++) {
    try {
      // File delivery and action timestamps share the host clock. Device
      // capturedAt is retained as evidence, but device/host clocks can differ.
      const deliveredAt = (await stat(file)).mtimeMs;
      const value = JSON.parse(await readFile(file, 'utf8'));
      if (
        value.incomplete === false &&
        value.snapshot.motionPhase === 'held' &&
        value.snapshot.viewportGuard?.status === 'current' &&
        deliveredAt > after &&
        predicate(value)
      ) {
        assert.equal(
          value.snapshot.implementationIdentity,
          expectedSource,
          'Native flow source must be fresh',
        );
        receipt = value;
        receiptObservedAt = deliveredAt;
        return value;
      }
    } catch {}
    await sleep(300);
  }
  throw new Error(`No expected native transition after ${after}: ${file}`);
}
async function open(screen = 'today', story = '') {
  const started = Date.now(),
    url = `exp://${metroHost}/--/vela?screen=${screen}${story ? `&story=${story}` : ''}&proof=${proofId}`;
  await exec(adb, [
    '-s',
    device,
    'shell',
    `am start -W -a android.intent.action.VIEW -d ${quote(url)} -p host.exp.exponent`,
  ]);
  return latest((value) => value.snapshot.screen === screen, started);
}
async function tap(name, predicate) {
  let current = await latest();
  if (current.snapshot.running)
    current = await latest((v) => v.snapshot.running, Date.now() - 1500);
  const target = current.observations.find(
    (item) => item.kind === 'target' && item.name === name,
  );
  assert.ok(target, `Missing native target: ${name}`);
  const { box } = target,
    window = current.snapshot.window,
    origin = current.snapshot.coordinateSpace.screenOffset;
  assert.ok(
    box.y + box.height / 2 >= 0 && box.y + box.height / 2 <= window.height,
    `Target offscreen: ${name}`,
  );
  const measured = target.visibleBox ?? box;
  assert.ok(
    measured.width > 0 && measured.height > 0,
    `Invisible target: ${name}`,
  );
  for (const key of ['x', 'y', 'width', 'height'])
    assert.ok(
      Number.isFinite(measured[key]) && Math.abs(measured[key] - box[key]) <= 1,
      `Target must be fully visible: ${name}/${key}`,
    );
  const expected = [
    (measured.x + origin.x) * window.scale,
    (measured.y + origin.y) * window.scale,
    (measured.x + measured.width + origin.x) * window.scale,
    (measured.y + measured.height + origin.y) * window.scale,
  ];
  let bounds = expected,
    error = null;
  let accessibilityOracle = {
    status: 'unavailable',
    reason:
      'Live clock continuously changes accessibility state; idle-dependent UIAutomator dump is not used.',
  };
  // A running clock prevents UIAutomator's idle wait from completing. The
  // command can exit zero with an ERROR and leave an older XML file intact.
  // Keep that oracle explicitly unavailable; prove the measured tap's fresh
  // product transition below without freezing or slowing the product clock.
  if (!current.snapshot.running) {
    const remote = `/sdcard/vela-${runId}-${events.length}.xml`;
    await exec(adb, ['-s', device, 'shell', 'rm', '-f', remote], {
      timeout: 5000,
    });
    const dumped = await exec(
      adb,
      ['-s', device, 'shell', 'uiautomator', 'dump', remote],
      { timeout: 15000 },
    );
    assert.ok(
      /dumped to:/i.test(dumped.stdout) &&
        dumped.stdout.includes(remote) &&
        !/ERROR:/i.test(dumped.stdout + dumped.stderr),
      `Accessibility oracle unavailable for idle action ${name}: ${dumped.stdout} ${dumped.stderr}`,
    );
    const xml = (
      await exec(adb, ['-s', device, 'exec-out', 'cat', remote], {
        timeout: 5000,
      })
    ).stdout;
    assert.ok(
      xml.includes('<hierarchy') && xml.includes('</hierarchy>'),
      'Incomplete fresh accessibility XML',
    );
    const xmlFile = `${events.length}-accessibility.xml`;
    await writeFile(`${directory}/${xmlFile}`, xml);
    await exec(adb, ['-s', device, 'shell', 'rm', '-f', remote], {
      timeout: 5000,
    });
    const escaped = name
      .replaceAll('&', '&amp;')
      .replaceAll('"', '&quot;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;');
    const node = xml
      .match(/<node\b[^>]*>/g)
      ?.find(
        (node) =>
          node.includes(`content-desc="${escaped}"`) &&
          node.includes('clickable="true"'),
      );
    assert.ok(node, `Missing accessible native action: ${name}`);
    bounds = node
      .match(/bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/)
      .slice(1)
      .map(Number);
    error = Math.max(
      ...bounds.map((value, index) => Math.abs(value - expected[index])),
    );
    assert.ok(
      error <= 2,
      `Native/accessibility bounds disagree for ${name}: ${JSON.stringify({ bounds, expected, error })}`,
    );
    accessibilityOracle = {
      status: 'verified',
      file: xmlFile,
      bounds,
      nativeBoundsErrorPx: error,
    };
  }
  const started = Date.now();
  await exec(adb, [
    '-s',
    device,
    'shell',
    'input',
    'tap',
    String(Math.round((bounds[0] + bounds[2]) / 2)),
    String(Math.round((bounds[1] + bounds[3]) / 2)),
  ]);
  const result = await latest(predicate, started);
  events.push({
    action: 'tap',
    name,
    started,
    receipt: result.capturedAt,
    receiptObservedAt,
    tapBoundsPx: bounds,
    accessibilityOracle,
    measurementCapturedAt: current.capturedAt,
    nativeBoundsErrorPx: error,
  });
  return result;
}
async function swipe() {
  const window = receipt.snapshot.window,
    started = Date.now();
  await exec(adb, [
    '-s',
    device,
    'shell',
    'input',
    'swipe',
    String(Math.round(window.width * window.scale * 0.55)),
    String(Math.round(window.height * window.scale * 0.75)),
    String(Math.round(window.width * window.scale * 0.55)),
    String(Math.round(window.height * window.scale * 0.3)),
    '500',
  ]);
  return latest(() => true, started);
}
async function capture(name) {
  const screenshot = await exec(
    adb,
    ['-s', device, 'exec-out', 'screencap', '-p'],
    { encoding: 'buffer', maxBuffer: 20_000_000 },
  );
  await writeFile(`${directory}/${name}.png`, screenshot.stdout);
  await writeFile(
    `${directory}/${name}.json`,
    JSON.stringify(receipt, null, 2) + '\n',
  );
}
async function reveal(name) {
  for (let i = 0; i < 6; i++) {
    const t = receipt.observations.find(
      (o) => o.kind === 'target' && o.name === name,
    );
    if (
      t &&
      t.visibleBox.height >= Math.min(t.box.height, 44) &&
      t.visibleBox.width > 0
    )
      return;
    await swipe();
  }
  throw new Error('Cannot reveal ' + name);
}
try {
  await open();
  const initialCount = receipt.snapshot.completedSessions;
  await tap('Open session', (v) => v.snapshot.screen === 'detail');
  await reveal('Start session');
  await tap(
    'Start session',
    (v) => v.snapshot.screen === 'active' && v.snapshot.running,
  );
  await latest((v) => v.snapshot.elapsedSeconds >= 1);
  await capture('running');
  await reveal('Pause session');
  await tap('Pause session', (v) => !v.snapshot.running);
  const paused = receipt.snapshot.elapsedSeconds;
  await sleep(1300);
  await latest((v) => !v.snapshot.running);
  assert.equal(receipt.snapshot.elapsedSeconds, paused);
  await capture('paused');
  await tap('Resume session', (v) => v.snapshot.running);
  await latest((v) => v.snapshot.elapsedSeconds > paused);
  await reveal('Finish session');
  await tap(
    'Finish session',
    (v) =>
      v.snapshot.screen === 'complete' &&
      v.snapshot.completedSessions === initialCount + 1,
  );
  await capture('complete');
  await reveal('View insights');
  await tap('View insights', (v) => v.snapshot.screen === 'insights');
  await capture('insights');
  await tap('Profile', (v) => v.snapshot.screen === 'profile');
  await reveal('Reduce motion');
  await tap('Reduce motion', (v) => v.snapshot.reducedMotion);
  await capture('reduced-preference');
  await tap(
    'Today',
    (v) =>
      v.snapshot.screen === 'today' &&
      v.snapshot.reducedMotion &&
      v.snapshot.motion.kind === 'opacity-fade',
  );
  await capture('reduced-page');
  await open('profile');
  assert.equal(receipt.snapshot.preferences.motion, 'reduced');
  assert.equal(receipt.snapshot.completedSessions, initialCount + 1);
  await reveal('Follow system motion');
  await tap(
    'Follow system motion',
    (v) => v.snapshot.preferences.motion === 'system',
  );
  await writeFile(
    `${directory}/summary.json`,
    JSON.stringify(
      {
        passed: true,
        events,
        initialCount,
        completedCount: initialCount + 1,
        accessibilityCoverage: {
          verified: events.filter(
            (e) => e.accessibilityOracle?.status === 'verified',
          ).length,
          unavailable: events.filter(
            (e) => e.accessibilityOracle?.status === 'unavailable',
          ).length,
        },
        scope:
          'Actual Android gestures and fresh measured state transitions, elapsed timer pause/resume, completion persistence, and reduced-motion substitution. Idle actions independently cross-check fresh accessibility XML bounds. Live-clock taps use measured visible bounds with fresh transition evidence; their accessibility oracle is explicitly unavailable. iOS static/scale proofs separate.',
      },
      null,
      2,
    ) + '\n',
  );
  console.log(directory);
} catch (error) {
  await writeFile(
    `${directory}/failure.json`,
    JSON.stringify({ error: String(error), events, last: receipt }, null, 2),
  );
  throw error;
}
