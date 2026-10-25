# Vela visual review

Current disposition: the final measured-root static matrix passes, and the Android live session flow below has passed under implementation `54a5fd6c…`. Earlier sections preserve historical findings and source identities; their pending statuses describe the evidence available at that stage. Frozen review artifacts use exported `evidence/` links. Original mutable capture paths that were not frozen/exported are explicitly marked local historical references.

Independent Astra design assessment, 2026-10-25. The brief asks for a purposeful local training journal with bold ink, lime and cobalt, generous grouping, full font scaling and predictable controls. Review used actual web, iPhone, Android and iPad screenshots, guided by the project's [pinned Impeccable critique](https://github.com/pbakaus/impeccable/blob/936867543ac2576920d663cc9803597f6044f3ac/.agents/skills/impeccable/reference/critique.md).

This is a bounded screenshot assessment, not a formal blind Impeccable run: no installed launcher/detector was available, prior technical proof results were known, and no extra review agents were spawned. Screenshots establish visible composition, not temporal motion quality, screen-reader behavior or human preference. The Expo Go gear overlay is excluded from product judgments.

## Judgment

The signature works best on Today: oversized editorial type, the lime commitment action and cobalt session panel form a recognizable composition. Desktop's paired arrangement gives the hero and session a useful relationship; default native Active gives the timer and resume action clear emphasis. Preserve these strengths. The primary weakness is applying promotional hierarchy too uniformly to task screens and enlarged text.

## Priority findings

| Priority | Evidence and consequence | Recommended change and distinguishing recheck |
| --- | --- | --- |
| P1 | Enlarged iPhone Today (local historical capture: `artifacts/vela/proof-native/iphone-enlarged/today.png`), measured fontScale 2.143, fills the initial viewport with `Build / mom / entu / m`; the session action is absent. Web Active at 2× (local historical capture: `artifacts/vela/proof-web/active-390-2.png`) breaks `rhythm` into `rhyth / m` and makes the operating controls subordinate to display copy. This is poor accessible composition even when text is preserved and boxes stay inside bounds. | Preserve user scaling. Add a shared semantic distinction between promotional display and operating heading, and an enlarged-scale topology that prioritizes the primary task. Recheck first-viewport access to the session action/timer, natural word wrapping, reading order, and full retained scaling. Do not solve it with a per-screen scale cap. |
| P2 | Native Insights (local historical capture: `artifacts/vela/proof-native/iphone-default/insights.png`) leads with a large `SAMPLE WEEK 76 MIN` chart; the actual journal lies below the first viewport. iPad Insights (local historical capture: `artifacts/vela/proof-native/ipad-default/insights.png`) makes the same sample chart brighter and more prominent than the real zero-session journal. The disclaimer is honest but the hierarchy makes illustrative history the principal reward. | Promote actual local entries/stats or an actionable empty state. Put sample history in a subordinate, optional section. Recheck both empty and populated journals: the user's record should be the first meaningful information. |
| P2 | Native Detail (local historical capture: `artifacts/vela/proof-native/iphone-default/detail.png`) spends much of the initial viewport on the decorative interval panel and pushes Start session below the phase rows. Web Detail (local historical capture: `artifacts/vela/proof-web/detail-390-1.png`) repeats the large Today session panel before the actual phase breakdown. Repetition delays the information needed to commit. | Consolidate the repeated promotional panel and prioritize phase summary with Start/Resume. Keep one expressive interval trace, sized to support the decision. Recheck that phase structure and the primary action are easy to discover without scrolling through a second poster. |
| P2 | Native completion (local historical capture: `artifacts/vela/proof-native/iphone-default/complete.png`) celebrates a `00:00` session. `native/VelaApp.tsx` records `elapsedRef.current` on FINISH without excluding zero; `examples/vela/web.jsx` floors subsecond duration and records zero. The journal counts entries, so an immediate exit can become a completed session. | Distinguish an unstarted/zero-second exit from a saved completion, with an explicit discard or neutral end state. Do not invent a minimum workout duration. Recheck zero elapsed, a short nonzero session, and repeated Finish to preserve truthful local history. |

