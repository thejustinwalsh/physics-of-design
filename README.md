# Design Theory

Local-first TypeScript CLI/MCP tools for **brief-driven mathematical design decisions**: coupled typography, perceptual color, responsive composition, precise component geometry and expressive motion. Fast bounded search explores weighted choices; a resolved design machine carries them into React + StyleX and React Native. Real renderers establish facts. Optional SemIf selects a mathematical frontier; it never verifies quality.

Vela is a complete six-screen app built from a generated policy. Fieldwork and the typography specimens remain executable proofs. This is a relational tool stack, not a component catalog or UI composer. Brief preference energy is not universal beauty, and musical ratios remain an optional hypothesis.

[Current extension and measured limits](docs/design-theory-extension.md) · [Previous app milestone](docs/design-machine-report.md) · [Full landscape](docs/landscape.md) · [Architecture](docs/adr-002-fast-design-machine.md)

```sh
npm ci && npm run build
./dist/cli.js composition solve --input examples/vela/problem.json --output /tmp/vela-choices.json
npm run vela:build
npm run vela:web:proof
# Actual native app, after native provisioning:
DESIGN_NATIVE_TOKEN=local-spike npm run vela:native
```

The solver returns an editable handoff, alternatives, factor evidence and an evaluated choice graph. MCP returns compact summaries and exact result references. Saved machines replay without inference; real rendering remains required.

## Motion, material relationships and developer gallery

```sh
npm run gallery:build
# Serve artifacts/vela/web; the gallery is /design-theory/ and Vela is /.
./dist/cli.js decision run --input examples/workflow/editorial-mathematical.json
./dist/cli.js wireframe inspect --input examples/wireframe/hero.json
./dist/cli.js prose analyze --input examples/prose/routing.json
```

`decision run` conditions later stages on earlier choices and caches each stage independently. Optional neural calls choose among mathematical alternatives; actual renderers validate finalists. The local proof made two neural calls and then replayed with zero calls. It follows one selected DAG path; automatic downstream backtracking is not implemented.

`motion dynamics` accounts for retarget work and dissipation. `motion timeline` emits bounded samples for GSAP/other runtimes. Material tools expose linear-RGB reflectance, roughness/metalness, seeded normal/roughness textures and explicit unsupported features. Media tools retain authored crop regions and source-pixel contrast scope. `prose analyze` models authored reader journeys, not literary beauty. Whole-layout technical drawings are editable through the MCP App; proposal edits require new renderer measurements.

The product name is Design Theory. Physics, energy, tension and entropy remain optional vocabulary. Historical papers, result reference prefixes, the `design` executable and the original GitHub address retain compatibility.

## Run

```sh
npm ci
npm run build
npm run fonts
npx playwright install chromium webkit --only-shell
node scripts/request.mjs examples/hero.json '{"probes":true}' | ./dist/cli.js layout measure
node scripts/request.mjs examples/editorial.json '{"directory":"artifacts/editorial","interactive":true}' | ./dist/cli.js proof
```

Every command reads one JSON object, writes JSON to stdout, and sends errors to stderr with exit1. Use `--input FILE`, `--output FILE`, or `--jsonl` for Unix composition. Valid but infeasible designs return explicit issues and `feasible:false`. Font paths resolve from the working directory. `./dist/cli.js --help` lists the complete command set; `commandSchemas` exports the actual typed schemas.

