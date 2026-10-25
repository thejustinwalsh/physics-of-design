// Environment qualification only. This fixture measures no design preference.
import { mkdir, writeFile } from 'node:fs/promises';
import { isDeepStrictEqual } from 'node:util';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { artifact, validateArtifact } from './relay-capabilities.mjs';

export const selectorCapabilityPayload = Object.freeze({
  state: {
    purpose:
      'Verify the installed local readout can finish in this execution environment. Neither alternative is a design recommendation.',
  },
  question:
    'Choose either of these two equivalent environment-test alternatives.',
  options: [
    { id: 'a', description: 'Environment-test alternative A.' },
    { id: 'b', description: 'Environment-test alternative B.' },
  ],
});

function requestFor(output, selector) {
  return {
    payload: selectorCapabilityPayload,
    gguf: selector.checkpoint.path,
    profile: selector.profile,
    readout: 'single',
    maxPromptTokens: 1024,
    auditDirectory: path.join(output, 'audit'),
  };
}

function validateReadout(result, selector) {
  const provenance = result?.provenance,
    model = provenance?.model;
  if (
    !['a', 'b'].includes(result?.selected) ||
    provenance?.readoutPasses !== 1 ||
    provenance.execution?.code !== 0 ||
    provenance.execution.cancelled !== false ||
    model?.source !== 'Qwen/Qwen3.5-4B' ||
    model.revision !== selector.revision ||
    model.gguf?.sha256 !== selector.checkpoint.sha256
  )
    throw new Error(
      'Selector capability lacks a completed, pinned two-option readout',
    );
}

/** Reread the raw saved artifacts; a rehashed summary cannot replace a readout. */
export function validateSelectorCapabilityResult(result, output, { selector }) {
  if (
    selector.profile !== 'qwen3.5-4b' ||
    result?.profile !== selector.profile ||
    result.revision !== selector.revision ||
    result.checkpointSha256 !== selector.checkpoint.sha256 ||
    result.cleanup?.confirmed !== true
  )
    throw new Error(
      'Selector capability summary differs from assigned provider',
    );
  const request = JSON.parse(validateArtifact(output, result.request));
  if (!isDeepStrictEqual(request, requestFor(output, selector)))
    throw new Error(
      'Selector capability request differs from the frozen two-option fixture',
    );
  const readout = JSON.parse(validateArtifact(output, result.artifact));
  validateReadout(readout, selector);
  if (
    !isDeepStrictEqual(result.readout, {
      requested: 1,
      completed: 1,
      modelCalls: 1,
      candidates: 2,
      selectedId: readout.selected,
    })
  )
    throw new Error(
      'Selector capability summary differs from its completed readout',
    );
  return true;
}

export async function probe({ workspace, output, selector, signal }) {
  if (selector.profile !== 'qwen3.5-4b')
    throw new Error('Relay qualifies the single provisional 4B selector only');
  if (process.env.DESIGN_SEMIF_BIN !== selector.executable.path)
    throw new Error(
      'Capability process must use the assigned selector executable',
    );
  const { selectLocalOptions } = await import(
    pathToFileURL(path.join(workspace, 'toolkit/dist/selector.js')).href
  );
  const auditDirectory = path.join(output, 'audit');
  await mkdir(auditDirectory, { recursive: true });
  const request = requestFor(output, selector);
  await writeFile(
    path.join(output, 'request.json'),
    JSON.stringify(request, null, 2) + '\n',
  );
  const abort = new AbortController(),
    stop = () => abort.abort();
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
  signal?.addEventListener('abort', stop, { once: true });
  if (signal?.aborted) stop();
  let result;
  try {
    abort.signal.throwIfAborted();
    result = await selectLocalOptions(request, {
      signal: abort.signal,
      onProgress: (event) =>
        process.stderr.write(
          JSON.stringify({ type: 'capability.selector.progress', ...event }) +
            '\n',
        ),
    });
  } finally {
    // The existing selector process helper drains and terminates its detached
    // provider group on abort before the readout promise settles.
    process.removeListener('SIGINT', stop);
    process.removeListener('SIGTERM', stop);
    signal?.removeEventListener('abort', stop);
  }
  validateReadout(result, selector);
  const model = result.provenance.model;
  await writeFile(
    path.join(output, 'readout.json'),
    JSON.stringify(result, null, 2) + '\n',
  );
  const receipt = {
    profile: selector.profile,
    revision: selector.revision,
    checkpointSha256: model.gguf.sha256,
    readout: {
      requested: 1,
      completed: 1,
      modelCalls: 1,
      candidates: 2,
      selectedId: result.selected,
    },
    artifact: artifact(output, 'readout.json'),
    request: artifact(output, 'request.json'),
    cleanup: {
      confirmed:
        result.provenance.execution.code === 0 &&
        !result.provenance.execution.cancelled,
    },
    scope:
      'One actual restricted-option forward readout through the assigned local provider. No design-quality, speed, training, or aesthetic validation claim.',
  };
  validateSelectorCapabilityResult(receipt, output, { selector });
  return receipt;
}
