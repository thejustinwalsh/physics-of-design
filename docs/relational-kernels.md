# Reuse measured choices and verify their property bindings

`kernel compile` turns a small semantic request into ordinary `decision run` stages. It reuses the existing energy engine; it does not search, call a model, render an app or generate a component tree. `bindings check` projects exact selected values and compares them with current renderer observations. Both APIs preserve missing evidence instead of treating a hash or a matching number as proof of authenticity.

## Three bounded compilers

| Kind         | Inputs                                                                                                                                                                  | Outputs and limits                                                                                                                                                                                                                                                                                                                                                                                |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `type-row`   | Actual copy; font/style identity; 2–12 named type candidates with observed text cells for every declared scenario; finite padding values; authored hit/row-height bands | Font size, absolute line height, tracking, measured text width, row height and padding. Hard guards reject measured overflow and the authored row maximum. The density band is an editable preference. This is a text/row relationship, not a component implementation.                                                                                                                           |
| `regions`    | 2–8 named regions with authored minimum measures and shares; finite gap/padding/split policies; optional link to a type-row choice                                      | Available width, column count and every region's allocated width. A paired row must fit all minimums; otherwise it stacks while retaining all regions. If even the stack cannot meet a minimum, the candidate fails. The linked type choice conditions the designated region's minimum using the observed text measure.                                                                           |
| `appearance` | Named finite alternatives containing ordinary palette, material-pair and motion-analysis inputs; authored direction preference; explicit static native finish           | Fresh executions of `analyzePalette`, `analyzeMaterialPair` and `analyzeMotion`, semantic palette values, spring parameters and surface parameters. Palette/analytic-motion failures and inconsistent/unknown declared material composition are excluded. Material target distances remain separate attributed factors. Composite contrast, appearance and native material parity remain pending. |

All candidates have semantic labels and numeric value aliases, so System 1 receives their meanings through the existing workflow. Each program binds the source/design/content identities, complete kernel input and product brief. Typography feeds the region stage through a real predecessor binding. Appearance can remain independent; a fabricated dependency would add work without a consequence. The shared brief enters each selector's declared context.

The compiler reserves at most 96 numeric evaluations per stage, enough for its finite candidate domains. It retains up to six Pareto/diverse alternatives through the existing search implementation. Requests allow at most eight kernels and 24 scenarios. This is a finite scope, not a claim of globally optimal layout or taste. An infeasible required stage blocks output resolution; it does not quietly drop a region or invent a token.

## Execute and resolve

Use the repository's compact discovery to inspect `kernel compile` once. The current frozen example is `examples/kernels/relay.json`; its observed text cells are actual Chromium measurements collected by `examples/kernels/relay-proof.mjs`. It supplies a common relational starting input, not a finished Relay design or native receipt.

```ts
import {
  compileRelationalKernels,
  runDecisionWorkflow,
  resolveRelationalKernelOutputs,
} from '@design-theory/toolkit';

const compiled = compileRelationalKernels(input);
const result = await runDecisionWorkflow({ workflow: compiled.workflow });
const selected = resolveRelationalKernelOutputs(compiled, result);
// Import or generate JSON from selected.values, retaining selected's identities.
const phone = selected.values.phone;
// phone['service-row.fontSize'], phone['service-row.rowHeight'],
// phone['workspace.columns'], phone['workspace.list.width'], ...
const replay = await runDecisionWorkflow({
  workflow: compiled.workflow,
  recipe: result.recipe,
  mode: 'replay',
});
```

`resolveRelationalKernelOutputs` checks compilation integrity, compares each current conditioned program identity with the workflow's source evidence, re-evaluates assignments and hard constraints, then emits named values per scenario. A result from a different kernel input is stale even if its chosen numbers still happen to be valid. It makes no search or neural call. The output retains the source workflow identity, scenario identities and outstanding renderer obligations. Current source hashes and source JSON pointers belong in the binding manifest described below.

`selection: "mathematical"` is the default. To request a real local selection, set the relevant kernel's selection to `local-selector` and supply the existing `decision run` selector configuration. Do not pass a synthetic selector to obtain a production inference count. A matching recipe replays through the ordinary guards.

