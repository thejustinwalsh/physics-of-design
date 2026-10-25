import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { execute } from '../dist/index.js';
const profile = process.env.DESIGN_SELECTOR_PROFILE ?? 'qwen3.5-4b';
if (!['qwen3.5-4b', 'qwen3.5-0.8b'].includes(profile))
  throw new Error('Unknown selector profile');
const directory =
  profile === 'qwen3.5-4b' ? 'artifacts/selector' : 'artifacts/selector-tiny';
const gguf =
  profile === 'qwen3.5-4b'
    ? 'artifacts/runtime/Qwen3.5-4B-Q4_K_M.gguf'
    : 'artifacts/runtime/Qwen3.5-0.8B-Q4_K_M.gguf';
await mkdir(directory, { recursive: true });
for (const archetype of ['hero', 'editorial']) {
  const state = JSON.parse(
    await readFile(`examples/${archetype}.json`, 'utf8'),
  );
  const result = await execute('system relax', {
    state,
    maxCandidates: 3,
    widths: [360, 1280],
    textScales: [1, 2],
    select: {
      gguf,
      profile,
      maxPromptTokens: 4096,
      criterion:
        archetype === 'hero'
          ? 'Choose a bold, compact title with a clearly subordinate subtitle and enough breathing room.'
          : 'Choose a calm editorial hierarchy and comfortable prose rhythm.',
      auditDirectory: `${directory}/audit`,
    },
  });
  await writeFile(
    `${directory}/${archetype}.json`,
    JSON.stringify(result, null, 2) + '\n',
  );
  console.log(
    JSON.stringify({
      archetype,
      viable: result.viableIds.length,
      selection: result.selection,
    }),
  );
}
