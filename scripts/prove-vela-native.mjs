import { assertNativePrimary } from './native-primary.mjs';
import { nativeSourceIdentity } from './native-source-identity.mjs';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, readFile, writeFile, copyFile } from 'node:fs/promises';
import path from 'node:path';
import { auditAppleHig, resolveDesignRuntime } from '../dist/index.js';
import { diagnoseNativeTextWidths } from '../dist/native-text-diagnostics.js';
const exec = promisify(execFile),
  [platform, device, label] = process.argv.slice(2),
  set = '/private/tmp/physics-design-simulators';
assert.ok(['ios', 'android'].includes(platform));
assert.match(label ?? '', /^[a-z0-9-]+$/);
const dir = `artifacts/vela/proof-native/${label}`,
  adb = path.resolve('artifacts/runtime/android-sdk/platform-tools/adb');
await mkdir(dir, { recursive: true });
const expectedSource = await nativeSourceIdentity();
const policy = JSON.parse(
    await readFile('examples/vela/design.generated.json', 'utf8'),
  ),
  results = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms)),
  quote = (s) => "'" + s.replaceAll("'", "'\\''") + "'";
for (const screen of [
  'today',
  'detail',
  'active',
  'complete',
  'insights',
  'profile',
]) {
  const start = Date.now(),
    proof = `vela-${label}-${screen}-${start}`,
    url = `exp://${platform === 'ios' ? 'localhost:8087' : '127.0.0.1:8088'}/--/vela?screen=${screen}&proof=${proof}`;
  if (platform === 'ios')
    await exec('xcrun', [
      'simctl',
      '--set',
      set,
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
  else
    await exec(adb, [
      '-s',
      device,
      'shell',
      `am start -W -a android.intent.action.VIEW -d ${quote(url)} -p host.exp.exponent`,
    ]);
  let receipt;
  for (let attempt = 0; attempt < 120; attempt++) {
    try {
      const r = JSON.parse(
        await readFile(
          `artifacts/fieldwork/native-observations/request-${createHash('sha256').update(proof).digest('hex')}.json`,
          'utf8',
        ),
      );
      if (
        !r.incomplete &&
        r.snapshot.app === 'vela' &&
        r.snapshot.screen === screen &&
        r.snapshot.hydrated &&
        r.snapshot.motionPhase === 'held' &&
        Date.parse(r.capturedAt) > start
      ) {
        receipt = r;
        break;
      }
    } catch {}
    await sleep(500);
  }
  assert.ok(receipt, `No fresh actual native ${screen} receipt`);
  await sleep(500);
  if (platform === 'ios') {
    const file = `/private/tmp/vela-${label}-${screen}.png`;
    await exec('xcrun', [
      'simctl',
      '--set',
      set,
      'io',
      device,
      'screenshot',
      file,
    ]);
    await copyFile(file, `${dir}/${screen}.png`);
  } else {
    const r = await exec(adb, ['-s', device, 'exec-out', 'screencap', '-p'], {
      encoding: 'buffer',
      maxBuffer: 20000000,
    });
    await writeFile(`${dir}/${screen}.png`, r.stdout);
  }
  const { window, safeArea } = receipt.snapshot;
  assert.equal(
    receipt.snapshot.viewportGuard?.status,
    'current',
    'Static proof requires current valid native geometry',
  );
  assert.equal(
    receipt.snapshot.implementationIdentity,
    expectedSource,
    'Actual native implementation must match frozen source',
  );
  assert.equal(
    receipt.snapshot.designHandoffIdentity,
    policy.handoff.identity,
    'Actual native policy must match frozen handoff identity',
  );
  const targets = receipt.observations
    .filter(
      (o) =>
        o.kind === 'target' &&
        o.visibleBox.width > 0 &&
        o.visibleBox.height > 0,
    )
    .map((o) => ({
      id: o.id,
      label: o.name,
      box: o.box,
      visibleBox: o.visibleBox,
    }));
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
        })
      : null;
  const primaryCheck = assertNativePrimary(receipt);
  const plan = resolveDesignRuntime(policy.handoff, {
    width: window.width - safeArea.left - safeArea.right,
    height: window.height,
    textScale: window.fontScale,
    reducedMotion: receipt.snapshot.reducedMotion ? 1 : 0,
  });
  assert.deepEqual(
    receipt.snapshot.plan,
    Object.fromEntries(
      Object.entries(plan.regions[screen].screen).filter(
        ([, v]) => typeof v === 'number',
      ),
    ),
    `App equations differ from tool runtime at ${screen}`,
  );
  assert.deepEqual(receipt.snapshot.motion.spring, {
    mass: plan.motions.page.mass,
    stiffness: plan.motions.page.stiffness,
    damping: plan.motions.page.damping,
  });
  const text = receipt.observations.filter((o) => o.kind === 'text');
  const textWidthDiagnostics = text
    .filter((o) => o.visibleBox.width > 0 && o.visibleBox.height > 0)
    .map((o) => ({
      id: o.id,
      name: o.name,
      lines: diagnoseNativeTextWidths({
        platform,
        box: o.box,
        lines: o.lines ?? [],
        textLayoutIdentity: o.textLayoutIdentity,
      }),
    }));
  const visibleFailures = text.filter(
    (o) =>
      o.visibleBox.width > 0 &&
      o.visibleBox.height > 0 &&
      textWidthDiagnostics
        .find((d) => d.id === o.id)
        ?.lines.some((l) => l.status === 'fail'),
  );
  const textWidthUnknown = textWidthDiagnostics.filter((d) =>
    d.lines.some((l) => l.status === 'unknown'),
  );
  await writeFile(
    `${dir}/${screen}.json`,
    JSON.stringify(
      {
        receipt,
        audit,
        plan,
        textWidthFailures: visibleFailures,
        textWidthUnknown,
        textWidthDiagnostics,
        primaryCheck,
      },
      null,
      2,
    ) + '\n',
  );
  assert.equal(audit?.failures.length ?? 0, 0, JSON.stringify(audit?.failures));
  assert.equal(
    visibleFailures.length,
    0,
    JSON.stringify(visibleFailures.map((o) => o.name)),
  );
  assert.equal(textWidthUnknown.length, 0, JSON.stringify(textWidthUnknown));
  assert.ok(
    receipt.snapshot.resolvedAdmissible,
    JSON.stringify(receipt.snapshot.resolvedFailures),
  );
  results.push({
    screen,
    viewport: window,
    navigation: receipt.snapshot.navigation,
    targets: targets.length,
    texts: text.length,
    textWidthFailures: visibleFailures.length,
    primaryCheck,
    auditFailures: audit?.failures ?? [],
    reducedMotion: receipt.snapshot.reducedMotion,
    motion: receipt.snapshot.motion,
  });
  console.log(
    JSON.stringify({
      screen,
      label,
      navigation: receipt.snapshot.navigation,
      texts: text.length,
      targets: targets.length,
    }),
  );
}
await writeFile(
  `${dir}/summary.json`,
  JSON.stringify(
    {
      passed: true,
      engine: 'react-native/Text+Yoga',
      platform,
      label,
      results,
      scope:
        'Actual default viewport/scaling text and target observations; task flows and visual critique are separate.',
    },
    null,
    2,
  ) + '\n',
);
