# Android line advance and trailing whitespace

The failing Vela Detail receipt reports line `movement. You choose the activity and ` at 333.058044dp inside a 331.428589dp text box: 1.629456dp of raw advance overflow. The line ends in U+0020. Installed React Native 0.88 `FontMetricsUtil.kt` uses `Layout.getLineWidth` for a soft-wrapped line, and `getLineMax` only when the line ends with a newline. Android's [Layout reference](https://developer.android.com/reference/android/text/Layout#getLineWidth(int)) distinguishes these: the former includes trailing whitespace, while [getLineMax](https://developer.android.com/reference/android/text/Layout#getLineMax(int)) excludes it. Raw advance overflow therefore does not by itself establish visible-content overflow.

The [initial screenshot](../evidence/vela/diagnostics/android-trailing-advance/detail.png) visibly retains the final word inside the card's text inset; the [raw receipt](../evidence/vela/diagnostics/android-trailing-advance/detail.json) preserves the width discrepancy. Fontkit corroborates that the pinned font has a positive space advance (512/2000em), but its whole-line width differs from Android's actual width. That calculation is not used to subtract a guessed space or certify native fit.

The new adapter retains every original line width. For a plain string with explicit known font style, a fresh matching native layout, LTR origin and a soft-wrapped trailing ASCII space/tab, `ObservedText` mounts an invisible, noninteractive native Text probe with the same shaping/scaling inputs and the exact trimmed line. A single-line native callback supplies `contentAdvanceEvidence`, bound to original layout identity, line index, raw text and raw width. The probe has sufficient measuring width; it does not change the visible product text or suppress scaling. Paint-only changes are excluded from shaping identity because they need not trigger a new text-layout event.

Nested runs, unknown styles, unsupported direction, stale callbacks, wrapped probe results and missing callbacks cannot supply a passing alternate extent. Probe callbacks are bounded by a one-second diagnostic timeout; missing evidence becomes unknown. The proof script records per-line diagnostics and requires both failures and unknowns to be empty. Export preflight also requires an empty unknown list. The existing tolerance is unchanged.

Five new tests use the actual raw Android fixture, synthetic probe callback vectors clearly labeled as such, stale/unknown cases, and the [historical unspaced 661.510437dp line inside 659.809509dp](../evidence/system/android-longword-failure.json). That 1.700928dp long-word overflow still fails. At adapter handoff, combined diagnostics/scheduler/composition tests passed 23/23, with build and native typecheck passing. The later diagnostics/primary-action regression run passed 11/11. These bounded checks are separate from the final repository verification lane.

The [actual Android default Detail rerun](../evidence/vela/proof-native/android-default-current/detail.json) records a trimmed native content advance of **328.183044dp**, while preserving the raw **333.058044dp** width inside the **331.428589dp** text box. It preserves the exact original line, style/layout identity and native callback provenance under implementation `54a5fd6cf374ea679a96425a20c4a6b730a12bd5085a0e5e867a081976fc619c` and design handoff `14a4fdb536ec291f14b83f9e7775617068647c7b8aeef66b0c3ec64ecc78baff`. This establishes advance fit for that line without guessing a space width. A trimmed advance is still not an ink-bound measurement or general typography-quality certificate.

The static proof now checks intrinsic fit in **every nonzero measured Text box**, including mounted children outside the scroll viewport. Clipping by a scroll viewport is expected and is distinct from overflow inside the Text's own box. Missing line callbacks are unknown, not a pass. The [posthoc coverage assessment](../evidence/vela/native-text-coverage-posthoc.json) independently rechecks **42 receipts and 665 text boxes, including 189 wholly offscreen boxes**, with zero failures or unknowns. It records exact receipt hashes and does not rewrite historical proof flags. Actual font scales are consistent within each six-screen group: Android 1×/2×, iPad 1×/2.143×, and iPhone 1×/2.143×/3.571×. The assessment SHA-256 is `6651fda85c64a405f2b9971e8ce1fd95b8d4eaaab0bc3b3bfb64ae3e0a482d80`. This checks mounted content, not unmounted virtualized content, scroll reachability, or glyph ink.

The reusable core measurement harness already had native trimmed-line probes before the product adapter. `native/App.tsx` waits for those callbacks and substitutes their widths before calculating inline bounds and overflow; `src/native.ts` explicitly reports no glyph ink bounds. Therefore the core did not share the product observer's raw-whitespace false failure. Its older receipt contract discards the raw/probe distinction, uses a fixed 10000dp probe and accepts its first returned line. The product adapter adds stricter single-line/layout provenance; this review does not claim those core provenance limitations were changed. The pure diagnostic helpers are exported by `src/index.ts`.

Initial failing evidence SHA-256:

```text
4068099e3761285aed052004803357fb62fb548aeb04e59d41df103d9c70a7e5  evidence/vela/diagnostics/android-trailing-advance/detail.json
1bff424cfc184995511a100129495aaaaeae80579778b3682d943b718913f6fa  evidence/vela/diagnostics/android-trailing-advance/detail.png
511520ecd998756f60223e771e55b22d78a0b4ed6f3ff13fba23cafb4c53c8a3  evidence/system/android-longword-failure.json
4e7bf1e349a5ccde73f770b958763067b6e02568b904cddd7b1b434dc3bb458e  native/node_modules/react-native/ReactAndroid/src/main/java/com/facebook/react/views/text/FontMetricsUtil.kt
```

Historical adapter source at initial handoff (not the final native implementation identity above):

```text
921c8688212e485c394dff7056428fa38ad0bc405982aaf1800175e4bc8c8dff  src/native-text-diagnostics.ts
322880f52fb9f0bc1a2f1fd3a47196f49fd99e64f3061da674922f8e9a782657  native/observations.tsx
d51209d62cda47eb628f3571903e39afadf096ea276730c1f3612976b364b59e  scripts/prove-vela-native.mjs
a5584ffe9907a909a46638aa261a4633e3b2462979f789b029ec8bb3810ce128  test/native-text-diagnostics.test.ts
```
