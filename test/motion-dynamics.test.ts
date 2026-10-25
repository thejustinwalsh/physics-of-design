import test from 'node:test';
import assert from 'node:assert/strict';
import { sampleMotion } from '../src/motion.js';
import {
  analyzeMotionDynamics,
  createDrivenMotion,
  dampMotionValue,
  sampleMotionTimeline,
  sampleTimelineProgress,
  scrollProgress,
} from '../src/motion-dynamics.js';
import {
  createDeviceTiltController,
  mapDeviceTilt,
} from '../src/browser-tilt.js';

const near = (a: number, b: number, tolerance = 1e-9) =>
  assert.ok(
    Math.abs(a - b) <= tolerance * Math.max(1, Math.abs(a), Math.abs(b)),
    `${a} != ${b}`,
  );

test('driven propagation matches the independently exercised stationary sampler in every damping regime', () => {
  for (const damping of [0, 3, 20 - 1e-10, 20, 20 + 1e-10, 50, 1000]) {
    const spring = { mass: 1, stiffness: 100, damping };
    const driver = createDrivenMotion({
      spring,
      position: -8,
      target: 17,
      velocity: -3,
    });
    let time = 0;
    for (const dt of [0, 0.001, 0.016, 0.1, 0.21, 1, 5]) {
      time += dt;
      const actual = driver.advance(dt);
      const expected = sampleMotion(
        {
          spring,
          coordinate: { unit: 'px', from: -8, to: 17, initialVelocity: -3 },
        },
        time,
      );
      near(actual.position, expected.position);
      near(actual.velocity, expected.velocity);
      near(actual.energy, expected.energy);
      near(actual.energy + actual.dissipated, actual.initialEnergy);
      assert.ok(actual.dissipated >= -1e-8);
    }
  }
});

test('retargeting preserves position/velocity and separates positive or negative target work', () => {
  const driver = createDrivenMotion({
    spring: { mass: 2, stiffness: 80, damping: 7 },
    position: 0,
    target: 10,
    velocity: 5,
  });
  driver.advance(0.12);
  for (const target of [40, -5, 8]) {
    const before = driver.snapshot(),
      after = driver.retarget(target);
    assert.equal(after.position, before.position);
    assert.equal(after.velocity, before.velocity);
    assert.equal(after.dissipated, before.dissipated);
    near(
      after.targetWork - before.targetWork,
      40 *
        ((before.position - target) ** 2 -
          (before.position - before.target) ** 2),
    );
    const advanced = driver.advance(0.07);
    near(
      advanced.energy,
      advanced.initialEnergy + advanced.targetWork - advanced.dissipated,
    );
  }
  const before = driver.snapshot();
  const atMass = driver.retarget(before.position);
  assert.ok(atMass.targetWork < before.targetWork);
  assert.throws(() => driver.retarget(Infinity));
  assert.deepEqual(driver.snapshot(), atMass);
  assert.throws(() => driver.advance(-1));
  assert.deepEqual(driver.snapshot(), atMass);
});

test('held targets are invariant to 30/60/120Hz and irregular time partitions', () => {
  const options = {
    spring: { mass: 1, stiffness: 180, damping: 12 },
    position: 0,
    target: 100,
    velocity: 40,
  };
  const expected = createDrivenMotion(options).advance(1);
  for (const count of [30, 60, 120, 1000]) {
    const driver = createDrivenMotion(options);
    for (let i = 0; i < count; i++) driver.advance(1 / count);
    near(driver.snapshot().position, expected.position);
    near(driver.snapshot().velocity, expected.velocity);
    near(driver.snapshot().dissipated, expected.dissipated);
  }
  const driver = createDrivenMotion(options);
  [0.001, 0.3, 0.007, 0.192, 0.5].forEach((dt) => driver.advance(dt));
  near(driver.snapshot().position, expected.position);
  near(
    dampMotionValue(dampMotionValue(0, 1, 12, 0.1), 1, 12, 0.3),
    dampMotionValue(0, 1, 12, 0.4),
  );
});

