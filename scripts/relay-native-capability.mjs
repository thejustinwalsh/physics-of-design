// Runs only when called. Native capability is measured on the prepared app itself.
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import {
  readFile,
  writeFile,
  mkdir,
  open,
  rm,
  access,
  realpath,
  lstat,
} from 'node:fs/promises';
import { readFileSync, realpathSync } from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const exec = promisify(execFile);
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const now = () => new Date().toISOString();
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const bundle = {
  'native-ios': 'host.exp.Exponent',
  'native-android': 'host.exp.exponent',
};
const finiteBox = (box) =>
  box &&
  ['x', 'y', 'width', 'height'].every((k) => Number.isFinite(box[k])) &&
  box.width > 0 &&
  box.height > 0;

export function validateNativeObservation(
  receipt,
  { platform, sourceIdentity, presses },
) {
  assert.equal(
    receipt?.phase,
    'template-shell',
    'Expected the unchanged prepared shell',
  );
  assert.equal(receipt.platform, platform);
  assert.equal(
    receipt.provider,
    platform,
    'Browser geometry is not native geometry',
  );
  assert.equal(
    receipt.sourceIdentity,
    sourceIdentity,
    'Stale native source identity',
  );
  assert.equal(
    receipt.presses,
    presses,
    'Native button transition did not match',
  );
  assert(
    Number.isFinite(Date.parse(receipt.observedAt)),
    'Missing observation time',
  );
  assert(receipt.viewport?.width > 0 && receipt.viewport?.height > 0);
  for (const [id, nodeName] of [
    ['shell-root', 'DIV'],
    ['shell-text', 'P'],
    ['shell-button', 'BUTTON'],
    ['shell-status', 'P'],
  ]) {
    assert(
      finiteBox(receipt.boxes?.[id]),
      `Missing actual host rectangle: ${id}`,
    );
    assert.equal(
      receipt.boxes[id].nodeName,
      nodeName,
      `Wrong host node: ${id}`,
    );
  }
  const b = receipt.boxes['shell-button'];
  assert(
    b.height >= 48 &&
      b.x >= 0 &&
      b.y >= 0 &&
      b.x + b.width <= receipt.viewport.width + 1 &&
      b.y + b.height <= receipt.viewport.height + 1,
    'Native button is not visible and usable',
  );
}

export function nativeButtonPoint(platform, tree) {
  let box;
  if (platform === 'native-ios') {
    assert(Array.isArray(tree), 'Invalid iOS accessibility tree');
    const buttons = tree.filter((n) => n.AXUniqueId === 'shell-button');
    assert.equal(buttons.length, 1, 'Expected exactly one native shell button');
    assert(buttons[0].enabled && buttons[0].AXLabel === 'Check interaction');
    assert(
      tree.some(
        (n) =>
          n.AXLabel === 'Relay implementation pending' &&
          n.type === 'StaticText',
      ),
      'Native shell Text was not observed',
    );
    assert(
      tree.some((n) => n.AXLabel === 'Button checks: 0'),
      'Native initial status was not observed',
    );
    box = buttons[0].frame;
  } else {
    assert.equal(platform, 'native-android');
    assert.equal(typeof tree, 'string');
    const nodes = [...tree.matchAll(/<node\b[^>]*>/g)].map(([node]) =>
      Object.fromEntries(
        [...node.matchAll(/([\w-]+)="([^"]*)"/g)].map(([, key, value]) => [
          key,
          value,
        ]),
      ),
    );
    const buttons = nodes.filter((n) => n['resource-id'] === 'shell-button');
    assert.equal(buttons.length, 1, 'Expected exactly one native shell button');
    const button = buttons[0];
    assert(
      button.enabled === 'true' &&
        button.clickable === 'true' &&
        button.package === bundle[platform],
    );
    assert(
      nodes.some(
        (n) =>
          n.text === 'Relay implementation pending' &&
          n.class === 'android.widget.TextView',
      ),
      'Native shell Text was not observed',
    );
    assert(
      nodes.some((n) => n.text === 'Button checks: 0'),
      'Native initial status was not observed',
    );
    const match = /^\[(\d+),(\d+)\]\[(\d+),(\d+)\]$/.exec(button.bounds ?? '');
    assert(match, 'Invalid UIAutomator button bounds');
    const [x, y, right, bottom] = match.slice(1).map(Number);
    box = { x, y, width: right - x, height: bottom - y };
  }
  assert(
    finiteBox(box) && box.x >= 0 && box.y >= 0,
    'Invalid native input rectangle',
  );
  return {
    x: Math.round(box.x + box.width / 2),
    y: Math.round(box.y + box.height / 2),
    box,
  };
}

