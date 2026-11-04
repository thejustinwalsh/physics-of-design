import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  initialState,
  mutate,
  active,
  latest,
  serviceStatus,
  rowsFor,
  validateRule,
  restore,
} from '../src/model.mjs';
const fixture = JSON.parse(
  fs.readFileSync(
    new URL(
      '../../../../experiments/relay/shared/fixtures.json',
      import.meta.url,
    ),
  ),
);
test('primary flow is linked, deterministic and idempotent', () => {
  let s = initialState(fixture);
  const telemetry = JSON.stringify(s.data.serviceSeries);
  assert.equal(active(s).length, 22);
  assert.equal(active(s).filter((i) => !i.assigneeId).length, 10);
  for (const a of [
    { type: 'assign', member: 'member-01' },
    { type: 'ack' },
    { type: 'investigate' },
    {
      type: 'note',
      note: 'Raised the demo inventory-cache pool limit; verifying recovery.',
    },
    {
      type: 'resolve',
      note: 'Synthetic mitigation verified; follow-up pool sizing review scheduled.',
    },
  ])
    s = mutate(s, { id: 'INC-1042', ...a });
  const i = s.data.incidents[0];
  assert.equal(active(s).length, 21);
  assert.equal(active(s).filter((i) => !i.assigneeId).length, 9);
  assert.equal(i.assigneeId, 'member-01');
  assert.ok(i.resolvedAt);
  for (const kind of [
    'assigned',
    'acknowledged',
    'investigating',
    'note',
    'resolved',
  ]) {
    assert.equal(i.timeline.filter((e) => e.kind === kind).length, 1);
    assert.equal(s.data.auditLog.filter((e) => e.action === kind).length, 1);
  }
  assert.equal(s.data.alertRules[0].incidentId, null);
  assert.equal(s.data.alertRules[0].status, 'healthy');
  assert.equal(s.data.incidents[1].status, fixture.incidents[1].status);
  assert.equal(JSON.stringify(s.data.serviceSeries), telemetry);
  assert.equal(latest(s, 'service-001').p95Ms, 1850);
  assert.equal(serviceStatus(s, s.data.services[0]), 'critical');
  assert.strictEqual(mutate(s, { type: 'ack', id: i.id }), s);
  assert.strictEqual(
    mutate(s, { type: 'resolve', id: i.id, note: 'again' }),
    s,
  );
  assert.deepEqual(restore(JSON.stringify(s), fixture), s);
});
test('rule validation and explicit evaluation preserve history', () => {
  let s = initialState(fixture);
  assert.throws(() => mutate(s, { type: 'investigate', id: 'INC-1042' }));
  assert.throws(() => mutate(s, { type: 'resolve', id: 'INC-1042', note: '' }));
  assert.ok(
    validateRule(s, { ...s.data.alertRules[0], threshold: Infinity }).threshold,
  );
  assert.ok(
    validateRule(s, {
      ...s.data.alertRules[0],
      metric: 'errorRate',
      threshold: 1.01,
    }).threshold,
  );
  s = mutate(s, { type: 'resolve', id: 'INC-1042', note: 'done' });
  assert.equal(s.data.alertRules[0].status, 'healthy');
  s = mutate(s, { type: 'evaluate' });
  assert.equal(s.data.alertRules[0].status, 'firing');
  assert.notEqual(s.data.alertRules[0].incidentId, 'INC-1042');
  assert.ok(s.data.incidents[0].alertRuleIds.includes('alert-001'));
  const count = s.data.incidents.length;
  s = mutate(s, { type: 'evaluate' });
  assert.equal(s.data.incidents.length, count);
  s = mutate(s, { type: 'toggleRule', id: 'alert-001' });
  assert.equal(s.data.alertRules[0].status, 'muted');
});
test('table sort is numeric and filters stay local to each route', () => {
  let s = initialState(fixture);
  s = mutate(s, {
    type: 'table',
    table: 'services',
    patch: { sort: 'p95Ms', direction: 'desc' },
  });
  const rows = rowsFor(s, 'services');
  assert.ok(rows.every((r, i) => !i || rows[i - 1].p95Ms >= r.p95Ms));
  s = mutate(s, {
    type: 'table',
    table: 'traces',
    patch: { query: 'trace-000001' },
  });
  assert.equal(rowsFor(s, 'traces').length, 1);
  assert.equal(s.tables.services.query, '');
  s = mutate(s, {
    type: 'table',
    table: 'services',
    patch: { query: 'no matches' },
  });
  assert.equal(rowsFor(s, 'services').length, 0);
});
test('service changes reset active event links and reset restores exact fixture', () => {
  let s = initialState(fixture);
  s = mutate(s, {
    type: 'saveRule',
    rule: { ...s.data.alertRules[0], serviceId: 'service-003' },
  });
  assert.equal(s.data.alertRules[0].incidentId, null);
  assert.deepEqual(mutate(s, { type: 'reset', fixture }).data, fixture);
  assert.throws(() => restore('{broken', fixture));
});
test('disabling a rule through its editor mutes its event and preserves incident history', () => {
  let s = initialState(fixture);
  s = mutate(s, {
    type: 'saveRule',
    rule: { ...s.data.alertRules[0], enabled: false },
  });
  assert.equal(s.data.alertRules[0].status, 'muted');
  assert.equal(s.data.alertRules[0].incidentId, null);
  assert.ok(s.data.incidents[0].alertRuleIds.includes('alert-001'));
  s = mutate(s, {
    type: 'saveRule',
    rule: { ...s.data.alertRules[0], enabled: true },
  });
  assert.equal(s.data.alertRules[0].status, 'healthy');
});
test('trace selection and expanded inventory rows survive persistence without changing operator history', () => {
  let s = initialState(fixture);
  s = mutate(s, { type: 'span', traceId: 'trace-000001', spanId: 'span-4' });
  s = mutate(s, {
    type: 'table',
    table: 'services',
    patch: { expanded: ['service-001'] },
  });
  const r = restore(JSON.stringify(s), fixture);
  assert.equal(r.traceSelections['trace-000001'], 'span-4');
  assert.deepEqual(r.tables.services.expanded, ['service-001']);
  assert.equal(r.sequence, 0);
  assert.deepEqual(r.data.auditLog, fixture.auditLog);
  assert.throws(() =>
    mutate(s, { type: 'span', traceId: 'trace-000001', spanId: 'not-a-span' }),
  );
});