test('bounded timeline exposes projection and interpolation policy; scroll ranges can reverse', () => {
  const table = sampleMotionTimeline({
    motion: {
      spring: { mass: 1, stiffness: 100, damping: 1 },
      coordinate: { unit: 'opacity', from: 0, to: 1 },
      durationSeconds: 1,
    },
    min: 0,
    max: 1,
    sampleCount: 41,
  });
  assert.ok(table.provenance.projectedSamples > 0);
  assert.equal(table.provenance.sampleCount, 41);
  for (let p = -0.1; p < 1.2; p += 0.001) {
    const value = sampleTimelineProgress(table, p);
    assert.ok(value >= 0 && value <= 1);
  }
  assert.equal(sampleTimelineProgress(table, 1), table.values.at(-1));
  near(
    sampleTimelineProgress(table, 0.0125),
    (table.values[0]! + table.values[1]!) / 2,
  );
  near(scrollProgress(25, 0, 100), 0.25);
  near(scrollProgress(25, 100, 0), 0.75);
  assert.equal(scrollProgress(1000, 0, 100), 1);
  assert.throws(() => scrollProgress(1, 0, 0));
  assert.throws(() =>
    sampleMotionTimeline({
      motion: { coordinate: { unit: 'px', from: 0, to: 1 } },
      min: 1,
      max: 0,
    }),
  );
  const trace = analyzeMotionDynamics({
    position: 0,
    steps: [
      { target: 10, dtSeconds: 0.1 },
      { target: -1, dtSeconds: 0.2 },
    ],
  });
  near(trace.balanceResidual, 0);
  assert.equal(trace.samples.length, 2);
  assert.throws(() =>
    analyzeMotionDynamics({ position: 0, steps: [{ dtSeconds: 31 }] }),
  );
});

class FakeTarget {
  listeners = new Map<string, Set<(event: any) => void>>();
  addEventListener(name: string, fn: (event: any) => void) {
    const set = this.listeners.get(name) ?? new Set();
    set.add(fn);
    this.listeners.set(name, set);
  }
  removeEventListener(name: string, fn: (event: any) => void) {
    this.listeners.get(name)?.delete(fn);
  }
  emit(name: string, event: unknown = {}) {
    for (const fn of this.listeners.get(name) ?? []) fn(event);
  }
  count() {
    return [...this.listeners.values()].reduce((n, set) => n + set.size, 0);
  }
}
function environment(
  permission: () => Promise<'granted' | 'denied'> = async () => 'granted',
) {
  const doc = Object.assign(new FakeTarget(), { hidden: false });
  const media = Object.assign(new FakeTarget(), { matches: false });
  const orientation = Object.assign(new FakeTarget(), { angle: 0 });
  let calls = 0;
  const win = Object.assign(new FakeTarget(), {
    document: doc,
    screen: { orientation },
    isSecureContext: true,
    matchMedia: () => media,
    DeviceOrientationEvent: {
      requestPermission: () => {
        calls++;
        return permission();
      },
    },
  });
  const controller = createDeviceTiltController({
    window: win as unknown as Window,
    document: doc as unknown as Document,
  });
  return { doc, media, win, orientation, controller, calls: () => calls };
}

test('screen mapping respects quarter rotations, calibration, wrap and bounds', () => {
  const current = { beta: 15, gamma: 30 },
    baseline = { beta: 0, gamma: 0 };
  for (const [angle, x, y] of [
    [0, 1, 0.5],
    [90, 0.5, -1],
    [180, -1, -0.5],
    [270, -0.5, 1],
  ]) {
    const actual = mapDeviceTilt(current, baseline, angle!);
    near(actual.x, x!);
    near(actual.y, y!);
  }
  near(
    mapDeviceTilt({ beta: -179, gamma: 0 }, { beta: 179, gamma: 0 }, 0).y,
    2 / 30,
  );
  assert.equal(mapDeviceTilt({ beta: 90, gamma: 90 }, baseline, 0).x, 1);
});

test('tilt does not prompt on construction, handles denial, and removes every listener', async () => {
  const e = environment(async () => 'denied');
  assert.equal(e.calls(), 0);
  assert.equal(e.win.listeners.get('deviceorientation')?.size ?? 0, 0);
  assert.equal(await e.controller.requestFromUserGesture(), 'denied');
  assert.equal(e.calls(), 1);
  assert.equal(e.controller.sample(1).x, 0);
  e.controller.dispose();
  e.controller.dispose();
  assert.equal(
    e.win.count() + e.doc.count() + e.media.count() + e.orientation.count(),
    0,
  );
  assert.equal(await e.controller.requestFromUserGesture(), 'disposed');
});

