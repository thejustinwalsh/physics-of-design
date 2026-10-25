# Bold field CLI/MCP integration review

Reviewed on 2026-10-25: the six new commands (`context inspect`, `field measure`, `field run`, `field validate`, `surface css`, `surface light`), their index exports, MCP catalog/summary/reference paths, context binding and discoverability. Probes compiled current source into an isolated `/tmp` runtime. No saved selector output or gallery fixture was overwritten. The review found two correctness issues; both are closed below. The documentation follow-up is now closed by the integrating agent.

## Findings and closure

**Closed — P2: finalist receipt identity omitted render-affecting settings.** Two actual Chromium validations used identical source bytes and numeric tokens but title leading 1.04 versus 1.08, with fresh matching measurement tables. Both passed; phone title heights were 162.234375px and 168.46875px. Both formerly returned identity `75f37ebde5e3ab267105715dada31070478fbd6c44c3b4f105abadfdaf818bf4`. A caller could therefore confuse two distinct rendered fixtures when associating receipts by identity.

The authorized fix in `src/design-field.ts` binds validator version `design-field-finalist-v2`, normalized brief, measurement identity, source digests, tokens, scenario policy and actual Chromium runtime. Using the full normalized brief deliberately invalidates on provenance/preference edits too; this is conservative reuse, not inferred prose semantics. `designFieldValidationIdentity` calculates that binding only and explicitly does not attest that rendering occurred. Regression coverage includes leading, tracking, optical sizing, image focal position, measurement identity, runtime and equivalent explicit/omitted defaults. All six field tests pass. The actual two-render probe still passes both fixtures and now returns distinct identities `4b5e6bfb1873600a62d82ccad3a97d64276fcb1fbfefae35ad3ebcf22448836e` and `dd6b32b2895d7a2e4c05c9d4b33ee20079e7765157495dd68948a1c74d3da450`. Probe/result: `/tmp/bold-field-identity-probe.mjs`, `/tmp/bold-field-identity-result.json`.

**Closed — P2: caller-supplied selection metadata escaped the compact field summary.** A mathematically valid replay recipe containing 262,144-character selection notes per stage, with recomputed ordinary integrity digests, replayed with zero neural calls and generated a 526,896-byte summary. This does not demonstrate forged browser evidence: payload hashes were never authentication. It demonstrates a missing output boundary for metadata accepted by the public recipe schema.

The integrating agent replaced the raw selection copy with bounded, typed fields. The same actual replay now returns a 2,637-byte summary; both notes are absent while the exact result reference retains all 262,144 characters for the reading stage. Nine current context/design-context tests pass, including the new oversized-metadata regression. Probe: `/tmp/bold-summary-fixed-probe.mjs`. The initial review message also suspected `decision run`; source inspection corrected that suspicion—its compact summary already omits selection. No issue is claimed for that path.

**Closed documentation follow-up — discoverability.** The CLI help and MCP catalog expose all six commands, and `src/index.ts` exports the corresponding APIs. At review time, the README command table listed none of these six. The field and DOM documents explained library functions/proof scripts but lacked direct JSON CLI/MCP request examples; the registry had broad brief-energy/material entries but no explicit authored-context/DOM-approximation entry. The integrating agent owns this documentation/registry follow-up. README now lists all six commands; docs/design-context.md, docs/design-field.md and docs/dom-surface-research.md include direct CLI/MCP inputs, and the registry identifies the authored field and DOM approximation factors.

## Executed checks

A real stdio MCP client used the isolated compiled CLI, fetched each schema, and executed all six commands. Exact references chained the surface recipe's `/input` into `surface light`, browser measurements into `field run`, the returned recipe into replay, and saved `/tokens` into finalist validation. Prototype pointer access returned an MCP error. All six finalist scenarios passed.

| Result                                                        | Compact bytes |
| ------------------------------------------------------------- | ------------: |
| context inspect, including full document behind its reference |         1,222 |
| surface css, unsafe translucent negative-control input        |         1,696 |
| surface light                                                 |         1,158 |
| field measure, 252 actual browser cells                       |         1,078 |
| field run, mathematical search                                |         2,670 |
| field run, unchanged replay                                   |         2,666 |
| field validate, six scenarios                                 |         1,412 |

These sizes precede the bounded-selection refinement and are observations of the exercised cases, not universal response limits. Search evaluated 972 candidates and 34,992 factor observations with zero neural calls. Replay performed zero searches/evaluations/neural calls and revalidated 12 alternatives. Full measurements, programs, document content and CSS text were excluded from their respective compact summaries. The unsafe glass recipe retained `renderedComposite: null` despite nominal opaque contrast 21:1. MCP transcript summary: `/tmp/bold-mcp-review-result.json`.

The initial 11 focused field/context tests passed; after fixes, six field and nine context/design-context tests pass. Isolated TypeScript compilation succeeds. Existing contract integration fixtures cover every new command; this review exercised the six-command subset directly rather than rerunning unrelated legacy/native commands.

## Trust and scope

`DESIGN.md` changes invalidate dependent choices while retaining unchanged text measurements; the regression exercises changed document bytes followed by replay, producing stale reading and blocked expression stages. Missing declared context rejects the run. Context inspection reports authored headings and byte identity, never approval or inferred constraints. File-size/UTF-8/hash guards and exact-reference ownership checks remain intact.

Source-byte equality and caller-provided measurement digests prevent accidental reuse mismatches; they do not authenticate an untrusted caller's claimed browser provider or model provenance. The docs state this boundary. `rendererVerification` remains pending in field search results; only the separate validator emits its narrowly scoped layout receipt. This review made no neural calls, did not revalidate model quality, and does not certify the surrounding gallery, native renderers, accessibility or physical-device behavior.
