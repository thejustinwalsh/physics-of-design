import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
// native/package.json is CommonJS; use its actual package boundary under tsx.
const { createObservationScheduler } = createRequire(import.meta.url)(
  '../native/observation-scheduler.ts',
) as typeof import('../native/observation-scheduler.js');

function clock() {
  let id = 0;
  const jobs = new Map<number, () => void>();
  const delays: number[] = [];
  return {
    jobs, delays,
    set(fn: () => void, delay: number) {
      delays.push(delay);
      jobs.set(++id, fn);
      return id;
    },
    clear(job: unknown) { jobs.delete(job as number); },
    tick() {
      const entry = jobs.entries().next().value;
      assert.ok(entry, 'expected a scheduled capture');
      jobs.delete(entry[0]);
      entry[1]();
    },
  };
}
const flush = () => new Promise<void>(resolve => setImmediate(resolve));

test('bursts and continuous events coalesce without resetting the capture deadline', async () => {
  const c = clock();
  let captures = 0;
  const s = createObservationScheduler(async () => { captures++; }, 80, c);
  for (let i = 0; i < 100; i++) s.schedule();
  assert.equal(c.jobs.size, 1);
  assert.deepEqual(c.delays, [80]);
  c.tick(); await flush();
  assert.equal(captures, 1);
  for (let i = 0; i < 20; i++) { s.schedule(); c.tick(); await flush(); }
  assert.equal(captures, 21);
  s.stop();
});

test('in-flight work is serial and events during capture produce one later batch', async () => {
  const c = clock();
  let release!: () => void, captures = 0;
  const s = createObservationScheduler(() => {
    captures++;
    return new Promise<void>(resolve => { release = resolve; });
  }, 80, c);
  s.schedule(); c.tick(); await flush();
  for (let i = 0; i < 20; i++) s.schedule();
  assert.equal(c.jobs.size, 0);
  release(); await flush();
  assert.equal(c.jobs.size, 1);
  c.tick(); await flush();
  assert.equal(captures, 2);
  s.stop(); release(); await flush();
  assert.equal(c.jobs.size, 0);
});

test('stopping cancels pending work and late completion cannot rearm it', async () => {
  const c = clock();
  let captures = 0;
  const s = createObservationScheduler(async () => { captures++; }, 80, c);
  s.schedule(); s.stop();
  assert.equal(c.jobs.size, 0);
  s.schedule(); await flush();
  assert.equal(captures, 0);
});

test('effect cleanup and setup can restart the same stable scheduler', async () => {
  const c = clock();
  let captures = 0;
  const s = createObservationScheduler(async () => { captures++; }, 80, c);
  s.start(); s.schedule(); s.stop();
  s.start(); s.schedule();
  assert.equal(c.jobs.size, 1);
  c.tick(); await flush();
  assert.equal(captures, 1);
  s.stop();
});

test('restart waits for an old in-flight batch and preserves one fresh pending capture', async () => {
  const c = clock();
  let release!: () => void, captures = 0;
  const s = createObservationScheduler(() => {
    captures++;
    return new Promise<void>(resolve => { release = resolve; });
  }, 80, c);
  s.schedule(); c.tick(); await flush();
  s.stop(); s.start();
  for (let i = 0; i < 20; i++) s.schedule();
  assert.equal(c.jobs.size, 0);
  assert.equal(captures, 1);
  release(); await flush();
  assert.equal(c.jobs.size, 1);
  c.tick(); await flush();
  assert.equal(captures, 2);
  s.stop(); release(); await flush();
  assert.equal(c.jobs.size, 0);
});

test('rejected and synchronously throwing captures report errors and remain schedulable', async () => {
  const c = clock(), errors: unknown[] = [];
  let attempts = 0;
  const s = createObservationScheduler(() => {
    attempts++;
    if (attempts === 1) throw new Error('synchronous capture failure');
    if (attempts === 2) return Promise.reject(new Error('asynchronous capture failure'));
    return Promise.resolve();
  }, 80, c, error => { errors.push(error); });
  for (let i = 0; i < 3; i++) { s.schedule(); c.tick(); await flush(); }
  assert.equal(attempts, 3);
  assert.deepEqual(errors.map(error => (error as Error).message), [
    'synchronous capture failure', 'asynchronous capture failure',
  ]);
  s.stop();
});

test('a diagnostic callback failure does not break scheduler recovery', async () => {
  const c = clock();
  let attempts = 0;
  const s = createObservationScheduler(async () => {
    if (++attempts === 1) throw new Error('capture failure');
  }, 80, c, () => { throw new Error('diagnostic failure'); });
  s.schedule(); c.tick(); await flush();
  s.schedule(); c.tick(); await flush();
  assert.equal(attempts, 2);
  s.stop();
});

test('stop between timer dispatch and deferred capture prevents starting new work', async () => {
  const c = clock();
  let captures = 0;
  const s = createObservationScheduler(async () => { captures++; }, 80, c);
  s.schedule(); c.tick(); s.stop(); await flush();
  assert.equal(captures, 0);
  assert.equal(c.jobs.size, 0);
});