Minor polish: the filled lime native navigation selection competes with the equally bright primary action, particularly on the iPad rail. A quieter selected treatment could preserve wayfinding while reserving the largest lime mass for commitment. This is lower priority than the task hierarchy above.

## Scope and follow-up

Inspected default web Today at 390/834/1440, Detail and Active at 390, Active at 2×, Complete at 390, Insights at 1440 and Profile at 834; default iPhone's six screens; Android Today; iPad Today/Active/Insights; enlarged iPhone Today. Other proof captures exist but are not claimed as independently inspected here. The technical browser report's 36 passing scenarios and palette pixel matches are complementary evidence, not an aesthetic verdict. Still images cannot establish whether spring timing helps state comprehension; review actual transitions separately.

Product changes were not made by this reviewer. Findings were sent to the implementation owner before this report. Reassess changed captures before closing them; filenames may be overwritten by later proof runs.

## Reviewed evidence fingerprints

```text
c0225c8119ec24a129ef8952db233d4e0658a6a8152a87e35284fe8e9ccebd46  proof-web/active-390-2.png
389adaf9962246c7b5f518096a38aef9d67447a61fa9a7b2e3e1ca400d3a6a6d  proof-web/detail-390-1.png
54c513e4fa1ecb3080da8e24f489ad3a7ca5525c906966674598fa8994afdaa5  proof-native/iphone-default/insights.png
8f03842fa27061811ec28909f4f0057c94967a4c8f7e414812bf25d98526eea2  proof-native/iphone-enlarged/today.png
b26e0327605a5090b453eaef2fbdb932f5bd6f40738b922ad9e828ae1ed0ebab  proof-native/iphone-default/complete.png
```

## Final re-review — frozen policy b6fcb8a6

Rechecked revised web pixels under policy `b6fcb8a62e9a406e87bd42b08c4f5b2d20f1e3c886619fbcec6d804ea5276fe9`. Every observation in the final 72-case web report carries this identity; its declared cases span six screens, widths 390/834/1440 and text scales 1/2/2.143/3.6. Report failures are empty. Independently opened revised Today 390 at 2× and 3.6×, Detail 390 default, Active 390 at 2× and 3.6×, Insights 390 at 2×, and Today 1440 default. That is a targeted visual re-review, not a claim to have inspected all 72 images.

| Prior finding | Final disposition from available evidence |
| --- | --- |
| Enlarged hierarchy | Web substantially corrected: Today action is first at y111.6px, heading uses shorter copy, and Active has a modest phase heading rather than a promotional title. Extreme-scale task access remains limited: at 390×2.143 Resume begins y830.5 in an 844px viewport; at 3.6× Resume begins y1723.3 and Detail Start y2129. These are retained, scrollable controls, not clipping failures. Native closure awaits fresh final pixels. |
| Sample history dominates actual journal | Closed on revised web: real journal and Open session precede a quieter sample section. Native closure awaits fresh final pixels. |
| Detail repeats promotional poster | Closed on revised web: compact title, Start, phase breakdown, then a small trace. Default Start begins y418.4, within the initial viewport. Native closure awaits fresh final pixels. |
| Zero-second completion | Closed in current source and web interaction evidence: zero elapsed produces DISCARD, no entries and an explicit notice. A 2.3822-second session is stored without flooring and survives reload. Native source has the same zero-elapsed guard and a distinct neutral state; native runtime closure remains pending. |

The default desktop layout retains an expressive, coherent relationship between headline, lime action and blue session. The revised task screens now have a useful difference in emphasis. Remaining style limits are visible at 3.6×: long supporting/card copy splits words and punctuation and creates very tall pages; the repeated decorative panel on Active still adds length after its controls. A future refinement could prioritize controls and use shorter optional supporting copy at extreme scales while preserving full user font scaling. These are specific design tradeoffs, not evidence of universally excellent aesthetics or human preference.

