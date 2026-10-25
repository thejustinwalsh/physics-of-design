#!/usr/bin/env node
// Real Simulator HID/AX operations through pinned Meta idb, without a default device set.
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const exec = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const base = path.resolve(
  process.env.DESIGN_IDB_STATE_DIRECTORY ??
    path.join(root, 'artifacts/ios-input-driver'),
);
const runtime = path.resolve(
  process.env.DESIGN_IDB_RUNTIME_DIRECTORY ?? path.join(base, 'runtime'),
);
const client = path.join(runtime, 'venv/bin/idb');
const companion = process.env.DESIGN_IDB_COMPANION ?? 'localhost:10882';
const set =
  process.env.DESIGN_IOS_DEVICE_SET ?? '/private/tmp/physics-design-simulators';
const [command = 'help', ...args] = process.argv.slice(2);
const version = '1.7.7';
const checksum =
  'd0e4e10a7bbd85a6ce67966acb5fca0a87fd14cd026b79f8ec3ee6c338f4a166';
const receipts = path.join(base, 'commands');
await mkdir(receipts, { recursive: true });
const record = {
  startedAt: new Date().toISOString(),
  command,
  args,
  companion,
  deviceSet: set,
};

async function run(argv) {
  const result = await exec(client, ['--companion', companion, ...argv], {
    timeout: 30000,
    maxBuffer: 16 * 1024 * 1024,
  });
  // idb 1.7.7 may report malformed tap arguments while exiting successfully.
  if (/ui tap expects/.test(result.stdout + result.stderr))
    throw new Error(result.stdout + result.stderr);
  return result.stdout;
}
function coordinate(value) {
  if (
    value === undefined ||
    value.trim() === '' ||
    !Number.isFinite(Number(value))
  ) {
    throw new Error('Coordinates must be finite numbers');
  }
  return Math.round(Number(value));
}
async function screen() {
  const target = JSON.parse(await run(['describe', '--json']));
  if (target.target_type !== 'simulator' || target.state !== 'Booted')
    throw new Error('A booted Simulator is required');
  record.target = target;
  return target.screen_dimensions;
}
function inside(x, y, dimensions) {
  if (
    x < 0 ||
    y < 0 ||
    x >= dimensions.width_points ||
    y >= dimensions.height_points
  ) {
    throw new Error(`Point ${x},${y} is outside the current Simulator screen`);
  }
}
async function setup() {
  await mkdir(runtime, { recursive: true });
  const url = `https://github.com/facebook/idb/releases/download/v${version}/idb-companion.macos-arm64.tar.gz`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Download failed: ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  const actual = createHash('sha256').update(bytes).digest('hex');
  if (actual !== checksum)
    throw new Error(`Companion checksum mismatch: ${actual}`);
  const archive = path.join(runtime, 'idb-companion.macos-arm64.tar.gz');
  await writeFile(archive, bytes);
  await exec('tar', ['-xzf', archive, '-C', runtime]);
  await exec('python3', ['-m', 'venv', path.join(runtime, 'venv')]);
  const packages = [
    'fb-idb==1.7.7',
    'aiofiles==25.1.0',
    'grpclib==0.4.9',
    'h2==4.4.1',
    'hpack==4.2.0',
    'hyperframe==6.1.0',
    'multidict==7.2.1',
    'protobuf==7.36.2',
  ];
  const installed = await exec(
    path.join(runtime, 'venv/bin/python'),
    ['-m', 'pip', 'install', '--no-cache-dir', ...packages],
    { timeout: 180000 },
  );
  return JSON.stringify({
    version,
    url,
    checksum: actual,
    install: installed.stdout,
  });
}

