import { readFile } from 'node:fs/promises';
if (!process.argv[2])
  throw new Error('usage: node scripts/request.mjs STATE_FILE [JSON_OPTIONS]');
const state = JSON.parse(await readFile(process.argv[2], 'utf8'));
process.stdout.write(
  JSON.stringify({ state, ...JSON.parse(process.argv[3] ?? '{}') }) + '\n',
);