| Command                                                                     | Purpose                                                                                     |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `energy search` / `energy analyze`                                          | Bounded weighted search, evaluated choice graph and local finite-difference pressures       |
| `composition solve`                                                         | Brief-conditioned search, optional local frontier selection and guarded solver recipes      |
| `decision handoff` / `decision replay`                                      | Resolved content/region/transition machine and zero-inference replay                        |
| `color convert` / `palette ramp` / `palette analyze` / `palette candidates` | CSS4/OKLCH, role contrast and joint repair with alpha uncertainty                           |
| `motion analyze` / `motion candidates` / `motion emit` / `motion proof`     | Analytic spring fields, bounded alternatives, platform plans and inspection                 |
| `component solve` / `component inspect`                                     | Source-bound dimension equations and technical drawings                                     |
| `decision run`                                                              | Conditional staged choice DAG, per-stage recipes and zero-inference replay                  |
| `wireframe inspect`                                                         | Whole-layout dimensional overlays and editable MCP App equations                            |
| `motion dynamics` / `motion timeline`                                       | Retarget work/dissipation and bounded runtime sample tables                                 |
| `surface probe` / `surface map` / `surface textures`                        | Linear PBR response, explicit Three mapping and reproducible normal/roughness data          |
| `media analyze` / `media crops`                                             | Decoded raster descriptors, source-region contrast and authored crop alternatives           |
| `prose analyze`                                                             | Section facts, task journeys, conditional cost and explicit probability entropy             |
| `material pair` / `material candidates`                                     | Separate finish/color/texture/light relationships and brief-conditioned Pareto pairings     |
| `validation plan` / `validation check`                                      | XState phase gates carrying current scenario and tool-evidence obligations                  |
| `registry`                                                                  | Evidence, heuristics, hypotheses, standards, sources and limits                             |
| `font inspect`                                                              | Real metrics, axes, features, coverage and font checksum                                    |
| `typography inspect` / `typography axes`                                    | Guarded browser baselines, outline/Canvas facts and bounded variable-axis endpoint wizard   |
| `text shape`                                                                | Glyph positioning/kerning plus actual renderer line breaks                                  |
| `intervals candidates`                                                      | Log-ratio alternatives and configurable multi-peak curves                                   |
| `relations score`                                                           | Separate conditional factors, alternatives and uncertainty                                  |
| `layout measure`                                                            | Actual rendered geometry, wrap brackets, content/spacing failures                           |
| `system graph`                                                              | Variable/factor dependencies                                                                |
| `system perturb`                                                            | Safe editable-state changes, locks and transitive invalidation                              |
| `system relax`                                                              | Bounded discrete search/refinement, responsive feasibility, Pareto alternatives             |
| `responsive patterns` / `responsive resolve`                                | Flex-only relational patterns and effective variables at a width                            |
| `rhythm analyze`                                                            | Ordered motifs, global/local entropy, attributed empirical surprise                         |
| `emit`                                                                      | React + StyleX source or React Native mapping with capability reports                       |
| `proof`                                                                     | Offline editable specimen, baseline guides, font comparison, source and state               |
| `choice select`                                                             | Fresh deterministic validation followed by the one optional local selector                  |
| `corpus validate` / `corpus analyze`                                        | Rights/attribution/project-split checks and rendered feature extraction                     |
| `color analyze` / `color candidates`                                        | Opaque sRGB contrast constraints, OKLCH descriptors and editable bounded alternatives       |
| `composition plan`                                                          | Shared editable flex topology, type/spacing roles and conditional measures                  |
| `platform audit`                                                            | Source-pinned Apple target, safe-area, scaling and navigation checks with explicit unknowns |
| `composition analyze`                                                       | Rectangle alignment constraints, grouping, overlap, balance and whitespace descriptors      |
| `training export`                                                           | Validated project-split preference records with synthetic/human provenance                  |
| `evaluate`                                                                  | Matched task/seed metrics, project-level preferences and hypothesis screening               |

State commands take `{state:...}`. See [examples/hero.json](examples/hero.json), [examples/editorial.json](examples/editorial.json), [the architecture decision](docs/adr-001.md), and [the research ledger](docs/research-ledger.md).

## Typography precision

```sh
./dist/cli.js typography inspect --input examples/typography/inspect.json
./dist/cli.js typography axes --input examples/typography/axes.json
npm run typography:proof
```

Both commands resolve responsive values and user text enlargement before inspecting the chosen block. The axis wizard defaults to all 40 Roboto Flex probes: requested state plus minimum/default/maximum for each of its 13 axes. Fontkit outlines, global metrics, DOM Range fragments, guarded baseline coordinates and Canvas drawing metrics remain distinct. Unsafe baseline probes return null; computed CSS does not reveal the browser's resolved axes. The current WebKit optical-size divergence is recorded rather than hidden. See [measurement semantics and proof](docs/typography-measurement.md) and [independent review](docs/typography-review.md).

Empty glyph outlines now have nullable bounds while retaining advances. Existing consumers can use the [dated semantic migration](codemods/2026-10-25-nullable-glyph-ink/instructions.md); its AST scan deliberately leaves arithmetic decisions to the caller.

## Responsive rules

Use [validation phases](docs/validation-phases.md) to carry the brief's phone/iPad/desktop, enlargement, content, motion and platform obligations across element/phase boundaries. Missing or stale receipts block progression; synthetic critique cannot satisfy human review. Run `npm run validation:proof` for six real geometry/palette calls and deliberate missing/stale cases. The gate coordinates evidence; it does not replace the validators or infer an exhaustive matrix.

Both emitters use explicit flex direction, wrap, grow, shrink and basis. Reading stacks use `nowrap`; optional rows may wrap and return to stacks when text measures no longer fit. A capped reading column remains appropriate on iPad and desktop. No CSS Grid is used.

