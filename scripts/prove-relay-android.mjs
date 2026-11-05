import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import http from 'node:http';
import path from 'node:path';
import { mkdir, open, writeFile } from 'node:fs/promises';
import { acquireLease } from './run-relay-builders.mjs';
import {
  stopOwnedProcessGroups,
  portsAvailable,
} from './relay-native-capability.mjs';
import {
  dumpAndroidAccessibility,
  queryAndroidProcessState,
} from './android-accessibility.mjs';
import {
  snapshotVerificationSources,
  verificationSourceFields,
} from './verification-sources.mjs';

// Current integration app, not the frozen builder/capability template. Every
// product mutation below uses actual Android input and fresh accessibility XML.
const root = process.cwd(),
  device = process.env.DESIGN_ADB_DEVICE ?? 'emulator-5554',
  adb =
    process.env.DESIGN_ADB ??
    path.join(root, 'artifacts/runtime/android-sdk/platform-tools/adb'),
  output = path.resolve(
    process.env.DESIGN_RELAY_NATIVE_OUTPUT ??
      `artifacts/relay-integration/android-${Date.now()}`,
  ),
  app = path.join(root, 'examples/relay/app'),
  metroPort = 8650,
  observerPort = 8652,
  proxyPort = 8653,
  observerRoute = `/observations/${randomUUID()}`,
  exec = promisify(execFile),
  before = snapshotVerificationSources(root),
  sourceIdentity = verificationSourceFields(before, before).sourceIdentity;
await mkdir(output, { recursive: true });
const report = {
  version: 1,
  startedAt: new Date().toISOString(),
  device,
  sourceIdentity,
  scope:
    'Current Expo Go Android integration: actual input, Text/Yoga/host geometry, task flows, app/OS scaling, landscape and Inspector. No iOS/iPad, physical-device, native UI-thread performance or human preference claim.',
  steps: [],
  commands: [],
  failures: [],
};
const lease = acquireLease('/private/tmp/design-theory-relay-resources.lock', {
  run: output,
  kind: 'relay-current-android-proof',
});
const abort = new AbortController();
const stop = () => abort.abort(new Error('Native proof interrupted'));
process.once('SIGINT', stop);
process.once('SIGTERM', stop);
let cleanupPhase = false,
  receiveSequence = 0,
  lastActionFence = 0,
  latestSequence = 0,
  latestSession = null,
  deviceUser = null,
  retiredSessions = new Set(),
  remoteFiles = new Set(),
  proxy = null,
  proxyLog = null,
  reverseBefore = null;
