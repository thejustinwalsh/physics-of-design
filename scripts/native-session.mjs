import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, mkdir, writeFile, open } from 'node:fs/promises';
import path from 'node:path';
import net from 'node:net';
const exec = promisify(execFile),
  root = process.cwd(),
  runtime = path.join(root, 'artifacts/runtime');
const env = {
  ...process.env,
  DESIGN_NATIVE_TOKEN: process.env.DESIGN_NATIVE_TOKEN ?? 'local-spike',
  __UNSAFE_EXPO_HOME_DIRECTORY: path.join(root, 'artifacts/expo-home'),
  EXPO_PUBLIC_DESIGN_TOKEN: process.env.DESIGN_NATIVE_TOKEN ?? 'local-spike',
  EXPO_NO_TELEMETRY: '1',
  DOTSLASH_CACHE: path.join(root, 'artifacts/dotslash'),
  CI: '1',
  ANDROID_USER_HOME: path.join(runtime, 'android-user'),
  ANDROID_AVD_HOME: path.join(runtime, 'android-avd'),
  ANDROID_HOME: path.join(runtime, 'android-sdk'),
};
const productMode = process.argv.includes('--fieldwork');
const children = [];
const set = '/private/tmp/physics-design-simulators';
let bootedPhone;
let serviceFailure;
let stopping = false;
let finishSession;
function requestStop() {
  serviceFailure = new Error('Native session interrupted');
  finishSession?.();
}
process.once('SIGINT', requestStop);
process.once('SIGTERM', requestStop);
await mkdir('artifacts/native-session', { recursive: true });
async function portOpen(port, host) {
  return new Promise((resolve) => {
    const socket = net.connect({ port, host });
    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.once('error', () => {
      socket.destroy();
      resolve(false);
    });
    socket.setTimeout(500, () => {
      socket.destroy();
      resolve(false);
    });
  });
}
async function start(name, command, args, cwd = root) {
  const log = await open(`artifacts/native-session/${name}.log`, 'a');
  const child = spawn(command, args, {
    cwd,
    env,
    detached: true,
    stdio: ['ignore', log.fd, log.fd],
  });
  await new Promise((resolve, reject) => {
    child.once('spawn', resolve);
    child.once('error', reject);
  });
  await log.close();
  children.push(child);
  child.once('exit', (code, signal) => {
    if (!stopping) {
      serviceFailure = new Error(
        `${name} exited (${code ?? signal}); see artifacts/native-session/${name}.log`,
      );
      finishSession?.();
    }
  });
  await writeFile(
    'artifacts/native-session/processes.json',
    JSON.stringify(children.map((c) => c.pid)),
  );
  return child;
}
async function waitFor(test, label, timeout = 120000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    if (serviceFailure) throw serviceFailure;
    try {
      if (await test()) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(
    `Timed out waiting for ${label}; see artifacts/native-session logs`,
  );
}
const adb = path.join(runtime, 'android-sdk/platform-tools/adb');
try {
  for (const port of [4319, 8087, 8088, ...(productMode ? [4321] : [])])
    if ((await portOpen(port, '127.0.0.1')) || (await portOpen(port, '::1')))
      throw new Error(
        `Port ${port} is occupied. Stop its service before starting this isolated native session.`,
      );
  if (productMode)
    await start('app-observer', process.execPath, ['scripts/app-observer.mjs']);
  await start('bridge', process.execPath, ['dist/cli.js', 'native', 'serve']);
  await start(
    'metro',
    'npm',
    ['run', 'start', '--', '--port', '8087'],
    path.join(root, 'native'),
  );
  await start('proxy', process.execPath, ['scripts/metro-proxy.mjs']);
  await waitFor(
    async () =>
      (await (await fetch('http://127.0.0.1:8088/status')).text()) ===
      'packager-status:running',
    'Metro',
  );
  const devices = (await exec(adb, ['devices'], { env })).stdout;
  if (!devices.includes('emulator-5554'))
    await start(
      'android-emulator',
      path.join(runtime, 'android-sdk/emulator/emulator'),
      [
        '-avd',
        'physics-design',
        '-no-window',
        '-no-audio',
        '-no-boot-anim',
        '-no-snapshot',
        '-gpu',
        'swiftshader',
        '-ports',
        '5554,5555',
      ],
    );
  await waitFor(
    async () =>
      (
        await exec(
          adb,
          ['-s', 'emulator-5554', 'shell', 'getprop', 'sys.boot_completed'],
          { env },
        )
      ).stdout.trim() === '1',
    'Android boot',
  );
  await exec(
    adb,
    [
      '-s',
      'emulator-5554',
      'install',
      '-r',
      path.join(
        root,
        'artifacts/expo-home/android-apk-cache/Expo-Go-58.0.5.apk',
      ),
    ],
    { env },
  );
  for (const port of ['8088', '4319', ...(productMode ? ['4321'] : [])])
    await exec(
      adb,
      ['-s', 'emulator-5554', 'reverse', `tcp:${port}`, `tcp:${port}`],
      { env },
    );
  await exec(
    adb,
    [
      '-s',
      'emulator-5554',
      'shell',
      'am',
      'start',
      '-W',
      '-a',
      'android.intent.action.VIEW',
      '-d',
      'exp://127.0.0.1:8088',
      '-p',
      'host.exp.exponent',
    ],
    { env },
  );
  await mkdir(set, { recursive: true });
  let id;
  try {
    id = (await readFile(path.join(runtime, 'iphone-udid.txt'), 'utf8')).trim();
  } catch {}
  if (!id) {
    id = (
      await exec('xcrun', [
        'simctl',
        '--set',
        set,
        'create',
        'Physics of Design Phone',
        'com.apple.CoreSimulator.SimDeviceType.iPhone-17-Pro',
        'com.apple.CoreSimulator.SimRuntime.iOS-26-5',
      ])
    ).stdout.trim();
    await writeFile(path.join(runtime, 'iphone-udid.txt'), id + '\n');
  }
  const inventory = JSON.parse(
    (await exec('xcrun', ['simctl', '--set', set, 'list', 'devices', '--json']))
      .stdout,
  );
  const device = Object.values(inventory.devices)
    .flat()
    .find((d) => d.udid === id);
  if (!device)
    throw new Error(
      `Stored simulator ${id} no longer exists; remove artifacts/runtime/iphone-udid.txt to create a new one.`,
    );
  if (device.state !== 'Booted') {
    await exec('xcrun', ['simctl', '--set', set, 'boot', id]);
    bootedPhone = id;
  }
  await exec('xcrun', [
    'simctl',
    '--set',
    set,
    'install',
    id,
    path.join(
      root,
      'artifacts/expo-home/ios-simulator-app-cache/Expo-Go-58.0.7.tar.app',
    ),
  ]);
  await exec('xcrun', [
    'simctl',
    '--set',
    set,
    'launch',
    '--terminate-running-process',
    id,
    'host.exp.Exponent',
    '--initialUrl',
    'exp://localhost:8087',
    '-EXDevMenuIsOnboardingFinished',
    'YES',
    '-ExpoGoOnboardingFinished',
    'YES',
  ]);
  await waitFor(async () => {
    const health = await (
      await fetch('http://127.0.0.1:4319/health', {
        headers: { authorization: `Bearer ${env.DESIGN_NATIVE_TOKEN}` },
      })
    ).json();
    return ['native-ios', 'native-android'].every((platform) =>
      health.clients?.some((c) => c.platform === platform),
    );
  }, 'both native harnesses');
  if (productMode) {
    const started = Date.now();
    await exec('xcrun', [
      'simctl',
      '--set',
      set,
      'launch',
      '--terminate-running-process',
      id,
      'host.exp.Exponent',
      '--initialUrl',
      'exp://localhost:8087/--/fieldwork',
      '-EXDevMenuIsOnboardingFinished',
      'YES',
      '-ExpoGoOnboardingFinished',
      'YES',
    ]);
    await exec(
      adb,
      [
        '-s',
        'emulator-5554',
        'shell',
        'am',
        'start',
        '-W',
        '-a',
        'android.intent.action.VIEW',
        '-d',
        'exp://127.0.0.1:8088/--/fieldwork',
        '-p',
        'host.exp.exponent',
      ],
      { env },
    );
    await waitFor(async () => {
      const receipts = await Promise.all(
        ['ios', 'android'].map(async (platform) =>
          JSON.parse(
            await readFile(
              `artifacts/fieldwork/native-observations/latest-${platform}.json`,
              'utf8',
            ),
          ),
        ),
      );
      return receipts.every(
        (r) =>
          Date.parse(r.capturedAt) > started &&
          r.incomplete === false &&
          r.snapshot.hydrated,
      );
    }, 'both actual Fieldwork app observations');
    console.log(
      'Fieldwork native apps ready on iPhone and Android. Observer:4321; Metro:8087/proxy:8088. Ctrl-C stops this session’s owned services.',
    );
  } else {
    console.log(
      `Native harnesses ready. Run npm run verify:all in another terminal with the same DESIGN_NATIVE_TOKEN. Ctrl-C stops services owned by this session.`,
    );
  }
  await new Promise((resolve) => {
    finishSession = resolve;
    if (serviceFailure) resolve();
  });
  if (serviceFailure && serviceFailure.message !== 'Native session interrupted')
    throw serviceFailure;
} finally {
  stopping = true;
  for (const child of children.reverse()) {
    try {
      process.kill(-child.pid, 'SIGTERM');
    } catch {}
  }
  if (bootedPhone)
    await exec('xcrun', [
      'simctl',
      '--set',
      set,
      'shutdown',
      bootedPhone,
    ]).catch(() => {});
  await new Promise((resolve) => setTimeout(resolve, 1000));
  for (const child of children) {
    try {
      process.kill(-child.pid, 'SIGKILL');
    } catch {}
  }
  process.removeListener('SIGINT', requestStop);
  process.removeListener('SIGTERM', requestStop);
}