Editable `responsive.anchors` couple type size, leading, tracking, measure, gutters, gaps and container caps to available width. Bounded interpolation preserves user text enlargement. The emitted web specimen observes its container with ResizeObserver. Native mappings resolve the same policy and use actual Text/Yoga measurements. Phone, iPad split/portrait/landscape and desktop names identify test scenarios, not device detection.

```sh
node scripts/request.mjs examples/hero.json '{"path":"/blocks/0/size","value":104}' | ./dist/cli.js system perturb
node scripts/request.mjs examples/hero.json '{"maxCandidates":9,"widths":[320,507,834,1440],"textScales":[1,2],"pinned":["/blocks/0/size"]}' | ./dist/cli.js system relax
```

Values and anchors remain editable. Old receipts become stale after state/font changes. Persistent locks and per-search pins are explicit. Numerical typography preferences are uncalibrated heuristics. [Responsive rationale and primary sources](docs/responsive-rules.md), [Astra + Impeccable review](docs/astra-design-review.md), [post-refinement judgment](docs/astra-design-followup.md).

## Native measurement

The pinned Expo58 / React Native0.88 harness returns actual `Text.onTextLayout` and `View.onLayout` geometry, loaded-font identity, runtime/version, system fontScale and device/window metadata. It never substitutes browser or standalone Yoga estimates. Virtual artboards and actual tablet windows remain different evidence classes.

On Apple Silicon with Xcode/iOS26.5 available:

```sh
npm run native:provision # Project-local Android SDK/JDK; accepts SDK licenses; downloads official Expo Go runtimes
DESIGN_NATIVE_TOKEN=local-spike npm run native:start
# Another terminal, while the harnesses are ready:
DESIGN_NATIVE_TOKEN=local-spike npm run test:native
DESIGN_NATIVE_TOKEN=local-spike DESIGN_NATIVE_PLATFORM=native-android npm run test:native
```

The session helper uses isolated simulator/AVD storage and a loopback bridge. It owns its bridge/Metro/proxy/emulator processes and stops those children on exit. Start with ports4319/8087/8088 available. The explicit IPv4→IPv6 Metro proxy avoids an emulator/localhost binding failure observed on this Mac. Native custom axes/optical sizing, disabled kerning and arbitrary OpenType toggles return explicit unsupported reports; use licensed static faces when appropriate. Native user text scaling is additional to requested stress textScale.

## Local selector

```sh
npm run selector:provision
npm run selector:smoke
```

Provisioning pins SemIf, the tokenizer and one Qwen3.5-4B Q4_K_M checkpoint, checking the recorded SHA-256. See [model provenance](research/selector-provenance.json). `scripts/semif-local.sh` runs offline with the project cache; `DESIGN_SEMIF_BIN` can select another installed SemIf executable. Selection itself downloads nothing.

Add `select:{criterion,gguf,auditDirectory?}` to `system relax`, or call `choice select` directly. Every candidate is remeasured before selection; zero/one viable candidates bypass inference. Returned choices include verification identity and model provenance, never an aesthetic/validity confidence score. Raw option readouts are retained only in requested audit artifacts.

## MCP and optional App

Configure stdio with command `node`, args `[/absolute/path/dist/cli.js,mcp]`, and this repository as working directory. The default profile exposes three tools: `design_catalog` discovers a command/schema, `design_execute` invokes it, and `design_specimen` opens the optional App. Use exact session references such as `{"$designRef":"pod:1","pointer":"/state"}` to reuse returned values. Summary responses retain a full result reference; request `response:"full"` when needed. `DESIGN_MCP_PROFILE=full` enables named wrappers for all 55 commands. No SaaS account is needed for the toolkit. Measured default discovery is the recorded compact wire size; see `npm run context:budget`; host framing varies.

MCP Apps hosts can use `ui://design-theory/specimens.html`. The App supports live edits, font comparison, actual browser baseline guides, dependency effects, recomputation, alternatives and an explicit human art-direction tie-break. Headless CLI operation is independent of the UI. The actual MCP SDK host bridge is integration-tested; a host's own UI policies may differ. HTML proof always previews the web renderer; native proof requires its native receipt.

## Verification and experiments

```sh
npm run verify # Core, browser, every CLI/MCP command, actual App SDK bridge, public consumer types
# With native harnesses and selector provisioned:
DESIGN_NATIVE_TOKEN=local-spike npm run verify:all
```

The full lane also executes both native platforms, real SemIf inference, and all three content/width/scale/search matrices. Logs and receipts are in `artifacts/verification` and `artifacts/system`. Deliberate clipping, stale receipts, broken inputs, lease/cancellation failures and unsupported capabilities are tested alongside successful specimens.