The first files named `iphone-enlarged-final/today.png` and `ipad-default-final/today.png` still showed the old Build momentum arrangement (screen clock 12:36), and the enlarged iPhone still had the original broken-word/action-buried problem. They had no final measurement companion when inspected. The reviewer reported this immediately and does not treat a `final` filename as proof of runtime freshness.

The mathematical system now demonstrably carries shared typography/topology choices into the revised web product, but the earlier passing checks missed a real hierarchy failure. Keep deterministic constraints, renderer receipts and design critique as separate evidence. No award ranking, synthetic beauty score, native parity claim or temporal motion-quality conclusion follows from this re-review.

Final web evidence SHA-256:

```text
1b75d546fae978786e4856caaaad0382dec9b2b262c58ed8153e8317ced84e14  proof-web/report.json
714a1cc0711a1cc4c3bde2e469459d85f2bb47ca429ab305a4f632b59001382b  proof-web/today-390-2.png
8e8a37297dd600d9210f3df045426b4bd15c2c0ba5cd9a859c38ad970bdcedcc  proof-web/detail-390-1.png
ae62bb15d50fff5b5f2307d5e6fdcf2a5fbd606c162aad15994096d7e0fb5947  proof-web/active-390-2.png
434ac7c971b115b89e9d39425fbf45395ee07ab34d8561a2d1607875591e5813  proof-web/insights-390-2.png
64a4fa308fe7ac215c20677efcb260bf802b7459cef8a8a1aeaa388f60272809  proof-web/today-1440-1.png
```

## Restore failure repair — source verification

A follow-up source review found a separate data-safety defect: a failed read or invalid stored payload still marked hydration complete, which allowed the save effect to replace unknown stored history with empty defaults. This was not a typography or screenshot issue. The native implementation now uses [a fail-closed restore gate](../src/restore-gate.ts): pending, failed, invalid and superseded restoration cannot authorize a write. The recovery screen offers **Retry restore** and preserves the stored bytes; the editable app is entered only after a successful restore. A missing key is distinguished from unreadable data and may initialize a fresh journal. Save failure remains a separate retry path.

[Three regression tests](../test/restore-gate.test.ts) passed: a failed read preserves existing bytes until a successful retry, malformed/pending restoration blocks writes while a genuine absent key permits initialization, and an older superseded request cannot unlock saving. Native TypeScript checking passed. This is executable boundary/source evidence; it does not claim a device-level fault-injection test or storage durability after process termination.

The reviewer making this repair also implemented the native refinements. The closure that follows is implementation-author verification, not a fresh blind independent preference judgment. Earlier independent findings and their original evidence remain above.

```text
982ce74b4225e68b643e34f546a99fbcdff7b40b539434b78edcd36eb38145be  native/VelaApp.tsx
6da7766d39f05390095c2dafb7ae685c0b8a32208c9952e68a34b0dc39db15a7  src/restore-gate.ts
d74273a9c20d35b487a1386fb6a5e2400e9ad5e11c944f7fceaac3645868cd63  test/restore-gate.test.ts
```

## Dock and task-hierarchy closure — policy 14a4fdb5

The frozen semantic handoff is `14a4fdb536ec291f14b83f9e7775617068647c7b8aeef66b0c3ec64ecc78baff`. This supersedes the action-placement conclusions for `b6fcb8a6` above. The final web report contains 72 observations at that exact identity, with empty error/failure lists. The reviewed web implementation is `9539f0d6bc763c910bd947370ec5741b3045144ddeea9e6360f6323c1b35f074` (`examples/vela/web.jsx`); its bundle hash is `515de6a37258fa4f9eb50dfca34c65fcfc4d4e19640672e6c6e93a39a81ba8eb`. [Frozen review inputs and hashes](../evidence/review/vela-closure/web/manifest.json) preserve the report and seven opened images, including default desktop, extreme-scale Today/Detail/Active, enlarged Insights, and two storage-error states.

