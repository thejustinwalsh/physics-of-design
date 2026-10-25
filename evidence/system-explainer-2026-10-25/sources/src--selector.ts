import { hash } from './identity.js';
import { createReadStream } from 'node:fs';
import {
  mkdtemp,
  readFile,
  writeFile,
  rm,
  mkdir,
  stat,
  copyFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { StateSchema, type DesignState } from './state.js';
import { resolveLayout } from './responsive.js';
import { measurementKey, type Renderer } from './measurement.js';
import { stateColors } from './design-color.js';
import {
  streamSelectorProcess,
  notifySelector,
  type SelectorExecutionOptions,
} from './selector-process.js';
export type {
  SelectorExecutionOptions,
  SelectorProgress,
} from './selector-process.js';

export const QWEN_REVISION = '851bf6e806efd8d0a36b00ddf55e13ccb7b8cd0a';
export const SelectorProfileSchema = z.enum(['qwen3.5-4b', 'qwen3.5-0.8b']);
export const selectorProfiles = {
  'qwen3.5-4b': {
    model: 'Qwen/Qwen3.5-4B',
    revision: QWEN_REVISION,
    experimental: false,
  },
  'qwen3.5-0.8b': {
    model: 'Qwen/Qwen3.5-0.8B',
    revision: '2fc06364715b967f1860aea9cf38778875588b17',
    experimental: true,
  },
} as const;
export const ChoiceRequestSchema = z
  .object({
    candidates: z
      .array(z.object({ id: z.string().min(1), state: StateSchema }))
      .min(1)
      .max(16),
    criterion: z.string().min(1).max(2000),
    gguf: z.string().min(1),
    profile: SelectorProfileSchema.default('qwen3.5-4b'),
    readout: z.enum(['single', 'balanced']).optional(),
    maxPromptTokens: z.number().int().min(512).max(16384).default(4096),
    widths: z.array(z.number().finite().positive()).min(1).max(4),
    textScales: z
      .array(z.number().finite().positive())
      .min(1)
      .max(3)
      .default([1, 2]),
    auditDirectory: z.string().optional(),
  })
  .strict();
const SemifResult = z
  .object({
    id: z.string(),
    option_ids: z.array(z.string()),
    probabilities: z.array(z.number().finite().min(0).max(1)),
    option_logits: z.array(z.number().finite()).optional(),
    prompt_sha256: z.string().regex(/^[a-f0-9]{64}$/),
    prompt_version: z.literal('direct-options-v1'),
    model: z
      .object({
        source: z.string(),
        revision: z.string(),
        dtype: z.literal('gguf-quantized'),
        backend: z.literal('llamacpp'),
        serving_config: z.literal('llamacpp-direct-v1'),
        gguf: z.object({ sha256: z.string() }),
      })
      .passthrough(),
    readout: z.literal(
      'quantized last-position logits restricted to declared answer slots; no generated tokens',
    ),
  })
  .passthrough();

export async function selectChoice(
  input: z.input<typeof ChoiceRequestSchema>,
  renderer: Renderer,
  execution: SelectorExecutionOptions = {},
) {
  execution.signal?.throwIfAborted();
  const request = ChoiceRequestSchema.parse(input);
  const profile = selectorProfiles[request.profile];
  if (
    new Set(request.candidates.map((c) => c.id)).size !==
    request.candidates.length
  )
    throw new Error('candidate ids must be unique');
  const fixedContent = (state: DesignState) =>
    hash(
      state.blocks.map((b) => ({
        id: b.id,
        role: b.role,
        text: b.text,
        language: b.language,
      })),
    );
  if (
    request.candidates.some(
      (c) =>
        fixedContent(c.state) !== fixedContent(request.candidates[0]!.state),
    )
  )
    throw new Error(
      'art-direction alternatives must preserve the same ordered content, roles and language',
    );
  const viable: { id: string; state: DesignState }[] = [];
  const verified: {
    id: string;
    inputHash: string;
    engine: string;
    scenarios: number;
  }[] = [];
  const rejected: { id: string; reasons: unknown[] }[] = [];
  const geometry = new Map<string, unknown>();
  // Never accept a caller's feasible flag or a model assertion in place of a fresh renderer receipt.
  for (const candidate of request.candidates) {
    execution.signal?.throwIfAborted();
    const reasons: unknown[] = [];
    const base = await renderer.measure(candidate.state, { spacing: true });
    const observations = [base];
    if (!base.feasible) reasons.push({ scenario: 'base', issues: base.issues });
    for (const width of request.widths)
      for (const textScale of request.textScales) {
        const s = structuredClone(candidate.state);
        s.viewport = { ...s.viewport, width, textScale };
        StateSchema.parse(s);
        const m = await renderer.measure(s, { spacing: true });
        observations.push(m);
        if (!m.feasible) reasons.push({ width, textScale, issues: m.issues });
      }
    if (reasons.length) rejected.push({ id: candidate.id, reasons });
    else {
      viable.push(candidate);
      geometry.set(candidate.id, {
        base: base.blocks.map((block) => ({
          id: block.id,
          lines: block.lines.length,
          width: block.box.width,
          height: block.box.height,
        })),
        stress: base.blocks.map((block, index) => ({
          id: block.id,
          minLines: Math.min(
            ...observations.map((m) => m.blocks[index]!.lines.length),
          ),
          maxLines: Math.max(
            ...observations.map((m) => m.blocks[index]!.lines.length),
          ),
        })),
      });
      verified.push({
        id: candidate.id,
        inputHash: base.inputHash,
        engine: base.engine,
        scenarios: 1 + request.widths.length * request.textScales.length,
      });
    }
  }
  for (const candidate of viable)
    if (
      measurementKey(candidate.state) !==
      verified.find((v) => v.id === candidate.id)!.inputHash
    )
      throw new Error(
        'candidate font content changed during selection; remeasure before choosing',
      );
  if (!viable.length)
    return {
      selected: null,
      reason: 'no viable candidates',
      rejected,
      modelCalled: false,
      verified,
    };
  if (viable.length === 1)
    return {
      selected: viable[0]!.id,
      reason: 'only viable candidate',
      rejected,
      modelCalled: false,
      verified,
    };
  const readout =
    request.readout ?? (profile.experimental ? 'balanced' : 'single');
  if (readout === 'balanced' && viable.length > 6)
    throw new Error(
      'Balanced readout supports at most six viable candidates; narrow the choice set or explicitly use single.',
    );
  const ordered =
    readout === 'balanced'
      ? [...viable].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
      : viable;
  const payload = {
    state: {
      purpose:
        'Select an art-direction alternative. Geometry and content preservation were already verified; do not verify or score aesthetics.',
      scenarios: { widths: request.widths, textScales: request.textScales },
      content: ordered[0]!.state.blocks.map((b) => ({
        id: b.id,
        role: b.role,
        text: b.text,
        language: b.language,
      })),
      candidateHashes: ordered.map((candidate) => ({
        id: candidate.id,
        inputHash: verified.find((v) => v.id === candidate.id)!.inputHash,
      })),
    },
    question: request.criterion,
    options: ordered.map((c) => ({
      id: c.id,
      description: JSON.stringify({
        archetype: c.state.archetype,
        blocks: c.state.blocks.map((b) => ({
          id: b.id,
          font: b.font.family,
          axes: b.font.axes,
          weight: b.weight,
          size: b.size,
          trackingEm: b.trackingEm,
          leading: b.leading,
          measure: b.measure,
        })),
        gaps: c.state.gaps,
        colors: stateColors(c.state).tokens,
        measuredGeometry: geometry.get(c.id),
        responsive: request.widths.map((width) => {
          const resolved = resolveLayout({
            ...c.state,
            viewport: { ...c.state.viewport, width },
          });
          return {
            width,
            pattern: resolved.pattern,
            blocks: resolved.state.blocks.map((b) => ({
              id: b.id,
              size: b.size,
              leading: b.leading,
              measure: b.measure,
            })),
            gaps: resolved.state.gaps,
          };
        }),
      }),
    })),
  };
  const selected = await selectLocalOptions(
    {
      payload,
      gguf: request.gguf,
      profile: request.profile,
      readout,
      maxPromptTokens: request.maxPromptTokens,
      ...(request.auditDirectory
        ? { auditDirectory: request.auditDirectory }
        : {}),
    },
    execution,
  );
  for (const candidate of viable) {
    if (
      measurementKey(candidate.state) !==
      verified.find((v) => v.id === candidate.id)!.inputHash
    )
      throw new Error(
        'candidate font content changed during selection; remeasure before choosing',
      );
  }
  return { ...selected, modelCalled: true, verified, rejected };
}

export async function checkpointDigest(file: string, signal?: AbortSignal) {
  const digest = createHash('sha256');
  for await (const chunk of createReadStream(file, { signal }))
    digest.update(chunk);
  return digest.digest('hex');
}

export interface LocalOptionsPayload {
  state: unknown;
  question: string;
  options: { id: string; description: string }[];
}
export interface LocalOptionsRequest {
  payload: LocalOptionsPayload;
  gguf: string;
  profile: z.infer<typeof SelectorProfileSchema>;
  readout: 'single' | 'balanced';
  maxPromptTokens: number;
  auditDirectory?: string | undefined;
}
export async function selectLocalOptions(
  request: LocalOptionsRequest,
  execution: SelectorExecutionOptions = {},
) {
  const result = await selectPinnedLocalOptions(request, undefined, execution);
  notifySelector(execution, { phase: 'completed', origin: 'process' });
  return result;
}

/** One checkpoint digest per session; metadata and returned provenance guard every readout. */
export async function prepareLocalOptionsSession(
  gguf: string,
  execution: SelectorExecutionOptions = {},
) {
  execution.signal?.throwIfAborted();
  const file = path.resolve(gguf);
  const signature = async () => {
    const value = await stat(file, { bigint: true });
    return `${value.dev}:${value.ino}:${value.size}:${value.mtimeNs}:${value.ctimeNs}`;
  };
  const before = await signature();
  notifySelector(execution, { phase: 'checkpoint-hash', origin: 'process' });
  const checkpointHash = await checkpointDigest(file, execution.signal);
  if (before !== (await signature()))
    throw new Error('Checkpoint changed while hashing');
  return {
    checkpointHash,
    async select(
      request: LocalOptionsRequest,
      options?: SelectorExecutionOptions,
    ) {
      if (path.resolve(request.gguf) !== file || before !== (await signature()))
        throw new Error('Prepared selector checkpoint changed');
      const result = await selectPinnedLocalOptions(request, checkpointHash, {
        ...execution,
        ...options,
      });
      if (before !== (await signature()))
        throw new Error('Prepared selector checkpoint changed during readout');
      notifySelector(
        { ...execution, ...options },
        { phase: 'completed', origin: 'process' },
      );
      return result;
    },
  };
}
async function selectPinnedLocalOptions(
  request: LocalOptionsRequest,
  pinnedCheckpointHash?: string,
  execution: SelectorExecutionOptions = {},
) {
  execution.signal?.throwIfAborted();
  const profile = selectorProfiles[request.profile],
    readout = request.readout;
  if (
    !request.payload.options.length ||
    request.payload.options.length > 16 ||
    new Set(request.payload.options.map((o) => o.id)).size !==
      request.payload.options.length
  )
    throw new Error('Local selector requires 1–16 unique options');
  if (readout === 'balanced' && request.payload.options.length > 6)
    throw new Error('Balanced local readout supports at most six options');
  const ordered =
    readout === 'balanced'
      ? [...request.payload.options].sort((a, b) => a.id.localeCompare(b.id))
      : request.payload.options;
  const payload = { ...request.payload, options: ordered };
  if (!pinnedCheckpointHash)
    notifySelector(execution, { phase: 'checkpoint-hash', origin: 'process' });
  const checkpointHash =
    pinnedCheckpointHash ??
    (await checkpointDigest(request.gguf, execution.signal));
  const id = hash({
    algorithm: 'physics-choice-v2',
    checkpointHash,
    readout,
    profile: request.profile,
    maxPromptTokens: request.maxPromptTokens,
    payload,
  });
  const row = { id, ...payload };
  const rows =
    readout === 'single'
      ? [row]
      : ordered.map((_, offset) => ({
          ...row,
          id: hash({ id, rotation: offset }),
          options: [
            ...row.options.slice(offset),
            ...row.options.slice(0, offset),
          ],
        }));
  const dir = await mkdtemp(path.join(tmpdir(), 'physics-semif-'));
  const auditDirectory = request.auditDirectory ?? dir;
  const diagnostic = (suffix: string) =>
    path.join(auditDirectory, `${id}.${suffix}`);
  let validatingOutput = false,
    retainFailure = false;
  try {
    const inputFile = path.join(dir, 'input.jsonl'),
      outputFile = path.join(dir, 'output.jsonl');
    const inputRows =
      rows.map((value) => JSON.stringify(value)).join('\n') + '\n';
    await mkdir(auditDirectory, { recursive: true });
    await writeFile(inputFile, inputRows);
    await writeFile(diagnostic('input.jsonl'), inputRows);
    const start = performance.now();
    const processResult = await streamSelectorProcess({
      executable: process.env.DESIGN_SEMIF_BIN ?? 'semif-score',
      args: [
        '--mode',
        'direct',
        '--backend',
        'llamacpp',
        '--model',
        profile.model,
        '--revision',
        profile.revision,
        '--gguf',
        path.resolve(request.gguf),
        '--input',
        inputFile,
        '--output',
        outputFile,
        '--max-tokens',
        String(request.maxPromptTokens),
        '--llama-threads',
        '8',
      ],
      stdoutFile: diagnostic('stdout.txt'),
      stderrFile: diagnostic('stderr.txt'),
      rowIds: rows.map((row) => row.id),
      maxPromptTokens: request.maxPromptTokens,
      options: execution,
    });
    await writeFile(
      diagnostic('process.json'),
      JSON.stringify(processResult) + '\n',
    );
    // Preserve partial provider output even when it exits or is cancelled mid-readout.
    try {
      await copyFile(outputFile, diagnostic('output.jsonl'));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    if (
      processResult.cancelled ||
      processResult.code !== 0 ||
      processResult.processError
    ) {
      const phase = processResult.cancelled ? 'cancelled' : 'process';
      await writeFile(
        diagnostic('failure.json'),
        JSON.stringify({
          phase,
          ...processResult,
          note: 'No completed selection; raw pipes and any partial readout are preserved.',
        }) + '\n',
      );
      const error = new Error(
        `Local selector ${processResult.cancelled ? 'cancelled' : 'process failed'} (code=${processResult.code ?? 'none'}, signal=${processResult.signal ?? 'none'}). Diagnostics: ${diagnostic('failure.json')}`,
      );
      if (processResult.cancelled) error.name = 'AbortError';
      throw error;
    }
    validatingOutput = true;
    notifySelector(execution, { phase: 'validating', origin: 'process' });
    execution.signal?.throwIfAborted();
    // Preserve the raw file, but never load an unbounded provider result into memory.
    if ((await stat(outputFile)).size > 16 * 1024 * 1024)
      throw new Error('Selector readout exceeds the 16 MiB JSON result limit');
    const raw = await readFile(outputFile, 'utf8');
    const lines = raw.trim().split('\n');
    if (lines.length !== rows.length)
      throw new Error(
        'SemIf must return exactly one result per declared readout row',
      );
    const results = lines.map((line) => SemifResult.parse(JSON.parse(line)));
    for (const [index, result] of results.entries()) {
      if (
        result.id !== rows[index]!.id ||
        result.model.source !== profile.model ||
        result.model.revision !== profile.revision ||
        result.model.gguf.sha256 !== checkpointHash ||
        result.option_ids.length !== ordered.length ||
        new Set(result.option_ids).size !== ordered.length ||
        result.option_ids.some(
          (x) => !ordered.some((candidate) => candidate.id === x),
        ) ||
        result.probabilities.length !== ordered.length ||
        (result.option_logits &&
          result.option_logits.length !== ordered.length) ||
        Math.abs(
          result.probabilities.reduce((sum, value) => sum + value, 0) - 1,
        ) > 0.001
      )
        throw new Error(
          'SemIf returned mismatched candidate/model provenance or malformed option probabilities',
        );
    }
    const useLogits = results.every(
      (result) => result.option_logits !== undefined,
    );
    const scores = new Map(ordered.map((candidate) => [candidate.id, 0]));
    for (const result of results)
      for (const [index, candidateId] of result.option_ids.entries()) {
        const probability = result.probabilities[index]!;
        if (readout === 'balanced' && !useLogits && probability === 0)
          throw new Error(
            'Balanced readout needs finite option logits or strictly positive probabilities; zero readouts are not silently floored.',
          );
        const value =
          readout === 'single'
            ? probability
            : useLogits
              ? result.option_logits![index]!
              : Math.log(probability);
        scores.set(
          candidateId,
          scores.get(candidateId)! + value / results.length,
        );
      }
    const selected = ordered.reduce((best, candidate) =>
      scores.get(candidate.id)! > scores.get(best.id)! ? candidate : best,
    ).id;
    const result = results[0]!;
    execution.signal?.throwIfAborted();
    if (request.auditDirectory) {
      await mkdir(request.auditDirectory, { recursive: true });
      await writeFile(
        path.join(request.auditDirectory, `${id}.input.jsonl`),
        rows.map((value) => JSON.stringify(value)).join('\n') + '\n',
      );
      await writeFile(
        path.join(request.auditDirectory, `${id}.output.jsonl`),
        raw,
      );
    }
    return {
      selected,
      provenance: {
        profile: request.profile,
        readoutMode: readout,
        readoutPasses: rows.length,
        aggregation:
          readout === 'single'
            ? 'single restricted-option readout'
            : useLogits
              ? 'mean option logits across canonical cyclic rotations'
              : 'mean log option probability across canonical cyclic rotations',
        promptHashes: results.map((value) => value.prompt_sha256),
        experimental: profile.experimental,
        model: result.model,
        promptHash: result.prompt_sha256,
        readout: result.readout,
        latencyMs: performance.now() - start,
        execution: processResult,
      },
      caveat:
        'Option logits are used only to select a viable alternative. No confidence, validity or aesthetic score is exposed.',
    };
  } catch (error) {
    retainFailure = true;
    const cancelled =
      execution.signal?.aborted ||
      (error instanceof Error && error.name === 'AbortError');
    notifySelector(execution, {
      phase: cancelled ? 'cancelled' : 'failed',
      origin: 'process',
    });
    if (validatingOutput) {
      const reason =
        error instanceof Error
          ? error.message.slice(0, 500)
          : String(error).slice(0, 500);
      await writeFile(
        diagnostic('failure.json'),
        JSON.stringify({
          phase: cancelled ? 'cancelled' : 'output-validation',
          reason,
          note: 'No candidate was selected. Raw process output remains separate from compact context.',
        }) + '\n',
      );
      const failure = new Error(
        `Local selector ${cancelled ? 'cancelled' : 'output validation failed'}: ${reason} Diagnostics: ${diagnostic('failure.json')}`,
      );
      if (cancelled) failure.name = 'AbortError';
      throw failure;
    }
    throw error;
  } finally {
    if (!retainFailure || request.auditDirectory)
      await rm(dir, { recursive: true, force: true });
  }
}