export async function portsAvailable(ports) {
  const results = [];
  for (const port of ports)
    for (const host of ['127.0.0.1', '::1']) {
      assert(Number.isInteger(port) && port > 1024 && port < 65536);
      results.push(
        await new Promise((resolve) => {
          const server = net.createServer();
          server.once('error', (error) =>
            resolve({ port, host, free: false, error: error.code }),
          );
          server.listen(port, host, () =>
            server.close(() => resolve({ port, host, free: true })),
          );
        }),
      );
    }
  return results;
}

const groupAlive = (pid) => {
  try {
    process.kill(-pid, 0);
    return true;
  } catch (error) {
    if (error.code === 'ESRCH') return false;
    throw error;
  }
};
export async function stopOwnedProcessGroups(
  records,
  {
    alive = groupAlive,
    send = (pid, signal) => process.kill(-pid, signal),
    wait = delay,
  } = {},
) {
  const results = [];
  for (const record of records) {
    assert(
      record.owned === true && Number.isInteger(record.pid) && record.pid > 1,
      'Refusing an unowned process group',
    );
    const result = {
      pid: record.pid,
      name: record.name,
      signals: [],
      absent: false,
    };
    results.push(result);
    try {
      const observe = () => {
        try {
          return alive(record.pid);
        } catch (error) {
          if (error.code !== 'EPERM') throw error;
          // Darwin can briefly deny signal-zero while a terminated group's
          // members exit. Preserve that observation; it never means absent.
          result.observationErrors ??= [];
          result.observationErrors.push(error.code);
          return null;
        }
      };
      let state = observe();
      for (let i = 0; i < 30 && state === null; i++) {
        await wait(100);
        state = observe();
      }
      if (state === true) {
        send(record.pid, 'SIGTERM');
        result.signals.push('SIGTERM');
        // Cleanup grace is not an execution deadline. Only this probe's groups
        // can be escalated, and surviving groups remain a failed cleanup.
        for (let i = 0; i < 30 && state !== false; i++) {
          await wait(100);
          state = observe();
        }
        if (state === true) {
          send(record.pid, 'SIGKILL');
          result.signals.push('SIGKILL');
        }
        for (let i = 0; i < 20 && state !== false; i++) {
          await wait(50);
          state = observe();
        }
      }
      result.absent = state === false;
      if (state === null)
        result.error = 'Process group absence remains unknown (EPERM)';
    } catch (error) {
      result.error = String(error.message);
    }
  }
  return results;
}