`npm run evaluate:agent` runs the paired same-agent first-pass experiment and retains raw prompts, JSONL usage events, output states, latency and renderer checks. `npm run evaluate:ratings` creates blinded local comparisons; `scripts/import-ratings.mjs` imports actual human observations. No ratings are invented. The initial executed pre-refinement experiment increased tokens/latency and did not establish fewer attempts. Musical preference remains undetermined and smooth stays the default. See [the full system report](docs/system-report.md) for exact results, supported conclusions and limits.

The licensed original corpus pilot and controlled perturbations live in `research/pilot-corpus.json`. It is not an award-design dataset. New records require explicit rights, attribution, strata, controls and project-level holdout. The musical prior is discarded if matched preference evidence shows no practical advantage; the factor engine remains useful independently.

## Color, composition and small-model research

State `colors` couples role tokens to actual web/native output and hard text contrast checks. `color analyze` keeps contrast constraints separate from optional hue/chroma/lightness descriptors. `color candidates` respects locks and returns multiple bounded single-token alternatives. `composition analyze` describes supplied rectangles, reading order and groups; it does not infer semantic salience or beauty. The legacy state color API accepts opaque sRGB hex. New `color convert` and `palette` commands add CSS4 inputs, OKLCH ramps, explicit sRGB emission, joint role repair and conservative alpha uncertainty; verified backdrop sampling remains a renderer responsibility. See [color rules](docs/color-rules.md) and [award inspiration provenance](research/inspiration-registry.json).

`npm run selector:provision:tiny` installs the pinned experimental 0.8B checkpoint without downloading 4B weights. Explicitly pass `profile:"qwen3.5-0.8b"` to use it. Its default balanced readout canonicalizes candidates and averages option logits across cyclic answer-slot rotations; this increases inference work and does not validate aesthetic ability. The original single-pass probe was order-sensitive. [Selector and training report](docs/selector-and-training.md) records memory, repeatability and synthetic-teacher evidence. No weight training has been run. `training export` preserves ties/abstentions in raw ratings and exports directional examples with project holdouts; four training projects are insufficient to claim a competent design judge.

The repository skill at [.agents/skills/design-theory/SKILL.md](.agents/skills/design-theory/SKILL.md) teaches measured, concise use. [Whole-system acceptance](docs/system-completion.md) routes every requirement to its outcome. [Portable evidence](evidence/README.md) includes renderer observations, screenshots, verification, raw synthetic labels and measured negative results; larger reproducible caches remain ignored.

## License and contributions

[MIT](LICENSE) for this project. Third-party dependencies retain their licenses; GSAP3.15 uses its [standard no-charge license](https://gsap.com/standard-license/), and is an optional browser-example runtime rather than part of the mathematical engine. [The voluntary agent pledge](AGENT-PLEDGE.md) asks agents and their operators to pay useful fixes forward when authorized. It is a request, not a condition on MIT permissions. [Contribution guidance](CONTRIBUTING.md) covers reproductions, provenance and research claims.

## Complete composition proofs

[Fieldwork](examples/fieldwork/content.json) is an original publication and companion native-app concept, built to challenge more than title/prose. The website has cover, issue and article compositions; the React Native app has journal, search, saved and reader views, local persistence, reading preferences and phone-tab/tablet-sidebar adaptation. Imagined editorial photographs retain [asset provenance](research/fieldwork-asset-provenance.json).

```sh
npm run build
npm run fieldwork:build
npm run fieldwork:web:proof
# Native, after provisioning and with its ports free:
DESIGN_NATIVE_TOKEN=local-spike npm run fieldwork:native
```

The shared `composition plan` controls type, density, measures and topology. `cropMedia` computes matching focal-point cover geometry for DOM and native images. `composition analyze` checks authored peer-edge/size contracts. The [skill comparison](docs/skill-comparison.md) extracts 18 conditional practices from Elaya and Impeccable. [Apple policy](docs/apple-hig-mathematics.md) explains what is executable and what still needs rendered/task review. [Full composition review](docs/fieldwork-design-review.md) records Astra's initial findings and accepted evidence; it is not a universal aesthetic calibration.

The native product session launches real iPhone/Android apps and the optional observation collector with owned-service cleanup. It uses Metro8087/proxy8088 and collector4321. While it is running, `npm run fieldwork:native:flows` exercises Android gestures and persistence; `scripts/prove-fieldwork-native.mjs PLATFORM DEVICE LABEL` captures a named device. Product mode and measurement-harness mode are separate sessions because their active native screens serve different tasks.
