import test from 'node:test';
import assert from 'node:assert/strict';
import { hash } from '../src/identity.js';
import {
  resolveOutputBindings,
  checkOutputBindings,
  type OutputBindingObservation,
} from '../src/output-bindings.js';
function fixture() {
  const value = { values: { phone: { rowHeight: 48, color: '#112233' } } };
  const current = {
    designIdentity: hash('design'),
    sourceIdentity: hash('source'),
    inputIdentity: hash('input'),
    resultIdentity: hash(value),
  };
  const binding = {
    id: 'row-height',
    scenario: 'phone',
    scenarioIdentity: hash('phone'),
    platform: 'web' as const,
    unit: 'css-px' as const,
    pointer: '/values/phone/rowHeight',
    target: {
      surface: 'relay-service-table',
      property: 'height' as const,
      sourceLocation: 'src/Row.tsx:12',
    },
    tolerance: 0.5,
  };
  const manifest = resolveOutputBindings({
    operation: 'resolve',
    current,
    source: { value, identity: hash(value) },
    bindings: [binding],
  });
  const observation: OutputBindingObservation = {
    binding: 'row-height',
    current,
    scenario: 'phone',
    scenarioIdentity: hash('phone'),
    platform: 'web',
    unit: 'css-px',
    surface: 'relay-service-table',
    property: 'height',
    sourceLocation: 'src/Row.tsx:12',
    status: 'observed',
    value: 48,
    provider: 'browser',
    runtime: 'synthetic-unit-test',
    resultRef: 'test:synthetic-observation',
    observedAt: '2026-10-25T00:00:00.000Z',
    detail: 'Synthetic observation tests the checker, not a browser',
  };
  return { value, current, binding, manifest, observation };
}
function check(edit?: (r: ReturnType<typeof fixture>) => void) {
  const r = fixture();
  edit?.(r);
  return checkOutputBindings({
    operation: 'check',
    manifest: r.manifest,
    current: r.current,
    observations: [r.observation],
  });
}
test('a recomputed hash cannot make internally invalid manifests verifiable', () => {
  const edits: ((r: any) => void)[] = [
    (r) => {
      r.manifest.entries[0].unit = r.observation.unit = 'dp';
    },
    (r) => {
      r.manifest.sourceValueIdentity = hash('other source');
    },
    (r) => {
      r.manifest.entries.push({
        ...r.manifest.entries[0],
        id: 'duplicate-target',
      });
    },
    (r) => {
      r.manifest.entries[0].expected = r.observation.value = '48';
    },
    (r) => {
      r.manifest.entries[0].pointer = '/bad~2pointer';
    },
  ];
  for (const edit of edits) {
    const r = fixture();
    edit(r);
    const { identity: _, ...body } = r.manifest;
    r.manifest.identity = hash(body);
    assert.throws(() =>
      checkOutputBindings({
        operation: 'check',
        manifest: r.manifest,
        current: r.current,
        observations: [r.observation],
      }),
    );
  }
});
test('exact source projection compares numeric values with declared tolerance', () => {
  const result = check((r) => {
    r.observation.value = 48.25;
  });
  assert.ok('verified' in result && result.verified);
  const fail = check((r) => {
    r.observation.value = 49;
  });
  assert.ok('complete' in fail && !fail.complete);
  assert.equal(fail.entries[0]!.status, 'override');
});
test('missing observation is unbound, and an unrecognized observation is rejected', () => {
  const r = fixture();
  const missing = checkOutputBindings({
    operation: 'check',
    manifest: r.manifest,
    current: r.current,
    observations: [],
  });
  assert.equal(missing.entries[0]!.status, 'unbound');
  r.observation.binding = 'unknown';
  assert.throws(
    () =>
      checkOutputBindings({
        operation: 'check',
        manifest: r.manifest,
        current: r.current,
        observations: [r.observation],
      }),
    /no binding/,
  );
});
test('current source, result, scenario and input mismatches remain stale', () => {
  for (const key of [
    'sourceIdentity',
    'inputIdentity',
    'designIdentity',
    'resultIdentity',
  ] as const) {
    const result = check((r) => {
      r.current[key] = hash('changed');
    });
    assert.equal(result.entries[0]!.status, 'stale');
  }
  assert.equal(
    check((r) => {
      r.observation.scenarioIdentity = hash('other');
    }).entries[0]!.status,
    'stale',
  );
});
test('provider, property, source location and units cannot be substituted', () => {
  for (const edit of [
    (r: ReturnType<typeof fixture>) => {
      r.observation.unit = 'dp';
    },
    (r: ReturnType<typeof fixture>) => {
      r.observation.provider = 'native-ios';
    },
    (r: ReturnType<typeof fixture>) => {
      r.observation.property = 'width';
    },
    (r: ReturnType<typeof fixture>) => {
      r.observation.sourceLocation = 'unused.tsx';
    },
  ])
    assert.equal(check(edit).entries[0]!.status, 'wrong-evidence');
});
test('unknown is blocking; explicit unsupported record never becomes verified', () => {
  assert.equal(
    check((r) => {
      r.observation.status = 'unknown';
    }).entries[0]!.status,
    'unknown',
  );
  assert.equal(
    check((r) => {
      r.observation.status = 'unsupported';
    }).entries[0]!.status,
    'unsupported',
  );
  const r = fixture();
  r.manifest = resolveOutputBindings({
    operation: 'resolve',
    current: r.current,
    source: { value: r.value, identity: hash(r.value) },
    bindings: [{ ...r.binding, unsupportedPolicy: 'record' }],
  });
  r.observation.status = 'unsupported';
  const result = checkOutputBindings({
    operation: 'check',
    manifest: r.manifest,
    current: r.current,
    observations: [r.observation],
  });
  assert.ok('complete' in result && result.complete && !result.verified);
});
test('stale payload hash, missing pointer, malformed pointer and wrong property unit reject', () => {
  const r = fixture();
  for (const pointer of ['/missing', '/values/~2bad', '/constructor'])
    assert.throws(
      () =>
        resolveOutputBindings({
          operation: 'resolve',
          current: r.current,
          source: { value: r.value, identity: hash(r.value) },
          bindings: [{ ...r.binding, pointer }],
        }),
      /pointer/,
    );
  assert.throws(
    () =>
      resolveOutputBindings({
        operation: 'resolve',
        current: r.current,
        source: { value: { changed: 1 }, identity: hash(r.value) },
        bindings: [r.binding],
      }),
    /identity/,
  );
  assert.throws(
    () =>
      resolveOutputBindings({
        operation: 'resolve',
        current: r.current,
        source: { value: r.value, identity: hash(r.value) },
        bindings: [{ ...r.binding, unit: 'ratio' }],
      }),
    /coordinate unit/,
  );
});
test('duplicate binding targets and tampered manifests fail before checks', () => {
  const r = fixture();
  assert.throws(
    () =>
      resolveOutputBindings({
        operation: 'resolve',
        current: r.current,
        source: { value: r.value, identity: hash(r.value) },
        bindings: [r.binding, { ...r.binding, id: 'another' }],
      }),
    /Duplicate target/,
  );
  r.manifest.entries[0]!.expected = 999;
  assert.throws(
    () =>
      checkOutputBindings({
        operation: 'check',
        manifest: r.manifest,
        current: r.current,
        observations: [r.observation],
      }),
    /identity/,
  );
});
