import { assertNativePrimary } from './native-primary.mjs';
import { nativeSourceIdentity } from './native-source-identity.mjs';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, readFile, writeFile, copyFile } from 'node:fs/promises';
import path from 'node:path';
import {
  auditAppleHig,
  projectNativeSafeArea,
  resolveDesignRuntime,
} from '../dist/index.js';
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
let expectedAndroidFontScale;
let observedFontScaleBaseline;
if (platform === 'android') {
  const setting = await exec(
    adb,
    ['-s', device, 'shell', 'settings', 'get', 'system', 'font_scale'],
    { timeout: 15000 },
  );
  expectedAndroidFontScale = Number(setting.stdout.trim());
  assert.ok(
    Number.isFinite(expectedAndroidFontScale) && expectedAndroidFontScale > 0,
    `Android font_scale must be explicit for this proof: ${setting.stdout.trim()}`,
  );
}
async function openAndroidUrl(url) {
  await exec(
    adb,
    [
      '-s',
      device,
      'shell',
      `am start -W -a android.intent.action.VIEW -d ${quote(url)} -p host.exp.exponent`,
    ],
    { timeout: 15000 },
  );
}
async function warmAndroidProject() {
  // A cold Expo Go initial URL can lose the /--/ product route. Establish JS
  // first, then deliver that route through the live Linking listener.
  // Recreate this proof's exact reverse mappings after emulator reconnects.
  // The reverse-list host label is not the current adb transport identifier.
  for (const port of [8088, 4319, 4321]) {
    await exec(adb, ['-s', device, 'reverse', '--remove', `tcp:${port}`], {
      timeout: 15000,
    }).catch(() => {});
    await exec(adb, ['-s', device, 'reverse', `tcp:${port}`, `tcp:${port}`], {
      timeout: 15000,
    });
  }
  await exec(
    adb,
    ['-s', device, 'shell', 'am', 'force-stop', 'host.exp.exponent'],
    { timeout: 15000 },
  );
  const launchedAt = Date.now();
  await openAndroidUrl('exp://127.0.0.1:8088');
  let previousSeen = 0,
    advances = 0,
    baseLaunchAttempts = 1,
    nextBaseLaunch = Date.now() + 3000,
    lastError;
  const deadline = Date.now() + 45000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(
        `${process.env.DESIGN_NATIVE_BRIDGE ?? 'http://127.0.0.1:4319'}/health`,
        {
          headers: {
            authorization: `Bearer ${process.env.DESIGN_NATIVE_TOKEN ?? process.env.EXPO_PUBLIC_DESIGN_TOKEN ?? 'local-spike'}`,
          },
          signal: AbortSignal.timeout(1000),
        },
      );
      assert.ok(
        response.ok,
        `Native bridge health returned ${response.status}`,
      );
      const health = await response.json();
      const seen = health.clients?.find(
        (client) => client.platform === 'native-android',
      )?.lastSeen;
      if (Number.isFinite(seen) && seen >= launchedAt && seen > previousSeen) {
        advances++;
        previousSeen = seen;
        if (advances >= 2)
          return {
            launchedAt,
            bridgeReadyAt: seen,
            heartbeats: advances,
            baseLaunchAttempts,
          };
      }
    } catch (error) {
      lastError = String(error);
    }
    // Expo Go can return a successful cold am-start while its LauncherActivity
    // exits during recreation. A warm resend is bounded and still needs actual
    // fresh JS bridge heartbeats before product routing is allowed.
    if (Date.now() >= nextBaseLaunch && baseLaunchAttempts < 8) {
      await openAndroidUrl('exp://127.0.0.1:8088');
      baseLaunchAttempts++;
      nextBaseLaunch = Date.now() + 3000;
    }
    await sleep(250);
  }
  throw new Error(
    `Android project never produced two fresh bridge heartbeats after launch${lastError ? `: ${lastError}` : ''}`,
  );
}
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
  let androidRoute;
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
  else {
    androidRoute = {
      ...(await warmAndroidProject()),
      routeAttempts: 1,
      expectedFontScale: expectedAndroidFontScale,
    };
    await openAndroidUrl(url);
  }
  let receipt, lastReceipt;
  let nextRouteAttempt = Date.now() + 2000;
  const receiptDeadline = Date.now() + 60000;
  while (Date.now() < receiptDeadline) {
    try {
      const r = JSON.parse(
        await readFile(
          `artifacts/fieldwork/native-observations/request-${createHash('sha256').update(proof).digest('hex')}.json`,
          'utf8',
        ),
      );
      lastReceipt = {
        screen: r.snapshot?.screen,
        phase: r.snapshot?.motionPhase,
        fontScale: r.snapshot?.window?.fontScale,
        viewport: r.snapshot?.viewportGuard?.status,
        implementationIdentity: r.snapshot?.implementationIdentity,
      };
      if (
        r.incomplete === false &&
        r.snapshot.app === 'vela' &&
        r.snapshot.screen === screen &&
        r.snapshot.hydrated &&
        r.snapshot.motionPhase === 'held' &&
        r.snapshot.viewportGuard?.status === 'current' &&
        r.snapshot.implementationIdentity === expectedSource &&
        r.snapshot.designHandoffIdentity === policy.handoff.identity &&
        (platform !== 'android' ||
          Math.abs(r.snapshot.window?.fontScale - expectedAndroidFontScale) <
            0.0001) &&
        Date.parse(r.capturedAt) > start
      ) {
        receipt = r;
        break;
      }
    } catch {}
    // Configuration recreation can still race the first warm intent. Reuse the
    // same proof URL so a delivered route is not remounted by a new proof ID.
    if (
      androidRoute &&
      Date.now() >= nextRouteAttempt &&
      androidRoute.routeAttempts < 8
    ) {
      await openAndroidUrl(url);
      androidRoute.routeAttempts++;
      nextRouteAttempt = Date.now() + 2000;
    }
    await sleep(500);
  }
  assert.ok(
    receipt,
    `No fresh actual native ${screen} receipt: ${JSON.stringify({ androidRoute, lastReceipt })}`,
  );
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
  const {
    window,
    safeArea,
    coordinateSpace,
    measuredRootFrame,
    nominalWindow,
  } = receipt.snapshot;
  assert.ok(
    Number.isFinite(window.fontScale) && window.fontScale > 0,
    'Actual font scale must be finite and positive',
  );
  observedFontScaleBaseline ??= window.fontScale;
  assert.ok(
    Math.abs(window.fontScale - observedFontScaleBaseline) < 0.0001,
    `Font scale changed within proof group: ${observedFontScaleBaseline} to ${window.fontScale}`,
  );
  assert.equal(coordinateSpace?.origin, 'measured root');
  assert.equal(coordinateSpace.units, 'dp');
  for (const key of ['x', 'y', 'width', 'height'])
    assert.ok(
      Number.isFinite(measuredRootFrame?.[key]),
      `Missing measured root ${key}`,
    );
  assert.equal(window.width, measuredRootFrame.width);
  assert.equal(window.height, measuredRootFrame.height);
  for (const key of ['width', 'height', 'scale', 'fontScale'])
    assert.ok(
      Number.isFinite(nominalWindow?.[key]) && nominalWindow[key] > 0,
      `Missing nominal window ${key}`,
    );
  assert.equal(window.fontScale, nominalWindow.fontScale);
  assert.equal(window.scale, nominalWindow.scale);
  const projectedSafeArea = projectNativeSafeArea({
    window,
    screen: coordinateSpace.screen,
    screenOffset: coordinateSpace.screenOffset,
    insets: safeArea,
  });
  assert.deepEqual(receipt.snapshot.windowSafeArea, projectedSafeArea);
  assert.equal(typeof receipt.snapshot.reducedMotion, 'boolean');
  const expectedDesignViewport = {
    width: window.width - projectedSafeArea.left - projectedSafeArea.right,
    height: window.height - projectedSafeArea.top - projectedSafeArea.bottom,
    textScale: window.fontScale,
    reducedMotion: Number(receipt.snapshot.reducedMotion),
  };
  assert.deepEqual(receipt.snapshot.designViewport, expectedDesignViewport);
  const geometryCheck = {
    source: 'measured-root-physical-safe-area-projection',
    measuredRootFrame,
    nominalWindow,
    coordinateSpace,
    projectedSafeArea,
    expectedDesignViewport,
  };
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
          safeArea: projectedSafeArea,
          targets,
          evidence: {
            engine: receipt.engine,
            receipt: `${label}/${screen}.json`,
          },
        })
      : null;
  const primaryCheck = assertNativePrimary(receipt);
  const plan = resolveDesignRuntime(policy.handoff, expectedDesignViewport);
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
  // Scroll clipping affects visibility, not intrinsic fit inside a Text's own
  // measured box. Check mounted offscreen children as well as visible content.
  const measuredText = text.filter((o) => o.box.width > 0 && o.box.height > 0);
  const textCoverage = {
    scope: 'all-nonzero-measured-text-boxes',
    measured: measuredText.length,
    whollyOffscreen: measuredText.filter(
      (o) => o.visibleBox.width <= 0 || o.visibleBox.height <= 0,
    ).length,
    zeroAreaExcluded: text.length - measuredText.length,
  };
  const textWidthDiagnostics = measuredText.map((o) => ({
    id: o.id,
    name: o.name,
    lines: o.lines?.length
      ? diagnoseNativeTextWidths({
          platform,
          box: o.box,
          lines: o.lines ?? [],
          textLayoutIdentity: o.textLayoutIdentity,
        })
      : [
          {
            lineIndex: null,
            status: 'unknown',
            reason: 'missing-native-text-layout',
          },
        ],
  }));
  const intrinsicFailures = measuredText.filter((o) =>
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
        textWidthFailures: intrinsicFailures,
        textWidthUnknown,
        textWidthDiagnostics,
        textCoverage,
        primaryCheck,
        geometryCheck,
        ...(androidRoute ? { androidRoute } : {}),
      },
      null,
      2,
    ) + '\n',
  );
  assert.equal(audit?.failures.length ?? 0, 0, JSON.stringify(audit?.failures));
  assert.equal(
    intrinsicFailures.length,
    0,
    JSON.stringify(intrinsicFailures.map((o) => o.name)),
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
    textWidthFailures: intrinsicFailures.length,
    textWidthUnknown: textWidthUnknown.length,
    textCoverage,
    primaryCheck,
    geometryCheck,
    ...(androidRoute ? { androidRoute } : {}),
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
      observedFontScaleBaseline,
      observedFontScales: [
        ...new Set(results.map((r) => r.viewport.fontScale)),
      ],
      scope:
        'Actual declared viewport/scaling. Intrinsic text fit checks every nonzero measured text box, including mounted offscreen scroll content; scroll clipping is separate. Visible target checks, task flows and visual critique have separate scopes.',
    },
    null,
    2,
  ) + '\n',
);
