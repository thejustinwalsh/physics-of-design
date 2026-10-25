# Composition and native-observation correctness review

## Reader/session addendum — checkpoint `1ddd212`

Read-only review found no material new defect in `readerImageAspect` or the explicit `--fieldwork` launcher mode. Ten of ten composition-plan tests pass; `node --check scripts/native-session.mjs` passes. Reader aspect is finite and bounded by 1.2–2.97 over the input schema and is used by native reader artwork. Product mode starts its observer within the existing owned-service lifecycle, includes port 4321 in preflight and Android forwarding, waits for both measurement clients before product navigation, and accepts only fresh, complete, hydrated product receipts. The observer participates in owned process-group cleanup; iOS shutdown remains conditional on this helper having booted the phone. The default branch retains measurement-mode behavior.

This is code-path inspection, syntax validation and unit testing. No helper services or devices were launched by this reviewer; the parent task owns the stopped-service-to-ready runtime exercise and cleanup verification.

| File                            | Reviewed SHA-256                                                   |
| ------------------------------- | ------------------------------------------------------------------ |
| `src/composition-plan.ts`       | `19f0d9219fdd2d4ef8c545019f7bd90ecb9b8277c2e24ede33ffbe5a086c9840` |
| `test/composition-plan.test.ts` | `5ace27010b96e2f823e611f05fbd8d2ad37deea4bac0c90fd095493d39649ebb` |
| `scripts/native-session.mjs`    | `0c5177c76f2934879c100c3e4b7b7019522b74bfff64a9ca4c47dd344187b222` |

## Final disposition — 2026-10-24

**All supported findings in this review are resolved. No remaining material defect was established within the reviewed boundaries.** Nine of nine composition-plan tests pass. This conclusion concerns deterministic behavior and observation provenance, not visual quality or full platform conformance.

- The original stale-screen/proof race, navigation unknown masking and non-finite crop boundary are fixed.
- Both follow-up P2 findings below are fixed: known typography failures now dominate inherited-cap unknown, and incomplete batches are dropped by the provider and explicitly rejected by both proof readers (`incomplete === false`).
- New clipping uses the intersection of measured scroll ancestors, not safe-area filtering. Independent checks passed for nested clips, fully clipped regions, missing/cyclic ancestry and retention of full target dimensions for control-size checks. A clipped 20pt-wide control still fails minimum size; clipping cannot turn it into a 44pt control. The existing unsafe fixed-control fixture still fails safe-area policy.
- The initial `ObservedScrollView` addition did not invalidate measurements on scrolling without a caller handler. This was corrected during verification. A mocked render of the final wrapper verifies that it forwards the original scroll event, requests a fresh observation, defaults to a 100ms throttle and preserves an explicit throttle. Main reader duplicate notification was removed. Reproduction: `/private/tmp/composition-scroll-review.mjs`.
- The actual provider source was also exercised with mocked native nodes against the final batch/clipping helpers. It discards an obsolete batch, emits the replacement screen/proof identity, and refuses incomplete or missing-clip batches. Reproduction: `/private/tmp/composition-observer-final-review.mjs`.
- Android tap conversion adds the recorded window-to-screen offset in dp before multiplying by display scale. The supplied flow summary records save, search, resume (922.2857055664062dp before and after) and persistent save after restart. This reviewer inspected the receipt but did not rerun device flows or independently remeasure the reported 136px UIAutomator offset. That device-level evidence belongs to the parent task.

Final reviewed SHA-256 values:

| File                                 | SHA-256                                                            |
| ------------------------------------ | ------------------------------------------------------------------ |
| `src/composition-plan.ts`            | `74ff1ea6f33bb7e84c761a91586bc017ce7312d95daa095cee5e62522c4c7485` |
| `src/apple-hig.ts`                   | `6bb6757d0a1616082d2f40991affe3132e1d319ab2d52aae143a0b037c8686f0` |
| `src/composition.ts`                 | `d94f9c15c28b7481c39fc12100d3aec42cdd9e430af6df030917cbbd700a85ad` |
| `native/observations.tsx`            | `bd531645e065d993faffee0d7163d0397ed9a59e454308b0c6e70e500cdee4c6` |
| `native/observation-batch.ts`        | `21c1194e81f06b25e4779ce6daa1926c4b1ab4c5f0193383d7394dbe222df1a6` |
| `native/observation-clipping.ts`     | `369ef920b613327d33a2d27a85f1d1739ab25ac0119a37f51dd8bb5ef4ffbdff` |
| `native/FieldworkApp.tsx`            | `9580cd42090fc01c041334ddd3ad9f5c3e98e63686c25fa8e4926b18990f12ff` |
| `test/composition-plan.test.ts`      | `e3f5788126ecbd7f33c8a8db32cc392d05edfb1d09c639a25651848cc6dbd302` |
| `scripts/prove-fieldwork-native.mjs` | `df350a7dfbfbc5bf747191693718d592182a52adf6b424545dd0b6d6e8067b14` |
| `scripts/fieldwork-native-flows.mjs` | `16301356f35a055297f89d52dad23f0a6a4f3a72e5ea9bc7ccb091fdba912082` |