At 390px and 3.6×, the measured Start action occupies y574.36–824px and Resume y465–581.92px in an 844px viewport; both are unobscured. The focused page body and bounded action dock scroll independently. This is an actual task-access improvement that the earlier geometry-only pass did not establish. Today’s first action and compact main heading remain readable; Insights presents the local journal/empty state before illustrative history. Default desktop retains the paired headline/action and cobalt session composition.

Web interaction evidence records a 1.5019-second positive session and a separate zero-time DISCARD with no entries. Fault-injected read failure, corrupt JSON and invalid schema each produce zero writes until a successful restore; save failure retains the new session in memory alongside prior history, leaves prior stored history intact, and succeeds on retry without a false saved receipt. The visible restore failure names the problem and provides one clear retry action. Native fault injection is not inferred from these browser tests.

Remaining tradeoffs are visible and intentional to report: at 3.6× Active's timer requires scrolling its content pane, while its primary control remains available; the secondary Finish control may require scrolling within the action dock. Some secondary promotional/card copy still fragments at extreme scale (for example, `steady` on Today) and pages become long. The native rail's large lime selection can compete with the main action. These are remaining composition costs, not clipping equivalence, a full accessibility certification, or evidence of human aesthetic preference. The Expo Go gear is harness chrome and is excluded from product judgments.

Native closure remains gated on refreshed receipts that carry both this handoff and the implementation fingerprint including the restore gate and native text-measurement adaptation. A filename containing `current` or `final` alone is not sufficient.

### Additional native boundary findings

Independent source review identified two further input-boundary defects before final recapture. The old decoder coerced `motion` and `accent` with `String(...)`, accepting arrays such as `["reduced"]` while later equality checks treated them differently. [The extracted native decoder](../native/vela-storage.ts) now requires exact preference values and validates record shape, finite bounded duration, dates, unique nonempty IDs and entry count. Its actual implementation is exercised through native-package `createRequire` in [decoder regressions](../test/vela-storage.test.ts), including proof that malformed preference arrays cannot unlock writes.

Separately, zero or inset-consumed native width could reach a logarithmic design expression before usable geometry existed. [The native viewport boundary](../src/native-viewport.ts) now defers initial resolution until complete geometry is finite and valid, and retains the entire previous valid geometry during a transient invalid observation. It preserves evidence in `viewportGuard`; a static proof must require `status: "current"`, not treat held geometry as a fresh measurement. [Three viewport tests](../test/native-viewport.test.ts) cover initial zero, held zero, subsequent valid rotation/reflow, invalid scale/insets and consumed panes. This is a reproduced input-driven source risk and preventative boundary verification, not a claim that a physical device crash was observed.

Nine tests across restore gate, actual decoder and viewport passed; native TypeScript checking passed. Final source fingerprint inputs added by these fixes:

```text
bc2d8e8aabb1b1af218b4099b37685901c17e52fe25a3d663656fa30f6979640  native/VelaApp.tsx
8707ca0dca520d126b363a08e24f89e029954045f059de304253f32a31c26849  native/vela-storage.ts
ed5a40ead1cd937792b683b377d788fa6f805d83c3adb81f4cf14e359edda0bc  src/native-viewport.ts
6da7766d39f05390095c2dafb7ae685c0b8a32208c9952e68a34b0dc39db15a7  src/restore-gate.ts
```

## Source-bound native recheck — implementation 61a754d7

This is implementation-author verification. The [frozen native review manifest](../evidence/review/vela-closure/native/manifest.json) preserves nine opened PNGs, their measurement companions and three passing six-screen summaries. Every selected receipt identifies implementation `61a754d7cc3445eff3888e8f8146c53ac93e652703e0022eac5fa00a9a788036`, handoff `14a4fdb536ec291f14b83f9e7775617068647c7b8aeef66b0c3ec64ecc78baff`, held animation and current viewport geometry. The selected images are iPhone at fontScale 2.143 (Today, Detail, Active, Complete, Insights), iPad at 1× (Today, Active, Insights), and Android at 1× (Detail). Passing summaries are not a claim that every screenshot was visually inspected.

