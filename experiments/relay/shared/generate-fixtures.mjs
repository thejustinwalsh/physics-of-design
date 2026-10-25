import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export const SEED = 20261024;
export const NOW = '2026-10-24T18:00:00.000Z';
const ROOT = path.dirname(fileURLToPath(import.meta.url));
const START = Date.parse(NOW) - 4 * 60 * 60 * 1000;
const iso = (ms) => new Date(ms).toISOString();
const id = (prefix, n, length = 3) => `${prefix}-${String(n).padStart(length, '0')}`;
const sha = (value) => createHash('sha256').update(value).digest('hex');
function random(seed) {
  let value = seed >>> 0;
  return () => { value ^= value << 13; value ^= value >>> 17; value ^= value << 5; return (value >>> 0) / 4294967296; };
}

/** @returns {import('./types').RelayFixture} */
export function generateFixtures(seed = SEED) {
  if (!Number.isSafeInteger(seed) || seed <= 0 || seed > 0xffffffff) throw new Error('seed must be an unsigned nonzero 32-bit integer');
  const next = random(seed);
  const pick = (lo, hi) => lo + Math.floor(next() * (hi - lo + 1));
  const teamNames = ['Core Commerce', 'Platform', 'Identity', 'Data Systems', 'Delivery', 'Developer Experience'];
  const personNames = ['Ari Vale', 'Mina Chen', 'Sam Okafor', 'Noor Ellis', 'Jules Park', 'Rowan Silva', 'Ira Chen', 'Tess Morgan', 'Alex Reed', 'Remy Bello', 'Uma Patel', 'Lee Reyes', 'Kai Tan', 'Sasha Liu', 'Indra Cole', 'Emery Fox', 'Robin Diaz', 'Drew Hart'];
  const teams = teamNames.map((name, i) => ({ id: id('team', i + 1, 2), name, memberIds: [0, 1, 2].map(j => id('member', i * 3 + j + 1, 2)) }));
  const members = personNames.map((name, i) => ({ id: id('member', i + 1, 2), name, initials: name.split(' ').map(s => s[0]).join(''), teamId: teams[Math.floor(i / 3)].id, role: i % 3 === 0 ? 'On-call SRE' : 'Service engineer' }));
  const named = ['checkout-api', 'inventory-cache', 'payments-adapter', 'pricing-api', 'order-worker', 'api-gateway', 'session-store', 'identity-api', 'search-index', 'catalog-api', 'shipping-router', 'notification-worker'];
  const nouns = ['account', 'basket', 'billing', 'cache', 'catalog', 'delivery', 'event', 'fraud', 'ledger', 'media', 'order', 'profile', 'queue', 'recommendation', 'report', 'search', 'stock', 'tax'];
  const services = Array.from({ length: 120 }, (_, i) => ({
    id: id('service', i + 1), name: named[i] ?? `${nouns[(i - 12) % nouns.length]}-${['api', 'worker', 'store', 'router', 'sync', 'edge'][Math.floor((i - 12) / nouns.length)]}-${String(Math.floor((i - 12) / nouns.length) + 1).padStart(2, '0')}`,
    description: i === 0 ? 'Coordinates basket validation, stock reservations and payment authorization.' : i === 1 ? 'Caches stock availability and reservation lookups for checkout.' : 'Synthetic service in the Relay demonstration environment.',
    teamId: teams[i < 2 ? 0 : i % 6].id, tier: i < 12 ? 1 : i < 60 ? 2 : 3,
    environment: i < 100 ? 'production' : 'staging', region: ['us-east-1', 'eu-west-1', 'ap-south-1'][i % 3],
    version: `v${2 + i % 4}.${i % 13}.${i % 9}`, sloTarget: i < 12 ? 99.95 : 99.9,
    p95TargetMs: i === 0 ? 450 : i === 1 ? 120 : 200 + (i % 6) * 50,
    dependencyIds: i === 0 ? ['service-002', 'service-003', 'service-004'] : i === 1 ? [] : [id('service', 1 + (i + 7) % 120)].filter(x => x !== id('service', i + 1)),
  }));
  const buckets = Array.from({ length: 48 }, (_, index) => ({ index, startAt: iso(START + index * 300000), endAt: iso(START + (index + 1) * 300000) }));
  const serviceSeries = services.map((service, i) => ({ serviceId: service.id, buckets: buckets.map(b => {
    const affected = i < 22 && b.index >= (i < 2 ? 36 : 30 + i % 12);
    const base = i < 2 ? [220, 48][i] : 80 + i % 8 * 22;
    const rawP95 = Math.round(base * (affected ? (i < 2 ? 5.2 : 2.3) : 1) * (0.86 + next() * 0.28));
    const p95Ms = i === 0 && b.index === 47 ? 1850 : i === 1 && b.index === 47 ? 1340 : affected ? Math.max(rawP95, service.p95TargetMs + 20) : rawP95;
    const requestCount = pick(1600, 14000);
    const errorCount = Math.floor(requestCount * (affected ? 0.025 + next() * 0.020 : next() * 0.0015));
    return { ...b, requestCount, errorCount, p50Ms: Math.round(p95Ms * 0.36), p95Ms, p99Ms: Math.round(p95Ms * 1.42) };
  }) }));
  // Fleet quantiles are separately authored synthetic observations; never average service p95s.
  const fleetSeries = buckets.map(b => ({ ...b,
    requestCount: serviceSeries.reduce((n, s) => n + s.buckets[b.index].requestCount, 0),
    errorCount: serviceSeries.reduce((n, s) => n + s.buckets[b.index].errorCount, 0),
    p50Ms: b.index >= 36 ? 118 : 94,
    p95Ms: b.index === 47 ? 862 : Math.round((b.index >= 36 ? 780 : 278) * (0.94 + next() * 0.12)),
    p99Ms: b.index >= 36 ? 2440 : 520,
  }));
  const incidents = Array.from({ length: 36 }, (_, i) => {
    const status = i < 10 ? 'triggered' : i < 18 ? 'acknowledged' : i < 22 ? 'investigating' : 'resolved';
    const openedAt = i === 0 ? buckets[36].startAt : iso(START + (8 + i % 25) * 300000);
    const acknowledgedAt = status === 'triggered' ? null : iso(Date.parse(openedAt) + 120000);
    const resolvedAt = status === 'resolved' ? iso(Date.parse(openedAt) + 1800000) : null;
    const incidentId = `INC-${1042 + i}`;
    const assigneeId = status === 'triggered' ? null : teams[i < 2 ? 0 : i % 6].memberIds[0];
    const timeline = [{ id: `${incidentId}-event-1`, at: openedAt, kind: 'detected', actorId: null, message: 'Demo threshold exceeded; incident opened.' }];
    if (assigneeId) timeline.push({ id: `${incidentId}-event-2`, at: acknowledgedAt, kind: 'acknowledged', actorId: assigneeId, message: 'Acknowledged by the on-call engineer.' });
    if (status === 'investigating') timeline.push({ id: `${incidentId}-event-3`, at: iso(Date.parse(openedAt) + 240000), kind: 'investigating', actorId: assigneeId, message: 'Investigation started.' });
    if (resolvedAt) timeline.push({ id: `${incidentId}-event-3`, at: resolvedAt, kind: 'resolved', actorId: assigneeId, message: 'Demo mitigation verified; incident resolved.' });
    return { id: incidentId, title: i === 0 ? 'Checkout tail latency elevated' : `${services[i].name}: ${['latency above target', 'error budget burn', 'queue saturation'][i % 3]}`,
      severity: i < 6 ? 'P1' : i < 20 ? 'P2' : 'P3', status,
      serviceIds: i === 0 ? ['service-001', 'service-002'] : [services[i].id], teamId: teams[i < 2 ? 0 : i % 6].id, assigneeId,
      openedAt, acknowledgedAt, resolvedAt,
      summary: i === 0 ? 'Checkout p95 reached 1,850 ms against a 450 ms target. Inventory-cache pool waits dominate the linked diagnostic trace. This is a synthetic incident.' : 'Generated operational scenario for local interaction testing; no live telemetry.',
      traceIds: [], alertRuleIds: i < 24 ? [id('alert', i + 1)] : [], timeline };
  });
  const traces = Array.from({ length: 1000 }, (_, i) => {
    const service = services[i % services.length];
    const primary = i === 0;
    const startedAt = primary ? '2026-10-24T17:52:18.000Z' : iso(START + Math.floor(next() * 14340000));
    const incident = incidents.find(x => x.serviceIds.includes(service.id) && Date.parse(x.openedAt) <= Date.parse(startedAt));
    const durationMs = primary ? 2180 : pick(28, incident && incident.status !== 'resolved' ? 1800 : 520);
    const error = primary || Boolean(incident && next() < 0.35);
    const spans = primary ? [
      { id: 'span-1', parentId: null, serviceId: 'service-001', operation: 'POST /v1/checkout', offsetMs: 0, durationMs: 2180, status: 'error', attributes: { 'http.status_code': 504, 'demo': true } },
      { id: 'span-2', parentId: 'span-1', serviceId: 'service-004', operation: 'pricing.calculate', offsetMs: 55, durationMs: 105, status: 'ok', attributes: { 'cache.hit': true } },
      { id: 'span-3', parentId: 'span-1', serviceId: 'service-002', operation: 'inventory.reserve', offsetMs: 180, durationMs: 1760, status: 'error', attributes: { 'pool.wait_ms': 1340, 'pool.active': 64, 'pool.limit': 64, 'error.type': 'PoolWaitTimeout' } },
      { id: 'span-4', parentId: 'span-3', serviceId: 'service-002', operation: 'cache.pool.acquire', offsetMs: 210, durationMs: 1340, status: 'error', attributes: { 'demo.diagnostic': 'connection pool saturation' } },
      { id: 'span-5', parentId: 'span-1', serviceId: 'service-003', operation: 'payments.authorize', offsetMs: 1970, durationMs: 120, status: 'ok', attributes: { 'payment.sandbox': true } },
    ] : [
      { id: `span-${i + 1}-1`, parentId: null, serviceId: service.id, operation: i % 3 === 0 ? 'POST /v1/process' : 'GET /v1/status', offsetMs: 0, durationMs, status: error ? 'error' : 'ok', attributes: { 'http.status_code': error ? 503 : 200, 'demo': true } },
      { id: `span-${i + 1}-2`, parentId: `span-${i + 1}-1`, serviceId: service.dependencyIds[0] ?? service.id, operation: 'dependency.lookup', offsetMs: Math.round(durationMs * 0.1), durationMs: Math.round(durationMs * 0.7), status: error ? 'error' : 'ok', attributes: { 'cache.hit': !error } },
    ];
    const traceId = id('trace', i + 1, 6);
    if (incident) incident.traceIds.push(traceId);
    return { id: traceId, serviceId: service.id, incidentId: incident?.id ?? null, startedAt, durationMs, status: error ? 'error' : 'ok', method: primary || i % 3 === 0 ? 'POST' : 'GET', route: primary ? '/v1/checkout' : i % 3 === 0 ? '/v1/process' : '/v1/status', region: service.region, spans };
  });
  const alertRules = Array.from({ length: 24 }, (_, i) => ({ id: id('alert', i + 1), name: i === 0 ? 'Checkout p95 above 450 ms' : `${services[i].name} ${i % 2 ? 'error rate' : 'p95 latency'}`,
    serviceId: services[i].id, teamId: services[i].teamId, metric: i % 2 ? 'errorRate' : 'p95Ms', operator: 'gt', threshold: i % 2 ? 0.02 : services[i].p95TargetMs,
    windowMinutes: 5, severity: incidents[i].severity, enabled: i !== 23, status: i === 23 ? 'muted' : incidents[i].status === 'resolved' ? 'healthy' : 'firing', incidentId: incidents[i].status === 'resolved' ? null : incidents[i].id }));
  return { schemaVersion: 1, demo: true, seed, now: NOW,
    provenance: { creator: 'Design Theory Relay experiment', license: 'MIT', method: 'Original xorshift32 fixture generation with authored diagnostic scenario; stable UTC clock.', privacy: 'All organizations, services, people, incidents and measurements are synthetic; no telemetry or personal data was used.' },
    primaryFlow: { serviceId: 'service-001', dependencyId: 'service-002', incidentId: 'INC-1042', traceId: 'trace-000001', alertRuleId: 'alert-001', assigneeId: 'member-01' },
    teams, members, services, incidents, traces, alertRules, serviceSeries, fleetSeries,
    auditLog: [{ id: 'audit-0001', at: '2026-10-24T17:59:00.000Z', actorId: 'member-04', action: 'alert.updated', entityType: 'alert', entityId: 'alert-023', detail: 'Demo rule window retained at five minutes.' }],
    savedViews: [
      { id: 'view-production', name: 'Production · slowest services', route: '/services', filters: { environment: 'production' }, sort: { key: 'p95Ms', direction: 'desc' }, timeRangeMinutes: 60 },
      { id: 'view-unassigned', name: 'Unassigned incidents', route: '/incidents', filters: { assignee: 'unassigned', status: 'active' }, sort: { key: 'severity', direction: 'asc' }, timeRangeMinutes: 240 },
    ] };
}

