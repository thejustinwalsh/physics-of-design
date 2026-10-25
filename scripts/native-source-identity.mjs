import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
export const nativeSourceFiles = [
  'native/App.tsx',
  'native/VelaApp.tsx',
  'native/vela-storage.ts',
  'native/coordinates.ts',
  'native/observations.tsx',
  'native/observation-batch.ts',
  'native/observation-scheduler.ts',
  'native/observation-clipping.ts',
  'native/metro.config.js',
  'native/package.json',
  'src/decision-runtime.ts',
  'src/math-expression.ts',
  'src/motion.ts',
  'src/typography-flow.ts',
  'src/restore-gate.ts',
  'src/native-text-diagnostics.ts',
  'src/native-viewport.ts',
  'src/native-safe-area.ts',
  'src/native-root-geometry.ts',
  'examples/vela/design.generated.json',
  'assets/fonts/Lato-Black.ttf',
  'assets/fonts/Lato-Regular.ttf',
];
export async function nativeSourceIdentity() {
  const digest = createHash('sha256');
  for (const file of nativeSourceFiles) {
    digest.update(file);
    digest.update('\0');
    digest.update(await readFile(file));
    digest.update('\0');
  }
  return digest.digest('hex');
}