let latest = null,
  launched = false,
  metro = null,
  observer = null,
  log = null,
  reverseOwned = [],
  settingsBefore = {},
  sequence = 0,
  childExited = false;
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function command(
  label,
  args,
  {
    binary = false,
    cleanup = cleanupPhase,
    allowFailure = false,
    ...options
  } = {},
) {
  if (!cleanup) abort.signal.throwIfAborted();
  if (
    !cleanup &&
    (/^(tap-|scroll-to-|type-)/.test(label) ||
      ['dismiss-keyboard', 'os-font-scale', 'landscape', 'portrait'].includes(
        label,
      ))
  )
    lastActionFence = receiveSequence;
  const entry = { label, args, startedAt: new Date().toISOString() };
  report.commands.push(entry);
  try {
    const r = await exec(adb, ['-s', device, ...args], {
      timeout: 30000,
      maxBuffer: 16 * 1024 * 1024,
      ...options,
      ...(!cleanup ? { signal: abort.signal } : {}),
      ...(binary ? { encoding: 'buffer' } : {}),
    });
    entry.code = 0;
    if (!binary) {
      entry.stdout = r.stdout;
      entry.stderr = r.stderr;
    }
    return { ...r, code: 0 };
  } catch (error) {
    entry.error = String(error);
    entry.stdout = error.stdout;
    entry.stderr = error.stderr;
    entry.code = error.code;
    if (allowFailure)
      return {
        code: error.code,
        stdout: error.stdout ?? '',
        stderr: error.stderr ?? '',
      };
    throw error;
  } finally {
    entry.finishedAt = new Date().toISOString();
  }
}
async function waitFor(predicate, label, timeout = 120000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    abort.signal.throwIfAborted();
    if (childExited) throw Error('Owned Metro exited; inspect metro.log');
    const value = await predicate();
    if (value) return value;
    await delay(150);
  }
  throw Error('Timed out: ' + label);
}
function current() {
  return latest?.sourceIdentity === sourceIdentity &&
    latest?.provider === 'native-android' &&
    latest?.phase === 'relay-app' &&
    latestSequence > lastActionFence &&
    latest?.hydrated &&
    latest?.fontLoaded
    ? latest
    : null;
}
async function snap(name) {
  const r = await waitFor(
    () => current(),
    'current source-bound native observation',
  );
  await writeFile(
    path.join(output, name + '.json'),
    JSON.stringify(
      {
        ...r,
        proofObservation: {
          receiveSequence: latestSequence,
          receivedAt: r.proofReceivedAt,
          actionFence: lastActionFence,
        },
      },
      null,
      2,
    ),
  );
  const image = await command(
    'screenshot-' + name,
    ['exec-out', 'screencap', '-p'],
    { binary: true },
  );
  await writeFile(path.join(output, name + '.png'), image.stdout);
  return r;
}
async function tree() {
  const captured = await dumpAndroidAccessibility({
    prefix: 'relay-product',
    registerRemote: (remote) => remoteFiles.add(remote),
    run: (label, args, options) => command('ax-' + label, args, options),
    cleanupRun: (label, args, options) =>
      command('ax-' + label, args, { ...options, cleanup: true }),
  });
  await writeFile(
    path.join(output, `accessibility-${sequence++}.xml`),
    captured.xml,
  );
  return [...captured.xml.matchAll(/<node\b[^>]*>/g)].map(([node]) =>
    Object.fromEntries(
      [...node.matchAll(/([\w-]+)="([^"]*)"/g)].map(([, key, value]) => [
        key,
        value,
      ]),
    ),
  );
}
function find(nodes, id) {
  return nodes.find(
    (node) =>
      (node['resource-id'] === id || node['resource-id']?.endsWith('/' + id)) &&
      node.enabled === 'true',
  );
}
async function tap(id, { scroll = true, towardStart = false } = {}) {
  for (let attempt = 0; attempt < (scroll ? 12 : 1); attempt++) {
    const nodes = await tree(),
      node = find(nodes, id),
      match = node?.bounds?.match(/\[(-?\d+),(-?\d+)\]\[(-?\d+),(-?\d+)\]/);
    if (match) {
      const [x1, y1, x2, y2] = match.slice(1).map(Number);
      if (x2 > x1 && y2 > y1) {
        await command('tap-' + id, [
          'shell',
          'input',
          'tap',
          String(Math.round((x1 + x2) / 2)),
          String(Math.round((y1 + y2) / 2)),
        ]);
        await delay(200);
        return;
      }
    }
    if (!scroll) break;
    const viewport =
      latest?.sourceIdentity === sourceIdentity &&
      latest?.provider === 'native-android'
        ? latest.viewport
        : null;
    assert.ok(
      viewport &&
        viewport.width > 0 &&
        viewport.height > 0 &&
        viewport.scale > 0,
    );
    const w = viewport.width * viewport.scale,
      h = viewport.height * viewport.scale;
    await command('scroll-to-' + id, [
      'shell',
      'input',
      'swipe',
      String(Math.round(w * 0.7)),
      String(Math.round(h * (towardStart ? 0.3 : 0.76))),
      String(Math.round(w * 0.7)),
      String(Math.round(h * (towardStart ? 0.76 : 0.3))),
      '350',
    ]);
  }
  throw Error('No current accessible native target: ' + id);
}
async function nav(destination) {
  const id = 'nav-' + destination;
  if (!find(await tree(), id)) await tap('nav-menu', { scroll: false });
  await tap(id);
  await waitFor(
    () => current()?.route.startsWith('/' + destination),
    'route ' + destination,
  );
}
async function choose(id, value) {
  if (id === 'settings-text') {
    // Settings deliberately restores its prior scroll position. Establish the
    // current root origin before searching downward for an earlier setting.
    await tree();
    for (let attempt = 0; attempt < 16; attempt++) {
      const viewport = latest?.boxes?.['relay-task-viewport'];
      const content = latest?.boxes?.['relay-workspace'];
      if (viewport && content && content.y >= viewport.y - 1) break;
      const size = latest?.viewport;
      assert.ok(size && size.width > 0 && size.height > 0 && size.scale > 0);
      const x = Math.round(size.width * size.scale * 0.7),
        height = size.height * size.scale;
      await command('scroll-to-settings-start', [
        'shell',
        'input',
        'swipe',
        String(x),
        String(Math.round(height * 0.3)),
        String(x),
        String(Math.round(height * 0.76)),
        '350',
      ]);
      await delay(200);
    }
  }
  await tap(id);
  await tap(id + '-option-' + value);
}
async function fill(id, value) {
  await tap(id);
  const encoded = value.replaceAll(' ', '%s');
  const quoted = "'" + encoded.replaceAll("'", "'\\''") + "'";
  await command('type-' + id, ['shell', `input text ${quoted}`]);
  await command('dismiss-keyboard', ['shell', 'input', 'keyevent', '4']);
  await delay(250);
}
async function step(name, fn) {
  console.log('Starting ' + name);
  try {
    const result = await fn();
    report.steps.push({ name, passed: true, result: result ?? null });
    console.log('Passed ' + name);
  } catch (error) {
    report.steps.push({
      name,
      passed: false,
      error: String(error.stack ?? error),
    });
    throw error;
  }
}