The enlarged iPhone now opens with the session action and intact “Build / your pace.” Active makes Resume/Leave available in the bottom dock; its timer can require content scrolling. The direct empty Complete fixture says “No time / saved.” and retains neutral return actions. That fixture establishes truthful presentation, not an executed zero-time Finish interaction. Insights puts the actual local journal before sample history on both inspected iPhone and iPad. Default iPad keeps the rail and an intentionally stacked 614pt content pane, with a clear timer/control relationship on Active.

Detail was only partly corrected in these pixels: Start is accessible in its dock, but the large cobalt trace and paragraph still precede phase information. This was reported rather than silently closed. The subsequent authorized change moves phase rows and effort guidance before the panel and reduces decorative trace height from display-size-derived to shared gap × 3. The reusable rule is **decision-critical information precedes illustration on focused task pages**. Its provenance is the brief and Impeccable’s Operate hierarchy, a conditional design heuristic rather than a physical law or calibrated preference constant. The precise trace height is local art direction. Native typechecking passed; `native/VelaApp.tsx` now hashes to `6f6631b8a5ab8e78d6b06d180171bd7fa6cd074490e25d852dabec3bba7dcbd8`. These older native captures do not prove that latest ordering; fresh visual closure follows separately.

### Measured Android trailing-space distinction

The frozen Android Detail receipt retains raw advance **333.058044dp** against a **331.428589dp** box for `movement. You choose the activity and `, including terminal U+0020. A separate actual React Native `Text.onTextLayout` probe of the same styled line without trailing whitespace measures **328.183044dp**. Its evidence binds the source text, style/font scale, width, original lines and line index; pending probes are zero. The screenshot also shows contained text. This supports a whitespace-advance diagnosis for this line; it is not a pixel-exact ink-bound measurement, a general exemption for space-ended lines, or permission to widen tolerance. Raw metrics remain available, and unknown/stale probes fail the proof.

### Latest web guard/storage rerun

The [separate final web snapshot](../evidence/review/vela-closure/web-final/manifest.json) retains the subsequent guard-contract rerun: report SHA-256 `6507ba5cdbf44eb0d4c44045718130b7073b58916192a8be3da6fd5408dd4d37`, source `3502f1e92b65e15f3d0f211df067789bd5fe3914bd7626d6b70f631ab5e3cfbf`, bundle `7046792365451683c80ae93052f4e37854f73bffec6be2cc657d0d927c000b03`. All 72 observations retain handoff `14a4fdb5…`, with empty error/failure lists. Current Detail and Active at 390×3.6 and Insights at 390×2 were reopened. The prior dock and actual-before-sample conclusions still hold; Active's secondary control still needs dock scrolling at maximum scale.

The rerun records a 1.4979-second saved session, a separate zero-time DISCARD with no entries, and successful preservation/retry for read-throw, corrupt JSON and invalid schema. These are browser-executed behaviors, distinct from synthetic mathematical preferences and from native device evidence. Motion receipts distinguish spatial movement from reduced-motion opacity, but still pixels and numeric receipts alone do not establish comfort or perceptual quality.

## Final native visual disposition — implementation f8cda49f

The [final native manifest](../evidence/review/vela-closure/native-final/manifest.json) freezes seven reopened PNGs and their exact receipts after the Detail ordering repair. All bind implementation `f8cda49f7403262d4924a8dd2e34f71069d1728e6b5cfd269d57532f0cf759ad` and handoff `14a4fdb536ec291f14b83f9e7775617068647c7b8aeef66b0c3ec64ecc78baff`, with current viewport geometry and held motion. The app source remains `6f6631b8a5ab8e78d6b06d180171bd7fa6cd074490e25d852dabec3bba7dcbd8`. Selected final pixels: Detail on default iPhone, 2.143× iPhone, default iPad and default Android; Active, Complete and Insights on 2.143× iPhone. This remains implementation-author verification, not a new blind review.

