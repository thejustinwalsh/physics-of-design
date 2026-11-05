# Vela directions: final synthetic review

This is synthetic model critique and static source review, not human preference evidence. No browser, model, native session or rebuild was launched. Only this requested review document was written; application sources were not changed.

## Outcome

The two directions satisfy the distinct-art-direction requirement within the inspected examples. Momentum uses expansive hierarchy, rounded planes and high-chroma emphasis; Field Notes uses smaller hierarchy, tighter grouping, shallow corners and paper/rule cues. These differences are visible at phone, iPad-sized browser and desktop widths and are backed by independently compiled typography, spacing, corner and spring assignments. They are not merely accent substitutions. Both preserve a prominent session action and readable task hierarchy. No additional blocking visual defect was established in the six public Today screenshots.

The public screenshots and receipt under `artifacts/vela/directions-public-review` identify frozen build `4de6042e9cb0`. They are static browser observations, not native-device or animation evidence. The separate `artifacts/vela/directions-proof-v9/report.json` reports 192 cells, four passing flows, zero failures and stable source `9c5b4919a6ab161d4ddc2c36568b0c8a46a45e87e1bc6f328b4ad0b08bfca904`. Preserve these distinct identities rather than describing all artifacts as one identical build.

## Prior findings

Changed-content coverage and keyboard switching from a genuinely scrolled position are now present. The keyboard flow checks focus retention and the focused anchor where scroll range permits. Selected-policy content resolution and direction-sensitive navigation corners address the earlier implementation/coherence findings. The earlier timer and label failures remain historical; current source uses the shared measured fit rules.

The three native summaries under `artifacts/vela/proof-native/directions-{momentum,field-notes,field-notes-expanded}` each report six passing Android screens. All report observed font scale 1. The expanded fixture means longer content, not enlarged system text. Thus these summaries do not establish new-direction native enlargement, iOS or native iPad coverage.

`artifacts/vela/flows-android/flows-1793868373663/summary.json` reports a passing actual Android gesture flow: paused in-session direction change, elapsed-state preservation, resume, completion persistence and reduced-motion substitution. Its distinction between fresh accessibility checks for idle actions and measured bounds plus transitions for live-clock taps is appropriate. This review did not independently execute those gestures.

## Remaining actionable findings

1. **Independent cleanup attempts are needed in the launcher.** In `scripts/native-session.mjs:395–430`, Android app stop/PID verification and all reverse removals share one try block. A failed app-stop or verification skips every reverse removal; one failed removal skips subsequent owned mappings. Attempt each owned cleanup independently, collect all errors, then perform restoration readback. Preserve lease retention when any cleanup remains unresolved.

2. **Unresolved cleanup needs a failing process result.** At `scripts/native-session.mjs:460–475`, `confirmedEmpty=false` retains the lease and writes the receipt but does not make an otherwise normal interruption exit unsuccessfully. Set a failing exit code or throw after the cleanup receipt and lease decision. A caller must not infer successful shutdown from exit status when cleanup failed.

3. **Native enlargement remains a scoped evidence gap.** Before claiming both directions verified under native text enlargement, run both against an actually observed increased system font scale and retain six-screen/critical-flow evidence. The inspected browser matrix covers enlargement separately; its results cannot substitute for Android measurements.

The new `--android-only` branches avoid iOS launch/wait work. Existing Android Expo-process rejection, conflict checks for reverse mappings, removal of only newly owned mappings, owned process-group termination and lease retention improve ownership boundaries. The live session has not terminated, so this review makes no claim that its cleanup has completed. Failure-path findings above are source-derived, not reproduced device failures.

## Scope

These findings do not establish awards, human preference, universal aesthetic superiority, physical performance, full light transport or synchronized native trajectories. No further arbitrary restyling is required by this review. Finish the declared native scaling coverage and terminal ownership cleanup, retain source-bound final verification, and publish the evidence with its actual limits.

## Follow-up: cleanup and primitive-text observation fixes

Subsequent static inspection verifies that the two launcher findings above are addressed in source. `scripts/native-session-cleanup.mjs` independently attempts owned-app stop, app absence verification, every owned reverse removal and the final restoration query, retaining operation-specific errors. The launcher consumes those errors, retains the resource lease when cleanup remains unresolved, and sets `process.exitCode = 1`. The inspected injection tests exercise continued attempts after multiple failures and rejection of restoration mismatch while avoiding unowned actions. Their execution was reported by the implementing agent; this reviewer did not rerun them. Actual shutdown of the new live session remains a separate pending observation.

The native enlargement attempt exposed an observer limitation rather than evidence that all affected lines fit: plain React text assembled from primitive child arrays had been excluded from trimmed-line probing. `plainNativeText` now concatenates strings, numbers and nested arrays of plain primitives; null/boolean children contribute no text. Element and other object children return null. `ObservedText` enables probing only when this strict reconstruction matches the recorded text. Existing known-style, current style identity, native line-text equality and probe-identity checks remain intact. Thus an array does not bypass the native measurement requirement, and styled/nested element objects cannot borrow their parent's shaping probe.

The inspected unit additions cover primitive concatenation, numeric children, nested-object rejection and resulting probe eligibility. No new concrete correctness defect was found in this change. A successful fresh native enlarged-text receipt is still required to close the earlier native scaling evidence gap; the new helper and unit cases alone do not close it. No application source was edited and no device/process action was performed during this follow-up.
