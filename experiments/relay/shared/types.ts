/** Relay v1: original deterministic demo data. No telemetry, credentials or real people. */
export type ISODate = string;
export type ServiceId = string;
export type Severity = 'P1' | 'P2' | 'P3';
export type IncidentStatus = 'triggered' | 'acknowledged' | 'investigating' | 'resolved';
export type ServiceStatus = 'healthy' | 'degraded' | 'critical';
export type Environment = 'production' | 'staging';
export interface Team { id: string; name: string; memberIds: string[]; }
export interface Member { id: string; name: string; initials: string; teamId: string; role: string; }
export interface Service {
  id: ServiceId; name: string; description: string; teamId: string; tier: 1 | 2 | 3;
  environment: Environment; region: string; version: string; sloTarget: number;
  p95TargetMs: number; dependencyIds: ServiceId[];
}
/** Aggregate snapshots are generated observations, not averages of trace rows or percentiles. */
export interface MetricBucket {
  index: number; startAt: ISODate; endAt: ISODate; requestCount: number;
  errorCount: number; p50Ms: number; p95Ms: number; p99Ms: number;
}
export interface ServiceSeries { serviceId: ServiceId; buckets: MetricBucket[]; }
export interface IncidentEvent {
  id: string; at: ISODate; kind: 'detected' | 'assigned' | 'acknowledged' | 'investigating' | 'resolved' | 'note';
  actorId: string | null; message: string;
}
export interface Incident {
  id: string; title: string; severity: Severity; status: IncidentStatus;
  serviceIds: ServiceId[]; teamId: string; assigneeId: string | null;
  openedAt: ISODate; acknowledgedAt: ISODate | null; resolvedAt: ISODate | null;
  summary: string; traceIds: string[]; alertRuleIds: string[]; timeline: IncidentEvent[];
}
export interface Span {
  id: string; parentId: string | null; serviceId: ServiceId; operation: string;
  offsetMs: number; durationMs: number; status: 'ok' | 'error';
  attributes: Record<string, string | number | boolean>;
}
export interface Trace {
  id: string; serviceId: ServiceId; incidentId: string | null; startedAt: ISODate;
  durationMs: number; status: 'ok' | 'error'; method: 'GET' | 'POST';
  route: string; region: string; spans: Span[];
}
export interface AlertRule {
  id: string; name: string; serviceId: ServiceId; teamId: string;
  metric: 'p95Ms' | 'errorRate'; operator: 'gt'; threshold: number;
  windowMinutes: number; severity: Severity; enabled: boolean;
  status: 'firing' | 'healthy' | 'muted'; incidentId: string | null;
}
export interface AuditEntry {
  id: string; at: ISODate; actorId: string; action: string; entityType: 'incident' | 'alert' | 'view' | 'settings';
  entityId: string; detail: string;
}
export interface SavedView {
  id: string; name: string; route: '/services' | '/incidents' | '/traces' | '/alerts';
  filters: Record<string, string>; sort: { key: string; direction: 'asc' | 'desc' };
  timeRangeMinutes: 15 | 60 | 240;
}
export interface RelayFixture {
  schemaVersion: 1; demo: true; seed: number; now: ISODate;
  provenance: { creator: string; license: string; method: string; privacy: string };
  primaryFlow: { serviceId: string; dependencyId: string; incidentId: string; traceId: string; alertRuleId: string; assigneeId: string };
  teams: Team[]; members: Member[]; services: Service[]; incidents: Incident[];
  traces: Trace[]; alertRules: AlertRule[]; serviceSeries: ServiceSeries[];
  fleetSeries: MetricBucket[]; auditLog: AuditEntry[]; savedViews: SavedView[];
}
export interface Preferences {
  theme: 'system' | 'dark' | 'light'; density: 'comfortable' | 'compact';
  reducedMotion: 'system' | 'reduce'; timezone: 'UTC' | 'local';
}
/** Mutations must update canonical entities and audit log atomically; see BRIEF.md. */
export type RelayAction =
  | { type: 'incident.assign'; incidentId: string; assigneeId: string }
  | { type: 'incident.acknowledge'; incidentId: string }
  | { type: 'incident.investigate'; incidentId: string }
  | { type: 'incident.resolve'; incidentId: string; note: string }
  | { type: 'incident.note'; incidentId: string; note: string }
  | { type: 'alert.upsert'; rule: AlertRule }
  | { type: 'alert.toggle'; ruleId: string; enabled: boolean }
  | { type: 'view.save'; view: SavedView }
  | { type: 'view.delete'; viewId: string }
  | { type: 'preferences.update'; preferences: Preferences }
  | { type: 'demo.reset' };
