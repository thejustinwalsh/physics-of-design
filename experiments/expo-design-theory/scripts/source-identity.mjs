import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
export const sourceFiles = ['src/App.jsx', 'src/useObservations.jsx', 'src/Scroll.jsx', 'src/Scroll.native.jsx', 'src/content.js', 'scripts/source-identity.mjs', 'babel.config.js', 'metro.config.js', 'postcss.config.js', 'strict.css', 'index.js', 'app.json', 'package.json', 'package-lock.json', '../../assets/fonts/Lato-Regular.ttf'];
export async function sourceIdentity() {
  const hash = createHash('sha256');
  for (const file of sourceFiles) { hash.update(file); hash.update('\0'); hash.update(await readFile(new URL(`../${file}`, import.meta.url))); hash.update('\0'); }
  return hash.digest('hex');
}
