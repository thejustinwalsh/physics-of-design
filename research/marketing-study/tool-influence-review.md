# Full-condition tool influence review

The full-condition first delivery used the toolkit for a genuine, narrow two-stage typography decision. The selected values reach the rendered desktop page. It also completed a real local Qwen3.5-4B restricted-option readout and hash-bound cached replay. This establishes actual tool use and a limited implementation influence; it does not establish better design or lower overall token use.

This is a read-only audit of frozen `Study-720fd5b1` in `/private/tmp/design-marketing-20261108-b`. No frozen source was executed, repaired or rewritten. The audit inspects saved source, receipts and the actual app-server CLI trace. Isolation is reviewed separately. The machine-readable companion is `/private/tmp/design-marketing-20261108-b/tool-influence-review.json`; it retains SHA-256 identities for all 134 frozen files, the actual raw trace, and the provider/command evidence.

## Execution trail and its boundaries

| Layer | Observed evidence | What it establishes |
| --- | --- | --- |
| Authored inputs | `src/design-decisions.mjs`, `receipts/decision-request.json`, `context.json`, `font-inspect.json` | The builder chose variable ranges, preference bands, factors, questions and responsive topology. Context and real font-byte identities are bound to the request. These are brief-conditioned hypotheses, not human preference data. |
| Numeric exploration | `decision-run.json`, `decision-run-2.json` | Failed first attempt searched 12 states / 48 factor evaluations. Successful retry searched 12 hero states plus 9 section states: 21 states / 66 factors. Across attempts: 33 searched states. |
| Model selection | Two timestamp/PID wrapper directories with `invocation.json` and `completion.json`; one provider `*.output.jsonl` row | Two real process attempts: exit 1 then exit 0. One completed restricted-option readout, not two completed model decisions. |
| Dependency | Successful `section-rhythm.evidence.bindings.heroSize = 118` | The selected hero size is passed to the next stage's hierarchy expression. This is an actual ordered dependent workflow. |
| Replay | `src/replay-decisions.mjs`, `replay-request.json`, `decision-replay.json`, completed CLI trace item | Replay points to `/recipe` with the successful result's exact hash. Two cache hits, six retained assignments revalidated, 18 factor evaluations; zero searches, selector calls or neural calls in this replay. |
| Renderer measurements | `src/verify.mjs`, `src/measure-sections.mjs`, both engine finalist receipts | 24 title measurements and 18 section measurements using actual DOM rectangles/computed styles, plus separate browser checks. Their app/CSS hashes match the frozen deliverable. |
| Consumed values | `src/design-values.json`, imported by `src/app.jsx`; CSS variables consumed by `public/base.css` | Five chosen values affect desktop typography/spacing. Responsive overrides deliberately reduce their influence on smaller layouts. |

The workflow orders `hero-type` then `section-rhythm`. The first stage uses local selection among three retained alternatives. The second stage uses declared numeric preference energy and deterministic ties. All three retained section alternatives have zero declared energy; 60px is therefore not uniquely justified by the supplied factors. The engine reports zero lookahead searches, branches or reused lookahead searches. The numeric graphs are exhaustive roots, not evidence that a broader adaptive state-machine strategy or successor lookahead was used.

The successful selector row has ID `fed93d185222939fc18c3c69fa7b778306cf66ab7236c018464029fa14a6769c`, reports 984 input tokens, and selects `alternative-0`. It uses profile `qwen3.5-4b`, checkpoint SHA-256 `00fe7986ff5f6b463e62455821146049db6f9313603938a70800d1fb69ef11a4`, and single restricted-option logits. No answer tokens were generated. Wrapper process elapsed times were about 11.7 seconds for the failed attempt and 15.0 seconds for success; the successful provider reports about 9.81 seconds internally. These are different scopes. Failed-attempt provider input usage is unknown. No selector token count should be pooled with coding-model token counts as equivalent cost.

Count invocation **directories containing invocation/completion receipts**, not every filesystem entry in `receipts/selector`. There are two such directories. The surrounding input/output/process/failure files share one logical row ID and include historical failure evidence; they are not additional invocations. The surviving row-level process receipt describes success, while the separate failure receipt and first wrapper preserve the earlier initialization failure. A successful shell exit for the first `decision run` did not mean a completed selector decision: that result explicitly says `status: incomplete` and zero completed readouts.

## What actually drives the page

| Chosen value | Source-to-render path | Recorded scope |
| --- | --- | --- |
| Title size 118px | JSON import → App effect → `--title-size` → `h1` clamp maximum | Actual 118px at 1440/1600 widths. At iPad 820px the title is about 71.34px; at phone 390px about 54.99px, authored independently. |
| Leading 0.94 | `--title-leading` → `h1` line-height | Desktop/iPad consume it. Phone overrides to 0.96. |
| Tracking −0.05em | `--title-tracking` → `h1` letter spacing | Desktop/iPad consume it. Phone fixes −0.05em and therefore masks the different tracking finalist. |
| Section size 60px | `--section-size` → `h2` clamp maximum | Feature heading measures 60px on desktop; 42px at iPad and 46px on phone for every measured finalist. Other section-specific rules also override sizes. |
| Section gap 32px | `--section-gap` → `.section-intro` bottom margin `calc(+26px)` | Actual 58px desktop/iPad; phone has authored 35px. The selected number is an input to a final spacing rule, not the literal final gap. |