test('latest-only input damps per elapsed second and suspends/recalibrates hidden or reduced motion', async () => {
  const e = environment();
  assert.equal(await e.controller.requestFromUserGesture(), 'active');
  e.win.emit('deviceorientation', { beta: 10, gamma: 5 });
  assert.equal(e.controller.sample(0).x, 0);
  e.win.emit('deviceorientation', { beta: 10, gamma: -25 });
  e.win.emit('deviceorientation', { beta: 10, gamma: 35 });
  near(e.controller.sample(0.1).x, 1 - Math.exp(-1.2));
  assert.ok(e.controller.sample(0.1).rotateY <= 8);
  e.doc.hidden = true;
  e.doc.emit('visibilitychange');
  assert.equal(e.controller.status, 'paused');
  assert.equal(e.controller.sample(1).x, 0);
  assert.equal(e.win.listeners.get('deviceorientation')!.size, 0);
  e.doc.hidden = false;
  e.doc.emit('visibilitychange');
  e.win.emit('deviceorientation', { beta: 20, gamma: 20 });
  assert.equal(e.controller.sample(1).x, 0);
  e.win.emit('deviceorientation', { beta: 20, gamma: 50 });
  assert.ok(e.controller.sample(0.1).x > 0);
  e.orientation.angle = 90;
  e.orientation.emit('change');
  e.win.emit('deviceorientation', { beta: 40, gamma: 10 });
  assert.equal(e.controller.sample(1).x, 0);
  e.media.matches = true;
  e.media.emit('change');
  assert.equal(e.controller.status, 'paused');
  assert.equal(e.controller.sample(1).x, 0);
  e.controller.dispose();
});

test('pending permission cannot resurrect a disposed controller; reduced motion never prompts', async () => {
  let resolve!: (result: 'granted') => void;
  const e = environment(
    () =>
      new Promise((r) => {
        resolve = r;
      }),
  );
  const pending = e.controller.requestFromUserGesture();
  e.controller.dispose();
  resolve('granted');
  assert.equal(await pending, 'disposed');
  assert.equal(e.win.count(), 0);
  const reduced = environment();
  reduced.media.matches = true;
  assert.equal(await reduced.controller.requestFromUserGesture(), 'paused');
  assert.equal(reduced.calls(), 0);
  reduced.controller.dispose();
});

test('tilt filtering is frame partition independent and ignores invalid sensor samples', async () => {
  const results: number[] = [];
  for (const count of [30, 60, 120]) {
    const e = environment();
    await e.controller.requestFromUserGesture();
    e.win.emit('deviceorientation', { beta: 0, gamma: 0 });
    e.controller.sample(0);
    e.win.emit('deviceorientation', { beta: 0, gamma: 30 });
    e.win.emit('deviceorientation', { beta: null, gamma: 10 });
    e.win.emit('deviceorientation', { beta: 1e308, gamma: 1e308 });
    for (let i = 0; i < count; i++) e.controller.sample(1 / count);
    results.push(e.controller.sample(0).x);
    e.controller.dispose();
  }
  results.forEach((value) => near(value, 1 - Math.exp(-12)));
  assert.equal(dampMotionValue(-1e308, 1e308, 12, 0), -1e308);
  assert.ok(Number.isFinite(dampMotionValue(-1e308, 1e308, 12, 1)));
});

test('unsupported context and rejected permission retain a usable neutral fallback', async () => {
  const rejected = environment(async () => {
    throw new Error('NotAllowedError');
  });
  assert.equal(await rejected.controller.requestFromUserGesture(), 'denied');
  assert.equal(rejected.controller.sample(0).lightX, 0);
  rejected.controller.dispose();
  const insecure = environment();
  insecure.win.isSecureContext = false;
  assert.equal(
    await insecure.controller.requestFromUserGesture(),
    'unsupported',
  );
  assert.equal(insecure.calls(), 0);
  insecure.controller.dispose();
});
