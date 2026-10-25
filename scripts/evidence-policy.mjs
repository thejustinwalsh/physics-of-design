import assert from 'node:assert/strict';

export const verificationStages = Object.freeze([
  'build',
  'types',
  'native-types',
  'unit',
  'browser',
  'commands-and-app',
  'consumer',
  'fieldwork-build',
  'fieldwork-web',
  'vela-policy',
  'vela-build',
  'vela-web',
  'native-ios',
  'native-android',
  'selector',
  'matrix-web',
  'matrix-native-ios',
  'matrix-native-android',
]);

export function assertFullVerification(summary) {
  assert.equal(summary?.complete, true, 'Verification is incomplete');
  assert.equal(summary?.passed, true, 'Verification did not pass');
  assert.equal(summary?.expectedStages, verificationStages.length);
  assert.ok(Array.isArray(summary?.results), 'Missing verification stages');
  assert.deepEqual(
    summary.results.map((s) => s.name),
    verificationStages,
    'Verification must contain the exact ordered eighteen stages',
  );
  for (const stage of summary.results)
    assert.equal(stage.code, 0, `Verification failed: ${stage.name}`);
}

export const velaFlowActions = Object.freeze([
  'Open session',
  'Start session',
  'Pause session',
  'Resume session',
  'Finish session',
  'View insights',
  'Profile',
  'Reduce motion',
  'Today',
  'Follow system motion',
]);
const unavailableActions = new Set(['Pause session', 'Finish session']);
const finite = (value) => typeof value === 'number' && Number.isFinite(value);
function assertBounds(bounds, label) {
  assert.ok(
    Array.isArray(bounds) && bounds.length === 4 && bounds.every(finite),
    `Invalid ${label}`,
  );
  assert.ok(
    bounds[2] > bounds[0] && bounds[3] > bounds[1],
    `Empty or reversed ${label}`,
  );
}
export function assertVelaFlow(summary) {
  assert.equal(summary?.passed, true, 'Android flow did not pass');
  assert.ok(Array.isArray(summary?.events), 'Missing flow events');
  assert.deepEqual(
    summary.events.map((e) => e.name),
    velaFlowActions,
    'Flow must contain the exact ordered ten actions',
  );
  assert.deepEqual(
    summary.accessibilityCoverage,
    { verified: 8, unavailable: 2 },
    'Flow must report eight XML checks and two unavailable checks',
  );
  const files = new Set();
  for (const event of summary.events) {
    assert.equal(event.action, 'tap', 'Expected a real tap action');
    assert.ok(
      finite(event.started) &&
        finite(event.receiptObservedAt) &&
        event.receiptObservedAt > event.started,
      'Flow needs fresh finite host delivery times',
    );
    assertBounds(event.tapBoundsPx, 'tap bounds');
    const oracle = event.accessibilityOracle;
    if (unavailableActions.has(event.name)) {
      assert.equal(
        oracle?.status,
        'unavailable',
        'Live-clock Pause/Finish must disclose the unavailable XML oracle',
      );
      assert.ok(
        typeof oracle.reason === 'string' && oracle.reason.trim().length > 0,
        'Unavailable oracle needs a reason',
      );
    } else {
      assert.equal(
        oracle?.status,
        'verified',
        `Missing XML verification: ${event.name}`,
      );
      assert.ok(
        typeof oracle.file === 'string' &&
          /^[0-9]+-accessibility\.xml$/.test(oracle.file),
        'Invalid accessibility filename',
      );
      assert.ok(!files.has(oracle.file), 'Duplicate accessibility XML file');
      files.add(oracle.file);
      assert.ok(
        finite(oracle.nativeBoundsErrorPx) &&
          oracle.nativeBoundsErrorPx >= 0 &&
          oracle.nativeBoundsErrorPx <= 2,
        'XML/native bounds error exceeds two pixels or is invalid',
      );
      assertBounds(oracle.bounds, 'oracle bounds');
      assert.deepEqual(
        oracle.bounds,
        event.tapBoundsPx,
        'Tap must use the verified accessibility rectangle',
      );
    }
  }
  assert.equal(files.size, 8);
}

// This deliberately parses only UIAutomator's flat attribute-bearing node tags.
// It does not execute XML, expand external entities, or accept a missing hierarchy.
const decodeXml = (value) =>
  value.replace(/&(?:quot|apos|lt|gt|amp|#x[0-9a-f]+|#[0-9]+);/gi, (entity) => {
    const named = {
      '&quot;': '"',
      '&apos;': "'",
      '&lt;': '<',
      '&gt;': '>',
      '&amp;': '&',
    };
    if (Object.hasOwn(named, entity)) return named[entity];
    const hex = entity.startsWith('&#x');
    return String.fromCodePoint(
      Number.parseInt(entity.slice(hex ? 3 : 2, -1), hex ? 16 : 10),
    );
  });
export function assertFlowXml(event, xml) {
  assert.equal(event?.accessibilityOracle?.status, 'verified');
  assert.ok(
    typeof xml === 'string' &&
      /^\s*(?:<\?xml[^?]*\?>\s*)?<hierarchy\b[^>]*>[\s\S]*<\/hierarchy>\s*$/.test(
        xml,
      ),
    'Missing complete UIAutomator hierarchy',
  );
  assert.ok(
    !/<!DOCTYPE|<!ENTITY/i.test(xml),
    'External XML declarations are not evidence',
  );
  const nodes = [...xml.matchAll(/<node\b[^>]*>/g)].map(([tag]) =>
    Object.fromEntries(
      [...tag.matchAll(/([\w:-]+)="([^"]*)"/g)].map(([, key, value]) => [
        key,
        decodeXml(value),
      ]),
    ),
  );
  const matches = nodes.filter(
    (n) => n['content-desc'] === event.name && n.clickable === 'true',
  );
  assert.equal(
    matches.length,
    1,
    'Expected one clickable accessibility action',
  );
  const match = /^\[(-?\d+),(-?\d+)\]\[(-?\d+),(-?\d+)\]$/.exec(
    matches[0].bounds,
  );
  assert.ok(match, 'Invalid UIAutomator bounds');
  const bounds = match.slice(1).map(Number);
  assertBounds(bounds, 'XML bounds');
  assert.deepEqual(
    bounds,
    event.tapBoundsPx,
    'Saved XML differs from tapped rectangle',
  );
  assert.deepEqual(
    bounds,
    event.accessibilityOracle.bounds,
    'Saved XML differs from reported oracle',
  );
}