For the smaller frozen request, run `node dist/cli.js kernel compile --input examples/kernels/relay-compact.json --resolve-file-refs --summary --output /tmp/relay-kernel-compilation.json`. It resolves only the explicitly hash-bound measurement file; regression coverage checks that it equals the full input exactly. `--publish-input` refreshes all three example files together.

The compiled workflow, full analyzer results and measurements can be written to files and reused with the CLI's hash-bound file references or exact MCP session references. Avoid printing these full artifacts into a builder's context. The compact summary and selected named values are the useful handoff.

`kernel resolve` exposes this existing resolver through CLI/MCP. Supply `{input, compilationIdentity, result}`: the original semantic input, the identity returned by `kernel compile`, and the full `decision run` result. Hash-bound file references can select `/input` and `/identity` from the saved compilation without copying its matrix. Run `design kernel resolve --input resolve-request.json --resolve-file-refs --output app/src/design.selected.json --summary`, then import the saved JSON and use its named values in components. Failed stages, changed compilations and invalid assignments reject; resolving performs no search, inference or renderer measurement. This removes custom glue around the exported resolver, not the obligation to measure the properties the app consumes.

## Measurement and platform contract

A text cell records scenario, measured width/height and overflow, provider, runtime, source result reference and the original renderer input identity. `kernelTextMeasurementIdentity` binds the adapted cell's exact text, font/style identity, candidate size/leading/tracking, measured width and declared scenario. Its purpose is to catch accidental parameter reuse; it does not authenticate an observation.

The caller's `fontIdentity` must cover actual bytes, face/weight, variation axes, OpenType settings, kerning and optical-sizing policy. Preserve the renderer's own `sourceInputIdentity` and full source receipt separately. A changed string, width, font state, source identity or scenario requires a matching new observation. The compiler rejects missing/duplicate cells and browser cells presented as native evidence.

Scenario units are `css-px` for web, `pt` for iOS and `dp` for Android. `textScale` is the requested stress enlargement; record actual system fontScale and platform behavior in the native source receipt. Do not both preapply a system multiplier and let native apply it again. The measured text cell, not a browser estimate, determines native text height. Layout outputs use the scenario's coordinate unit; `lineHeight` is an absolute layout value, while `lineHeightRatio` is a descriptive ratio. React Native takes numeric absolute line height; CSS/StyleX numeric line height is a multiplier, so emit an explicit pixel length for an absolute web value. React Strict DOM consumers must verify their pinned adapter's length conversion in both renderers. Row and region geometry remain proposals until their actual components are measured.

These compilers deliberately cover declared discrete scenarios. A runtime resize needs the shared relational resolver and a current observation or another compiled scenario; selecting the nearest stored width does not establish fit. Keep natural text heights, actual roots and safe-area projection in the renderer adapter. Expo web, iOS and Android require separate current observations.

The Relay font preflight found that the supplied Roboto Flex advertises `pnum` but not `tnum`; requesting `tnum:true` is unsupported by the existing measurement pipeline. Default Fontkit digit advances 0–9 were all 8.467 at the inspected 15px state. Those are two separate facts. The proof uses the default feature state and retains `font-numerals.json`; browser/native numeral alignment still needs actual rendering checks. Do not reinterpret missing `tnum` as proof that the default digits are proportional.

## Bind exact outputs to actual properties

`resolveOutputBindings` accepts one exact source JSON value and its hash, current design/source/input identities, and an array of typed targets. `current.resultIdentity` must equal that exact source hash. For a kernel handoff, use the whole `selected` object as `source.value`; its own embedded `resultIdentity` separately preserves the source workflow hash.

Each target declares a binding ID, scenario identity, platform/unit, RFC 6901 source pointer, rendered surface/test ID, supported property alias, source location and optional numeric tolerance. The resolver copies the scalar expected value from the pointer and signs the manifest with an ordinary integrity hash. It does not read a file, infer a property mapping or claim that the app imported the value.