export function validateFixtures(data) {
  const assert = (ok, message) => { if (!ok) throw new Error(message); };
  for (const [key, count] of Object.entries({ services: 120, incidents: 36, traces: 1000, alertRules: 24, teams: 6, members: 18, fleetSeries: 48 })) assert(data[key].length === count, `${key} count`);
  const ids = (rows) => new Set(rows.map(x => x.id));
  for (const key of ['services', 'incidents', 'traces', 'alertRules', 'teams', 'members']) assert(ids(data[key]).size === data[key].length, `${key} duplicate id`);
  const serviceIds = ids(data.services), teamIds = ids(data.teams), memberIds = ids(data.members), incidentIds = ids(data.incidents), traceIds = ids(data.traces), alertIds = ids(data.alertRules);
  assert(new Set(data.services.map(x => x.name)).size === 120, 'duplicate service name');
  for (const service of data.services) { assert(teamIds.has(service.teamId), 'service team'); for (const dep of service.dependencyIds) assert(serviceIds.has(dep), 'dependency'); }
  for (const series of data.serviceSeries) {
    assert(serviceIds.has(series.serviceId) && series.buckets.length === 48, 'series shape');
    for (const b of series.buckets) assert(b.errorCount <= b.requestCount && b.p50Ms <= b.p95Ms && b.p95Ms <= b.p99Ms && Date.parse(b.endAt) - Date.parse(b.startAt) === 300000, 'metric bounds');
  }
  for (const incident of data.incidents) {
    assert(teamIds.has(incident.teamId) && (!incident.assigneeId || memberIds.has(incident.assigneeId)), 'incident owner');
    assert((incident.status === 'resolved') === Boolean(incident.resolvedAt), 'resolution state');
    for (const x of incident.serviceIds) assert(serviceIds.has(x), 'incident service');
    for (const x of incident.traceIds) assert(traceIds.has(x), 'incident trace');
    for (const x of incident.alertRuleIds) assert(alertIds.has(x), 'incident alert');
  }
  for (const trace of data.traces) {
    assert(serviceIds.has(trace.serviceId) && (!trace.incidentId || incidentIds.has(trace.incidentId)), 'trace relation');
    const spanIds = ids(trace.spans), byId = new Map(trace.spans.map(s => [s.id, s]));
    for (const span of trace.spans) {
      assert(serviceIds.has(span.serviceId) && (!span.parentId || spanIds.has(span.parentId)), 'span relation');
      assert(span.offsetMs >= 0 && span.durationMs > 0 && span.offsetMs + span.durationMs <= trace.durationMs, 'span containment');
      const parent = byId.get(span.parentId);
      if (parent) assert(span.offsetMs >= parent.offsetMs && span.offsetMs + span.durationMs <= parent.offsetMs + parent.durationMs, 'parent containment');
    }
    if (trace.incidentId) assert(data.incidents.find(x => x.id === trace.incidentId).traceIds.includes(trace.id), 'bidirectional trace');
  }
  for (const rule of data.alertRules) assert(serviceIds.has(rule.serviceId) && teamIds.has(rule.teamId) && (!rule.incidentId || incidentIds.has(rule.incidentId)) && (rule.status !== 'muted' || !rule.enabled), 'alert relation');
  assert(data.traces[0].incidentId === 'INC-1042' && data.incidents[0].traceIds.includes('trace-000001'), 'primary flow');
  assert(data.incidents.filter(x => x.status !== 'resolved').length === 22, 'initial active count');
  return { counts: { services: 120, incidents: 36, activeIncidents: 22, traces: 1000, alertRules: 24, teams: 6, buckets: 48 }, valid: true };
}

async function main() {
  const data = generateFixtures();
  const validation = validateFixtures(data);
  const serialized = `${JSON.stringify(data, null, 2)}\n`;
  const file = path.join(ROOT, 'fixtures.json');
  const integrity = { schemaVersion: 1, seed: SEED, now: NOW, algorithm: 'xorshift32-v1', fixtureSha256: sha(serialized), ...validation };
  const metadata = `${JSON.stringify(integrity, null, 2)}\n`;
  if (process.argv.includes('--check')) {
    if (await readFile(file, 'utf8') !== serialized || await readFile(path.join(ROOT, 'fixture-integrity.json'), 'utf8') !== metadata) throw new Error('Frozen fixture differs from deterministic generator');
    console.log(JSON.stringify({ ...integrity, mode: 'checked' }));
  } else {
    await writeFile(file, serialized);
    await writeFile(path.join(ROOT, 'fixture-integrity.json'), metadata);
    console.log(JSON.stringify({ ...integrity, mode: 'generated' }));
  }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
