import { readFile, writeFile } from 'node:fs/promises';
import { z } from 'zod';
import { evaluate } from '../dist/index.js';
const [ratingsFile, keyFile, observationsFile, outputFile] =
  process.argv.slice(2);
if (!outputFile)
  throw new Error('usage: import-ratings RATINGS KEY OBSERVATIONS OUTPUT');
const { ratings } = z
  .object({
    ratings: z.array(
      z
        .object({
          id: z.string(),
          raterId: z.string().min(1),
          winner: z.enum(['left', 'right', 'tie']),
        })
        .strict(),
    ),
  })
  .strict()
  .parse(JSON.parse(await readFile(ratingsFile, 'utf8')));
const assignments = JSON.parse(await readFile(keyFile, 'utf8')),
  data = JSON.parse(await readFile(observationsFile, 'utf8'));
for (const rating of ratings) {
  const key = assignments.find((k) => k.id === rating.id);
  if (!key) throw new Error('unknown blinded assignment');
  let winner = rating.winner;
  if (key.reversed && winner !== 'tie')
    winner = winner === 'left' ? 'right' : 'left';
  const { projectId, taskId, seed, comparison } = key;
  data.preferences.push({
    projectId,
    taskId,
    seed,
    comparison,
    raterId: rating.raterId,
    winner,
  });
}
const analysis = evaluate(data);
await writeFile(
  outputFile,
  JSON.stringify({ observations: data, analysis }, null, 2) + '\n',
);
