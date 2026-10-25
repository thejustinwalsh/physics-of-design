import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
const exec = promisify(execFile),
  adb = path.resolve('artifacts/runtime/android-sdk/platform-tools/adb'),
  device = 'emulator-5554';
const directory = 'artifacts/fieldwork/flows-android';
const metroHost = process.env.FIELDWORK_ANDROID_HOST ?? '127.0.0.1:8088';
await mkdir(directory, { recursive: true });
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const quote = (value) => "'" + value.replaceAll("'", "'\\''") + "'";
let proofId = `flows-${Date.now()}`,
  receipt;
const events = [];
async function latest(predicate = () => true, after = 0) {
  const file = `artifacts/fieldwork/native-observations/request-${createHash('sha256').update(proofId).digest('hex')}.json`;
  for (let i = 0; i < 100; i++) {
    try {
      const value = JSON.parse(await readFile(file, 'utf8'));
      if (
        value.incomplete === false &&
        Date.parse(value.capturedAt) > after &&
        predicate(value)
      ) {
        receipt = value;
        return value;
      }
    } catch {}
    await sleep(300);
  }
  throw new Error(`No expected native transition after ${after}: ${file}`);
}
async function open(screen = 'journal', story = '') {
  const started = Date.now(),
    url = `exp://${metroHost}/--/fieldwork?screen=${screen}${story ? `&story=${story}` : ''}&proof=${proofId}`;
  await exec(adb, [
    '-s',
    device,
    'shell',
    `am start -W -a android.intent.action.VIEW -d ${quote(url)} -p host.exp.exponent`,
  ]);
  return latest((value) => value.snapshot.screen === screen, started);
}
async function tap(name, predicate) {
  const current = await latest(),
    target = current.observations.find(
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
  const started = Date.now();
  await exec(adb, [
    '-s',
    device,
    'shell',
    'input',
    'tap',
    String(Math.round((box.x + box.width / 2 + origin.x) * window.scale)),
    String(Math.round((box.y + box.height / 2 + origin.y) * window.scale)),
  ]);
  const result = await latest(predicate, started);
  events.push({ action: 'tap', name, started, receipt: result.capturedAt });
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
try {
  await open();
  if (receipt.snapshot.saved.includes('looking-longer'))
    await tap(
      'Remove The art of looking longer',
      (v) => !v.snapshot.saved.includes('looking-longer'),
    );
  await tap('Save The art of looking longer', (v) =>
    v.snapshot.saved.includes('looking-longer'),
  );
  await tap('Saved', (v) => v.snapshot.screen === 'saved');
  await capture('saved');
  await tap(
    'Read The art of looking longer',
    (v) => v.snapshot.screen === 'reader',
  );
  await swipe();
  assert.ok(
    receipt.snapshot.readerPosition.offset > 100,
    'Actual native scroll offset changed',
  );
  const offset = receipt.snapshot.readerPosition.offset;
  await capture('reading');
  await tap('Back to saved stories', (v) => v.snapshot.screen === 'saved');
  await tap('Journal', (v) => v.snapshot.screen === 'journal');
  for (let attempt = 0; attempt < 3; attempt++) {
    const item = receipt.observations.find(
      (o) => o.kind === 'target' && o.name === 'Resume reading',
    );
    if (
      item &&
      item.box.y + item.box.height / 2 < receipt.snapshot.window.height - 100
    )
      break;
    await swipe();
  }
  await tap(
    'Resume reading',
    (v) =>
      v.snapshot.screen === 'reader' && v.snapshot.readerPosition.offset > 100,
  );
  assert.ok(
    Math.abs(receipt.snapshot.readerPosition.offset - offset) < 8,
    `Resume restores observed offset ${offset} -> ${receipt.snapshot.readerPosition.offset}`,
  );
  events.push({
    action: 'resume-observed-offset',
    before: offset,
    after: receipt.snapshot.readerPosition.offset,
  });
  await capture('resumed');
  await tap('Back to the journal', (v) => v.snapshot.screen === 'journal');
  await tap('Explore', (v) => v.snapshot.screen === 'explore');
  const target = receipt.observations.find(
    (item) => item.kind === 'target' && item.name === 'Search stories',
  );
  assert.ok(target);
  const w = receipt.snapshot.window,
    origin = receipt.snapshot.coordinateSpace.screenOffset;
  await exec(adb, [
    '-s',
    device,
    'shell',
    'input',
    'tap',
    String(
      Math.round((target.box.x + target.box.width / 2 + origin.x) * w.scale),
    ),
    String(
      Math.round((target.box.y + target.box.height / 2 + origin.y) * w.scale),
    ),
  ]);
  const started = Date.now();
  await exec(adb, ['-s', device, 'shell', 'input', 'text', 'zzunseenquery']);
  await latest((v) => v.snapshot.query === 'zzunseenquery', started);
  const keyboardDismissed = Date.now();
  await exec(adb, ['-s', device, 'shell', 'input', 'keyevent', '4']);
  await latest(
    (v) => v.snapshot.window.height >= w.height - 1,
    keyboardDismissed,
  );
  await sleep(600); // Wait for the native keyboard dismissal animation before the pixel capture.
  await latest(
    (v) => v.snapshot.window.height >= w.height - 1,
    keyboardDismissed,
  );
  await capture('search-empty');
  await tap('Clear search', (v) => v.snapshot.query === '');
  // Cold restart the Expo project, wait for the actual measurement client, then
  // deliver the app link after its JS listener is alive. Cold app-link delivery
  // itself is not claimed: Expo Go dropped those parameters in this environment.
  const restart = Date.now();
  await exec(adb, [
    '-s',
    device,
    'shell',
    'am',
    'force-stop',
    'host.exp.exponent',
  ]);
  await exec(adb, [
    '-s',
    device,
    'shell',
    'am',
    'start',
    '-W',
    '-a',
    'android.intent.action.VIEW',
    '-d',
    `exp://${metroHost}`,
    '-p',
    'host.exp.exponent',
  ]);
  const processResult = await exec(adb, [
    '-s',
    device,
    'shell',
    'pidof',
    'host.exp.exponent',
  ]);
  assert.ok(
    processResult.stdout.trim(),
    'Expo Go has a live process after restart',
  );
  await sleep(4000); // Cold project boot before delivering the documented warm app-link event.
  proofId = `flows-relaunch-${Date.now()}`;
  await open();
  assert.ok(
    receipt.snapshot.saved.includes('looking-longer'),
    'Saved choice survives process restart',
  );
  await capture('relaunch');
  events.push({
    action: 'cold-project-restart-and-warm-app-link',
    savedRestored: true,
    scope:
      'Persistent app state verified; cold app-link transport unsupported by this Expo Go run.',
  });
  await writeFile(
    `${directory}/summary.json`,
    JSON.stringify(
      {
        passed: true,
        events,
        scope:
          'Actual Android native gestures, Text/View observations and process restart. Native iOS screenshots are separate evidence.',
      },
      null,
      2,
    ) + '\n',
  );
  console.log(
    'Native save, search/empty, reading resume and process persistence flows passed.',
  );
} catch (error) {
  await writeFile(
    `${directory}/failure.json`,
    JSON.stringify({ error: String(error), events, last: receipt }, null, 2),
  );
  throw error;
}
