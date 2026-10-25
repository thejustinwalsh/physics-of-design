/** Source-bound property projections and renderer comparisons. Declarations are not authenticated observations. */
import { z } from 'zod';
import { hash } from './identity.js';
const Digest = z.string().regex(/^[a-f0-9]{64}$/),
  Id = z.string().regex(/^[a-z][a-z0-9-]{0,79}$/),
  Value = z.union([z.string().max(1024), z.number().finite(), z.boolean()]);
const Platform = z.enum(['web', 'native-ios', 'native-android']);
const Unit = z.enum([
  'css-px',
  'pt',
  'dp',
  'ratio',
  'count',
  'color',
  'token',
  'spring-parameter',
]);
const Property = z.enum([
  'fontSize',
  'lineHeight',
  'letterSpacing',
  'minHeight',
  'height',
  'width',
  'paddingTop',
  'paddingBottom',
  'paddingLeft',
  'paddingRight',
  'gap',
  'color',
  'backgroundColor',
  'borderColor',
  'opacity',
  'flexDirection',
  'columns',
  'nativeFinish',
  'spring.mass',
  'spring.stiffness',
  'spring.damping',
  'surface.roughness',
  'surface.metalness',
]);
const Current = z
  .object({
    designIdentity: Digest,
    sourceIdentity: Digest,
    inputIdentity: Digest,
    resultIdentity: Digest,
  })
  .strict();
const Target = z
  .object({
    surface: Id,
    property: Property,
    sourceLocation: z.string().min(1).max(512),
  })
  .strict();
const Binding = z
  .object({
    id: Id,
    scenario: Id,
    scenarioIdentity: Digest,
    platform: Platform,
    unit: Unit,
    pointer: z.string().max(2048),
    target: Target,
    tolerance: z.number().finite().min(0).max(2).default(0),
    unsupportedPolicy: z.enum(['block', 'record']).default('block'),
  })
  .strict();
const ManifestEntry = Binding.extend({ expected: Value });
export const OutputBindingManifestSchema = z
  .object({
    version: z.literal(1),
    engine: z.literal('output-bindings-v1'),
    current: Current,
    sourceValueIdentity: Digest,
    entries: z.array(ManifestEntry).min(1).max(512),
    scope: z.string(),
    identity: Digest,
  })
  .strict();
export const OutputBindingsResolveSchema = z
  .object({
    operation: z.literal('resolve'),
    current: Current,
    source: z.object({ value: z.unknown(), identity: Digest }).strict(),
    bindings: z.array(Binding).min(1).max(512),
  })
  .strict();
const Observation = z
  .object({
    binding: Id,
    current: Current,
    scenario: Id,
    scenarioIdentity: Digest,
    platform: Platform,
    unit: Unit,
    surface: Id,
    property: Property,
    sourceLocation: z.string().min(1).max(512),
    status: z.enum(['observed', 'unsupported', 'unknown']),
    value: Value.optional(),
    provider: z.enum(['browser', 'native-ios', 'native-android']),
    runtime: z.string().min(1).max(200),
    resultRef: z.string().min(1).max(2048),
    observedAt: z.string().datetime(),
    detail: z.string().min(1).max(1000),
  })
  .strict();
const Check = z
  .object({
    operation: z.literal('check'),
    manifest: OutputBindingManifestSchema,
    current: Current,
    observations: z.array(Observation).max(512),
  })
  .strict();
