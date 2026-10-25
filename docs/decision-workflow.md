# Design decision workflow API

Design Theory can execute a dependency-ordered sequence of design decisions. Each active stage searches a separate numeric program, then optionally asks the same pinned local model to select one of its mathematically admissible alternatives. A predecessor's selected numeric variables condition later scenario inputs. Application navigation remains a separate concern in `decision-machine.ts`.

## Entry points

`runDecisionWorkflow(input)` executes the entire workflow. `compileDecisionWorkflow(input)` returns an executable `DecisionWorkflowMachine`, with asynchronous `step()` and `run()` methods and a synchronous `getSnapshot()`. `step()` executes one stage in deterministic topological order. The snapshot state is `ready`, `running`, or `complete`; completion can still contain failed or stale stages. Concurrent calls to `step()` are rejected. Snapshots are copies and cannot alter the machine.

`RunDecisionWorkflowSchema`, `DecisionWorkflowSchema`, `DecisionStageSchema`, and `DecisionWorkflowRecipeSchema` are strict Zod input boundaries. Unknown object fields, undeclared binding inputs, missing dependencies, duplicate identifiers, and cyclic graphs are rejected before execution.

The request contains:

| Field      | Meaning                                                                                    |
| ---------- | ------------------------------------------------------------------------------------------ |
| `workflow` | Version 1 definition with `id`, stages, optional context, and budgets                      |
| `selector` | Optional checkpoint path, pinned profile, readout mode, prompt budget, and audit directory |
| `recipe`   | Previous returned recipe containing reusable successful/skipped stages                     |
| `mode`     | `search` by default; `replay` forbids both new mathematical exploration and selector calls |

## Stage definition

Every stage declares `id`, `purpose`, an `EnergyProgram` in `program`, and `provenance: {kind, source}`. `kind` is `brief`, `heuristic`, `hypothesis`, or `calculated`. The program retains its own factor provenance and separate preference tensions.

`dependsOn` names predecessor stages. `bindings` contains `{input, stage, variable}` records: the predecessor's chosen variable overwrites the named scenario input in every scenario of this stage. The input must already exist in every scenario. Bindings cannot reference derived outputs or undeclared dependencies.

`contextKeys` declares which workflow context values affect the stage and are visible to its selector. Unused context values do not invalidate it. A stage's optional `when` expression uses only its bound predecessor inputs: zero skips the stage, any finite nonzero result activates it. Dependants of a skipped, stale, blocked, or failed stage are blocked because that stage supplies no chosen assignment. Independent branches continue.

`options` uses `EnergySearchOptionsSchema`. `selection` defaults to `mathematical`; `local-selector` requires the workflow selector configuration. `question` supplies the local selection criterion. The model sees the stage brief, declared context, conditioned bindings, assignments, and compact ranges of preference observations. Every offered alternative has passed that stage's mathematical hard guards across its declared scenarios. At most 16 candidates are offered for single readout, or six for balanced readout. All retained search candidates remain available in the result, including those not offered to the model.

The mathematical policy selects the lowest declared preference energy with deterministic ties. Neither policy certifies aesthetics or renderer behavior. A one-candidate stage does not call the model.

## Cache and replay

Each stage key binds its normalized conditioned program, search options, declared context, purpose, provenance, question, guard, bindings, predecessor keys and assignments, selector policy, and actual checkpoint digest. A downstream rule change leaves earlier unrelated stages reusable. A predecessor identity change invalidates dependants even when its chosen assignment remains numerically equal. Reordering stage declarations does not change the path.

Replay validates payload integrity, re-evaluates the guard, re-evaluates every retained assignment against the current numeric program, and checks that the selected assignment belongs to those alternatives. It does not repeat search or call the model. A stale entry remains visible as `previous`; search mode can replace it, while replay mode returns `stale`. Hashes detect accidental changes; they are not signed attestations of an untrusted recipe's authorship.

A prepared selector session hashes the actual checkpoint once per workflow execution. It checks file identity, size, modification time, and change time before and after each readout; returned model provenance must match the pinned digest and profile. Each separate replay hashes the checkpoint again. Thus zero neural replay still includes filesystem hashing and fresh numeric checks. Audit-directory and checkpoint-path changes alone do not invalidate a cache when checkpoint bytes and policy remain identical.

Results preserve `chosen`, `replayed`, `skipped`, `stale`, `blocked`, and `failed` stage states, alternatives, and search evidence. Recipes contain reusable entries only; retain the full result when preserving failed exploration or stale history. A model failure does not silently fall back to a different design choice. Every result reports renderer verification as pending.

## Budgets and counters

Workflows permit at most 16 stages and 128 dependency edges. The sum of declared stage `maxEvaluations` must fit both workflow `maxEvaluations` and `maxGraphNodes` before execution. Both default to 65,536 and are capped at 100,000. This conservative reservation gives each stage a stable search policy and cache identity even when earlier stages replay or skip. Each stage also retains the numeric engine's factor-observation and expression-operation limits.

`maxSelectorCalls` defaults to 16 and caps selector invocations. `maxReadoutPasses` defaults to 96 and caps requested answer-slot readouts: one for single readout, one per offered candidate for balanced readout. Exhausting either budget leaves the stage failed with its mathematical alternatives intact.

`statistics` separates new searches/evaluations, replayed assignment checks (`revalidated`), all performed factor evaluations, newly generated graph nodes, cache hits, selector invocations, requested and completed readout passes, and checkpoint hashes. `neuralCalls` counts production selector invocation attempts; a failed subprocess need not have completed a readout. `testSelectorCalls` counts explicitly injected unit-test calls, with zero `neuralCalls`. Test-injected selector identities cannot reuse production cache entries. The recipe's retained evidence describes the originating search; current execution counters live in the top-level `statistics`.

## Runnable proof

The example at [`examples/workflow/editorial.json`](../examples/workflow/editorial.json) selects a reading column, then conditions text-size exploration on the selected width. Build before running the proof:

```sh
npm run build
node scripts/prove-decision-workflow.mjs
DESIGN_SEMIF_BIN=./scripts/semif-local.sh node scripts/prove-decision-workflow.mjs --selector
```

The first command runs mathematical selection. The `--selector` command requires the provisioned local 4B GGUF and performs two real stage readouts, then proves unchanged replay uses zero selector calls and a downstream typography change preserves the composition stage. `DESIGN_GGUF` overrides the checkpoint path; `DESIGN_WORKFLOW_OUTPUT` overrides the default `artifacts/workflow` evidence directory. Unit tests with injected selectors are protocol tests, not neural evidence.

The workflow currently executes one selected path through a bounded acyclic dependency graph. It does not automatically backtrack if a later stage has no admissible alternative. Its preserved alternatives support an explicit subsequent revision. Real font shaping, responsive browser/native geometry, accessibility checks, and visual critique remain separate required evidence. Local neural throughput is hardware-dependent; this API makes no hundreds-of-calls-per-second claim.
