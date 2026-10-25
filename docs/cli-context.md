# Compact CLI receipts

The CLI retains full JSON by default. Agents can fetch one input schema without running a command or reading stdin, then keep large results on disk while reading a compact summary:

```sh
node dist/cli.js kernel compile --schema
node dist/cli.js kernel compile --input kernel-input.json --output compiled.json --summary
```

`--summary` requires `--output` and a single JSON result. The full file is the ordinary composable result. Standard output contains `summary` and a `fullResult` reference with an absolute path, exact byte SHA256 and optional RFC 6901 pointer. Kernel summaries include a workflow reference; decision/field summaries include their recipe reference. Retention summaries expose unreachable targets, ties and incomplete Pareto work; bounded lookahead summaries expose witnessed, unknown or infeasible continuations. Full graphs and renderer grids stay in the referenced file.

An explicit input reference looks like:

```json
{"workflow":{"$designFile":"compiled.json","sha256":"<exact byte hash from prior output>","pointer":"/workflow"}}
```

Pass `--resolve-file-refs` to resolve it before command validation. Hash mismatch fails with stderr JSON and exit 1. References are inert without that flag. A referenced file cannot trigger another file read by embedding references in its payload. Resolution is limited to eight unique files, 16 MiB per file, 32 MiB unique-file bytes, 32 MiB expanded request bytes, one million expanded nodes and 64 expanded nesting levels. Repeated references count toward the expansion budget before cloning; the MCP session resolver enforces the same expanded-value limits. Same-file references share one byte snapshot and return independent selected values. Hashes establish byte identity, not renderer authenticity or causal influence.

This transport is local to the CLI. MCP keeps its existing bounded, session-local `$designRef` store; it does not automatically open arbitrary `$designFile` paths. CLI `--schema` and MCP `design_catalog` use the same schema source. No filesystem result transport is advertised as cloud or cross-machine storage.

To minimize context, load the brief and relevant skill facet, discover one schema, compile a small semantic kernel, execute the existing bounded decision workflow, resolve selected outputs into properties, then measure those actual properties through the binding checker. Call relevant specialist tools when the task needs them. Calling every tool, repeating full JSON in prompts, or making a model select a single remaining option adds no evidence of design quality.
