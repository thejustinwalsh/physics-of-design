# Relay native follow-up — November 5, 2026

The integration needed height-aware responsive rules and reliable native inspection, not another visual theme. This follow-up changes the existing expression policy and shared adapters. It does not establish design preference, physical-device performance or a cohort winner.

## Changes and deterministic boundaries

`resolveRelayFrame` now consumes usable height alongside width and effective app × OS text scale. Editable brief assumptions reserve eight text em for the task, ten em plus padding for expanded chrome and four em plus padding for compact chrome. Compact mode follows the stable expanded budget rather than its own measured output; it disables the rail and moves secondary controls into Menu. Unknown height stays unavailable; an impossible task budget stays unsatisfied. Actual scroll-host geometry remains separate from these predictions.

Native Inspector keeps the last meaningfully changed observation instead of changing its visible clock on equivalent invalidations. Identity, target, missing geometry, foreground and actual geometry changes still invalidate it. Attachment/removal changes schedule capture; all subscriptions and frames are disposed.

Shared dialogs reserve their header, allow the title to wrap beside an independent Close target and keep keyboard dismissal outside that row. Header, title, body and Close use modal-scoped observation IDs. A nested chooser cannot overwrite its parent's Close reference.

The shared Android accessibility adapter requires a fresh nonce path, successful dump completion and complete XML. Exit-zero idle errors cannot read a stale file. Cleanup runs independently of cancellation and retains ownership when uncertain. App absence requires a completed remote `pidof` result, never a transport exit code. Explicit Android user targeting fixes a locally observed force-stop command that returned zero while the app remained alive.

## Retained renderer evidence

`node scripts/prove-relay-android.mjs` runs the actual integration app in Expo Go on Android emulator-5554 with real touch/text input and Text/Yoga/host geometry. It restores font scale, rotation, ADB reverse mappings and owned runtime processes, verifies free ports and retains its exclusive lease on unknown cleanup. Each receipt includes source identities, command history, fresh accessibility XML and screenshots. Captures and screenshots are separate observations, not an atomic frame guarantee.

The artifacts below are local, ignored operator evidence, not checked-in human preference labels:

| Run under `artifacts/relay-integration/` | Result |
| --- | --- |
| `android-1793852699849` | Primary task and compounded-scale landscape passed; actual Inspector Close failed. Screenshot showed body/header overlap and missing title. Cleanup passed. |
| `android-1793853135366` | Header/body non-overlap and actual Inspector dismissal passed after shared header fix; portrait recovered. Source stable; cleanup passed. |
| `android-1793853325292` | Stronger title/control containment, distinct nested Close observations, child disposal and actual parent dismissal passed. Source stable; cleanup passed. |
| `android-1793853843350` / `android-1793854075677` | Added portrait driver used the wrong entry, then assumed a six-item chooser had search. Both failed extensions remain retained; cleanup passed. Actual portrait Inspector geometry was observed in the second run. |
| `android-1793854379958` | All five stages passed: primary task, compounded-scale landscape, nested Inspector, enlarged portrait title/control containment, actual workspace-search text and keyboard dismissal. Source stable; cleanup passed. |

The `android-1793853325292` checkpoint's report SHA-256 is `cfa37222fb58579564e0b839b3ce2f68236baf5721b26e2f82a36e7da62437a1`, source identity `0b996cf8cfc7ddf5f2f5f1f0b05bc04412e4f546021afb13b825918edd2496d4`. Later edits require new source-bound checks; these rows remain historical checkpoints. The five-stage `android-1793854379958` report SHA-256 is `d517486ac04b6bb20c16b10f05f4c7dd8286f24449c29adc248cbe92c1a16243`, source identity `e72dcc48476766e78b1fc0ef2c2cb3012173da8c4c0090475c1481b528f42f41`.

The Settings panel and workspace-search dialog also shared a host observation ID. The dialog now uses `relay-command-search`; browser and native checks open it over Settings and require the parent observation to survive disposal. The native driver rejects pre-existing Expo Go before device mutations or launch. `ownership-negative-proof.json` records an explicitly owned fixture: the driver rejected it without starting Metro or stopping/changing its PIDs, and the operator then stopped only that unchanged fixture. Both guard and fixture cleanup passed. The driver currently shares the Mac-host `/private/tmp` lease convention; it is not claimed portable to arbitrary hosts.

Local current browser proof passed 74 steps across six Chromium/WebKit desktop/phone/iPad contexts. The prior pushed checkpoint `6d69299` also passed remote Relay CI run `41969581897`; its downloaded artifact `13389417121` contains source-stable static and browser receipts with identity `11347f4c66cfb58b742b508e9a98eb79eb8c8e1800301674dbec6406acdb0ed6`. Archive SHA-256: `7f4287872fcde5853cc8492f07c8d439b6b36846fae04eec5990bb7eaf5471e0`. This is historical CI evidence, not a receipt for subsequent edits.

Actual enlarged landscape facts: app scale 1.5, OS scale approximately 1.3, viewport 814.48 × 383.24dp, task viewport 814.48 × 310.48dp versus authored minimum 218.40dp. Primary input resolved INC-1042 through its linked trace and recorded note/resolution; active incidents changed 22 → 21. These facts support this tested scenario, not an arbitrary viewport guarantee.

Earlier driver failures remain retained: incompatible Expo flags, IPv6 localhost readiness, incorrect navigation scroll direction and restored Settings scroll position. Their failed runs were not rewritten as app passes. All 526 toolkit unit tests and 18 app tests passed at the follow-up checkpoint; current ordered/browser/native results must be inspected separately before publication.

## Independent critique and open work

Synthetic GPT-6 Astra review identified the title oracle gap, nested Close identity collision and keyboard/header competition. Those findings informed the stronger source and native checks. Static follow-up found no new blocker. It did not run a renderer or represent human preference.

A separate synthetic visual review found that fleet totals consumed 39% of the initial phone task viewport and the primary investigation action began about 89% down it; it also identified selected trace styling overriding severity. These remain semantic composition work, not evidence that lighting or a palette replacement will solve hierarchy.

The tested enlarged portrait keyboard scenario verifies actual typed text, usable control interaction and panel-internal geometry. General keyboard occlusion bounds, modal projection into native safe-area coordinates, iOS/iPad product flows, physical Safari/GPU performance and native UI-thread motion remain unverified here. Native finishes remain static. No new System 1 readout was used for these deterministic fixes; this follow-up does not establish fresh choice-path replay or token savings. The full goal stays open.
