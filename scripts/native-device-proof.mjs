import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { NativeRenderer, parseState } from '../dist/index.js';

const exec = promisify(execFile);
const platform = process.argv[2],
  label = process.argv[3];
assert.ok(['native-ios', 'native-android'].includes(platform));
assert.match(label ?? '', /^[a-z0-9-]+$/);
const directory = `artifacts/responsive/${label}`;
await mkdir(directory, { recursive: true });
const renderer = new NativeRenderer();
const observations = [];
try {
  for (const archetype of ['hero', 'editorial']) {
    const state = parseState(
      JSON.parse(await readFile(`examples/${archetype}.json`, 'utf8')),
    );
    state.platform = platform;
    if (process.env.DESIGN_PROOF_COLORS)
      state.colors = JSON.parse(
        await readFile(process.env.DESIGN_PROOF_COLORS, 'utf8'),
      );
    const probe = await renderer.measure(state);
    state.viewport.width = Number(probe.runtime.windowWidth);
    state.viewport.height = Number(probe.runtime.windowHeight);
    const measurement = await renderer.measure(state);
    assert.equal(
      measurement.feasible,
      true,
      JSON.stringify(measurement.issues),
    );
    if (process.env.DESIGN_EXPECT_FONT_SCALE)
      assert.ok(
        Math.abs(
          measurement.runtime.fontScale -
            Number(process.env.DESIGN_EXPECT_FONT_SCALE),
        ) < 0.02,
      );
    await writeFile(
      `${directory}/${archetype}.json`,
      JSON.stringify({ state, measurement }, null, 2) + '\n',
    );
    if (platform === 'native-ios') {
      assert.ok(process.env.DESIGN_SIMULATOR_UDID, 'set DESIGN_SIMULATOR_UDID');
      const temporary = `/private/tmp/physics-${label}-${archetype}.png`;
      await exec('xcrun', [
        'simctl',
        '--set',
        '/private/tmp/physics-design-simulators',
        'io',
        process.env.DESIGN_SIMULATOR_UDID,
        'screenshot',
        temporary,
      ]);
      await copyFile(temporary, `${directory}/${archetype}.png`);
    } else {
      const result = await exec(
        path.resolve('artifacts/runtime/android-sdk/platform-tools/adb'),
        [
          '-s',
          process.env.DESIGN_ADB_DEVICE ?? 'emulator-5554',
          'exec-out',
          'screencap',
          '-p',
        ],
        { encoding: 'buffer', maxBuffer: 20 * 1024 * 1024 },
      );
      await writeFile(`${directory}/${archetype}.png`, result.stdout);
    }
    observations.push({
      archetype,
      width: state.viewport.width,
      height: state.viewport.height,
      runtime: measurement.runtime,
      issues: measurement.issues,
    });
  }
  await writeFile(
    `${directory}/summary.json`,
    JSON.stringify(
      {
        passed: true,
        observations,
        scope:
          'Actual native window and renderer; simulator/emulator, not physical hardware. Screenshots include the measurement harness.',
      },
      null,
      2,
    ) + '\n',
  );
  console.log(JSON.stringify(observations));
} finally {
  await renderer.close();
}