function artifact(output, relative) {
  assert(!path.isAbsolute(relative) && !relative.split(/[\\/]/).includes('..'));
  const file = realpathSync(path.join(output, relative));
  assert(
    file.startsWith(realpathSync(output) + path.sep),
    'Artifact escaped output directory',
  );
  const bytes = readFileSync(file);
  return { path: relative, bytes: bytes.length, sha256: hash(bytes) };
}
function readArtifact(output, ref) {
  const actual = artifact(output, ref.path);
  assert.deepEqual(actual, ref, 'Native artifact changed');
  return readFileSync(path.join(output, ref.path));
}
export function validateNativeCapabilityResult(result, output, { metadata }) {
  assert(result?.cleanup?.confirmed === true, 'Native cleanup is unconfirmed');
  assert.deepEqual(
    result.checks.map((c) => c.id),
    [
      'native-ios-actual-geometry-and-input',
      'native-android-actual-geometry-and-input',
      'prepared-app-unchanged',
    ],
  );
  assert(
    result.checks.every((c) => c.passed),
    'Native checks failed',
  );
  assert.match(result.sourceIdentityBefore, /^[0-9a-f]{64}$/);
  assert.equal(
    result.sourceIdentityAfter,
    result.sourceIdentityBefore,
    'App source changed',
  );
  assert.equal(
    result.preparedIdentityAfter,
    result.preparedIdentityBefore,
    'Prepared app tree changed',
  );
  const source = JSON.parse(readArtifact(output, result.source));
  assert.equal(source.before.identity, result.sourceIdentityBefore);
  assert.equal(
    hash(JSON.stringify(source.before.files)),
    source.before.identity,
    'Invalid source snapshot digest',
  );
  assert.deepEqual(source.before, source.after);
  assert.deepEqual(source.preparedBefore, source.preparedAfter);
  assert.equal(source.preparedBefore.identity, result.preparedIdentityBefore);
  assert.equal(
    hash(JSON.stringify(source.preparedBefore.entries)),
    source.preparedBefore.identity,
    'Invalid prepared snapshot digest',
  );
  assert.deepEqual(
    result.platforms.map((p) => p.platform),
    ['native-ios', 'native-android'],
  );
  for (const p of result.platforms) {
    const deviceId =
      metadata.runtime.devices[p.platform === 'native-ios' ? 'ios' : 'android'];
    assert.equal(p.deviceId, deviceId);
    assert.equal(p.sourceIdentity, result.sourceIdentityBefore);
    assert.deepEqual(p.action, { before: 0, after: 1 });
    const receipt = JSON.parse(readArtifact(output, p.receipt));
    assert.equal(receipt.platform, p.platform);
    assert.equal(receipt.phase, 'template-shell');
    assert.equal(receipt.sourceIdentity, p.sourceIdentity);
    assert.equal(receipt.device.id, deviceId);
    assert.equal(receipt.device.bundle, bundle[p.platform]);
    assert.equal(
      receipt.device.observedVersion,
      metadata.runtime.devices.tools.expoGo[
        p.platform === 'native-ios' ? 'ios' : 'android'
      ],
    );
    const before = JSON.parse(readArtifact(output, receipt.before));
    const after = JSON.parse(readArtifact(output, receipt.after));
    validateNativeObservation(before, {
      platform: p.platform,
      sourceIdentity: p.sourceIdentity,
      presses: 0,
    });
    validateNativeObservation(after, {
      platform: p.platform,
      sourceIdentity: p.sourceIdentity,
      presses: 1,
    });
    assert(
      Date.parse(after.observedAt) > Date.parse(before.observedAt),
      'Native observation did not advance',
    );
    assert.deepEqual(p.root, after.boxes['shell-root']);
    const ax = readArtifact(output, receipt.input.accessibility).toString();
    const point = nativeButtonPoint(
      p.platform,
      p.platform === 'native-ios' ? JSON.parse(ax) : ax,
    );
    assert.deepEqual(receipt.input.point, point);
    assert.equal(
      receipt.input.kind,
      p.platform === 'native-ios' ? 'idb-hid' : 'adb-input',
    );
    assert.equal(receipt.input.completed, true);
    const dispatch = JSON.parse(readArtifact(output, receipt.input.dispatch));
    assert.equal(dispatch.code, 0, 'Native input command failed');
    assert.equal(
      dispatch.command,
      p.platform === 'native-ios'
        ? path.join(
            metadata.runtime.devices.tools.iosInputRuntime,
            'venv/bin/idb',
          )
        : metadata.runtime.devices.tools.androidAdb,
    );
    assert.deepEqual(
      dispatch.args,
      p.platform === 'native-ios'
        ? [
            '--companion',
            metadata.runtime.devices.tools.iosInputCompanionAddress,
            'ui',
            'tap',
            String(point.x),
            String(point.y),
            '--api',
            'hid',
          ]
        : [
            '-s',
            deviceId,
            'shell',
            'input',
            'tap',
            String(point.x),
            String(point.y),
          ],
    );
    readArtifact(output, dispatch.stdout);
    readArtifact(output, dispatch.stderr);
    assert(
      Date.parse(receipt.input.completedAt) >= Date.parse(dispatch.completedAt),
    );
    assert(
      Date.parse(receipt.afterReceivedAt) >=
        Date.parse(receipt.input.completedAt),
      'Observation predates actual input',
    );
    const png = readArtifact(output, p.screenshot);
    assert(
      png.length > 100 &&
        png
          .subarray(0, 8)
          .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) &&
        png.readUInt32BE(16) > 0 &&
        png.readUInt32BE(20) > 0,
      'Invalid native screenshot',
    );
    assert.equal(png.readUInt32BE(16), receipt.device.screen.width);
    assert.equal(png.readUInt32BE(20), receipt.device.screen.height);
  }
  assert.deepEqual(
    result.cleanup.groups.map((g) => g.name),
    ['metro', 'proxy', 'idb-companion'],
  );
  assert.equal(new Set(result.cleanup.groups.map((g) => g.pid)).size, 3);
  assert(result.cleanup.groups.every((g) => g.absent));
  assert.deepEqual(
    result.cleanup.ports.map((p) => [p.port, p.host]),
    [
      metadata.runtime.metro,
      metadata.runtime.proxy,
      metadata.runtime.observer,
      10882,
    ].flatMap((p) => [
      [p, '127.0.0.1'],
      [p, '::1'],
    ]),
  );
  assert(result.cleanup.ports.every((p) => p.free));
  assert.deepEqual(
    result.cleanup.reverses.map((r) => r.port),
    [metadata.runtime.metro, metadata.runtime.proxy, metadata.runtime.observer],
  );
  assert(result.cleanup.reverses.every((r) => r.removed));
  const reverse = JSON.parse(
    readArtifact(output, result.cleanup.reverseSnapshot),
  );
  assert.deepEqual(
    reverse.before,
    reverse.after,
    'Android reverse mappings were not restored',
  );
  assert.deepEqual(
    result.cleanup.applications.map((a) => [a.platform, a.deviceId, a.bundle]),
    [
      ['native-ios', metadata.runtime.devices.ios, bundle['native-ios']],
      [
        'native-android',
        metadata.runtime.devices.android,
        bundle['native-android'],
      ],
    ],
  );
  assert(result.cleanup.applications.every((a) => a.stopped));
  for (const application of result.cleanup.applications) {
    if (application.platform === 'native-ios')
      assert.equal(application.observed.pid, null);
    else assert.deepEqual(application.observed.pids, []);
  }
  for (const ref of result.artifacts) readArtifact(output, ref);
}