try {
  const free = await portsAvailable([metroPort, observerPort, proxyPort]);
  assert.ok(
    free.every((port) => port.free),
    JSON.stringify(free),
  );
  const user = await command('device-user', [
    'shell',
    'am',
    'get-current-user',
  ]);
  deviceUser = user.stdout.trim();
  assert.match(deviceUser, /^\d+$/);
  const ready = await command('device-state', ['get-state']);
  assert.match(ready.stdout, /device/);
  for (const setting of [
    'font_scale',
    'accelerometer_rotation',
    'user_rotation',
  ])
    settingsBefore[setting] = (
      await command('read-' + setting, [
        'shell',
        'settings',
        'get',
        'system',
        setting,
      ])
    ).stdout.trim();
  reverseBefore = (
    await command('reverse-before', ['reverse', '--list'])
  ).stdout
    .trim()
    .split('\n')
    .filter(Boolean)
    .sort();
  for (const port of [proxyPort, observerPort]) {
    const mapping = reverseBefore.find(
      (line) => line.trim().split(/\s+/)[1] === `tcp:${port}`,
    );
    assert.ok(
      !mapping || mapping.trim().split(/\s+/)[2] === `tcp:${port}`,
      `Conflicting reverse mapping: ${mapping}`,
    );
    if (!mapping) {
      await command('reverse-add-' + port, [
        'reverse',
        `tcp:${port}`,
        `tcp:${port}`,
      ]);
      reverseOwned.push(port);
    }
  }
  observer = http.createServer(async (req, res) => {
    try {
      if (req.method !== 'POST' || req.url !== observerRoute) {
        res.writeHead(404).end();
        return;
      }
      let size = 0,
        chunks = [];
      for await (const chunk of req) {
        size += chunk.length;
        if (size > 2e6) throw Error('oversize receipt');
        chunks.push(chunk);
      }
      const r = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      if (
        r.sourceIdentity !== sourceIdentity ||
        r.provider !== 'native-android' ||
        r.phase !== 'relay-app' ||
        typeof r.captureSession !== 'string' ||
        !Number.isSafeInteger(r.captureSequence) ||
        r.captureSequence < 1
      )
        throw Error('stale/wrong provider');
      if (retiredSessions.has(r.captureSession))
        throw Error('Retired native capture session');
      if (
        latestSession === r.captureSession &&
        latest &&
        r.captureSequence <= latest.captureSequence
      )
        throw Error('Out-of-order native capture');
      if (latestSession && latestSession !== r.captureSession)
        retiredSessions.add(latestSession);
      latestSession = r.captureSession;
      latestSequence = ++receiveSequence;
      latest = { ...r, proofReceivedAt: new Date().toISOString() };
      res.writeHead(201).end('{}');
    } catch (error) {
      res.writeHead(400).end(String(error));
    }
  });
  await new Promise((resolve, reject) => {
    observer.once('error', reject);
    observer.listen(observerPort, '127.0.0.1', resolve);
  });
  log = await open(path.join(output, 'metro.log'), 'wx');
  metro = spawn(
    process.execPath,
    [
      'node_modules/expo/bin/cli',
      'start',
      '--localhost',
      '--clear',
      '--port',
      String(metroPort),
    ],
    {
      cwd: app,
      detached: true,
      env: {
        ...process.env,
        CI: '1',
        EXPO_NO_TELEMETRY: '1',
        EXPO_PUBLIC_DESIGN_SOURCE_HASH: sourceIdentity,
        EXPO_PUBLIC_DESIGN_OBSERVER: `http://127.0.0.1:${observerPort}${observerRoute}`,
        EXPO_PUBLIC_DESIGN_BRIEF_HASH: createHash('sha256')
          .update(await readFile(path.join(root, 'examples/relay/DESIGN.md')))
          .digest('hex'),
        __UNSAFE_EXPO_HOME_DIRECTORY: path.join(output, 'expo-home'),
      },
      stdio: ['ignore', log.fd, log.fd],
    },
  );
  await new Promise((resolve, reject) => {
    metro.once('spawn', resolve);
    metro.once('error', reject);
  });
  report.runtime = {
    metroPid: metro.pid,
    metroPort,
    observerPort,
    owned: true,
    startedAt: new Date().toISOString(),
  };
  metro.once('exit', (code, signal) => {
    childExited = true;
    report.runtime.exitedAt = new Date().toISOString();
    report.runtime.exitCode = code;
    report.runtime.signal = signal;
  });
  proxyLog = await open(path.join(output, 'proxy.log'), 'wx');
  proxy = spawn(process.execPath, ['scripts/metro-proxy.mjs'], {
    cwd: root,
    detached: true,
    env: {
      ...process.env,
      DESIGN_METRO_PROXY_PORT: String(proxyPort),
      DESIGN_METRO_UPSTREAM_PORT: String(metroPort),
    },
    stdio: ['ignore', proxyLog.fd, proxyLog.fd],
  });
  await new Promise((resolve, reject) => {
    proxy.once('spawn', resolve);
    proxy.once('error', reject);
  });
  report.runtime.proxyPid = proxy.pid;
  await waitFor(async () => {
    try {
      return (
        await (
          await fetch(`http://127.0.0.1:${proxyPort}/status`, {
            signal: abort.signal,
          })
        ).text()
      ).includes('packager-status:running');
    } catch {
      return false;
    }
  }, 'Metro');
  launched = true;
  await command('launch', [
    'shell',
    'am',
    'start',
    '--user',
    deviceUser,
    '-W',
    '-a',
    'android.intent.action.VIEW',
    '-d',
    `exp://127.0.0.1:${proxyPort}`,
    '-p',
    'host.exp.exponent',
  ]);
  launched = true;
  await waitFor(() => current(), 'Relay Android bootstrap');
  await snap('initial');
  await step('reset and current native root', async () => {
    await nav('settings');
    await tap('reset-demo');
    await tap('confirm-demo-action');
    await waitFor(() => current()?.activeCount === 22, 'reset fixture');
    const r = await snap('reset');
    assert.equal(r.measuredRoot.status, 'current');
    assert.equal(r.geometry.rendererRootObserved, true);
    assert.ok(r.boxes['relay-task-viewport']?.height > 0);
    return { viewport: r.viewport, root: r.measuredRoot };
  });
  await step(
    'primary diagnosis reaches linked incident and trace through native controls',
    async () => {
      await tap('diagnose-checkout');
      await tap('service-incident-INC-1042');
      await choose('incident-owner', 'member-01');
      await tap('incident-ack');
      await tap('incident-investigate');
      await tap('incident-trace-trace-000001');
      await tap('span-span-4');
      const r = await snap('pool-span');
      assert.ok(r.route.includes('/traces/'));
      assert.equal(r.traceSelections['trace-000001'], 'span-4');
      await tap('back', { towardStart: true });
      await fill(
        'incident-note',
        'Raised the demo inventory-cache pool limit; verifying recovery.',
      );
      await tap('incident-note-add');
      await fill(
        'incident-resolution',
        'Synthetic mitigation verified; follow-up pool sizing review scheduled.',
      );
      await tap('incident-resolve');
      const resolved = await waitFor(
        () => current()?.primary.status === 'resolved' && current(),
        'coordinated incident resolution',
      );
      assert.equal(resolved.activeCount, 21);
      assert.equal(resolved.unassignedCount, 9);
      assert.equal(resolved.primary.assigneeId, 'member-01');
      assert.equal(resolved.alert001.status, 'healthy');
      assert.equal(resolved.service001.p95Ms, 1850);
      assert.ok(
        resolved.primary.timeline.some(
          (event) =>
            event.kind === 'note' &&
            event.message ===
              'Raised the demo inventory-cache pool limit; verifying recovery.',
        ),
      );
      assert.ok(
        resolved.primary.timeline.some(
          (event) =>
            event.kind === 'resolved' &&
            event.message ===
              'Synthetic mitigation verified; follow-up pool sizing review scheduled.',
        ),
      );
      await snap('primary-resolved');
      return {
        traceRoute: r.route,
        activeCount: resolved.activeCount,
        status: resolved.primary.status,
      };
    },
  );
  await step(
    'compounded text scale and landscape preserve task viewport and menus',
    async () => {
      await nav('settings');
      await choose('settings-text', '1.5');
      await command('os-font-scale', [
        'shell',
        'settings',
        'put',
        'system',
        'font_scale',
        '1.3',
      ]);
      await command('rotation-lock', [
        'shell',
        'settings',
        'put',
        'system',
        'accelerometer_rotation',
        '0',
      ]);
      await command('landscape', [
        'shell',
        'settings',
        'put',
        'system',
        'user_rotation',
        '1',
      ]);
      await waitFor(() => {
        const r = current();
        return (
          r?.viewport.width > r?.viewport.height &&
          r.viewport.fontScale >= 1.29 &&
          r.preferences.textScale === 1.5 &&
          r.geometry.values.compactChrome === 1
        );
      }, 'actual landscape and compounded scale');
      await nav('overview');
      const r = await snap('landscape-enlarged');
      const task = r.boxes['relay-task-viewport'],
        hostRoot = r.boxes['relay-root'],
        safe = r.safeArea;
      assert.equal(r.measuredRoot.status, 'current');
      assert.ok(hostRoot && safe);
      for (const dimension of ['width', 'height'])
        assert.ok(
          Math.abs(hostRoot[dimension] - r.measuredRoot[dimension]) < 1,
        );
      assert.ok(
        Math.abs(
          r.geometry.inputs.width - (hostRoot.width - safe.left - safe.right),
        ) < 1,
      );
      assert.ok(
        Math.abs(
          r.geometry.inputs.height - (hostRoot.height - safe.top - safe.bottom),
        ) < 1,
      );
      assert.ok(
        task &&
          task.x >= hostRoot.x + safe.left - 1 &&
          task.y >= hostRoot.y + safe.top - 1 &&
          task.x + task.width <= hostRoot.x + hostRoot.width - safe.right + 1 &&
          task.y + task.height <=
            hostRoot.y + hostRoot.height - safe.bottom + 1,
      );

      assert.ok(
        task?.height >= r.geometry.values.minimumTaskHeight,
        JSON.stringify({ task, geometry: r.geometry }),
      );
      await tap('nav-menu', { scroll: false });
      await tap('global-filters-open');
      assert.ok(find(await tree(), 'global-team'));
      await tap('relay-dialog-close', { scroll: false });
      await tap('nav-menu', { scroll: false });
      await tap('phone-range');
      await tap('range-60');
      await waitFor(
        () => current()?.context.range === 60,
        'changed time range',
      );
      return {
        viewport: r.viewport,
        task,
        minimumTaskHeight: r.geometry.values.minimumTaskHeight,
      };
    },
  );
  await step(
    'native Inspector stays idle enough for fresh accessibility and dismisses',
    async () => {
      await tap('nav-menu', { scroll: false });
      await tap('inspect-open');
      const nodes = await tree();
      assert.ok(find(nodes, 'inspection-panel'));
      assert.ok(find(nodes, 'inspection-surface'));
      assert.ok(find(nodes, 'inspection-panel-close'));
      await waitFor(
        () =>
          current()?.boxes?.['inspection-panel'] &&
          current()?.boxes?.['inspection-surface'],
        'current Inspector rectangles',
      );
      const inspector = await snap('inspector-landscape');
      const panel = inspector.boxes['inspection-panel'];
      const title = inspector.boxes['inspection-panel-title'];
      const header = inspector.boxes['inspection-panel-header'];
      const body = inspector.boxes['inspection-panel-body'];
      const close = inspector.boxes['inspection-panel-close'];
      assert.ok(
        header?.height > 0 && body?.height > 0,
        'Dialog header and body have positive extents',
      );
      assert.ok(
        header.y + header.height <= body.y + 1,
        'Dialog body cannot overlap its fixed header',
      );
      assert.ok(
        close.y >= header.y - 1 &&
          close.y + close.height <= header.y + header.height + 1,
        'Close remains inside the header hit region',
      );
      const contained = (child, parent) =>
        child &&
        parent &&
        child.width > 0 &&
        child.height > 0 &&
        child.x >= parent.x - 1 &&
        child.y >= parent.y - 1 &&
        child.x + child.width <= parent.x + parent.width + 1 &&
        child.y + child.height <= parent.y + parent.height + 1;
      assert.ok(
        contained(title, header),
        'Visible title stays inside its header',
      );
      assert.ok(contained(close, header), 'Close stays inside its header');
      assert.ok(
        contained(header, panel) && contained(body, panel),
        'Dialog contains header and body',
      );
      const surface = inspector.boxes['inspection-surface'];
      assert.ok(
        contained(surface, body),
        'Observed-element control remains usable inside scroll body',
      );
      assert.ok(
        title.x + title.width <= close.x + 1,
        'Title does not overlap Close',
      );
      await tap('inspection-surface', { scroll: false });
      assert.ok(find(await tree(), 'inspection-surface-dialog'));
      await waitFor(
        () =>
          current()?.boxes?.['inspection-panel-close'] &&
          current()?.boxes?.['inspection-surface-dialog-close'],
        'Distinct parent and child Close observations',
      );
      await tap('inspection-surface-dialog-close', { scroll: false });
      assert.ok(!find(await tree(), 'inspection-surface-dialog'));
      await waitFor(
        () =>
          current()?.boxes?.['inspection-panel-close'] &&
          !current()?.boxes?.['inspection-surface-dialog-close'],
        'Parent Close observation retained after child disposal',
      );
      await tap('inspection-panel-close', { scroll: false });
      assert.ok(!find(await tree(), 'inspection-panel'));
      await command('portrait', [
        'shell',
        'settings',
        'put',
        'system',
        'user_rotation',
        '0',
      ]);
      await waitFor(
        () => current()?.viewport.height > current()?.viewport.width,
        'portrait recovery',
      );
      // Exercise the long Inspector title and keyboard action in enlarged
      // portrait too; landscape containment does not establish this case.
      await tap('nav-menu', { scroll: false });
      await tap('inspect-open');
      await tap('inspection-surface', { scroll: false });
      await tap('inspection-surface-search', { scroll: false });
      await command('type-portrait-inspector-search', [
        'shell',
        'input',
        'text',
        'relay-task',
      ]);
      assert.ok(
        find(await tree(), 'inspection-surface-dialog-keyboard-dismiss'),
      );
      const keyboard = await snap('inspector-portrait-keyboard');
      const child = keyboard.boxes['inspection-surface-dialog'];
      const childHeader = keyboard.boxes['inspection-surface-dialog-header'];
      const childBody = keyboard.boxes['inspection-surface-dialog-body'];
      assert.ok(contained(childHeader, child) && contained(childBody, child));
      assert.ok(
        contained(
          keyboard.boxes['inspection-surface-dialog-title'],
          childHeader,
        ),
      );
      assert.ok(
        contained(
          keyboard.boxes['inspection-surface-dialog-close'],
          childHeader,
        ),
      );
      assert.ok(childHeader.y + childHeader.height <= childBody.y + 1);
      await tap('inspection-surface-dialog-keyboard-dismiss', {
        scroll: false,
      });
      assert.ok(
        !find(await tree(), 'inspection-surface-dialog-keyboard-dismiss'),
      );
      await tap('inspection-surface-dialog-close', { scroll: false });
      await tap('inspection-panel-close', { scroll: false });
      assert.ok(!find(await tree(), 'inspection-panel'));
      await snap('portrait-recovered');
    },
  );
} catch (error) {
  report.failures.push(String(error));
  try {
    await writeFile(
      path.join(output, 'failure-observation.json'),
      JSON.stringify(
        {
          receipt: latest,
          receiveSequence,
          actionFence: lastActionFence,
          fresh: Boolean(current()),
        },
        null,
        2,
      ),
    );
    if (current()) await snap('failure');
    else {
      const screenshot = await command(
        'failure-screenshot',
        ['exec-out', 'screencap', '-p'],
        { binary: true },
      );
      await writeFile(path.join(output, 'failure.png'), screenshot.stdout);
    }
  } catch (diagnosticError) {
    report.failures.push('Diagnostic: ' + String(diagnosticError));
  }
  process.exitCode = 1;
} finally {
  cleanupPhase = true;
  const cleanup = { errors: [], groups: [] };
  for (const [setting, value] of Object.entries(settingsBefore))
    try {
      await command('restore-' + setting, [
        'shell',
        'settings',
        value === 'null' ? 'delete' : 'put',
        'system',
        setting,
        ...(value === 'null' ? [] : [value]),
      ]);
    } catch (error) {
      cleanup.errors.push(String(error));
    }
  if (launched)
    try {
      await command('stop-app', [
        'shell',
        'am',
        'force-stop',
        '--user',
        deviceUser,
        'host.exp.exponent',
      ]);
    } catch (error) {
      cleanup.errors.push(String(error));
    }
  for (const port of reverseOwned)
    try {
      await command('reverse-remove-' + port, [
        'reverse',
        '--remove',
        `tcp:${port}`,
      ]);
    } catch (error) {
      cleanup.errors.push(String(error));
    }
  for (const remote of remoteFiles)
    try {
      await command('remote-cleanup', ['shell', 'rm', '-f', remote]);
    } catch (error) {
      cleanup.errors.push(String(error));
    }
  if (metro?.pid || proxy?.pid)
    try {
      cleanup.groups = await stopOwnedProcessGroups([
        ...(metro?.pid
          ? [{ pid: metro.pid, name: 'current-relay-metro', owned: true }]
          : []),
        ...(proxy?.pid
          ? [{ pid: proxy.pid, name: 'current-relay-proxy', owned: true }]
          : []),
      ]);
    } catch (error) {
      cleanup.errors.push(String(error));
    }
  if (observer) {
    observer.closeAllConnections();
    await new Promise((resolve) => observer.close(resolve));
  }
  await log?.close();
  await proxyLog?.close();
  try {
    const restored = {};
    for (const setting of Object.keys(settingsBefore))
      restored[setting] = (
        await command('verify-' + setting, [
          'shell',
          'settings',
          'get',
          'system',
          setting,
        ])
      ).stdout.trim();
    assert.deepEqual(restored, settingsBefore);
    cleanup.settingsRestored = restored;
    if (reverseBefore !== null) {
      const reverseAfter = (
        await command('reverse-after', ['reverse', '--list'])
      ).stdout
        .trim()
        .split('\n')
        .filter(Boolean)
        .sort();
      assert.deepEqual(reverseAfter, reverseBefore);
      cleanup.reverseRestored = reverseAfter;
    }
    if (launched) {
      const appState = await queryAndroidProcessState({
        packageName: 'host.exp.exponent',
        run: (name, args, options) =>
          command(name, args, { ...options, cleanup: true }),
      });
      assert.deepEqual(appState.pids, []);
      cleanup.appAbsent = true;
    }
    cleanup.ports = await portsAvailable([metroPort, proxyPort, observerPort]);
    assert.ok(cleanup.ports.every((port) => port.free));
  } catch (error) {
    cleanup.errors.push(String(error));
  }
  process.removeListener('SIGINT', stop);
  process.removeListener('SIGTERM', stop);
  cleanup.confirmedEmpty =
    cleanup.errors.length === 0 &&
    cleanup.groups.every((group) => group.absent);
  report.cleanup = cleanup;
  Object.assign(
    report,
    verificationSourceFields(before, snapshotVerificationSources(root)),
  );
  report.passed =
    report.failures.length === 0 &&
    report.steps.length === 4 &&
    report.steps.every((step) => step.passed) &&
    report.sourceStable &&
    cleanup.confirmedEmpty;
  report.finishedAt = new Date().toISOString();
  await writeFile(
    path.join(output, 'report.json'),
    JSON.stringify(report, null, 2),
  );
  if (cleanup.confirmedEmpty) lease.release(cleanup);
  else lease.retain(cleanup);
  if (!report.passed) process.exitCode = 1;
  console.log(
    JSON.stringify({
      passed: report.passed,
      steps: report.steps,
      failures: report.failures,
      cleanup,
      sourceStable: report.sourceStable,
    }),
  );
}