The dated sections below retain the finding history; their open statuses are superseded by this final disposition.

## Fix verification — 2026-10-24

Eight of eight updated composition-plan tests pass. The original P1 stale screen/proof labeling finding is **resolved**: independently rerunning the provider-level mocked interleaving against the new helper emits no obsolete payload and then emits only the rescheduled reader/proof-new target. Reproduction: `/private/tmp/composition-observer-fix-review.mjs`. The original navigation P2 and crop-boundary P3 are **resolved**. Source IDs and relative-epsilon wording are corrected; explicit RN cap zero now passes and unresolved inherited cap null stays unknown.

Two follow-up P2 findings remain at this reviewed revision:

1. **Inherited cap masks known typography failures.** `src/apple-hig.ts` checks `maxFontSizeMultiplier === null` before `allowsFontScaling` or `contentPreserved`. Both `{allowsFontScaling:false, maxFontSizeMultiplier:null, testedTextScale:2, contentPreserved:true}` and `{allowsFontScaling:true, maxFontSizeMultiplier:null, testedTextScale:2, contentPreserved:false}` return `dynamic-type:unknown`. Explicit scaling cancellation or lost content should return fail regardless of an unresolved cap. Apply the same known-failure precedence now used for navigation.
2. **Proof consumers accept incomplete batches.** The bounded helper correctly reports `incomplete:true` when a callback times out, but `scripts/prove-fieldwork-native.mjs:27` and `scripts/fieldwork-native-flows.mjs:15` ignore that flag. An independent two-record test with one 44pt target and one timed-out target produced `{incomplete:true, retainedTargets:1, failures:[]}` through the current audit mapping. A missing failing target can disappear from a supposedly complete control audit. Proof readers must reject/retry incomplete receipts, or the provider must withhold them from proof use. Diagnostic storage may retain the flag. This does not invalidate the audit's explicitly supplied-target-only scope; it invalidates the proof consumer's use of a partial receipt as complete observations.

Fix-verification SHA-256 values:

| File                            | SHA-256                                                            |
| ------------------------------- | ------------------------------------------------------------------ |
| `src/composition-plan.ts`       | `47be1017e476f21c0ad5bf914f5154e91138421ed9755f5117093f3d9fa49946` |
| `src/apple-hig.ts`              | `98a1cd1c88a5cd70c14a5dd4ac729717353c1577c32b1669483167b0998e441e` |
| `src/composition.ts`            | `567dc7b92450f510cc4dc77fb195e93089774fc0d20891746988161857f7f2e4` |
| `native/observations.tsx`       | `1df0c6eb04288f7f22b692d4329d21d0b9c55cbf879bab0190b0ef567ca76cd7` |
| `native/observation-batch.ts`   | `1757636f0c7e3b407d91b06234c93726637232097c4d57b5ac1113598383de4a` |
| `test/composition-plan.test.ts` | `14415174b6d1ff43f1b1c4364b8c5fddb4a62095d6f348de617b5388d34ae14b` |

The original review below is retained as historical evidence, not a claim that its resolved findings remain open.

## Initial review

Reviewed 2026-10-24 against the source hashes below. This is a read-only code review apart from this report; no simulator, app, collector or product source was changed. Two material findings were reproduced. The five existing `test/composition-plan.test.ts` tests pass.

## Verified findings

### P1 — An old measurement batch can acquire a new screen/proof identity

`native/observations.tsx:18–23` takes the node records before awaiting asynchronous `measureInWindow` callbacks, then reads `current.current` after that await. A render or navigation during measurement can therefore attach the new screen, proof ID, window geometry and app state to old nodes. The debounce cancels pending timers, not an already running measurement batch.

Reproduced by compiling the actual TSX with esbuild and running it with mocked React hooks, timers, native callbacks and fetch: register an old journal target, start the timer, hold its measurement callback, render `{screen:'reader', proofId:'proof-new'}`, replace the registered target, then release the old callback. The emitted payload contains the **reader/proof-new snapshot and the old journal target**. The standalone reproduction is `/private/tmp/composition-observer-review.mjs`; no native process participates.

This matters because `scripts/prove-fieldwork-native.mjs:27` accepts a receipt by its new proof ID, timestamp and screen. The timestamp is generated after callbacks finish, so it does not distinguish this stale batch. Pin a deep snapshot and generation before measuring; discard/reschedule if the snapshot or node generation changes before publishing. Test a delayed old callback across navigation and across a new proof request. Pinning metadata alone prevents relabeling but must also prevent out-of-order batches from replacing newer receipts.

### P2 — Missing navigation history masks explicitly known failures

`src/apple-hig.ts:40` returns `unknown` before checking any available navigation facts when `priorDestinations` is absent or `taskStatePreserved` is omitted.

With a valid 44×44 control and otherwise valid audit input:

