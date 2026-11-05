// Canonical local state. Workflow actions never rewrite frozen telemetry.
export const namespace = 'design-theory-relay-integration-v1';
export const emptyTable = () => ({
  query: '',
  status: 'all',
  region: 'all',
  assignee: 'all',
  sort: 'id',
  direction: 'asc',
  page: 1,
  pageSize: 15,
  selected: [],
  expanded: [],
});
export function initialState(fixture) {
  return {
    version: 1,
    sequence: 0,
    localIncident: 1,
    localRule: 1,
    data: JSON.parse(JSON.stringify(fixture)),
    preferences: {
      theme: 'dark',
      palette: 'graphite',
      density: 'comfortable',
      reducedMotion: 'system',
      timezone: 'UTC',
      textScale: 1,
    },
    context: { range: 60, bucket: 47, team: 'all', environment: 'all' },
    tables: Object.fromEntries(
      ['services', 'incidents', 'traces', 'alerts'].map((k) => [
        k,
        emptyTable(),
      ]),
    ),
    recovery: 'ready',
    traceSelections: {},
  };
}
export const active = (s) =>
  s.data.incidents.filter((i) => i.status !== 'resolved');
export function latest(s, id) {
  return s.data.serviceSeries.find((x) => x.serviceId === id)?.buckets.at(-1);
}
export function serviceStatus(s, service) {
  const b = latest(s, service.id);
  return b.p95Ms > service.p95TargetMs * 2 ||
    b.errorCount / b.requestCount > 0.05
    ? 'critical'
    : b.p95Ms > service.p95TargetMs || b.errorCount / b.requestCount > 0.01
      ? 'degraded'
      : 'healthy';
}
export function validateRule(s, r) {
  const errors = /** @type {Record<string,string>} */ ({});
  if (!r.name?.trim()) errors.name = 'Enter a rule name.';
  if (!s.data.services.some((x) => x.id === r.serviceId))
    errors.serviceId = 'Choose an existing service.';
  if (!s.data.teams.some((x) => x.id === r.teamId))
    errors.teamId = 'Choose a routing team.';
  if (!['p95Ms', 'errorRate'].includes(r.metric))
    errors.metric = 'Choose a metric.';
  if (
    !Number.isFinite(r.threshold) ||
    (r.metric === 'p95Ms'
      ? r.threshold <= 0
      : r.threshold < 0 || r.threshold > 1)
  )
    errors.threshold =
      r.metric === 'p95Ms'
        ? 'Latency must be finite and greater than zero.'
        : 'Error rate must be between 0 and 100%.';
  if (![5, 10, 15].includes(r.windowMinutes))
    errors.windowMinutes = 'Choose 5, 10 or 15 minutes.';
  if (!['P1', 'P2', 'P3'].includes(r.severity))
    errors.severity = 'Choose P1, P2 or P3.';
  return errors;
}
export function mutate(state, action) {
  if (action.type === 'reset') return initialState(action.fixture);
  const s = JSON.parse(JSON.stringify(state));
  let committed = false;
  let eventTime = null;
  const tick = () => {
    if (eventTime) return eventTime;
    s.sequence++;
    const times = s.data.incidents
      .flatMap((i) => [i.openedAt, ...i.timeline.map((e) => e.at)])
      .map((x) => Date.parse(x));
    eventTime = new Date(
      Math.max(
        Date.parse(s.data.now) + s.sequence * 1000,
        ...times.map((t) => t + 1000),
      ),
    ).toISOString();
    return eventTime;
  };
  const audit = (action, entityType, entityId, detail) => {
    committed = true;
    s.data.auditLog.push({
      id: `local-audit-${s.sequence + 1}-${s.data.auditLog.length}`,
      at: tick(),
      actorId: 'member-01',
      action,
      entityType,
      entityId,
      detail,
    });
  };
  const incident = s.data.incidents.find((i) => i.id === action.id);
  const event = (kind, message) => {
    incident.timeline.push({
      id: `${incident.id}-local-${s.sequence + 1}-${kind}`,
      at: tick(),
      kind,
      actorId: 'member-01',
      message,
    });
    audit(kind, 'incident', incident.id, message);
  };
  switch (action.type) {
    case 'assign':
      if (!incident) throw Error('Incident not found');
      if (!s.data.members.some((m) => m.id === action.member))
        throw Error('Member not found');
      if (incident.assigneeId === action.member) break;
      incident.assigneeId = action.member;
      event(
        'assigned',
        `Assigned to ${s.data.members.find((m) => m.id === action.member).name}.`,
      );
      break;
    case 'ack':
      if (
        !incident ||
        incident.status === 'resolved' ||
        incident.acknowledgedAt
      )
        break;
      incident.acknowledgedAt = tick();
      incident.status = 'acknowledged';
      event('acknowledged', 'Acknowledged locally.');
      break;
    case 'investigate':
      if (
        !incident ||
        incident.status === 'resolved' ||
        incident.status === 'investigating'
      )
        break;
      if (!incident.acknowledgedAt)
        throw Error('Acknowledge before investigating.');
      incident.status = 'investigating';
      event('investigating', 'Investigation started.');
      break;
    case 'note':
      if (!incident) throw Error('Incident not found');
      if (!action.note?.trim()) throw Error('Enter a note.');
      event('note', action.note.trim());
      break;
    case 'resolve':
      if (!incident || incident.status === 'resolved') break;
      if (!action.note?.trim()) throw Error('A resolution note is required.');
      incident.status = 'resolved';
      incident.resolvedAt = tick();
      event('resolved', action.note.trim());
      for (const r of s.data.alertRules)
        if (r.incidentId === incident.id) {
          r.incidentId = null;
          r.status = r.enabled ? 'healthy' : 'muted';
        }
      break;
    case 'toggleRule': {
      const r = s.data.alertRules.find((r) => r.id === action.id);
      if (!r) throw Error('Rule not found');
      r.enabled = !r.enabled;
      r.status = r.enabled ? 'healthy' : 'muted';
      r.incidentId = null;
      audit(
        'alert.toggled',
        'alert',
        r.id,
        `${r.enabled ? 'Enabled; evaluate explicitly' : 'Muted'} locally.`,
      );
      break;
    }
    case 'saveRule': {
      const errors = validateRule(s, action.rule);
      if (Object.keys(errors).length)
        throw Error(Object.values(errors).join(' '));
      const old = s.data.alertRules.find((r) => r.id === action.rule.id);
      const r = {
        ...action.rule,
        name: action.rule.name.trim(),
        operator: 'gt',
      };
      if (old) {
        Object.assign(
          old,
          r,
          !r.enabled
            ? { incidentId: null, status: 'muted' }
            : old.serviceId !== r.serviceId || old.enabled !== r.enabled
              ? { incidentId: null, status: 'healthy' }
              : {},
        );
      } else {
        s.localRule++;
        r.id = `local-alert-${s.localRule}`;
        r.incidentId = null;
        r.status = r.enabled ? 'healthy' : 'muted';
        s.data.alertRules.push(r);
      }
      audit('alert.saved', 'alert', r.id, r.name);
      break;
    }
    case 'evaluate': {
      for (const r of s.data.alertRules) {
        if (!r.enabled) {
          r.status = 'muted';
          continue;
        }
        const bs = s.data.serviceSeries
          .find((x) => x.serviceId === r.serviceId)
          .buckets.slice(-r.windowMinutes / 5);
        const value =
          r.metric === 'p95Ms'
            ? Math.max(...bs.map((b) => b.p95Ms))
            : bs.reduce((n, b) => n + b.errorCount, 0) /
              bs.reduce((n, b) => n + b.requestCount, 0);
        const firing = value > r.threshold;
        r.status = firing ? 'firing' : 'healthy';
        if (!firing) {
          r.incidentId = null;
          continue;
        }
        let i = s.data.incidents.find(
          (i) =>
            i.status !== 'resolved' &&
            i.serviceIds.includes(r.serviceId) &&
            i.alertRuleIds.includes(r.id),
        );
        if (!i) {
          const id = `LOCAL-${String(s.localIncident++).padStart(4, '0')}`;
          const at = tick();
          i = {
            id,
            title: `Synthetic evaluation: ${r.name}`,
            severity: r.severity,
            status: 'triggered',
            serviceIds: [r.serviceId],
            teamId: r.teamId,
            assigneeId: null,
            openedAt: at,
            acknowledgedAt: null,
            resolvedAt: null,
            summary: `Explicit local rule evaluation at ${s.data.now}.`,
            traceIds: [],
            alertRuleIds: [r.id],
            timeline: [
              {
                id: `${id}-detected`,
                at,
                kind: 'detected',
                actorId: null,
                message: 'Frozen demo samples exceeded the rule.',
              },
            ],
          };
          s.data.incidents.push(i);
        }
        r.incidentId = i.id;
      }
      audit(
        'alerts.evaluated',
        'alert',
        'all',
        'Evaluated frozen samples: max supplied p95 or weighted error rate.',
      );
      break;
    }
    case 'saveView':
      s.data.savedViews.push({
        ...action.view,
        id: `view-local-${s.sequence + 1}`,
      });
      audit(
        'view.saved',
        'view',
        s.data.savedViews.at(-1).id,
        action.view.name,
      );
      break;
    case 'deleteView':
      s.data.savedViews = s.data.savedViews.filter((v) => v.id !== action.id);
      audit('view.deleted', 'view', action.id, 'Saved view removed.');
      break;
    case 'preferences':
      Object.assign(s.preferences, action.patch);
      audit(
        'preferences.updated',
        'settings',
        'preferences',
        JSON.stringify(action.patch),
      );
      break;
    case 'span': {
      const trace = s.data.traces.find((t) => t.id === action.traceId);
      if (!trace?.spans.some((span) => span.id === action.spanId))
        throw Error('Span not found in this trace.');
      s.traceSelections = {
        ...s.traceSelections,
        [action.traceId]: action.spanId,
      };
      return s;
    }
    case 'context':
      Object.assign(s.context, action.patch);
      if ('team' in action.patch || 'environment' in action.patch)
        for (const table of Object.values(s.tables)) table.page = 1;
      return s;
    case 'table': {
      const t = s.tables[action.table];
      Object.assign(t, action.patch);
      if (
        [
          'query',
          'status',
          'region',
          'assignee',
          'sort',
          'direction',
          'pageSize',
        ].some((k) => k in action.patch)
      )
        t.page = 1;
      return s;
    }
    case 'recovery':
      s.recovery = action.value;
      return s;
    default:
      throw Error('Unknown local action');
  }
  return committed ? s : state;
}
export function rowsFor(s, kind) {
  const t = s.tables[kind];
  let rows = kind === 'alerts' ? s.data.alertRules : s.data[kind];
  rows = rows.map((r) =>
    kind === 'services'
      ? {
          ...r,
          ...latest(s, r.id),
          status: serviceStatus(s, r),
          p95Ms: latest(s, r.id).p95Ms,
          rate: latest(s, r.id).requestCount / 300,
          errorRate: latest(s, r.id).errorCount / latest(s, r.id).requestCount,
        }
      : r,
  );
  rows = rows.filter((r) => {
    const services =
      kind === 'services'
        ? [r]
        : s.data.services.filter((x) =>
            (r.serviceIds ?? [r.serviceId]).includes(x.id),
          );
    return (
      (s.context.team === 'all' ||
        r.teamId === s.context.team ||
        services.some((x) => x.teamId === s.context.team)) &&
      (s.context.environment === 'all' ||
        services.some((x) => x.environment === s.context.environment)) &&
      (t.status === 'all' ||
        (t.status === 'active'
          ? r.status !== 'resolved'
          : r.status === t.status)) &&
      (t.region === 'all' || r.region === t.region) &&
      (t.assignee !== 'unassigned' || r.assigneeId === null) &&
      [r.id, r.name, r.title, r.route, r.method, ...services.map((x) => x.name)]
        .join(' ')
        .toLowerCase()
        .includes(t.query.toLowerCase())
    );
  });
  const value = (r) =>
    t.sort === 'severity'
      ? { P1: 1, P2: 2, P3: 3 }[r.severity]
      : t.sort === 'owner'
        ? (r.assigneeId ?? 'zz')
        : t.sort === 'service'
          ? (s.data.services.find((x) => x.id === r.serviceId)?.name ?? r.id)
          : r[t.sort];
  rows.sort((a, b) => {
    const x = value(a),
      y = value(b);
    return (
      (typeof x === 'number' && typeof y === 'number'
        ? x - y
        : String(x ?? '').localeCompare(String(y ?? ''))) *
        (t.direction === 'desc' ? -1 : 1) || a.id.localeCompare(b.id)
    );
  });
  return rows;
}
export function restore(raw, fixture) {
  const s = JSON.parse(raw);
  if (
    s.version !== 1 ||
    s.data?.seed !== fixture.seed ||
    !s.context ||
    !s.tables ||
    !s.preferences ||
    !Array.isArray(s.data.incidents)
  )
    throw Error('Stored demo state is incompatible. Reset or export it.');
  return s;
}
