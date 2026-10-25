#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import { createInterface } from 'node:readline';
import path from 'node:path';
import { execute, commandSchemas, type Command } from './commands.js';
import { startNativeBridge } from './native.js';
import { designCatalog } from './catalog.js';
import { summarizeResult } from './mcp-context.js';
import {
  designFileReference,
  resolveDesignFileReferences,
} from './file-references.js';

const cancellation = new AbortController();

async function main() {
  const args = process.argv.slice(2);
  if (args[0] === '--help' || !args.length) {
    process.stdout.write(
      JSON.stringify(
        {
          usage:
            'design <command> [--schema] [--input FILE|-] [--output FILE] [--summary] [--resolve-file-refs] [--jsonl]',
          commands: [...Object.keys(commandSchemas), 'mcp', 'native serve'],
          input:
            'One JSON object on stdin. State-based commands take {state: <state>}; native serve uses DESIGN_NATIVE_TOKEN. Errors go to stderr, with exit 1.',
        },
        null,
        2,
      ) + '\n',
    );
    return;
  }
  if (args[0] === 'mcp') {
    const { serveMcp } = await import('./mcp.js');
    await serveMcp();
    return;
  }
  if (args[0] === 'native' && args[1] === 'serve') {
    const port = Number(process.env.DESIGN_NATIVE_PORT ?? 4319);
    if (!Number.isInteger(port) || port < 1 || port > 65535)
      throw new Error('invalid DESIGN_NATIVE_PORT');
    const server = await startNativeBridge(port);
    process.stdout.write(
      JSON.stringify({
        ready: true,
        url: `http://127.0.0.1:${port}`,
        engine: 'native-bridge',
        requires: 'Running native/ Expo harness; no synthetic measurements',
      }) + '\n',
    );
    for (const signal of ['SIGINT', 'SIGTERM'] as const)
      process.on(signal, () => server.close(() => process.exit(0)));
    return;
  }
  const words: string[] = [];
  process.once('SIGINT', () => cancellation.abort());
  process.once('SIGTERM', () => cancellation.abort());
  while (args[0] && !args[0].startsWith('--')) words.push(args.shift()!);
  const command = words.join(' ');
  if (!Object.hasOwn(commandSchemas, command))
    throw new Error(`unknown command ${command}; run design --help`);
  let input = '-',
    output: string | undefined,
    jsonl = false,
    summary = false,
    schema = false,
    resolveFiles = false;
  while (args.length) {
    const arg = args.shift();
    if (arg === '--input') {
      input = args.shift() ?? '';
      if (!input) throw new Error('--input requires a file');
    } else if (arg === '--output') {
      output = args.shift();
      if (!output) throw new Error('--output requires a file');
    } else if (arg === '--jsonl') jsonl = true;
    else if (arg === '--summary') summary = true;
    else if (arg === '--schema') schema = true;
    else if (arg === '--resolve-file-refs') resolveFiles = true;
    else throw new Error(`unknown option ${arg}`);
  }
  if (summary && (!output || jsonl || schema))
    throw new Error(
      '--summary requires --output FILE and a single JSON result',
    );
  if (schema) {
    const data = JSON.stringify(designCatalog(command as Command)) + '\n';
    if (output) await writeFile(output, data);
    else process.stdout.write(data);
    return;
  }
  const write = async (value: unknown) => {
    const data = JSON.stringify(value) + '\n';
    if (output) await writeFile(output, data, { flag: jsonl ? 'a' : 'w' });
    else process.stdout.write(data);
    if (summary) {
      const fullResult = designFileReference(
        path.resolve(output!),
        Buffer.from(data),
      );
      const view = summarizeResult(command, value, null);
      if (view.summary && typeof view.summary === 'object') {
        const r = value as Record<string, unknown>;
        const recipePointer = r.recipe
          ? '/recipe'
          : r.workflow &&
              typeof r.workflow === 'object' &&
              Object.hasOwn(r.workflow, 'recipe')
            ? '/workflow/recipe'
            : null;
        if (recipePointer && Object.hasOwn(view.summary, 'recipe'))
          (view.summary as Record<string, unknown>).recipe = {
            ...fullResult,
            pointer: recipePointer,
          };
        if (command === 'kernel compile')
          (view.summary as Record<string, unknown>).workflow = {
            ...fullResult,
            pointer: '/workflow',
          };
      }
      process.stdout.write(
        JSON.stringify({
          summary: view.summary,
          fullResult,
          referenceScope:
            'Hash-bound local JSON. Explicit --resolve-file-refs resolves pointers; hashes establish byte identity, not authenticity or renderer execution.',
        }) + '\n',
      );
    }
  };
  const run = async (value: unknown) =>
    execute(
      command as Command,
      resolveFiles ? await resolveDesignFileReferences(value) : value,
      {
        signal: cancellation.signal,
        onProgress: (progress) =>
          process.stderr.write(
            JSON.stringify({ type: 'design.progress', ...progress }) + '\n',
          ),
      },
    );
  if (jsonl) {
    const stream =
      input === '-'
        ? process.stdin
        : (await import('node:fs')).createReadStream(input);
    for await (const line of createInterface({
      input: stream,
      crlfDelay: Infinity,
    }))
      if (line.trim()) await write(await run(JSON.parse(line)));
  } else {
    let raw = '';
    if (input === '-') {
      for await (const chunk of process.stdin) raw += chunk;
    } else raw = await readFile(input, 'utf8');
    await write(await run(raw.trim() ? JSON.parse(raw) : {}));
  }
}
process.stdout.on('error', (error: NodeJS.ErrnoException) => {
  if (error.code === 'EPIPE') process.exit(0);
  throw error;
});
main().catch((error) => {
  process.stderr.write(
    JSON.stringify({
      error: error instanceof Error ? error.message : String(error),
    }) + '\n',
  );
  process.exitCode = 1;
});