```js
navigation: {
  destinations: ['journal'],
  selected: 'journal',
  taskStatePreserved: false
}
```

The result is `navigation-continuity: unknown` and zero failures, although loss of task state is explicitly supplied. `selected:'missing'` is similarly masked. Adding `priorDestinations:['journal']` changes the same known failure to `fail`.

Known failure should dominate missing evidence, or selection validity, state continuity and destination retention should be separate checks. Distinguishing tests should retain `unknown` for an otherwise valid incomplete observation, but return `fail` for explicit state loss, an invalid selection or duplicate destinations even when another field is missing.

### P3 — Accepted finite crop inputs can produce non-finite output

`src/composition-plan.ts:50–64` bounds dimensions above but only requires them to be positive below. This accepted input yields `scale`, draw dimensions and offsets of `Infinity`/`-Infinity`, `objectPosition:'NaN% NaN%'`, and NaN focal coordinates:

```js
cropMedia({
  sourceWidth: Number.MIN_VALUE,
  sourceHeight: 1,
  width: 100,
  height: 100,
  focalX: 0.5,
  focalY: 0.5,
});
```

Restrict dimensions to a meaningful lower bound or reject unrepresentable intermediate/output geometry. This is a boundary-validation defect; it is not evidence that the app's 1536×1024 assets crop incorrectly.

## Contract and provenance clarifications

- The audit rejects `maxFontSizeMultiplier:0`, but the installed React Native `TextProps.js:167–172` defines zero as unlimited and null/undefined as inherited. `ObservedText` preserves zero and emits null for an omitted prop, while the audit treats null as unlimited. Before passing observer props into typography audits, normalize to an explicitly resolved cap or represent inherited/unknown separately; otherwise valid unlimited declarations are rejected and inherited caps can be mistaken for unlimited. Current native proof code omits typography, so it reports that check unknown; no current typography receipt was shown falsely passing.
- `apple-tabs` in the audit is `apple-tab-bars` in `research/apple-hig-provenance.json`. URLs agree, but IDs should agree for source-ID-to-hash lookup.
- The tolerance is eight float32 **relative epsilons** at viewport magnitude, not exactly eight ULPs. At viewport magnitude 844 it is approximately 0.0008049 pt, or 13.1875 float32 ULPs. The implementation is a conservative numerical allowance; its description should use the implemented basis. Existing tests distinguish float32 reconstruction noise from 43.99 pt controls.

## Distinguishing checks and scope

- All five composition-plan tests passed, including authored alignment failures, crop coverage, radius bounds and Apple minimum/default separation.
- All six cached Apple pages referenced by the audit matched their recorded SHA-256 values. The cached accessibility table explicitly supports iOS/iPadOS default 44×44 pt and minimum 28×28 pt. The source-date claim is supported by the local pinned cache, not a new network retrieval in this review.
- No material defect was found in the new peer-alignment constraint calculation/reference checks, ordinary cover-crop formula or concentric-radius formula within their stated geometric domains.
- The plan's columns can rise from one to two as text scale changes from 1 to 1.17 at width 834 because the sidebar disappears and releases width. This is not inherently a geometry failure; the existing sampled monotonicity assertion should not be mistaken for a universal invariant.
- Native callbacks were mocked only to reproduce scheduling/provenance behavior. This review does not claim device execution, aesthetic quality, full HIG conformity or assistive-technology validation. Parent task owns live native verification.

## Reviewed source identities

SHA-256 hashes, confirmed unchanged at the end of the code inspection:

| File                                       | SHA-256                                                            |
| ------------------------------------------ | ------------------------------------------------------------------ |
| `src/composition-plan.ts`                  | `6b736eb18c5aa9612cdecbaa3467edccd380cd6d08b35d0887c7d5bb628228c1` |
| `src/apple-hig.ts`                         | `d72f6486930ad59bb7cc52c0bb0aa5d1333808ff1edf783d3a1a878a0aed6143` |
| `src/composition.ts`                       | `567dc7b92450f510cc4dc77fb195e93089774fc0d20891746988161857f7f2e4` |
| `native/observations.tsx`                  | `531b91d84574db95a9a16d3bc36ed6dd5778ae55752b7ee1107c33322b44bc1d` |
| `test/composition-plan.test.ts`            | `698c40959b1337d97acfd7a2ab2f272806503f1bd59f9b8db9de06aeb0df6a0d` |
| `scripts/prove-fieldwork-native.mjs`       | `86889265658d04e8799181ab8eb38aca1305064b4bb2fd68ca8d832af798e8f4` |
| `scripts/app-observer.mjs`                 | `dd1b10b9eb17d97f5ad90d64645d1c60d245b90ffa5cdd396162f689084865c4` |
| `research/apple-hig-provenance.json`       | `8850143b1d03230d0803da11fb5db8a278c9d04fbbfa959977a415048cb694fa` |
| installed RN `Libraries/Text/TextProps.js` | `c44f742ca010685634a2696d94b89e0690b0e88a56729029488b166ecab3c017` |