| Original finding | Scoped final disposition |
| --- | --- |
| Enlarged hierarchy and buried actions | Closed for primary-action access in inspected captures and measured web scenarios: native Start and Resume remain fully visible; enlarged Today’s earlier source-bound recheck showed action-first composition. Full text scaling is retained. A full timer and every secondary action are not promised in the first viewport at maximum scale. |
| Sample history leads the real journal | Closed in source and inspected native/web ordering. The real local journal is first; native enlarged empty counts are still tall, so its follow-up action needs scrolling. The sample section is retained and labeled. |
| Detail repeats a poster before decision information | Closed in the fresh four-platform/scale Detail selection. Default iPhone and Android show all three phases before the compact trace; enlarged iPhone starts with actual phase information and can scroll through the rest. iPad preserves the same information order and dock. Start remains available throughout. |
| Zero-time completion is celebrated/logged | Closed in source, executable web behavior and inspected native empty presentation. The native empty fixture is neutral and offers return actions. A direct Complete fixture does not independently prove native zero-time dispatch or durable save/relaunch; those require their own flow receipts. |

No new visual blocker was found in this selected final set. The bold Today identity is preserved while Detail and Active now better serve decisions and operation. Remaining costs are specific: enlarged phase rows/empty stats create long content, part of the timer may sit below its content viewport, maximum-scale secondary dock controls may need a separate scroll, and the native lime navigation selection still competes with commitment actions. These merit future user/task evaluation; passing layout checks cannot settle them.

The Expo Go gear visibly overlaps upper chrome in some enlarged captures and is harness UI, not a designed product control. This review does not certify screen-reader traversal, device keyboard/focus behavior, cold offline operation, all possible localization, or subjective comfort of motion. Maximum-scale native groups and live native session persistence flows were not part of this final seven-image inspection. Synthetic Astra judgments are not human-preference evidence, and no aggregate beauty score is assigned.

## Maximum-scale safe-area defect and repair

A subsequent actual iPhone capture at fontScale **3.571** exposed a material defect outside the earlier selected final set: Resume fit, but the visible Leave session frame extended to y874pt, below the y840pt safe end. The [frozen failing capture and receipt](../evidence/review/vela-closure/safe-area-before/manifest.json) retain implementation `f8cda49f…`. Padding at the bottom of scroll content did not constrain the scrolling viewport itself. This supersedes any inference that the earlier dock closure covered every maximum-scale native control.

The repair projects the physical-screen safe rectangle into the measured window with [a pure helper](../src/native-safe-area.ts). The dock reserves that projected bottom band **outside** its viewport and subtracts it from the shared dock height budget. Its scroll content retains ordinary shared spacing. An iPhone window that includes the home-indicator band reserves 34pt; an Android window already excluding status/navigation bars gets no duplicate 48pt inset. The receipt records the projected window safe area. Seven safe-area/viewport regressions and native TypeScript checking passed. This is geometric/source verification; the repaired maximum-scale device capture is still required.

Frozen repair source: `native/VelaApp.tsx` SHA-256 `10f29d668273ee11afa1ca8f059643eeced73b06c93c42e5e075a585d43fe82e`; `src/native-safe-area.ts` SHA-256 `c2160a1dfbeb43cf131372c6de68177c3f936fc48a616ca97049683a1c9fcc4e`. The Detail phase-before-illustration change is retained. Maximum-scale header word fragmentation and the very limited body viewport remain visible composition costs, distinct from the safe-area repair.

## Safe-area device closure — implementation 46371400

Fresh actual iPhone Active and Detail at **fontScale 3.571** were opened and frozen with their receipts in the [safe-area after manifest](../evidence/review/vela-closure/safe-area-after/manifest.json). Both carry implementation `46371400055a38ecec5c6b5ef50564e0d81908b1a7c99871821b726588bd53e8`, handoff `14a4fdb536ec291f14b83f9e7775617068647c7b8aeef66b0c3ec64ecc78baff`, current viewport geometry and held motion. After formatting, current file hashes are `baba9692be08cba9ca73e1c289432932713db9798b05d6a751044db5786080b3` for `native/VelaApp.tsx` and `9ed40e9ad2a827a833474550410dd9163835eb653bb937adfd7fc5fa2f69a806` for `src/native-safe-area.ts`. The earlier failing capture remains unchanged.