try {
  let output = '';
  if (command === 'help') {
    output = `Usage: node scripts/ios-input-driver.mjs COMMAND [ARGS]
setup                         Install checksum-verified idb 1.7.7 under artifacts only
start UDID                    Foreground companion for explicit custom set; Ctrl-C stops it
describe                      Simulator identity and current screen size
ax                            Fresh native accessibility tree as JSON
tap X Y                       Real HID touch; rounds point coordinates to integers
tap-id TEST_ID                 Fresh AXUniqueId query followed by real HID center touch
swipe X1 Y1 X2 Y2 [SECONDS]    Continuous native HID swipe (default 0.5 seconds)
text TEXT                     Native keyboard text input into the focused field
key HID_USAGE                 Native keyboard key by USB HID usage number
screenshot PATH               Save current Simulator screenshot

DESIGN_IDB_COMPANION defaults to localhost:10882. For a local Unix socket, set it
to an absolute path for both start and later commands. DESIGN_IOS_DEVICE_SET
defaults to /private/tmp/physics-design-simulators. Start never boots or shuts
down a Simulator. Each command saves a receipt under artifacts/ios-input-driver.
DESIGN_IDB_STATE_DIRECTORY redirects receipts to a private writable directory;
DESIGN_IDB_RUNTIME_DIRECTORY reuses an already provisioned idb runtime separately.
An input receipt confirms dispatch only; verify resulting app/AX state separately.\n`;
  } else if (command === 'setup') output = await setup();
  else if (command === 'start') {
    if (!/^[0-9a-f-]{36}$/i.test(args[0] ?? ''))
      throw new Error('start requires an explicit Simulator UDID');
    const transport = path.isAbsolute(companion)
      ? ['--grpc-domain-sock', companion]
      : companion === 'localhost:10882'
        ? ['--grpc-port', '10882']
        : null;
    if (!transport)
      throw new Error(
        'start supports localhost:10882 or an absolute Unix socket path',
      );
    const argv = [
      '--device-set-path',
      set,
      '--only',
      'simulator',
      '--udid',
      args[0],
      ...transport,
      '--log-level',
      'info',
    ];
    record.argv = argv;
    const child = spawn(path.join(runtime, 'idb_companion'), argv, {
      stdio: 'inherit',
    });
    const stop = () => child.kill('SIGTERM');
    process.once('SIGINT', stop);
    process.once('SIGTERM', stop);
    const code = await new Promise((resolve, reject) => {
      child.once('error', reject);
      child.once('exit', resolve);
    });
    if (code !== 0 && code !== null)
      throw new Error(`Companion exited ${code}`);
  } else if (command === 'describe') output = await run(['describe', '--json']);
  else if (command === 'ax')
    output = await run(['ui', 'describe-all', '--json']);
  else if (command === 'tap' || command === 'tap-id') {
    const dimensions = await screen();
    let x, y;
    if (command === 'tap-id') {
      const tree = JSON.parse(await run(['ui', 'describe-all', '--json']));
      const matches = tree.filter((element) => element.AXUniqueId === args[0]);
      if (matches.length !== 1)
        throw new Error(
          `Expected exactly one AXUniqueId ${args[0]}, found ${matches.length}`,
        );
      const element = matches[0];
      if (
        !element.enabled ||
        !element.frame ||
        element.frame.width <= 0 ||
        element.frame.height <= 0
      )
        throw new Error('Element is disabled or has no tappable frame');
      record.element = element;
      x = Math.round(element.frame.x + element.frame.width / 2);
      y = Math.round(element.frame.y + element.frame.height / 2);
    } else {
      x = coordinate(args[0]);
      y = coordinate(args[1]);
    }
    inside(x, y, dimensions);
    record.hidPoint = { x, y };
    output = await run(['ui', 'tap', String(x), String(y), '--api', 'hid']);
  } else if (command === 'swipe') {
    const points = args.slice(0, 4).map(coordinate);
    if (points.length !== 4) throw new Error('swipe requires four coordinates');
    const dimensions = await screen();
    inside(points[0], points[1], dimensions);
    inside(points[2], points[3], dimensions);
    const duration = Number(args[4] ?? 0.5);
    if (!(duration > 0 && duration <= 10))
      throw new Error('Swipe duration must be >0 and <=10 seconds');
    record.hidPath = { points, duration, delta: 8 };
    output = await run([
      'ui',
      'swipe',
      ...points.map(String),
      '--duration',
      String(duration),
      '--delta',
      '8',
    ]);
  } else if (command === 'text') {
    if (args.length !== 1) throw new Error('text requires one quoted string');
    output = await run(['ui', 'text', args[0]]);
  } else if (command === 'key') {
    if (!/^\d+$/.test(args[0] ?? ''))
      throw new Error('key requires a numeric USB HID usage');
    output = await run(['ui', 'key', args[0]]);
  } else if (command === 'screenshot') {
    if (args.length !== 1)
      throw new Error('screenshot requires an output path');
    output = await run(['screenshot', path.resolve(args[0])]);
  } else throw new Error(`Unknown command ${command}`);
  record.status = 'completed';
  record.stdout = output;
  process.stdout.write(output);
} catch (error) {
  record.status = 'failed';
  record.error = {
    message: error.message,
    stdout: error.stdout,
    stderr: error.stderr,
    code: error.code,
  };
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
} finally {
  record.completedAt = new Date().toISOString();
  await writeFile(
    path.join(
      receipts,
      `${record.startedAt.replaceAll(':', '-')}-${process.pid}.json`,
    ),
    JSON.stringify(record, null, 2) + '\n',
  );
}