```ts
const source = { value: selected, identity: hash(selected) };
const current = {
  designIdentity,
  sourceIdentity: currentApplicationSourceHash,
  inputIdentity: selected.inputIdentity,
  resultIdentity: source.identity,
};
const manifest = resolveOutputBindings({
  operation: 'resolve',
  current,
  source,
  bindings: [
    {
      id: 'service-label-width',
      scenario: 'phone',
      scenarioIdentity: selected.scenarioIdentities.phone,
      platform: 'web',
      unit: 'css-px',
      pointer: '/values/phone/service-row.textWidth',
      target: {
        surface: 'relay-service-label',
        property: 'width',
        sourceLocation: 'src/ServiceRow.tsx:24',
      },
      tolerance: 0.5,
    },
  ],
});
```

Use a real adapter to collect `getBoundingClientRect`, computed style or native `onLayout`/`onTextLayout` and the corresponding current input/scenario/source identities. The observation names its provider, runtime, source result reference and timestamp. Supply colors in the same normalized representation as the expected emitted value, and state whether a width is the declared box or a different coordinate frame. A transformed bounding rectangle cannot be compared to an untransformed width without an explicit adapter conversion.

`checkOutputBindings({operation:'check',manifest,current,observations})` returns:

- `pass` when the current observation matches the expected value within the declared tolerance.
- `unbound` for a missing observation; `override` for a different value.
- `stale` for a changed source/input/design/result or scenario identity.
- `wrong-evidence` for the wrong platform/provider, unit, surface, property or source location.
- `unknown`, `unsupported`, or explicitly permitted `recorded-unsupported` without converting it to verified support.

`complete` means every obligation passes or has the authored record policy. `verified` requires every binding to pass. Unknown binding IDs, duplicate observations/targets, malformed pointers, mismatched source payload hashes and incompatible property units throw as malformed caller input. A failed observed comparison is a valid result. A malicious caller can falsify a receipt or recompute hashes; this is a coordination and consistency boundary, not authentication or proof of causal influence.

For React/StyleX/RSD/RN integration, generate/import the selected JSON once and use named typed property mappings in components. A browser can inspect current computed values; native needs its real view/text measurements and explicit capability reports. Do not place dynamic inspectors on stale clones. Changed content or source invalidates the affected manifest. This adapter complements functional and accessibility checks; matching row height does not establish a working service table.

## Reproduce the current proof

```sh
npm run build
node examples/kernels/relay-proof.mjs
# Update the frozen example only when intentionally refreshing common inputs:
node examples/kernels/relay-proof.mjs --publish-input
npx tsx --test test/relational-kernels.test.ts test/output-bindings.test.ts
```

`DESIGN_KERNEL_RUNTIME` selects an isolated already-compiled runtime directory; `DESIGN_KERNEL_OUTPUT` changes the artifact directory. The proof hashes its source and emitted runtime files before and after, and rejects a changed-source run. It records 18 actual browser text observations across six scenarios, executes deterministic palette/material/motion analysis and the ordinary workflow, resolves selected output values, replays, and checks actual selected text-box widths through the binding adapter. A deliberately changed width must be detected as an override. It does not build the Relay app or claim actual native execution.

The frozen pre-builder receipt is `artifacts/relational-kernels-final/receipt.json`, recorded from `2026-10-25T13:27:42.360Z` to `2026-10-25T13:27:46.974Z`. It reports three searches / 13 assignments / 234 factor evaluations / zero neural calls; replay performs zero searches or neural calls and revalidates five assignments. All six selected actual text-width bindings pass, and the two-pixel negative control is detected. The compact semantic request is 6,849 compact JSON bytes, with the 15,561-byte resolved input retained on disk. These sizes are not token measurements. The source hashes in the receipt identify this execution; a later source change requires a new receipt.

The initial sandbox attempt failed to register Chromium's macOS process port. A source-loader attempt then failed because its browser callback contained an injected `__name` helper. The final proof uses compiled modules. The unavailable `tnum` request was rejected by actual font capability checking before being removed. Preserve those setup/capability failures separately from the successful final receipt; none is a passing renderer observation.
