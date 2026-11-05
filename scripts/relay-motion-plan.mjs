import { readFile, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { emitMotion } from '../dist/motion.js';
import { hash } from '../dist/identity.js';
import { fileURLToPath } from 'node:url';
const directory = fileURLToPath(
  new URL('../examples/relay/app/src/design', import.meta.url),
);
const staged = JSON.parse(
  await readFile(directory + '/staged-values.json', 'utf8'),
);
const selected = JSON.parse(
  await readFile(directory + '/resolved.json', 'utf8'),
).values.desktop;
const input = {
  spring: {
    mass: selected['appearance.spring.mass'],
    stiffness: staged.stiffness,
    damping: staged.damping,
  },
  coordinate: { unit: 'dp', from: 0, to: 1, initialVelocity: 0 },
  durationSeconds: 2,
  sampleCount: 121,
  settling: { positionTolerance: 0.01, speedTolerance: 0.01 },
  bounds: null,
};
const emitted = emitMotion({
  motion: input,
  channel: 'translateX',
  platform: 'react-native',
  useNativeDriver: true,
});
assert.equal(
  emitted.supported,
  true,
  'Historical starting parameters require a supported actual native adapter',
);
assert.equal(emitted.plan.kind, 'react-native-spring');
const result = {
  version: 1,
  identity: hash({ input, plan: emitted.plan }),
  supported: emitted.supported,
  config: emitted.plan.config,
  origin:
    'Historical starting spring parameters evaluated by current motion emit; not a fresh selector recipe or native-device verification.',
  coordinate:
    'Actual plot-content dp. Target derives from current bucket centers; geometry changes snap. The native backend owns retarget propagation; position/velocity continuity require current platform measurement. Bounds clipping is presentation policy.',
  reducedMotion: 'instant; stop native animation and set exact current target',
};
const file = directory + '/cursor-motion.json';
if (process.argv.includes('--check'))
  assert.deepEqual(
    JSON.parse(await readFile(file, 'utf8')),
    result,
    'Regenerate the actual emitted cursor adapter plan',
  );
else await writeFile(file, JSON.stringify(result, null, 2) + '\n');
console.log(
  JSON.stringify({
    cursorPlan: result.supported,
    identity: result.identity,
    nativeDriverRequested: result.config.useNativeDriver,
    verification: 'pending-current-native-runtime',
  }),
);