The safe-area defect is now closed in these device measurements. Active's dock clip runs from **480.666656pt to exactly 840pt**; Detail's runs from **619.666687pt to exactly 840pt**. The projected bottom inset is 34pt in the 874pt window. Resume is fully visible at y501.333323–680.999979pt; Start is fully visible at y640.333353–820.333353pt. Leave's complete frame extends to882.666672pt, but its **visible** frame ends at840pt, correctly clipped by the scroll viewport instead of entering the home-indicator band. The native safe-area audit has no failing checks in either selected receipt.

This closes unsafe visible placement, not the cost of a scrollable secondary action: at the initial scroll offset, Leave session is only partly visible and requires dock scrolling. Its full reveal/activation through a gesture was not performed by this reviewer. Active's large header still fragments “SESSION”, and the timer lies below the initial body viewport. Detail preserves phase-before-illustration order, but maximum-scale content also requires scrolling. These are retained usability limits, not reasons to suppress user font scaling or equate an audit pass with excellent composition. No further styling changes were made for this closure.

## Android root-coordinate correction

The iPhone closure above did not establish Android edge-to-edge geometry. A subsequent actual Android 2× Detail capture visibly placed Start under the navigation bar. Its [frozen screenshot and raw receipt](../evidence/review/vela-closure/measured-root-before/manifest.json) retain implementation `46371400…`: Start ended near843.048dp and the dock clip near862.476dp, while the nominal reported window height was814.476dp. Applying a safe-area projection to the wrong root extent could not fix that disagreement. This was a real control-placement defect, not an increased-tolerance candidate.

The correction measures a non-collapsible outer Yoga View with `onLayout` and `measureInWindow`. Its actual width/height drive the accepted root viewport. All provider node and clip frames subtract the same raw root origin before clipping; physical screen offset is that origin plus the platform coordinate adapter offset. The accepted tuple retains nominal window dimensions separately. Pending/invalid measurements hold the previous complete tuple and cannot satisfy a current-geometry proof; superseded callbacks cannot replace a newer measurement. `snapshot.designViewport` explicitly records projected usable width/height for runtime equations and proof replay, while `snapshot.window` describes the actual measured root. No guessed navigation-bar padding or target clamping is used.

Twelve focused geometry/projection/boundary tests and native typechecking passed. Tests distinguish a full-screen Android root from an excluded-bars root, preserve zero-origin iOS behavior, check the common node/clip transform, and reject invalid or zero-usable-area geometry. These are input cases, not a claim that a particular raw root origin has already been observed on the device. Runtime closure requires fresh measured-root receipts. Multiwindow/Stage Manager parity is outside this verification.

Frozen correction hashes: `native/VelaApp.tsx` `814f041b2d074e300d46636939945aa07af9650b9d810e6df967b0c7ac652148`; `native/observations.tsx` `bee2db1ee56b3c2a063ee4325784ce3b1530659739a43f642d018d8cd002f3bf`; new `src/native-root-geometry.ts` `7e7a8850dcf9447fc116d5e0d1452d5f586e00cff848511929fa38ab0066d4cb`.

## Final measured-root device closure — implementation 54a5fd6c

Fresh **Android 2× Detail/Active and iPhone 3.571× Detail/Active** were visually inspected and frozen with raw measurement companions in the [measured-root after manifest](../evidence/review/vela-closure/measured-root-after/manifest.json). All four identify implementation `54a5fd6cf374ea679a96425a20c4a6b730a12bd5085a0e5e867a081976fc619c` and handoff `14a4fdb536ec291f14b83f9e7775617068647c7b8aeef66b0c3ec64ecc78baff`, with current geometry and held motion. The source hashes in the manifest match the correction above. The seven current native summaries each report six passing cases, and all 42 companion receipt identities were checked against this implementation. That is a static matrix result; the pixel review here covers the four named captures.