export async function runNativeCapability({
  workspace,
  output,
  metadata,
  selector: _selector,
  signal,
}) {
  workspace = await realpath(workspace);
  output = await realpath(output);
  const app = path.join(workspace, 'app'),
    toolkit = path.join(workspace, 'toolkit');
  assert(
    !output.startsWith(app + path.sep) &&
      !output.startsWith(toolkit + path.sep),
    'Capability outputs must be outside immutable app/toolkit inputs',
  );
  const { snapshotApplication, snapshotPreparedApplication } = await import(
    pathToFileURL(path.join(toolkit, 'scripts/run-relay-builders.mjs')).href
  );
  const sourceBefore = snapshotApplication(app),
    preparedBefore = snapshotPreparedApplication(app);
  const { devices, metro, proxy, observer: observerPort } = metadata.runtime;
  const tools = devices.tools,
    ports = [metro, proxy, observerPort, 10882];
  assert(new Set(ports).size === ports.length);
  assert.match(devices.ios, /^[0-9a-f-]{36}$/i);
  assert.match(devices.android, /^[a-zA-Z0-9_.:-]+$/);
  assert.equal(tools.iosInputVersion, '1.7.7');
  assert.equal(tools.iosInputCompanionAddress, 'localhost:10882');
  for (const p of [tools.androidAdb, tools.simulatorSet, tools.iosInputRuntime])
    assert(path.isAbsolute(p));
  const idb = path.join(tools.iosInputRuntime, 'venv/bin/idb');
  const companion = path.join(tools.iosInputRuntime, 'idb_companion');
  const expoCli = path.join(app, 'node_modules/expo/bin/cli');
  for (const p of [idb, companion, expoCli, tools.androidAdb]) await access(p);
  const cache = path.join(app, '.expo');
  assert(
    await lstat(cache).then(
      () => false,
      (e) => {
        if (e.code === 'ENOENT') return true;
        throw e;
      },
    ),
    'Prepared app contains an existing Expo cache; ownership is unknown',
  );
  const abort = new AbortController();
  const stop = () => abort.abort(new Error('Native capability cancelled'));
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
  signal?.addEventListener('abort', stop, { once: true });
  if (signal?.aborted) stop();
  const nonce = randomUUID(),
    route = `/observe/${nonce}`;
  const env = {
    ...process.env,
    CI: '1',
    EXPO_NO_TELEMETRY: '1',
    EXPO_NO_TYPESCRIPT_SETUP: '1',
    EXPO_PUBLIC_DESIGN_SOURCE_HASH: sourceBefore.identity,
    EXPO_PUBLIC_DESIGN_OBSERVER: `http://127.0.0.1:${observerPort}${route}`,
    __UNSAFE_EXPO_HOME_DIRECTORY: path.join(output, 'expo-home'),
  };
  const children = [],
    handles = [],
    artifactNames = new Set(),
    commands = [],
    latest = new Map(),
    launched = new Set(),
    reverses = [],
    remoteFiles = [];
  const result = {
    version: 1,
    platforms: [],
    checks: [],
    artifacts: [],
    sourceIdentityBefore: sourceBefore.identity,
    preparedIdentityBefore: preparedBefore.identity,
    cleanup: {
      confirmed: false,
      groups: [],
      ports: [],
      applications: [],
      reverses: [],
      errors: [],
    },
  };
  const progress = (phase) =>
    process.stderr.write(
      JSON.stringify({ capability: 'native', phase }) + '\n',
    );
  const save = async (name, bytes) => {
    await writeFile(path.join(output, name), bytes);
    artifactNames.add(name);
    return artifact(output, name);
  };
  async function run(
    name,
    command,
    args,
    { binary = false, allowFailure = false, cleanup = false } = {},
  ) {
    const prefix = `${String(commands.length).padStart(3, '0')}-${name}`;
    const entry = { name, command, args, cwd: workspace, startedAt: now() };
    commands.push(entry);
    let value;
    try {
      value = await exec(command, args, {
        cwd: workspace,
        env,
        encoding: binary ? 'buffer' : 'utf8',
        maxBuffer: 16 * 1024 * 1024,
        ...(!cleanup ? { signal: abort.signal } : {}),
      });
      entry.code = 0;
    } catch (error) {
      value = { stdout: error.stdout ?? '', stderr: error.stderr ?? '' };
      entry.code = error.code ?? null;
      entry.error = String(error.message);
      if (!allowFailure) entry.failed = true;
    }
    entry.completedAt = now();
    entry.stdout = await save(`${prefix}.stdout`, value.stdout);
    entry.stderr = await save(`${prefix}.stderr`, value.stderr);
    if (entry.failed) throw new Error(`${name} failed: ${entry.error}`);
    return { ...value, code: entry.code, entry };
  }
  async function launch(name, command, args, extraEnv = {}, cwd = workspace) {
    const logName = `${name}.log`,
      log = await open(path.join(output, logName), 'wx');
    handles.push(log);
    artifactNames.add(logName);
    const child = spawn(command, args, {
      cwd,
      env: { ...env, ...extraEnv },
      detached: true,
      stdio: ['ignore', log.fd, log.fd],
    });
    const record = {
      name,
      pid: child.pid,
      owned: true,
      command,
      args,
      cwd,
      startedAt: now(),
      child,
    };
    children.push(record);
    child.on('error', (error) => {
      record.error = String(error.message);
    });
    child.on('exit', (code, signal) => {
      record.exitCode = code;
      record.signal = signal;
      record.exitedAt = now();
    });
    await new Promise((resolve, reject) => {
      child.once('spawn', resolve);
      child.once('error', reject);
    });
  }
  async function waitFor(fn, label) {
    progress(label);
    for (;;) {
      abort.signal.throwIfAborted();
      const dead = children.find((c) => c.error || c.exitedAt);
      if (dead) throw new Error(`Owned ${dead.name} exited before ${label}`);
      const value = await fn();
      if (value) return value;
      await delay(300);
    }
  }
  const adb = (name, args, options) =>
    run(name, tools.androidAdb, ['-s', devices.android, ...args], options);
  const sim = (name, args, options) =>
    run(
      name,
      'xcrun',
      ['simctl', '--set', tools.simulatorSet, ...args],
      options,
    );
  const ios = (name, args, options) =>
    run(
      name,
      idb,
      ['--companion', tools.iosInputCompanionAddress, ...args],
      options,
    );
  async function applicationState(platform, cleanup = false) {
    if (platform === 'native-ios') {
      const listing = (
        await sim(
          'ios-app-state',
          ['spawn', devices.ios, 'launchctl', 'list'],
          { cleanup },
        )
      ).stdout;
      const row = listing
        .split('\n')
        .find((line) =>
          /UIKitApplication:host\.exp\.Exponent(?:\[|\s|$)/.test(line),
        );
      const pid = row?.trim().split(/\s+/)[0];
      return {
        pid: pid && /^\d+$/.test(pid) ? Number(pid) : null,
        row: row ?? null,
      };
    }
    const r = await adb(
      'android-app-state',
      ['shell', 'pidof', bundle[platform]],
      { allowFailure: true, cleanup },
    );
    assert(
      r.code === 0 || r.code === 1,
      'Could not establish Android app state',
    );
    return { pids: r.stdout.trim().split(/\s+/).filter(Boolean).map(Number) };
  }
  async function stopApplication(platform, cleanup = false) {
    if (platform === 'native-ios')
      await sim(
        'ios-stop-expo-go',
        ['terminate', devices.ios, bundle[platform]],
        { allowFailure: true, cleanup },
      );
    else
      await adb(
        'android-stop-expo-go',
        ['shell', 'am', 'force-stop', bundle[platform]],
        { cleanup },
      );
    const state = await applicationState(platform, cleanup);
    assert(
      platform === 'native-ios' ? state.pid === null : state.pids.length === 0,
      'Expo Go remained active after stop',
    );
    return state;
  }
  let activePlatform = null,
    observerListening = false,
    cacheOwned = false,
    reverseBefore = null;
  const observer = http.createServer(async (req, res) => {
    if (req.method !== 'POST' || req.url !== route) {
      res.writeHead(404).end();
      return;
    }
    const chunks = [];
    let size = 0;
    try {
      for await (const chunk of req) {
        size += chunk.length;
        if (size > 1024 * 1024) {
          res.writeHead(413).end();
          return;
        }
        chunks.push(chunk);
      }
      const raw = Buffer.concat(chunks),
        data = JSON.parse(raw.toString());
      assert(
        data.platform === activePlatform &&
          data.sourceIdentity === sourceBefore.identity &&
          data.phase === 'template-shell',
      );
      latest.set(data.platform, { raw, data, receivedAt: now() });
      res.writeHead(204).end();
    } catch {
      res.writeHead(400).end();
    }
  });
  try {
    progress('preflight');
    const initialPorts = await portsAvailable(ports);
    assert(
      initialPorts.every((p) => p.free),
      `Assigned runtime ports already occupied: ${JSON.stringify(initialPorts.filter((p) => !p.free))}`,
    );
    await new Promise((resolve, reject) => {
      observer.once('error', reject);
      observer.listen(observerPort, '127.0.0.1', resolve);
    });
    observerListening = true;
    cacheOwned = true;
    await launch(
      'metro',
      process.execPath,
      [expoCli, 'start', '--localhost', '--clear', '--port', String(metro)],
      {},
      app,
    );
    await launch(
      'proxy',
      process.execPath,
      [path.join(toolkit, 'scripts/metro-proxy.mjs')],
      {
        DESIGN_METRO_PROXY_PORT: String(proxy),
        DESIGN_METRO_UPSTREAM_PORT: String(metro),
      },
    );
    await waitFor(async () => {
      try {
        return (
          (await (
            await fetch(`http://127.0.0.1:${proxy}/status`, {
              signal: abort.signal,
            })
          ).text()) === 'packager-status:running'
        );
      } catch (e) {
        if (abort.signal.aborted) throw e;
        return false;
      }
    }, 'waiting-for-metro');
    await launch('idb-companion', companion, [
      '--device-set-path',
      tools.simulatorSet,
      '--only',
      'simulator',
      '--udid',
      devices.ios,
      '--grpc-port',
      '10882',
      '--log-level',
      'info',
    ]);
    const description = await waitFor(async () => {
      const r = await ios('ios-describe', ['describe', '--json'], {
        allowFailure: true,
      });
      return r.code === 0 && JSON.parse(r.stdout);
    }, 'waiting-for-assigned-ios');
    assert.equal(description.udid, devices.ios);
    assert.equal(description.state, 'Booted');
    assert.equal(description.target_type, 'simulator');
    for (const platform of ['native-ios', 'native-android']) {
      activePlatform = platform;
      latest.delete(platform);
      const deviceId = devices[platform === 'native-ios' ? 'ios' : 'android'];
      const device = {
        id: deviceId,
        bundle: bundle[platform],
        declaredVersion:
          tools.expoGo[platform === 'native-ios' ? 'ios' : 'android'],
        purpose:
          'Explicitly relaunch the assigned Expo Go app for unchanged blank-shell capability qualification',
      };
      if (platform === 'native-ios') {
        device.screen = {
          width: description.screen_dimensions.width,
          height: description.screen_dimensions.height,
        };
        const appContainer = (
          await sim('ios-container', [
            'get_app_container',
            devices.ios,
            bundle[platform],
            'app',
          ])
        ).stdout.trim();
        device.observedVersion = (
          await run('ios-version', '/usr/libexec/PlistBuddy', [
            '-c',
            'Print:CFBundleShortVersionString',
            path.join(appContainer, 'Info.plist'),
          ])
        ).stdout.trim();
        device.priorState = await applicationState(platform);
        await stopApplication(platform);
        launched.add(platform);
        await sim('ios-launch', [
          'launch',
          devices.ios,
          bundle[platform],
          '--initialUrl',
          `exp://localhost:${metro}`,
          '-EXDevMenuIsOnboardingFinished',
          'YES',
          '-ExpoGoOnboardingFinished',
          'YES',
        ]);
      } else {
        assert.equal(
          (await adb('android-state', ['get-state'])).stdout.trim(),
          'device',
        );
        const pkg = (
          await adb('android-package', [
            'shell',
            'dumpsys',
            'package',
            bundle[platform],
          ])
        ).stdout;
        device.observedVersion = /\bversionName=([^\s]+)/.exec(pkg)?.[1];
        device.priorState = await applicationState(platform);
        const display = (await adb('android-display', ['shell', 'wm', 'size']))
          .stdout;
        const sizes = [
          ...display.matchAll(/(?:Physical|Override) size: (\d+)x(\d+)/g),
        ];
        assert(sizes.length > 0, 'Android display size unknown');
        device.screen = {
          width: Number(sizes.at(-1)[1]),
          height: Number(sizes.at(-1)[2]),
        };
        const prior = (
          await adb('android-reverse-before', ['reverse', '--list'])
        ).stdout;
        reverseBefore = prior.trim().split('\n').filter(Boolean).sort();
        for (const port of [metro, proxy, observerPort]) {
          assert(
            !prior
              .split('\n')
              .some((line) => line.split(/\s+/)[1] === `tcp:${port}`),
            `Existing Android reverse ownership is unknown: ${port}`,
          );
          await adb('android-reverse-add', [
            'reverse',
            `tcp:${port}`,
            `tcp:${port}`,
          ]);
          reverses.push(port);
        }
        await stopApplication(platform);
        launched.add(platform);
        await adb('android-launch', [
          'shell',
          'am',
          'start',
          '-W',
          '-a',
          'android.intent.action.VIEW',
          '-d',
          `exp://127.0.0.1:${proxy}`,
          '-p',
          bundle[platform],
        ]);
      }
      assert.equal(
        device.observedVersion,
        device.declaredVersion,
        'Installed Expo Go differs from descriptor',
      );
      const before = await waitFor(() => {
        const r = latest.get(platform);
        if (!r?.data.boxes?.['shell-button']) return false;
        validateNativeObservation(r.data, {
          platform,
          sourceIdentity: sourceBefore.identity,
          presses: 0,
        });
        return r;
      }, `${platform}-shell-observation`);
      let tree;
      if (platform === 'native-ios')
        tree = await waitFor(async () => {
          const value = JSON.parse(
            (await ios('ios-accessibility', ['ui', 'describe-all', '--json']))
              .stdout,
          );
          return value.some((n) => n.AXUniqueId === 'shell-button') && value;
        }, 'native-ios-accessibility-ready');
      else {
        const remote = `/sdcard/relay-capability-${nonce}.xml`;
        remoteFiles.push(remote);
        await adb('android-accessibility-dump', [
          'shell',
          'uiautomator',
          'dump',
          remote,
        ]);
        tree = (
          await adb('android-accessibility-read', ['exec-out', 'cat', remote])
        ).stdout;
      }
      const point = nativeButtonPoint(platform, tree);
      const accessibility = await save(
        `${platform}-accessibility.${platform === 'native-ios' ? 'json' : 'xml'}`,
        typeof tree === 'string' ? tree : JSON.stringify(tree, null, 2),
      );
      const input = {
        kind: platform === 'native-ios' ? 'idb-hid' : 'adb-input',
        point,
        accessibility,
        startedAt: now(),
      };
      let dispatch;
      if (platform === 'native-ios') {
        assert(
          point.x < description.screen_dimensions.width_points &&
            point.y < description.screen_dimensions.height_points,
        );
        dispatch = await ios('ios-hid-tap', [
          'ui',
          'tap',
          String(point.x),
          String(point.y),
          '--api',
          'hid',
        ]);
        assert(!/ui tap expects/.test(dispatch.stdout + dispatch.stderr));
      } else
        dispatch = await adb('android-input-tap', [
          'shell',
          'input',
          'tap',
          String(point.x),
          String(point.y),
        ]);
      input.completed = true;
      input.completedAt = now();
      input.dispatch = await save(
        `${platform}-input.json`,
        JSON.stringify(dispatch.entry, null, 2),
      );
      const after = await waitFor(() => {
        const r = latest.get(platform);
        if (!r || r.receivedAt < input.completedAt || r.data.presses === 0)
          return false;
        validateNativeObservation(r.data, {
          platform,
          sourceIdentity: sourceBefore.identity,
          presses: 1,
        });
        return r;
      }, `${platform}-actual-button-transition`);
      const screenshotName = `${platform}.png`;
      if (platform === 'native-ios') {
        await ios('ios-screenshot', [
          'screenshot',
          path.join(output, screenshotName),
        ]);
        artifactNames.add(screenshotName);
      } else
        await save(
          screenshotName,
          (
            await adb('android-screenshot', ['exec-out', 'screencap', '-p'], {
              binary: true,
            })
          ).stdout,
        );
      const receipt = {
        phase: 'template-shell',
        platform,
        sourceIdentity: sourceBefore.identity,
        device,
        before: await save(`${platform}-before.json`, before.raw),
        after: await save(`${platform}-after.json`, after.raw),
        beforeReceivedAt: before.receivedAt,
        afterReceivedAt: after.receivedAt,
        input,
      };
      result.platforms.push({
        platform,
        deviceId,
        sourceIdentity: sourceBefore.identity,
        root: after.data.boxes['shell-root'],
        action: { before: before.data.presses, after: after.data.presses },
        receipt: await save(
          `${platform}-receipt.json`,
          JSON.stringify(receipt, null, 2),
        ),
        screenshot: artifact(output, screenshotName),
      });
      result.checks.push({
        id: `${platform}-actual-geometry-and-input`,
        passed: true,
      });
      const stoppedState = await stopApplication(platform);
      launched.delete(platform);
      result.cleanup.applications.push({
        platform,
        deviceId,
        bundle: bundle[platform],
        stopped: true,
        observed: stoppedState,
      });
      activePlatform = null;
    }
  } catch (error) {
    result.checks.push({
      id: 'native-capability-execution',
      passed: false,
      error: String(error.message),
    });
    await save('failure.txt', String(error.stack ?? error));
  } finally {
    progress('cleanup');
    for (const platform of launched) {
      try {
        const stoppedState = await stopApplication(platform, true);
        result.cleanup.applications.push({
          platform,
          deviceId: devices[platform === 'native-ios' ? 'ios' : 'android'],
          bundle: bundle[platform],
          stopped: true,
          observed: stoppedState,
        });
      } catch (error) {
        result.cleanup.errors.push(String(error.message));
      }
    }
    for (const port of reverses) {
      try {
        await adb(
          'android-reverse-remove',
          ['reverse', '--remove', `tcp:${port}`],
          { cleanup: true },
        );
        result.cleanup.reverses.push({ port, removed: true });
      } catch (error) {
        result.cleanup.reverses.push({
          port,
          removed: false,
          error: String(error.message),
        });
      }
    }
    if (reverseBefore !== null) {
      try {
        const after = (
          await adb('android-reverse-after', ['reverse', '--list'], {
            cleanup: true,
          })
        ).stdout
          .trim()
          .split('\n')
          .filter(Boolean)
          .sort();
        result.cleanup.reverseSnapshot = await save(
          'android-reverse-snapshots.json',
          JSON.stringify({ before: reverseBefore, after }, null, 2),
        );
        assert.deepEqual(
          after,
          reverseBefore,
          'Android reverse mappings were not restored',
        );
      } catch (error) {
        result.cleanup.errors.push(String(error.message));
      }
    }
    for (const remote of remoteFiles)
      try {
        await adb('android-dump-remove', ['shell', 'rm', remote], {
          cleanup: true,
        });
      } catch (error) {
        result.cleanup.errors.push(String(error.message));
      }
    if (observerListening) {
      observer.closeAllConnections();
      await new Promise((resolve) => observer.close(resolve));
    }
    result.cleanup.groups = await stopOwnedProcessGroups(
      children.filter((c) => c.pid),
    );
    for (const handle of handles) await handle.close();
    if (cacheOwned)
      try {
        await rm(cache, { recursive: true, force: true });
      } catch (error) {
        result.cleanup.errors.push(String(error.message));
      }
    result.cleanup.ports = await portsAvailable(ports);
    const sourceAfter = snapshotApplication(app),
      preparedAfter = snapshotPreparedApplication(app);
    result.sourceIdentityAfter = sourceAfter.identity;
    result.preparedIdentityAfter = preparedAfter.identity;
    result.source = await save(
      'source-snapshots.json',
      JSON.stringify(
        {
          before: sourceBefore,
          after: sourceAfter,
          preparedBefore,
          preparedAfter,
        },
        null,
        2,
      ),
    );
    result.checks.push({
      id: 'prepared-app-unchanged',
      passed:
        sourceBefore.identity === sourceAfter.identity &&
        preparedBefore.identity === preparedAfter.identity,
    });
    await save('commands.json', JSON.stringify(commands, null, 2));
    await save(
      'processes.json',
      JSON.stringify(
        children.map(({ child, ...record }) => record),
        null,
        2,
      ),
    );
    result.cleanup.confirmed =
      result.cleanup.errors.length === 0 &&
      result.cleanup.groups.every((g) => g.absent) &&
      result.cleanup.ports.every((p) => p.free) &&
      result.cleanup.reverses.every((r) => r.removed) &&
      result.cleanup.applications.every((a) => a.stopped);
    result.artifacts = [...artifactNames]
      .sort()
      .map((name) => artifact(output, name));
    process.removeListener('SIGINT', stop);
    process.removeListener('SIGTERM', stop);
    signal?.removeEventListener('abort', stop);
  }
  await writeFile(
    path.join(output, 'native-result.json'),
    JSON.stringify(result, null, 2) + '\n',
  );
  progress(
    result.checks.every((c) => c.passed) && result.cleanup.confirmed
      ? 'complete'
      : 'failed',
  );
  return result;
}
export const probe = runNativeCapability;
