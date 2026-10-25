# A measured, staged design field

The `examples/design-field/brief.json` case turns the recorded synthetic **DELIBERATE FRICTION** interview into a finite, inspectable design problem. Its preferences are authored hypotheses, not human approval or empirical laws. `DESIGN.md` provides separately hashed project context. The real title, body, font bytes and original SVG are inputs; generated choices are not three manually authored style presets.

## Reproduce the case

The CLI/MCP routes expose the same functions. `field measure` expects `{ "brief": ... }`:

```sh
node -e 'const fs=require("fs"); console.log(JSON.stringify({brief:JSON.parse(fs.readFileSync("examples/design-field/brief.json"))}))' | ./dist/cli.js field measure --output /tmp/field-measurements.json
```

`field run` takes `{brief,measurements}` with optional selector/recipe/mode; `field validate` takes `{brief,measurements,tokens}`. Discover each exact schema using `design_catalog` or `design <command> --schema`; compact MCP/CLI summaries keep measurement grids and search graphs behind result references, including `/workflow/recipe` for replay. CLI `--summary --output FILE` and explicit hash-bound references are described in [CLI context](cli-context.md).

```sh
npm run build
node scripts/prove-design-field.mjs --publish-fixture
# Opt into two real local readouts, after provisioning the pinned checkpoint:
DESIGN_SEMIF_BIN=./scripts/semif-local.sh node scripts/prove-design-field.mjs --selector --publish-fixture
```

`DESIGN_FIELD_OUTPUT` changes the output directory. `DESIGN_GGUF` changes the checkpoint path; actual bytes still bind its identity. The default mathematical run makes no neural calls. `--selector` uses the existing prepared SemIf session for one narrow-frontier choice per stage, with one checkpoint hash per run. It is not inference inside every numeric evaluation.

The proof records full measurements, search session, actual finalist validation, replay, partial invalidation and a compact gallery session. `--publish-fixture` updates the checked-in measurement and gallery JSON used by `FieldSession.jsx`. Without it, generated files remain in the output directory. Each top-level library call records its actual input/result hash and elapsed time; the session includes the existing workflow's detailed searches and selector audit provenance. Mathematical evaluations, neural attempts and completed readouts have separate counters.

## What the numeric exploration means

The first stage evaluates **540** combinations of title size, body size, content cap, inter-region gap and body leading. Before search, Chromium measures **252** independent text cells: every title-size/column and body-size/column/leading combination at phone, iPad and desktop, each at text scale 1 and 2. The search looks up actual natural text heights, line counts and horizontal overflow. It does not estimate wrapping from character count or font advance. Gap choices share those text measurements because the gap does not change the text width.

A direct-successor lookahead evaluates **432** expression assignments for each of six retained reading candidates before the first choice. The selected child search is reused. The whole run therefore evaluates **3,132** assignments through seven numeric searches (540 reading + 6 × 432 expression), with no neural inference inside that loop.

The expression stage explores **432** image-aspect, image-share, two-finish roughness and motion-role combinations, conditioned on all five selected reading variables. Its image-to-text-height relationship uses the measured selected text stack. Geometric asymmetry is `abs(2 * imageShare - 1)`; its desired band is deliberately above zero. Roughness contrast is the difference between two declared roughness parameters. Neither is a calibrated measure of perceived tension or material contrast. Motion role is categorical: quiet, settle or rebound. Its finite alternative preference changes are reported, but no derivative or physical force is assigned to the category index.

Hard text-overflow and action-reach guards stay separate from weighted preference contributions. Reading density, hierarchy, spacing, image dominance and material counterpoint remain independently attributed. `energy analyze` computes finite neighbouring changes; the view retains factor-by-factor work so competing scenario effects remain visible. A low aggregate only describes the authored bands and weights. It does not establish beauty, usability or award-level art direction.

The case has explicit fixed geometry conventions: phone padding 20px, other padding 36px; title size capped by 13.5% of viewport width before user enlargement; body width capped by 55% of the content maximum, available width and 680px. These are local, revisable compiler policies, not external standards. Title leading, title tracking, body tracking, font axes and optical sizing are editable brief inputs. Values and font bytes bind the measurement identity. The title/body/action retain natural height; a 44px action precedes imagery. Action reach permits additional vertical distance at enlarged text.

