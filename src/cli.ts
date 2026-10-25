#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import { createInterface } from 'node:readline';
import { execute, commandSchemas, type Command } from './commands.js';
import { startNativeBridge } from './native.js';

async function main() {
  const args = process.argv.slice(2);
  if (args[0] === '--help' || !args.length) {
    process.stdout.write(
      JSON.stringify(
        {
          usage: 'design <command> [--input FILE|-] [--output FILE] [--jsonl]',
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
  while (args[0] && !args[0].startsWith('--')) words.push(args.shift()!);
  const command = words.join(' ');
  if (!Object.hasOwn(commandSchemas, command))
    throw new Error(`unknown command ${command}; run design --help`);
  let input = '-',
    output: string | undefined,
    jsonl = false;
  while (args.length) {
    const arg = args.shift();
    if (arg === '--input') {
      input = args.shift() ?? '';
      if (!input) throw new Error('--input requires a file');
    } else if (arg === '--output') {
      output = args.shift();
      if (!output) throw new Error('--output requires a file');
    } else if (arg === '--jsonl') jsonl = true;
    else throw new Error(`unknown option ${arg}`);
  }
  const write = async (value: unknown) => {
    const data = JSON.stringify(value) + '\n';
    if (output) await writeFile(output, data, { flag: jsonl ? 'a' : 'w' });
    else process.stdout.write(data);
  };
  if (jsonl) {
    const stream =
      input === '-'
        ? process.stdin
        : (await import('node:fs')).createReadStream(input);
    for await (const line of createInterface({
      input: stream,
      crlfDelay: Infinity,
    }))
      if (line.trim())
        await write(await execute(command as Command, JSON.parse(line)));
  } else {
    let raw = '';
    if (input === '-') {
      for await (const chunk of process.stdin) raw += chunk;
    } else raw = await readFile(input, 'utf8');
    await write(
      await execute(command as Command, raw.trim() ? JSON.parse(raw) : {}),
    );
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
