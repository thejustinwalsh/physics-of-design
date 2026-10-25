import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, readFile, writeFile, copyFile } from 'node:fs/promises';
import path from 'node:path';
import { auditAppleHig, analyzeComposition } from '../dist/index.js';
const exec = promisify(execFile);
const [platform, device, label] = process.argv.slice(2);
assert.ok(['ios', 'android'].includes(platform));
assert.match(label ?? '', /^[a-z0-9-]+$/);
const directory = `artifacts/fieldwork/proof-native/${label}`;
await mkdir(directory, { recursive: true });
const adb = path.resolve('artifacts/runtime/android-sdk/platform-tools/adb');
const observations = [];
const quoteShell = (value) => "'" + value.replaceAll("'", "'\\''") + "'";
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
for (const [screen, story] of [
  ['journal', ''],
  ['explore', ''],
  ['saved', ''],
  ['reader', 'looking-longer'],
]) {
  const started = Date.now(),
    proofId = `${label}-${screen}-${started}`,
    url = `exp://${platform === 'ios' ? (process.env.FIELDWORK_IOS_HOST ?? 'localhost:8087') : (process.env.FIELDWORK_ANDROID_HOST ?? '127.0.0.1:8088')}/--/fieldwork?screen=${screen}${story ? `&story=${story}` : ''}&proof=${proofId}`;
  if (platform === 'ios')
    await exec('xcrun', [
      'simctl',
      '--set',
      '/private/tmp/physics-design-simulators',
      'launch',
      '--terminate-running-process',
      device,
      'host.exp.Exponent',
      '--initialUrl',
      url,
      '-EXDevMenuIsOnboardingFinished',
      'YES',
      '-ExpoGoOnboardingFinished',
      'YES',
    ]);
  else {
    console.log(
      JSON.stringify({
        stage: 'native-open',
        platform,
        screen,
        url,
        method: 'warm Expo Go link event',
      }),
    );
    await exec(adb, [
      '-s',
      device,
      'shell',
      `am start -W -a android.intent.action.VIEW -d ${quoteShell(url)} -p host.exp.exponent`,
    ]);
  }
  let receipt;
  for (let attempt = 0; attempt < 120; attempt++) {
    try {
      const current = JSON.parse(
        await readFile(
          `artifacts/fieldwork/native-observations/request-${createHash('sha256').update(proofId).digest('hex')}.json`,
          'utf8',
        ),
      );
      if (
        current.incomplete === false &&
        Date.parse(current.capturedAt) > started &&
        current.snapshot.screen === screen
      ) {
        receipt = current;
        break;
      }
    } catch {}
    await wait(500);
  }
  assert.ok(
    receipt,
    `No fresh native ${screen} observation; inspect Metro and collector logs`,
  );
  await wait(250);
  if (platform === 'ios') {
    const temporary = `/private/tmp/fieldwork-${label}-${screen}.png`;
    await exec('xcrun', [
      'simctl',
      '--set',
      '/private/tmp/physics-design-simulators',
      'io',
      device,
      'screenshot',
      temporary,
    ]);
    await copyFile(temporary, `${directory}/${screen}.png`);
  } else {
    const result = await exec(
      adb,
      ['-s', device, 'exec-out', 'screencap', '-p'],
      { encoding: 'buffer', maxBuffer: 20_000_000 },
    );
    await writeFile(`${directory}/${screen}.png`, result.stdout);
  }
  const { window, safeArea } = receipt.snapshot;
  const targets = receipt.observations
    .filter(
      (o) =>
        o.kind === 'target' &&
        o.box.width > 0 &&
        o.box.height > 0 &&
        o.visibleBox.width > 0 &&
        o.visibleBox.height > 0 &&
        o.visibleBox.x < window.width &&
        o.visibleBox.y < window.height &&
        o.visibleBox.x + o.visibleBox.width > 0 &&
        o.visibleBox.y + o.visibleBox.height > 0,
    )
    .map((o) => ({
      id: o.id,
      label: o.name,
      box: o.box,
      visibleBox: o.visibleBox,
    }));
  const media = receipt.observations.filter((o) => o.kind === 'media');
  const thumbnails = media.filter((o) => o.role === 'thumbnail');
  const rectangles = media.map((o) => ({ id: o.id, box: o.box }));
  const constraints =
    thumbnails.length < 2
      ? []
      : ['left', 'width', 'height'].map((axis) => ({
          id: `thumbnail-${axis}`,
          members: thumbnails.map((o) => o.id),
          axis,
          tolerance: 0.5,
          source:
            'Fieldwork authored thumbnail rail and 92×104dp frame contract',
        }));
  const alignment = analyzeComposition({
    viewport: { width: window.width, height: window.height },
    rectangles,
    constraints,
  });
  assert.ok(
    alignment.constraints.every((c) => c.pass),
    JSON.stringify(alignment.constraints),
  );
  for (const thumbnail of thumbnails) {
    assert.ok(Math.abs(thumbnail.box.width - 92) < 0.5);
    assert.ok(Math.abs(thumbnail.box.height - 104) < 0.5);
  }
  const audit =
    platform === 'ios'
      ? auditAppleHig({
          platform: window.width > 700 ? 'ipados' : 'ios',
          viewport: { width: window.width, height: window.height },
          safeArea,
          targets,
          evidence: {
            engine: receipt.engine,
            receipt: `${label}/${screen}.json`,
          },
          navigation: {
            destinations: ['journal', 'explore', 'saved'],
            selected: screen === 'reader' ? 'journal' : screen,
          },
        })
      : null;
  await writeFile(
    `${directory}/${screen}.json`,
    JSON.stringify({ receipt, audit, alignment }, null, 2) + '\n',
  );
  assert.equal(audit?.failures.length ?? 0, 0, JSON.stringify(audit?.failures));
  observations.push({
    screen,
    window,
    targets: targets.length,
    failures: audit?.failures ?? [],
    unknown: audit?.unknown ?? [],
    media,
    alignment: alignment.constraints,
  });
}
await writeFile(
  `${directory}/summary.json`,
  JSON.stringify(
    {
      observations,
      scope:
        'Actual native screenshots, view frames and text layout callbacks. Separate UI flows establish task transitions; no desktop-native or full HIG-conformance claim.',
    },
    null,
    2,
  ) + '\n',
);
console.log(
  JSON.stringify(
    observations.map((o) => ({
      screen: o.screen,
      targets: o.targets,
      failures: o.failures,
    })),
  ),
);
