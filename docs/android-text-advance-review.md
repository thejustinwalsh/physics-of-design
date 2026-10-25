# Android line advance and trailing whitespace

The failing Vela Detail receipt reports line `movement. You choose the activity and ` at 333.058044dp inside a 331.428589dp text box: 1.629456dp of raw advance overflow. The line ends in U+0020. Installed React Native 0.88 `FontMetricsUtil.kt` uses `Layout.getLineWidth` for a soft-wrapped line, and `getLineMax` only when the line ends with a newline. Android's [Layout reference](https://developer.android.com/reference/android/text/Layout#getLineWidth(int)) distinguishes these: the former includes trailing whitespace, while [getLineMax](https://developer.android.com/reference/android/text/Layout#getLineMax(int)) excludes it. Raw advance overflow therefore does not by itself establish visible-content overflow.

The saved screenshot visibly retains the final word inside the card's text inset. Fontkit corroborates that the pinned font has a positive space advance (512/2000em), but its whole-line width differs from Android's actual width. That calculation is not used to subtract a guessed space or certify native fit.

The new adapter retains every original line width. For a plain string with explicit known font style, a fresh matching native layout, LTR origin and a soft-wrapped trailing ASCII space/tab, `ObservedText` mounts an invisible, noninteractive native Text probe with the same shaping/scaling inputs and the exact trimmed line. A single-line native callback supplies `contentAdvanceEvidence`, bound to original layout identity, line index, raw text and raw width. The probe has sufficient measuring width; it does not change the visible product text or suppress scaling. Paint-only changes are excluded from shaping identity because they need not trigger a new text-layout event.

Nested runs, unknown styles, unsupported direction, stale callbacks, wrapped probe results and missing callbacks cannot supply a passing alternate extent. Probe callbacks are bounded by a one-second diagnostic timeout; missing evidence becomes unknown. The proof script records per-line diagnostics and requires both failures and unknowns to be empty. Export preflight also requires an empty unknown list. The existing tolerance is unchanged.

Five new tests use the actual raw Android fixture, synthetic probe callback vectors clearly labeled as such, stale/unknown cases, and the historical unspaced 661.510437dp line inside 659.809509dp. That 1.700928dp long-word overflow still fails. Combined diagnostics/scheduler/composition tests pass 23/23; build and native typecheck pass. Actual trimmed-line callback values remain pending the primary agent's Android rerun. A trimmed advance is still not an ink-bound measurement or general typography-quality certificate.

Initial failing evidence SHA-256:

```text
4068099e3761285aed052004803357fb62fb548aeb04e59d41df103d9c70a7e5  artifacts/vela/diagnostics/android-trailing-advance/detail.json
1bff424cfc184995511a100129495aaaaeae80579778b3682d943b718913f6fa  artifacts/vela/diagnostics/android-trailing-advance/detail.png
511520ecd998756f60223e771e55b22d78a0b4ed6f3ff13fba23cafb4c53c8a3  artifacts/system/android-longword-failure.json
4e7bf1e349a5ccde73f770b958763067b6e02568b904cddd7b1b434dc3bb458e  native/node_modules/react-native/ReactAndroid/src/main/java/com/facebook/react/views/text/FontMetricsUtil.kt
```

Adapter source at handoff:

```text
921c8688212e485c394dff7056428fa38ad0bc405982aaf1800175e4bc8c8dff  src/native-text-diagnostics.ts
322880f52fb9f0bc1a2f1fd3a47196f49fd99e64f3061da674922f8e9a782657  native/observations.tsx
d51209d62cda47eb628f3571903e39afadf096ea276730c1f3612976b364b59e  scripts/prove-vela-native.mjs
a5584ffe9907a909a46638aa261a4633e3b2462979f789b029ec8bb3810ce128  test/native-text-diagnostics.test.ts
```