The Android root is now **observed**, not inferred: raw `measureInWindow` y is −51.809540dp and height 914.285767dp, compared with nominal window height 814.476190dp. Adding the platform offset produces a physical root origin approximately zero (−0.000015dp rounding residue). Projection gives a bottom inset 48.000037dp and usable design height 814.476190dp. Detail's and Active's dock clips end at approximately 866.285736dp in root coordinates, matching the physical safe bottom after the recorded transform. Start ends 846.857147dp; Active Resume ends 762.666718dp and Leave ends 846.857147dp. All three controls are fully visible above the Android navigation bar in the screenshots. The prior under-bar primary-control defect is closed for these measured device states. The Android records carry explicit primary-control verification; they do not contain an Apple HIG audit result.

The iPhone root remains 874pt high at origin 0, with 34pt bottom inset and explicit usable design height 778pt. Detail's dock ends 840pt and Start ends 820.333353pt. Active's revised dock runs 524–840pt, with Resume fully visible at 544.666666–724.333292pt. Leave's visible portion ends 840pt while its full frame extends to 926.000015pt; it still requires scrolling within the dock. The screenshot confirms the safe band is protected. This is retained scrolling, not a claim that the entire secondary control is initially visible.

No new geometry blocker was found in this selected final set. Detail keeps phase information before illustration; Android's timer and both controls are legible together at 2×. Maximum iPhone typography still produces a tall, fragmented header and pushes the timer below the initial body viewport. Those documented composition limits remain. Live native session-flow verification is **not closed by this static result**: the separate automation still requires a fresh state oracle because an actively ticking clock prevents its previous idle wait from completing. No native live-flow pass, full assistive-technology certification or multiwindow parity is claimed here. No UI edits were made during this final review.

## Android live-flow closure

The final [Android flow summary](../evidence/vela/flows-android/flows-1792908583406/summary.json) passes under implementation `54a5fd6cf374ea679a96425a20c4a6b730a12bd5085a0e5e867a081976fc619c`, handoff `14a4fdb536ec291f14b83f9e7775617068647c7b8aeef66b0c3ec64ecc78baff`, and actual fontScale **1**. Its SHA-256 is `770f97cf96c52b7d6380b0cee7ab66eca00754a65ddd8f2dfaf3c03a3c7f1419`. This closes the live Android positive-duration flow that was pending in the preceding static review.

Ten actual taps cover opening, starting, pausing, resuming and finishing a session; inspecting the journal; changing motion preference; and returning to the system setting. The timer pauses at 1.682087543 seconds, remains unchanged during the tested pause, then advances after Resume. The [completion receipt](../evidence/vela/flows-android/flows-1792908583406/complete.json) records 2.314755918 seconds, increases the local session count from 1 to 2, and reports saved persistence. The completion image was opened and shows a truthful 00:02 receipt. Reopening Profile retains the count and reduced-motion preference. The [reduced-page receipt](../evidence/vela/flows-android/flows-1792908583406/reduced-page.json) reports `opacity-fade`; its corresponding image was also opened. These establish the implemented substitution and saved/reopened state, not motion comfort or cold-process storage durability.

Eight idle actions have fresh UIAutomator XML bounds checks; the eight exported XML files were read and the corresponding action bounds checked. **Pause and Finish have no UIAutomator XML confirmation** because the live clock prevents that idle-dependent query from settling. Those two taps instead use measured visible native bounds followed by fresh observed state transitions, and the summary explicitly marks their accessibility oracle unavailable. Transition freshness uses host observer-file delivery time, avoiding device/host clock skew; stale XML is not reused to manufacture confirmation.

This is functional Android evidence, not an iOS interaction proof, a maximum-font gesture proof, a full screen-reader review, or a human aesthetic evaluation. It does not add a native zero-duration interaction claim to the existing source/web/empty-state evidence. The geometry and visual limits above remain, including maximum iPhone header fragmentation and dock scrolling for secondary actions. The separate full repository verification was still running when this addendum was written and is not reported as complete here.
