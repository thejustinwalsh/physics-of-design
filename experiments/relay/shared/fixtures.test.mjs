import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { generateFixtures, validateFixtures, SEED, NOW } from './generate-fixtures.mjs';

test('frozen fixture matches deterministic source and contains the complete diagnostic graph', async () => {
  const actual = JSON.parse(await readFile(new URL('./fixtures.json', import.meta.url), 'utf8'));
  assert.deepEqual(actual, generateFixtures(SEED));
  assert.deepEqual(generateFixtures(SEED), generateFixtures(SEED));
  assert.notDeepEqual(generateFixtures(SEED + 1).serviceSeries, actual.serviceSeries);
  assert.equal(actual.now, NOW);
  assert.equal(validateFixtures(actual).valid, true);
  assert.equal(actual.incidents.filter(x => x.status !== 'resolved' && x.assigneeId === null).length, 10);
  assert.equal(actual.serviceSeries[0].buckets[47].p95Ms, 1850);
  assert.equal(actual.services[0].p95TargetMs, 450);
  const trace = actual.traces.find(x => x.id === actual.primaryFlow.traceId);
  assert.equal(trace.incidentId, actual.primaryFlow.incidentId);
  assert.equal(trace.durationMs, 2180);
  assert.equal(trace.spans.find(x => x.operation === 'cache.pool.acquire').durationMs, 1340);
  assert.equal(new Set(actual.services.map(x => x.name)).size, 120);
  for (const bucket of actual.fleetSeries) {
    assert.equal(bucket.requestCount, actual.serviceSeries.reduce((n, s) => n + s.buckets[bucket.index].requestCount, 0));
    assert.equal(bucket.errorCount, actual.serviceSeries.reduce((n, s) => n + s.buckets[bucket.index].errorCount, 0));
  }
});

test('fixture validation rejects broken relationships, impossible timing and invalid metrics', () => {
  const brokenLink = generateFixtures(); brokenLink.traces[0].incidentId = 'missing';
  assert.throws(() => validateFixtures(brokenLink), /trace relation/);
  const brokenSpan = generateFixtures(); brokenSpan.traces[0].spans[3].durationMs = 99999;
  assert.throws(() => validateFixtures(brokenSpan), /span containment/);
  const brokenMetric = generateFixtures(); brokenMetric.serviceSeries[0].buckets[0].errorCount = Infinity;
  assert.throws(() => validateFixtures(brokenMetric), /metric bounds/);
  assert.throws(() => generateFixtures(0), /seed/);
});