// Authored paths reviewed for this milestone. New files require an explicit change;
// no filesystem walk can silently publish a runtime bundle, model, or diagnostic payload.
export const curatedCurrentEvidenceFiles = Object.freeze(
  [
    ...verificationStages.map((stage) => `verification/${stage}.log`),
    'verification/summary.json',
    'verification/evidence-policy.log',
    'review/vela-closure/measured-root-after/android-enlarged-current/active.json',
    'review/vela-closure/measured-root-after/android-enlarged-current/active.png',
    'review/vela-closure/measured-root-after/android-enlarged-current/detail.json',
    'review/vela-closure/measured-root-after/android-enlarged-current/detail.png',
    'review/vela-closure/measured-root-after/iphone-maximum-current/active.json',
    'review/vela-closure/measured-root-after/iphone-maximum-current/active.png',
    'review/vela-closure/measured-root-after/iphone-maximum-current/detail.json',
    'review/vela-closure/measured-root-after/iphone-maximum-current/detail.png',
    'review/vela-closure/measured-root-after/manifest.json',
    'review/vela-closure/measured-root-before/detail-receipt.json',
    'review/vela-closure/measured-root-before/detail.png',
    'review/vela-closure/measured-root-before/manifest.json',
    'review/vela-closure/native-final/android-default-current/detail.json',
    'review/vela-closure/native-final/android-default-current/detail.png',
    'review/vela-closure/native-final/ipad-default-current/detail.json',
    'review/vela-closure/native-final/ipad-default-current/detail.png',
    'review/vela-closure/native-final/iphone-default-current/detail.json',
    'review/vela-closure/native-final/iphone-default-current/detail.png',
    'review/vela-closure/native-final/iphone-enlarged-current/active.json',
    'review/vela-closure/native-final/iphone-enlarged-current/active.png',
    'review/vela-closure/native-final/iphone-enlarged-current/complete.json',
    'review/vela-closure/native-final/iphone-enlarged-current/complete.png',
    'review/vela-closure/native-final/iphone-enlarged-current/detail.json',
    'review/vela-closure/native-final/iphone-enlarged-current/detail.png',
    'review/vela-closure/native-final/iphone-enlarged-current/insights.json',
    'review/vela-closure/native-final/iphone-enlarged-current/insights.png',
    'review/vela-closure/native-final/manifest.json',
    'review/vela-closure/native/android-default-current/detail.json',
    'review/vela-closure/native/android-default-current/detail.png',
    'review/vela-closure/native/android-default-current/summary.json',
    'review/vela-closure/native/ipad-default-current/active.json',
    'review/vela-closure/native/ipad-default-current/active.png',
    'review/vela-closure/native/ipad-default-current/insights.json',
    'review/vela-closure/native/ipad-default-current/insights.png',
    'review/vela-closure/native/ipad-default-current/summary.json',
    'review/vela-closure/native/ipad-default-current/today.json',
    'review/vela-closure/native/ipad-default-current/today.png',
    'review/vela-closure/native/iphone-enlarged-current/active.json',
    'review/vela-closure/native/iphone-enlarged-current/active.png',
    'review/vela-closure/native/iphone-enlarged-current/complete.json',
    'review/vela-closure/native/iphone-enlarged-current/complete.png',
    'review/vela-closure/native/iphone-enlarged-current/detail.json',
    'review/vela-closure/native/iphone-enlarged-current/detail.png',
    'review/vela-closure/native/iphone-enlarged-current/insights.json',
    'review/vela-closure/native/iphone-enlarged-current/insights.png',
    'review/vela-closure/native/iphone-enlarged-current/summary.json',
    'review/vela-closure/native/iphone-enlarged-current/today.json',
    'review/vela-closure/native/iphone-enlarged-current/today.png',
    'review/vela-closure/native/manifest.json',
    'review/vela-closure/safe-area-after/active.json',
    'review/vela-closure/safe-area-after/active.png',
    'review/vela-closure/safe-area-after/detail.json',
    'review/vela-closure/safe-area-after/detail.png',
    'review/vela-closure/safe-area-after/manifest.json',
    'review/vela-closure/safe-area-before/active.json',
    'review/vela-closure/safe-area-before/active.png',
    'review/vela-closure/safe-area-before/manifest.json',
    'review/vela-closure/web-final/active-390-3.6.png',
    'review/vela-closure/web-final/detail-390-3.6.png',
    'review/vela-closure/web-final/insights-390-2.png',
    'review/vela-closure/web-final/manifest.json',
    'review/vela-closure/web-final/report.json',
    'review/vela-closure/web/active-390-3.6.png',
    'review/vela-closure/web/detail-390-3.6.png',
    'review/vela-closure/web/insights-390-2.png',
    'review/vela-closure/web/manifest.json',
    'review/vela-closure/web/report.json',
    'review/vela-closure/web/restore-error-throw.png',
    'review/vela-closure/web/save-error.png',
    'review/vela-closure/web/today-1440-1.png',
    'review/vela-closure/web/today-390-3.6.png',
  ].sort(),
);