export const OutputBindingsCheckSchema = z.discriminatedUnion('operation', [
  OutputBindingsResolveSchema,
  Check,
]);
export type OutputBindingManifest = z.infer<typeof OutputBindingManifestSchema>;
export type OutputBindingObservation = z.infer<typeof Observation>;
function pointer(value: unknown, path: string): unknown {
  if ((path !== '' && !path.startsWith('/')) || /~(?![01])/u.test(path))
    throw Error('Binding pointer must be an RFC 6901 JSON pointer');
  let selected = value;
  if (path !== '')
    for (const part of path.slice(1).split('/')) {
      const key = part.replaceAll('~1', '/').replaceAll('~0', '~');
      if (
        !selected ||
        typeof selected !== 'object' ||
        !Object.hasOwn(selected, key)
      )
        throw Error(`Binding pointer does not exist: ${path}`);
      selected = (selected as Record<string, unknown>)[key];
    }
  return selected;
}
function unique(values: string[], name: string) {
  if (new Set(values).size !== values.length) throw Error(`Duplicate ${name}`);
}
function validUnit(entry: z.infer<typeof Binding>) {
  const property = entry.target.property;
  const expected =
    property === 'columns'
      ? 'count'
      : ['color', 'backgroundColor', 'borderColor'].includes(property)
        ? 'color'
        : ['nativeFinish', 'flexDirection'].includes(property)
          ? 'token'
          : property.startsWith('spring.')
            ? 'spring-parameter'
            : property.startsWith('surface.') || property === 'opacity'
              ? 'ratio'
              : null;
  if (expected && entry.unit !== expected)
    throw Error(`Wrong unit for ${property}`);
  if (
    !expected &&
    entry.unit !==
      ({ web: 'css-px', 'native-ios': 'pt', 'native-android': 'dp' } as const)[
        entry.platform
      ]
  )
    throw Error(
      `Layout property ${property} requires its platform coordinate unit`,
    );
}
function validEntries(entries: z.infer<typeof ManifestEntry>[]) {
  unique(
    entries.map((b) => b.id),
    'binding IDs',
  );
  unique(
    entries.map(
      (b) =>
        `${b.scenario}/${b.platform}/${b.target.surface}/${b.target.property}`,
    ),
    'target properties',
  );
  for (const b of entries) {
    validUnit(b);
    if (
      (b.pointer !== '' && !b.pointer.startsWith('/')) ||
      /~(?![01])/u.test(b.pointer)
    )
      throw Error('Binding pointer must be an RFC 6901 JSON pointer');
    if (typeof b.expected !== 'number' && b.tolerance !== 0)
      throw Error(`Tolerance requires numeric value: ${b.id}`);
    if (
      ['css-px', 'pt', 'dp', 'ratio', 'count', 'spring-parameter'].includes(
        b.unit,
      ) &&
      typeof b.expected !== 'number'
    )
      throw Error(`Numeric unit requires numeric value: ${b.id}`);
    if (['color', 'token'].includes(b.unit) && typeof b.expected !== 'string')
      throw Error(`String unit requires string value: ${b.id}`);
  }
}
export function resolveOutputBindings(
  input: z.input<typeof OutputBindingsResolveSchema>,
) {
  const r = OutputBindingsResolveSchema.parse(input);
  if (
    hash(r.source.value) !== r.source.identity ||
    r.current.resultIdentity !== r.source.identity
  )
    throw Error('Binding source payload identity mismatch');
  const entries = r.bindings.map((b) => ({
    ...b,
    expected: Value.parse(pointer(r.source.value, b.pointer)),
  }));
  validEntries(entries);
  const body = {
    version: 1 as const,
    engine: 'output-bindings-v1' as const,
    current: r.current,
    sourceValueIdentity: r.source.identity,
    entries,
    scope:
      'Expected values projected from exact source pointers. No renderer ran; hashes detect payload changes, not authenticity or causal consumption.',
  };
  return { ...body, identity: hash(body) };
}
export function checkOutputBindings(
  input: z.input<typeof OutputBindingsCheckSchema>,
) {
  const r = OutputBindingsCheckSchema.parse(input);
  if (r.operation === 'resolve') return resolveOutputBindings(r);
  const { identity, ...body } = r.manifest;
  if (hash(body) !== identity)
    throw Error('Binding manifest identity mismatch');
  if (r.manifest.sourceValueIdentity !== r.manifest.current.resultIdentity)
    throw Error('Binding manifest source payload identity mismatch');
  validEntries(r.manifest.entries);
  unique(
    r.observations.map((o) => o.binding),
    'observations',
  );
  const known = new Set(r.manifest.entries.map((e) => e.id));
  for (const o of r.observations)
    if (!known.has(o.binding))
      throw Error(`Observation has no binding: ${o.binding}`);
  const staleManifest = hash(r.current) !== hash(r.manifest.current);
  const entries = r.manifest.entries.map((b) => {
    const o = r.observations.find((x) => x.binding === b.id);
    let status:
      | 'pass'
      | 'stale'
      | 'unbound'
      | 'wrong-evidence'
      | 'override'
      | 'unknown'
      | 'unsupported'
      | 'recorded-unsupported';
    if (staleManifest) status = 'stale';
    else if (!o) status = 'unbound';
    else if (
      hash(o.current) !== hash(r.current) ||
      o.scenarioIdentity !== b.scenarioIdentity
    )
      status = 'stale';
    else if (
      o.scenario !== b.scenario ||
      o.platform !== b.platform ||
      o.unit !== b.unit ||
      o.surface !== b.target.surface ||
      o.property !== b.target.property ||
      o.sourceLocation !== b.target.sourceLocation ||
      o.provider !== (b.platform === 'web' ? 'browser' : b.platform)
    )
      status = 'wrong-evidence';
    else if (
      o.status === 'unknown' ||
      (o.status === 'observed' && o.value === undefined)
    )
      status = 'unknown';
    else if (o.status === 'unsupported')
      status =
        b.unsupportedPolicy === 'record'
          ? 'recorded-unsupported'
          : 'unsupported';
    else
      status = (
        typeof b.expected === 'number' && typeof o.value === 'number'
          ? Math.abs(o.value - b.expected) <= b.tolerance
          : o.value === b.expected
      )
        ? 'pass'
        : 'override';
    return {
      id: b.id,
      status,
      expected: b.expected,
      observed: o?.value ?? null,
      unit: b.unit,
      target: b.target,
      resultRef: o?.resultRef ?? null,
      detail: o?.detail ?? 'No current renderer observation',
    };
  });
  return {
    version: 1 as const,
    manifestIdentity: identity,
    current: r.current,
    complete: entries.every(
      (e) => e.status === 'pass' || e.status === 'recorded-unsupported',
    ),
    verified: entries.every((e) => e.status === 'pass'),
    entries,
    scope:
      'Compares caller-supplied current renderer observations with consumed-value expectations. Matching values support consistency, not authorship, causal influence, task success or whole-app accessibility.',
  };
}
