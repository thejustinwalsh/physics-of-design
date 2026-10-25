#!/usr/bin/env node
// Local app-server transport. This does not modify the frozen comparison runner.
import { StringDecoder } from 'node:string_decoder';
import { spawn, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  mkdirSync,
  writeFileSync,
  readFileSync,
  appendFileSync,
  openSync,
  closeSync,
  fsyncSync,
  existsSync,
  renameSync,
  mkdtempSync,
  copyFileSync,
} from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
const hash = (b) => createHash('sha256').update(b).digest('hex');
const save = (p, x) => {
  const tmp = p + '.tmp';
  writeFileSync(tmp, JSON.stringify(x, null, 2) + '\n', { mode: 0o600 });
  renameSync(tmp, p);
};
const configPath = () =>
  path.join(
    process.env.CODEX_HOME ?? path.join(os.homedir(), '.codex'),
    'config.toml',
  );
const configHash = () =>
  existsSync(configPath()) ? hash(readFileSync(configPath())) : null;
async function cleanupOwnedGroup(groupId) {
  if (!groupId || process.platform === 'win32')
    return {
      groupId: groupId ?? null,
      confirmedEmpty: false,
      reason: 'POSIX process group unavailable',
      forced: false,
    };
  const exists = () => {
    try {
      process.kill(-groupId, 0);
      return true;
    } catch (error) {
      return error.code !== 'ESRCH';
    }
  };
  if (!exists()) return { groupId, confirmedEmpty: true, forced: false };
  try {
    process.kill(-groupId, 'SIGTERM');
  } catch {}
  const end = performance.now() + 1000;
  while (exists() && performance.now() < end)
    await new Promise((resolve) => setTimeout(resolve, 25));
  let forced = false;
  if (exists()) {
    forced = true;
    try {
      process.kill(-groupId, 'SIGKILL');
    } catch {}
  }
  const killedBy = performance.now() + 500;
  while (exists() && performance.now() < killedBy)
    await new Promise((resolve) => setTimeout(resolve, 25));
  return {
    groupId,
    confirmedEmpty: !exists(),
    forced,
    scope:
      'Owned POSIX process group only; separately detached runtime groups require launcher cleanup checks.',
  };
}
export class JsonLines {
  constructor(onValue, maxBytes = 16 * 1024 * 1024) {
    this.onValue = onValue;
    this.maxBytes = maxBytes;
    this.decoder = new StringDecoder('utf8');
    this.pending = '';
    this.lines = 0;
  }
  push(bytes) {
    this.pending += this.decoder.write(bytes);
    let end;
    while ((end = this.pending.indexOf('\n')) !== -1) {
      const line = this.pending.slice(0, end);
      this.pending = this.pending.slice(end + 1);
      if (Buffer.byteLength(line) > this.maxBytes)
        throw Error('JSONL line exceeds configured bound');
      if (line.trim()) {
        this.lines++;
        this.onValue(JSON.parse(line), line);
      }
    }
    if (Buffer.byteLength(this.pending) > this.maxBytes)
      throw Error('JSONL pending line exceeds configured bound');
  }
  end() {
    this.pending += this.decoder.end();
    return {
      completeLines: this.lines,
      trailingBytes: Buffer.byteLength(this.pending),
      truncated: !!this.pending.trim(),
    };
  }
}
export class UsageLedger {
  constructor(threadId = null) {
    this.threadId = threadId;
    this.turnId = null;
    this.updates = [];
    this.turnStatus = null;
    this.regressions = [];
  }
  accept(message, receivedAt = new Date().toISOString()) {
    const p = message.params;
    if (!p || p.threadId !== this.threadId) return false;
    if (message.method === 'turn/started' && p.turn?.id)
      this.turnId = p.turn.id;
    if (message.method === 'turn/completed' && p.turn?.id === this.turnId)
      this.turnStatus = p.turn.status;
    if (
      message.method !== 'thread/tokenUsage/updated' ||
      (this.turnId && p.turnId !== this.turnId)
    )
      return false;
    const keys = [
      'inputTokens',
      'cachedInputTokens',
      'outputTokens',
      'reasoningOutputTokens',
      'totalTokens',
    ];
    if (typeof p.turnId !== 'string')
      throw Error('Usage notification missing turnId');
    for (const name of ['total', 'last'])
      for (const k of keys)
        if (
          !Number.isSafeInteger(p.tokenUsage?.[name]?.[k]) ||
          p.tokenUsage[name][k] < 0
        )
          throw Error(`Malformed usage ${name}.${k}`);
    const prior = this.updates.at(-1)?.tokenUsage.total;
    if (prior && keys.some((k) => p.tokenUsage.total[k] < prior[k]))
      this.regressions.push({
        receivedAt,
        previous: prior,
        next: p.tokenUsage.total,
      });
    this.updates.push(structuredClone({ ...p, receivedAt }));
    return true;
  }
  snapshot(reason) {
    const latest = this.updates.at(-1);
    return {
      reason,
      threadId: this.threadId,
      turnId: this.turnId,
      turnStatus: this.turnStatus,
      notificationCount: this.updates.length,
      reportedUsage: latest?.tokenUsage ?? null,
      lastReportedAt: latest?.receivedAt ?? null,
      coverage: latest
        ? 'actual latest reported thread cumulative usage; unreported tail unknown'
        : 'unknown: no usage notification received',
      completeTurnObserved: this.turnStatus === 'completed',
      regressions: this.regressions,
      aggregation:
        'latest total replaces prior total; never sum snapshots; cached/reasoning fields preserved without adding them again',
    };
  }
}
export function snapshotSchemas(out) {
  mkdirSync(out, { recursive: false });
  const temp = mkdtempSync(path.join(os.tmpdir(), 'codex-metrics-schema-'));
  execFileSync('codex', ['app-server', 'generate-json-schema', '--out', temp], {
    stdio: 'pipe',
  });
  const sources = {};
  for (const f of [
    'v1/InitializeParams.json',
    'v1/InitializeResponse.json',
    'v2/ThreadStartParams.json',
    'v2/ThreadStartResponse.json',
    'v2/TurnStartParams.json',
    'v2/TurnInterruptParams.json',
    'v2/ThreadTokenUsageUpdatedNotification.json',
    'v2/TurnCompletedNotification.json',
  ]) {
    const b = readFileSync(path.join(temp, f));
    const target = path.join(out, path.basename(f));
    writeFileSync(target, b);
    sources[f] = hash(b);
  }
  const receipt = {
    cliVersion: execFileSync('codex', ['--version'], {
      encoding: 'utf8',
    }).trim(),
    generatedAt: new Date().toISOString(),
    source: 'Installed codex app-server generate-json-schema; no model call',
    schemas: sources,
    helperSha256: hash(readFileSync(fileURLToPath(import.meta.url))),
  };
  save(path.join(out, 'provenance.json'), receipt);
  return receipt;
}
export async function recordSession(
  spec,
  out,
  {
    probe = false,
    executable = 'codex',
    argsPrefix = ['app-server', '--listen', 'stdio://'],
    signal,
    env = {},
    validateThreadStart,
    onTurnStarted,
  } = {},
) {
  if (
    !spec ||
    typeof spec.cwd !== 'string' ||
    (!probe && typeof spec.prompt !== 'string')
  )
    throw Error('Spec requires cwd and (for run) prompt');
  if (
    Object.keys(env).some((key) => ['HOME', 'home', 'CODEX_HOME'].includes(key))
  )
    throw Error('Per-run environment cannot replace home or Codex state roots');
  const budget = Object.hasOwn(spec, 'timeoutMs') ? spec.timeoutMs : null,
    grace = spec.interruptGraceMs ?? 5000;
  if (
    (budget !== null &&
      (!Number.isInteger(budget) || budget < 1 || budget > 3600000)) ||
    !Number.isInteger(grace) ||
    grace < 0 ||
    grace > 30000
  )
    throw Error('Invalid bounded timeout/grace');
  mkdirSync(out, { recursive: false });
  const before = configHash();
  const startedAt = new Date().toISOString(),
    start = performance.now();
  const args = [...argsPrefix, ...(spec.appServerArgs ?? [])];
  const ledger = new UsageLedger();
  const raw = path.join(out, 'stdout.jsonl'),
    rawFd = openSync(raw, 'wx', 0o600),
    journalFd = openSync(path.join(out, 'usage.jsonl'), 'wx', 0o600);
  const stderrFd = openSync(path.join(out, 'stderr.txt'), 'wx', 0o600);
  const outbound = path.join(out, 'requests.jsonl');
  save(path.join(out, 'invocation.json'), {
    startedAt,
    executable,
    args,
    spec,
    probe,
    configSha256: before,
    helperSha256: hash(readFileSync(fileURLToPath(import.meta.url))),
    budgetStarts: 'process spawn, includes handshake/thread startup',
    approvalHandling:
      'No automatic client approvals. Unexpected server requests fail explicitly.',
    environmentOverrideKeys: Object.keys(env).sort(),
  });
  const child = spawn(executable, args, {
    cwd: spec.cwd,
    stdio: ['pipe', 'pipe', 'pipe'],
    detached: true,
    env: { ...process.env, ...env },
  });
  let nextId = 0,
    done = false,
    timedOut = false,
    cancelled = false,
    finishReason = 'process-exit',
    protocolError = null,
    framing = null,
    settleTimer,
    forceTimer,
    budgetTimer;
  let interruptedTurn = null;
  let startNotified = false;
  const waiting = new Map();
  let finishResolve;
  const finished = new Promise((r) => (finishResolve = r));
  const flushSnapshot = (reason) => {
    fsyncSync(rawFd);
    fsyncSync(journalFd);
    save(path.join(out, 'usage-latest.json'), ledger.snapshot(reason));
  };
  const send = (message) => {
    const line = JSON.stringify(message) + '\n';
    appendFileSync(outbound, line, { mode: 0o600 });
    child.stdin.write(line);
  };
  const request = (method, params) =>
    new Promise((resolve, reject) => {
      const id = nextId++;
      waiting.set(id, { resolve, reject });
      send({ id, method, params });
    });
  const sendInterruptIfReady = () => {
    if (
      (!timedOut && !cancelled) ||
      done ||
      !ledger.threadId ||
      !ledger.turnId ||
      interruptedTurn === ledger.turnId
    )
      return;
    interruptedTurn = ledger.turnId;
    request('turn/interrupt', {
      threadId: ledger.threadId,
      turnId: ledger.turnId,
    }).catch(() => {});
  };
  const stop = (reason) => {
    if (done) return;
    done = true;
    finishReason = reason;
    clearTimeout(budgetTimer);
    clearTimeout(settleTimer);
    flushSnapshot(reason);
    try {
      process.kill(-child.pid, 'SIGTERM');
    } catch {}
    forceTimer = setTimeout(() => {
      try {
        process.kill(-child.pid, 'SIGKILL');
      } catch {}
    }, 1000);
    forceTimer.unref();
  };
  const notifyTurnStarted = () => {
    if (startNotified || !ledger.threadId || !ledger.turnId) return;
    startNotified = true;
    try {
      onTurnStarted?.({ threadId: ledger.threadId, turnId: ledger.turnId });
    } catch (error) {
      protocolError = `Turn-start observer failed: ${String(error)}`;
      stop('turn-start-observer-failed');
    }
  };
  const parser = new JsonLines((message) => {
    const usage = ledger.accept(message);
    notifyTurnStarted();
    sendInterruptIfReady();
    if (usage) {
      appendFileSync(
        journalFd,
        JSON.stringify({
          receivedAt: new Date().toISOString(),
          notification: message,
        }) + '\n',
      );
      flushSnapshot('usage-notification');
    }
    if (message.id !== undefined && waiting.has(message.id)) {
      const pending = waiting.get(message.id);
      waiting.delete(message.id);
      message.error
        ? pending.reject(Error(JSON.stringify(message.error)))
        : pending.resolve(message.result);
    } else if (message.id !== undefined && message.method) {
      protocolError = 'Unexpected server request ' + message.method;
      send({
        id: message.id,
        error: {
          code: -32601,
          message:
            'Metrics recorder does not grant approvals or answer user input',
        },
      });
      stop('unsupported-server-request');
    }
    if (
      message.method === 'turn/completed' &&
      message.params?.threadId === ledger.threadId &&
      message.params?.turn?.id === ledger.turnId
    ) {
      clearTimeout(settleTimer);
      settleTimer = setTimeout(
        () =>
          stop(
            cancelled
              ? 'cancelled-interrupted'
              : timedOut
                ? 'timeout-interrupted'
                : 'turn-ended',
          ),
        250,
      );
    }
  });
  child.stdout.on('data', (bytes) => {
    appendFileSync(rawFd, bytes);
    try {
      parser.push(bytes);
    } catch (e) {
      protocolError = String(e);
      stop('protocol-error');
    }
  });
  child.stderr.on('data', (bytes) => appendFileSync(stderrFd, bytes));
  child.stdin.on('error', () => {});
  child.on('error', (e) => {
    protocolError = String(e);
    stop('spawn-error');
  });
  child.on('close', (code, signal) => {
    abortSignal?.removeEventListener('abort', cancel);
    clearTimeout(budgetTimer);
    clearTimeout(settleTimer);
    framing = parser.end();
    flushSnapshot(finishReason);
    for (const p of waiting.values()) p.reject(Error('App-server closed'));
    waiting.clear();
    finishResolve({ code, signal });
  });
  const interrupt = (reason) => {
    if (done || timedOut || cancelled) return;
    timedOut = reason === 'timeout';
    cancelled = reason === 'cancelled';
    finishReason = reason;
    clearTimeout(budgetTimer);
    flushSnapshot(`${reason}-before-interrupt`);
    sendInterruptIfReady();
    settleTimer = setTimeout(() => stop(`${reason}-drain-expired`), grace);
  };
  const timeout = () => interrupt('timeout');
  const cancel = () => interrupt('cancelled');
  const abortSignal = signal;
  abortSignal?.addEventListener('abort', cancel, { once: true });
  if (abortSignal?.aborted) cancel();
  if (budget !== null && !cancelled) budgetTimer = setTimeout(timeout, budget);
  try {
    if (cancelled) throw Error('Cancelled before initialization');
    const init = await request('initialize', {
      clientInfo: { name: 'design_builder_metrics', version: '1.0.0' },
    });
    save(path.join(out, 'initialize-result.json'), init);
    send({ method: 'initialized', params: {} });
    if (probe) {
      stop('handshake-only');
    } else if (!timedOut && !cancelled && !done) {
      const thread = await request('thread/start', {
        ...spec.threadStart,
        cwd: spec.cwd,
        ephemeral: true,
      });
      ledger.threadId = thread.thread.id;
      save(path.join(out, 'thread-start-result.json'), thread);
      if (validateThreadStart) await validateThreadStart(thread);
      if (!timedOut && !cancelled && !done) {
        const turn = await request('turn/start', {
          ...spec.turnStart,
          threadId: ledger.threadId,
          input: [{ type: 'text', text: spec.prompt }],
        });
        ledger.turnId = turn.turn.id;
        save(path.join(out, 'turn-start-result.json'), turn);
        notifyTurnStarted();
        sendInterruptIfReady();
      }
    }
  } catch (e) {
    if (!done && !cancelled) {
      protocolError = String(e);
      stop('request-failed');
    }
  }
  const exit = await finished;
  clearTimeout(forceTimer);
  const processCleanup = await cleanupOwnedGroup(child.pid);
  if (!processCleanup.confirmedEmpty)
    protocolError ??= 'Owned process group cleanup could not be confirmed';
  closeSync(rawFd);
  closeSync(journalFd);
  closeSync(stderrFd);
  const after = configHash();
  const receipt = {
    startedAt,
    finishedAt: new Date().toISOString(),
    wallMs: performance.now() - start,
    wallTimeLimitMs: budget,
    ...exit,
    timedOut,
    cancelled,
    finishReason,
    protocolError,
    framing,
    probe,
    processCleanup,
    configBefore: before,
    configAfter: after,
    configUnchanged: before === after,
    usage: ledger.snapshot(finishReason),
    rawSha256: hash(readFileSync(raw)),
    usageJournalSha256: hash(readFileSync(path.join(out, 'usage.jsonl'))),
    limits: [
      'No recovery of usage never emitted by server.',
      'Timeout receipt is latest reported cumulative total, not a certified final billed total.',
      'This helper does not enforce design-condition isolation; caller must predeclare and verify identical per-run config.',
    ],
  };
  save(path.join(out, 'receipt.json'), receipt);
  return receipt;
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const [command, input, output] = process.argv.slice(2);
  if (command === 'schema')
    console.log(JSON.stringify(snapshotSchemas(path.resolve(input)), null, 2));
  else if (command === 'run' || command === 'probe') {
    const spec = JSON.parse(readFileSync(input, 'utf8'));
    const controller = new AbortController(),
      cancel = () => controller.abort();
    process.once('SIGINT', cancel);
    process.once('SIGTERM', cancel);
    try {
      console.log(
        JSON.stringify(
          await recordSession(spec, path.resolve(output), {
            probe: command === 'probe',
            signal: controller.signal,
          }),
          null,
          2,
        ),
      );
    } finally {
      process.removeListener('SIGINT', cancel);
      process.removeListener('SIGTERM', cancel);
    }
  } else
    console.log(
      'schema <new-directory> | probe <spec.json> <new-directory> (no model) | run <spec.json> <new-directory> (starts one authorized turn)',
    );
}
