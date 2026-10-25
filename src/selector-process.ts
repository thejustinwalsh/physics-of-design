import { spawn } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { finished } from 'node:stream/promises';
import { StringDecoder } from 'node:string_decoder';
import { once } from 'node:events';

export interface SelectorProgress {
  phase:
    | 'checkpoint-hash'
    | 'starting'
    | 'model-loading'
    | 'model-ready'
    | 'row-start'
    | 'prefill'
    | 'readout-complete'
    | 'validating'
    | 'completed'
    | 'cancelled'
    | 'failed';
  origin: 'process' | 'provider';
  rowId?: string;
  processed?: number;
  total?: number;
}
/** Node execution hooks; never serialized into a prompt or selection identity. */
export interface SelectorExecutionOptions {
  signal?: AbortSignal | undefined;
  onProgress?: ((event: SelectorProgress) => void) | undefined;
}
export function notifySelector(
  options: SelectorExecutionOptions,
  event: SelectorProgress,
) {
  // A presentation callback cannot change a readout or prevent cancellation.
  try {
    options.onProgress?.(event);
  } catch {
    /* observer errors are isolated */
  }
}
const prefix = '@design-selector-progress ';

/** File-backed pipes, bounded progress parsing, and explicit process-tree cancellation. */
export async function streamSelectorProcess(input: {
  executable: string;
  args: string[];
  stdoutFile: string;
  stderrFile: string;
  rowIds: string[];
  maxPromptTokens: number;
  options: SelectorExecutionOptions;
}) {
  const stdout = createWriteStream(input.stdoutFile, { mode: 0o600 });
  const stderr = createWriteStream(input.stderrFile, { mode: 0o600 });
  try {
    await Promise.all([once(stdout, 'open'), once(stderr, 'open')]);
  } catch (error) {
    stdout.destroy();
    stderr.destroy();
    throw error;
  }
  const started = performance.now();
  let cancelled = false,
    processError: string | null = null;
  let progressEvents = 0,
    latestProgress: SelectorProgress | null = null;
  const emit = (event: SelectorProgress) => {
    latestProgress = event;
    progressEvents++;
    notifySelector(input.options, event);
  };
  const child = spawn(input.executable, input.args, {
    detached: process.platform !== 'win32',
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, HF_HUB_OFFLINE: '1', TRANSFORMERS_OFFLINE: '1' },
  });
  let escalation: ReturnType<typeof setTimeout> | undefined,
    processClosed = false;
  const killTree = (signal: NodeJS.Signals) => {
    if (!child.pid) return;
    try {
      if (process.platform === 'win32') {
        const killer = spawn(
          'taskkill',
          ['/PID', String(child.pid), '/T', '/F'],
          { stdio: 'ignore' },
        );
        killer.on('error', () => {
          child.kill(signal);
        });
      } else process.kill(-child.pid, signal);
    } catch {
      /* already exited */
    }
  };
  const terminate = () => {
    if (processClosed) return;
    killTree('SIGTERM');
    // Shutdown grace only after an explicit abort or pipe failure, never a work deadline.
    escalation ??= setTimeout(() => killTree('SIGKILL'), 1000);
    escalation.unref();
  };
  const abort = () => {
    cancelled = true;
    emit({ phase: 'cancelled', origin: 'process' });
    terminate();
  };
  const ioFailure = (error: Error) => {
    processError = error.message.slice(0, 500);
    terminate();
  };
  stdout.on('error', ioFailure);
  stderr.on('error', ioFailure);
  const stdoutDone = finished(stdout).catch(ioFailure);
  const stderrDone = finished(stderr).catch(ioFailure);
  child.stdout.pipe(stdout);
  child.stderr.pipe(stderr);
  const decoder = new StringDecoder('utf8');
  let pending = '',
    dropping = false;
  const rowIds = new Set(input.rowIds);
  const seen = new Set<string>();
  const progress = new Map<string, { processed: number; total: number }>();
  const line = (value: string) => {
    if (!value.startsWith(prefix)) return;
    try {
      const r: unknown = JSON.parse(value.slice(prefix.length));
      if (!r || typeof r !== 'object') return;
      const p = r as Record<string, unknown>;
      let event: SelectorProgress;
      if (p.phase === 'model-loading' || p.phase === 'model-ready')
        event = { phase: p.phase, origin: 'provider' };
      else if (
        (p.phase === 'row-start' || p.phase === 'readout-complete') &&
        typeof p.rowId === 'string' &&
        rowIds.has(p.rowId)
      )
        event = { phase: p.phase, origin: 'provider', rowId: p.rowId };
      else if (
        p.phase === 'prefill' &&
        typeof p.rowId === 'string' &&
        rowIds.has(p.rowId) &&
        Number.isSafeInteger(p.processed) &&
        Number.isSafeInteger(p.total) &&
        Number(p.processed) >= 0 &&
        Number(p.processed) <= Number(p.total) &&
        Number(p.total) > 0 &&
        Number(p.total) <= input.maxPromptTokens
      ) {
        const previous = progress.get(p.rowId);
        if (
          previous &&
          (previous.total !== p.total ||
            previous.processed >= Number(p.processed))
        )
          return;
        const counters = {
          processed: Number(p.processed),
          total: Number(p.total),
        };
        progress.set(p.rowId, counters);
        event = {
          phase: 'prefill',
          origin: 'provider',
          rowId: p.rowId,
          ...counters,
        };
      } else return;
      if (event.phase !== 'prefill') {
        const key = JSON.stringify(event);
        if (seen.has(key)) return;
        seen.add(key);
      }
      if (!cancelled) emit(event);
    } catch {
      /* Raw stderr is inert, including malformed progress records. */
    }
  };
  child.stderr.on('data', (bytes: Buffer) => {
    const parts = decoder.write(bytes).split('\n');
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i]!;
      if (!dropping && pending.length + part.length <= 8192) pending += part;
      else {
        dropping = true;
        pending = '';
      }
      if (i < parts.length - 1) {
        if (!dropping) line(pending);
        pending = '';
        dropping = false;
      }
    }
  });
  child.on('error', (error) => {
    processError = error.message.slice(0, 500);
  });
  const exited = new Promise<{
    code: number | null;
    signal: NodeJS.Signals | null;
  }>((resolve) => {
    child.on('close', (code, signal) => resolve({ code, signal }));
  });
  input.options.signal?.addEventListener('abort', abort, { once: true });
  emit({ phase: 'starting', origin: 'process' });
  if (input.options.signal?.aborted) abort();
  const exit = await exited;
  processClosed = true;
  input.options.signal?.removeEventListener('abort', abort);
  // A dead parent can leave descendants alive. Cancellation always finishes the tree.
  if (cancelled || processError) killTree('SIGKILL');
  clearTimeout(escalation);
  await Promise.all([stdoutDone, stderrDone]);
  return {
    ...exit,
    cancelled,
    processError,
    elapsedMs: performance.now() - started,
    progressEvents,
    latestProgress,
    wallTimeLimit: null,
  };
}
