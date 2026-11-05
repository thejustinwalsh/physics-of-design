# Use exact palette references in compact responses

The full `paletteCandidates()` result and ordinary CLI JSON are unchanged. Only compact `palette candidates` summaries change: `candidate.system` is an exact session `$designRef` for MCP, or a hash-bound `$designFile` when the CLI uses `--output FILE --summary`. Display `candidate.tokenPreview`, respecting `omittedTokens` and `truncatedTokens`. A preview is not a complete system. `omittedCandidates` records alternatives beyond the six shown; the retained full result preserves every candidate and role.

Pass the system reference unchanged into the next `palette analyze` request (or another compatible schema position). MCP resolves it in the same session. CLI consumers pass `--resolve-file-refs`; a stale file hash rejects reuse. Session eviction, result scope and explicit full-result behavior remain unchanged. `summarizeResult(..., null)` has no retained system to reference and returns `system:null`; ordinary callers needing the full palette should use the full result instead of a compact preview.

Before:

```ts
renderSwatches(compact.summary.candidates[0].system.tokens);
```

After:

```ts
const candidate = compact.summary.candidates[0];
renderPreview(
  candidate.tokenPreview,
  candidate.omittedTokens,
  candidate.truncatedTokens,
);
const nextInput = { system: candidate.system }; // preserve reference, do not reconstruct roles
```

Do not rewrite consumers of full results, authored palette systems, generator inputs, saved receipts or literal command strings. Dynamic JSON consumers and aliases need semantic review; the scanner intentionally makes no edits. The actual CLI/MCP integration regression proves identical analyzer facts after reference reuse, retains raw byte counts and verifies compact summaries avoid repeated role graphs. It does not establish model-token savings or selector decisions.
