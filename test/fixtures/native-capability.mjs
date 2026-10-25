// Synthetic protocol fixtures only; these are never evidence of device execution.
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { crc32, deflateSync } from 'node:zlib';
import path from 'node:path';
import {
  snapshotApplication,
  snapshotPreparedApplication,
} from '../../scripts/run-relay-builders.mjs';
import { nativeButtonPoint } from '../../scripts/relay-native-capability.mjs';

const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
function png() {
  const chunk = (name, data) => {
    const type = Buffer.from(name),
      bytes = Buffer.alloc(data.length + 12);
    bytes.writeUInt32BE(data.length);
    type.copy(bytes, 4);
    data.copy(bytes, 8);
    bytes.writeUInt32BE(crc32(Buffer.concat([type, data])), data.length + 8);
    return bytes;
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(2);
  ihdr.writeUInt32BE(2, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk(
      'tEXt',
      Buffer.from(
        'Comment\0Synthetic protocol fixture, not an actual device screenshot',
      ),
    ),
    chunk('IDAT', deflateSync(Buffer.alloc(18))),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

export function createNativeCapabilityFixture({ workspace, output, metadata }) {
  mkdirSync(output, { recursive: true });
  const refs = [];
  const save = (name, value) => {
    const bytes = Buffer.isBuffer(value)
      ? value
      : Buffer.from(typeof value === 'string' ? value : JSON.stringify(value));
    writeFileSync(path.join(output, name), bytes);
    const ref = { path: name, bytes: bytes.length, sha256: hash(bytes) };
    refs.push(ref);
    return ref;
  };
  const source = snapshotApplication(path.join(workspace, 'app'));
  const prepared = snapshotPreparedApplication(path.join(workspace, 'app'));
  const tools = metadata.runtime.devices.tools;
  const platforms = ['native-ios', 'native-android'].map((platform) => {
    const isIos = platform === 'native-ios',
      key = isIos ? 'ios' : 'android';
    const deviceId = metadata.runtime.devices[key];
    const box = (nodeName, x, y, width, height) => ({
      nodeName,
      x,
      y,
      width,
      height,
    });
    const base = {
      phase: 'template-shell',
      platform,
      provider: platform,
      sourceIdentity: source.identity,
      viewport: { width: 390, height: 844, scale: 1, fontScale: 1 },
      boxes: {
        'shell-root': box('DIV', 0, 0, 390, 844),
        'shell-text': box('P', 20, 20, 240, 24),
        'shell-button': box('BUTTON', 20, 60, 160, 48),
        'shell-status': box('P', 20, 124, 160, 24),
      },
    };
    const before = save(`${platform}-before.json`, {
      ...base,
      presses: 0,
      observedAt: '2026-10-25T00:00:00.000Z',
    });
    const after = save(`${platform}-after.json`, {
      ...base,
      presses: 1,
      observedAt: '2026-10-25T00:00:02.000Z',
    });
    const tree = isIos
      ? [
          {
            AXUniqueId: 'shell-button',
            AXLabel: 'Check interaction',
            enabled: true,
            frame: { x: 20, y: 60, width: 160, height: 48 },
          },
          { AXLabel: 'Relay implementation pending', type: 'StaticText' },
          { AXLabel: 'Button checks: 0', type: 'StaticText' },
        ]
      : '<hierarchy><node text="Relay implementation pending" class="android.widget.TextView"/><node resource-id="shell-button" package="host.exp.exponent" clickable="true" enabled="true" bounds="[20,60][180,108]"/><node text="Button checks: 0"/></hierarchy>';
    const point = nativeButtonPoint(platform, tree);
    const accessibility = save(
      `${platform}-accessibility.${isIos ? 'json' : 'xml'}`,
      tree,
    );
    const stdout = save(`${platform}-input.stdout`, ''),
      stderr = save(`${platform}-input.stderr`, '');
    const dispatch = save(`${platform}-input.json`, {
      code: 0,
      command: isIos
        ? path.join(tools.iosInputRuntime, 'venv/bin/idb')
        : tools.androidAdb,
      args: isIos
        ? [
            '--companion',
            tools.iosInputCompanionAddress,
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
      stdout,
      stderr,
      completedAt: '2026-10-25T00:00:01.000Z',
    });
    const receipt = save(`${platform}-receipt.json`, {
      phase: 'template-shell',
      platform,
      sourceIdentity: source.identity,
      device: {
        id: deviceId,
        bundle: isIos ? 'host.exp.Exponent' : 'host.exp.exponent',
        observedVersion: tools.expoGo[key],
        screen: { width: 2, height: 2 },
      },
      before,
      after,
      afterReceivedAt: '2026-10-25T00:00:03.000Z',
      input: {
        kind: isIos ? 'idb-hid' : 'adb-input',
        accessibility,
        point,
        dispatch,
        completed: true,
        completedAt: '2026-10-25T00:00:01.000Z',
      },
    });
    return {
      platform,
      deviceId,
      sourceIdentity: source.identity,
      root: base.boxes['shell-root'],
      action: { before: 0, after: 1 },
      receipt,
      screenshot: save(`${platform}.png`, png()),
    };
  });
  const ports = [
    metadata.runtime.metro,
    metadata.runtime.proxy,
    metadata.runtime.observer,
  ];
  const sourceRef = save('source-snapshots.json', {
    before: source,
    after: source,
    preparedBefore: prepared,
    preparedAfter: prepared,
  });
  const reverseSnapshot = save('android-reverse-snapshots.json', {
    before: [],
    after: [],
  });
  return {
    version: 1,
    fixture: 'Synthetic protocol fixture; no device was executed',
    platforms,
    sourceIdentityBefore: source.identity,
    sourceIdentityAfter: source.identity,
    preparedIdentityBefore: prepared.identity,
    preparedIdentityAfter: prepared.identity,
    source: sourceRef,
    checks: [
      'native-ios-actual-geometry-and-input',
      'native-android-actual-geometry-and-input',
      'prepared-app-unchanged',
    ].map((id) => ({ id, passed: true })),
    artifacts: refs,
    cleanup: {
      confirmed: true,
      reverseSnapshot,
      groups: ['metro', 'proxy', 'idb-companion'].map((name, i) => ({
        name,
        pid: 10000 + i,
        absent: true,
      })),
      ports: [...ports, 10882].flatMap((port) =>
        ['127.0.0.1', '::1'].map((host) => ({ port, host, free: true })),
      ),
      reverses: ports.map((port) => ({ port, removed: true })),
      applications: platforms.map((p) => ({
        platform: p.platform,
        deviceId: p.deviceId,
        bundle:
          p.platform === 'native-ios'
            ? 'host.exp.Exponent'
            : 'host.exp.exponent',
        stopped: true,
        observed: p.platform === 'native-ios' ? { pid: null } : { pids: [] },
      })),
      errors: [],
    },
  };
}