The original SVG is decoded locally with network access blocked. Intrinsic image dimensions support cover geometry; a 32×32 luminance sample is descriptive evidence only. It is not used as a proxy for physical roughness, reflectance, subject detection or a perceptual score. The source image and finishes remain separate inputs.

## APIs and evidence boundaries

- `collectDesignFieldMeasurements(brief)` reads source bytes, validates primary font coverage and supplied variation axes, then measures the complete finite text matrix in Chromium.
- `compileDesignField({brief, measurements, selection?, designContextIdentity?})` compiles two ordinary `EnergyProgram` stages into the existing workflow schema. A declared design-context path requires its inspected hash. This function does not add a second optimizer.
- `runDesignField({brief, measurements, selector?, recipe?, mode?})` checks current source bytes, invokes `context inspect` when requested, runs the existing staged machine, and calls `energy analyze` for chosen stages.
- `validateDesignFieldFinalist({brief, measurements, tokens})` renders the exact standalone text/action/image fixture at all six scenarios and checks containment, source loading, agreement with measured text cells and action reach.
- `designFieldStageView(session, id)` returns retained alternatives, individual factors, saved-choice pressure probes and alternative work.

Strict Zod schemas cover briefs, measurements, run requests and validation requests. Measurement digest checks detect mismatches, duplicates and incomplete matrices; they are not signed attestations that an untrusted caller actually ran a browser. Test fixtures explicitly identify their provider as `test-fixture` and cannot enter a real selector run.

Whole coupled alternatives remain unrendered until finalist validation. Even a passed finalist receipt covers only that standalone fixture in its recorded Chromium runtime. It does not verify the surrounding gallery, native layout, physical devices, accessibility, fallback scripts, material appearance or motion choreography. Those need their own tests. The gallery uses separate CSS and bounded GPU DOM adapters with their declared material limits; standalone field validation does not verify either adapter.

## Reuse and editing

An unchanged recipe re-evaluates twelve retained stage alternatives plus six saved successor witnesses without search or neural calls. A changed child policy or target invalidates a parent whose selection used its lookahead; do not claim downstream-only invalidation for that dependency. Changed text/fonts/domains require new matching measurements. Changing `DESIGN.md` changes dependent workflow identities without changing the text measurement identity; replay becomes stale and a new choice is required. No automatic prose-to-constraint inference is claimed.

The gallery imports the generated session. Comparing retained options performs no model call. A different reading choice explicitly makes the old conditioned expression stage stale; another full combination is labeled an unvalidated preview. Restoring the saved choice is a local UI action, not execution of the replay API. Downloaded current choices and downloaded saved evidence identify these different states. The reproducible command remains visible.

## Current actual selector receipt

The 2026-10-25 run in `artifacts/design-field-runtime-v2-selector` passed six finalist scenarios and verified source/emitted-module hashes unchanged from start to end. It made two actual Qwen3.5-4B single readouts: approximately 92.42 s and 58.45 s on the local CPU configuration. Replay made zero searches/readouts and revalidated 18 assignments. This is evidence of execution and reuse, not model taste or general speed. The compact serialized full result is 1,598,462 bytes; its shared diagnostic summary is 7,436 bytes (before host framing).

The revised prompts include units, complete category aliases and bounded worst-scenario consequences. Tokenizer-only preflight measured 4,506 and 3,733 tokens for its recorded candidate payloads; actual chosen-branch prompt hashes and raw readouts remain in the run's selector directory. A prior expression attempt failed under the old 120-second process budget; that failure remains in `artifacts/design-field-runtime-v2-selector-attempt-2`. Do not count its two attempted calls as two completed readouts. Failed process diagnostics remain separate from compact context. The subsequent [streaming selector](selector-streaming.md) removes wall-time cutoffs and the timeout environment setting entirely; it reports actual chunk progress and supports explicit cancellation. The 92/58-second run is historical to that transport change and must not be relabeled a current streamed run.

See [bounded lookahead](adr-005-bounded-successor-lookahead.md) and [scenario applicability and selector vocabulary](adr-006-scenario-applicability-and-selector-vocabulary.md). Programs with scenario-specific hard bands fail closed at unsampled or ambiguous inputs unless their handoff explicitly authors the base-band continuation policy. Matching a nearby width is not equivalent to matching a declared scenario.