These values are consumed, rather than metadata only. The built JS also contains the JSON-derived binding path. This was an offline authoring-time toolkit decision; the deployed page does not run the toolkit or Qwen selector. Much of the page—including palette, composition, sculpture cropping, responsive topology, motion functions and demo behavior—is directly authored. No receipt supports attributing that entire design to the numeric search or selector.

The interactive specimen's slider uses separately authored equations for type size, leading, tracking, space, HSL color and orbit. Its “Save this path” stores one slider number in React state for the visit. Its “Replay saved” restores that number. This is a real working front-end control preset, **not** the toolkit's hash-bound decision recipe, zero-call engine replay or a persisted solver path. The nearby illustrative-specimen disclaimer narrows the claim, but the word “path” can still invite that stronger interpretation.

## Measurements versus authored estimates

The numeric program's hard title-height band uses `3 × titleSize × titleLeading`. For the chosen values it predicts 332.76px. That is an authored three-line approximation; it does not use actual font shaping, text widths, browser line fragments or CSS font variation in its calculation. The actual saved Chromium desktop title box is 345.125px. The estimate and the measured box are different quantities and must not be reported as identical verified geometry.

`inspectFont` records real font metadata, axes, metrics, coverage and byte identity. It does not itself establish a shaping-based title fit. The renderer scripts wait for fonts and obtain real DOM rectangles, client/scroll widths, computed sizes, line height, tracking and text range fragments. The saved finalist receipts demonstrate actual browser measurement. `analyzeComposition` receives those rectangles and tests an authored left-edge alignment constraint with 1px tolerance; that establishes the declared alignment, not general composition quality.

The numeric workflow and replay both still report `rendererVerification: pending`. The separate renderer evidence was not fed back into the decision recipe or used to choose between measured finalists. No measured loss function, revised numeric program, rejection stage or automatic post-render selection is evidenced. This is a tool-assisted choice followed by browser inspection, not a closed measurement-feedback solver.

All three title alternatives were measured at four sizes in both engines, but responsive overrides mask the title-size alternatives at iPad/phone, and all phone tracking alternatives converge. Similarly, section-size alternatives differ on desktop but converge at narrower sizes. The measurement count is valid; it is not 42 independent visibly distinct designs.

The final builder suite retains 134 passing checks and matching final JS/CSS identities. This audit does not independently rerun them. The final test script uses an actual mouse click on the slider track and keyboard Home/End/arrows; it does not exercise a continuous pointer drag. Scroll checks use programmatic `scrollTo`, rather than real wheel events. Disposal is reviewed in source, not tested through an unmount harness. These distinctions matter when interpreting broader interaction-verification requirements. The builder's own report discloses simulated enlargement, browser emulation and source-only cleanup review.

## Claims and remaining uncertainty

The page explicitly says design preference and lower overall build-token use have not been established, and that the optional selector does not verify facts or judge aesthetics. This audit finds no evidence that contradicts those limits. Generic marketing descriptions of native shaping, OKLCH, PBR and platform mappings are product capability copy, not demonstrations performed by this site's narrow typography run. Native geometry, PBR rendering, perceptual palette generation and actual user preference were not exercised here.

The build report's central claims about the 21-state successful search, actual completed selector, dependent binding, cached zero-call replay and renderer measurement counts are supported by matching receipts and CLI execution evidence. The 21-state number covers only the successful run; include the failed first run when discussing total tool effort. The report does not claim a selector aesthetic score or demonstrated token savings. The slogan “The physics of better interfaces” remains promotional language, not an empirical outcome of this case study.

No causal quality gain can be isolated from one full-condition build. The builder authored candidate ranges and constraints, selected the finalist question and much of the design, and then implemented and corrected the site. There is no counterfactual showing the same builder's outcome without those particular selected values, no blinded human preference observation in this audit, and no evidence that the unselected title options would be worse. The strongest supported conclusion is actual, narrow, traceable design-tool influence with separate renderer evidence.

Frozen identities: `src/app.jsx` SHA-256 `6bd25b3b02f1f1ab3d23690a0240cc20d88b6103331dafe650fc5b5170e04445`; `src/design-values.json` `4f6f3ab5413b57f960cf4be924d84aa5218ea4cfe1a83bdcb9c497ad0868da2a`; `public/app.js` `837b85d9a135bcf208b62328fa7c43e00d18e1e5a4d63fb2e0dcad4cc7518b89`; `public/base.css` `2ca2fdb80944f5ee284be578fe69b251c3ad89a989d50f6850e96f5ee351818a`. The JSON companion contains exact hashes for the decision requests/results, provider receipts, all remaining frozen evidence, and the raw trace so these findings can be checked without executing the specimen.
