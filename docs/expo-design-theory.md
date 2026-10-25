# Expo / React Strict DOM interoperability experiment

The isolated review flow runs with real React Strict DOM primitives on production Expo Web and actual iOS/Android Expo Go runtimes. Ten source-bound text scenarios feed the shared relational kernels; the resulting typography, row density, and region widths are imported by the app. This is a measured integration experiment, not Relay, a visual-parity claim, or an aesthetic benchmark.

The recorded brief is [`DESIGN.md`](../experiments/expo-design-theory/DESIGN.md). The app, adapters, pinned lockfile and producers live in [`experiments/expo-design-theory`](../experiments/expo-design-theory). No synthetic interview is presented as human preference evidence.

## Current evidence

`artifacts/expo-design-theory/proof.json` is the aggregate. It binds current source files and the exact raw artifacts, rather than accepting handwritten platform flags. At the recorded freeze:

| Evidence | Observed result |
| --- | --- |
| Production Expo Web | 60/60 checks; actual Chromium and WebKit at 390, 820 and 1440 CSS pixels, each at 1× and 2× app text |
| Actual iOS | Eight AX-targeted HID actions; 10/10 geometry/source/result checks on iPhone 17 Pro / iOS 26.5 Simulator |
| Actual Android | Eight adb input actions independently checked against UIAutomator bounds; 10/10 geometry/source/result checks on the provisioned emulator |
| Shared output bindings | 36/36 comparisons of actual browser/native geometry or browser computed style against exact selected output pointers |
| App JavaScript checks | `npm run typecheck --prefix experiments/expo-design-theory` passes with checked JavaScript and native asset declarations |

The native flows filter records, open a row, mark it reviewed, return to all records, and change the title. Actual native controls also switch text enlargement on and off. iOS enlarged single-line height measured 45 points against 44.8 expected; Android measured 44.952 device-independent pixels. Native widths are measured independently; the adapter does not pretend that a declared native `fontSize` is a computed-style observation.

The renderer source identity is `c51150c1a3b2c80819a01cb785932f3cc3861867533e340952b6f2c56a76eff1`. The selected values identity is `b365f97bdbbec88c8b7396c545bf183583db309c70b9f886afcd3b7f388cbe45`. The aggregate separately hashes producers, type-check configuration, generated values, raw results and font bytes. Hashes detect changed payloads; they do not authenticate authorship or establish that a renderer executed.

## Current stack and boundaries

Exact dependency versions are Expo 58.0.19, React/React DOM 19.3.0, React Native 0.88.0, React Native Web 0.21.4, React Strict DOM 0.0.55, Expo Metro Runtime 58.0.15, Expo Font 58.0.10, and Safe Area Context 5.10.1. The package and lockfile pin the development dependencies as well. React Strict DOM brings its own StyleX dependency; it does not use the repository gallery's separately installed StyleX version.

The setup follows the current [Expo SDK matrix](https://docs.expo.dev/versions/v58.0.0/) and [React Strict DOM setup](https://react.github.io/react-strict-dom/learn/setup/). Its documented Babel preset and PostCSS plugin compile the shared `css.create` rules; package exports select the actual native implementation. [React Native 0.88](https://reactnative.dev/blog/2026/10/19/react-native-0.88) and the installed package versions were checked instead of copying an older SDK example.

`App.jsx` uses `html` text, buttons and flex regions on both renderers. Native scrolling uses the documented [`compat.native`](https://react.github.io/react-strict-dom/llms.txt) boundary around a real React Native `ScrollView`, isolated in `Scroll.native.jsx`. It is an explicit platform adapter. The app does not contain a WebView. [`useObservations.jsx`](../experiments/expo-design-theory/src/useObservations.jsx) reads actual host-node `getBoundingClientRect` values and retains declared state separately. The hook clears its observation interval on unmount. Network delivery is enabled only by the explicit local observer environment variable.

The DOM material shader remains web-only and is not used as evidence of a native finish. This experiment uses static finishes. Strict DOM's [CSS](https://react.github.io/react-strict-dom/api/css/) and [HTML](https://react.github.io/react-strict-dom/api/html/) support is a subset; these results cover the exercised primitives, not every DOM/CSS API.

## Two tuning rounds

Round 1 is retained under `artifacts/expo-design-theory/round1/`, including source, screenshots, native receipts and `review.json`. Its web mechanical checks passed, but actual native rendering and synthetic visual inspection found failures:

* A requested 362-point iOS row rendered at 396 points because implicit box sizing added padding and borders. Android showed the equivalent overflow. Round 2 makes box sizing explicit at shared layout boundaries.
* Native text spans flattened the attempted inline flex metadata layout, concatenating time and status. Round 2 uses an intentional text separator.
* The first enlargement control changed headings and row titles while details, metadata, values and buttons stayed small. Round 2 applies enlargement to every text role.
* Phone detail opened below the whole list. Round 2 uses a single-column detail state with an explicit return action; wider layouts retain both regions.
* Expo 58's asset import failed with RN Web 0.21.0. The current 0.21.4 patch exports the required asset registry and passed an actual export.

The first Android boot also displayed a System UI ANR dialog. Its screenshot is retained; it was dismissed through its measured native dialog bounds. A GUI inspection call stalled, so actual iOS touches moved to the checksum-pinned idb companion and fresh accessibility IDs. The first blank-template smoke separately retained a stopped-companion failure before retrying. These are execution findings, not app performance scores.

## Reproduce and inspect

The ordered web producer owns an ephemeral static server and browsers only; it never boots or stops native devices:

```sh
npm ci --prefix experiments/expo-design-theory
node scripts/prove-expo-design-theory.mjs --web-only
```

On this Mac, the installed WebKit runtime requires `DESIGN_WEBKIT_EXECUTABLE=artifacts/runtime/playwright/webkit-2370/pw_run.sh`. Omit that override when Playwright has its normal installed executable. The producer exports the actual Expo app, checks controls and source-bound values, and writes `artifacts/expo-design-theory/round2/proof.json`.

For fresh decisions, collect actual text cells before compiling. Web calibration uses `EXPO_DESIGN_ROUND=round2-calibration` with the same producer. Native calibration uses the real iOS/Android app and `scripts/native-proof.mjs --calibrate` (add `--ios` for iOS). The native session producer is `node experiments/expo-design-theory/scripts/session.mjs`; it uses Metro 8097, proxy 8098, and loopback observer 4333. Android must reverse **both** Metro ports because the manifest's asset URL names 8097, plus 4333 for observations. Existing runtimes must already be provisioned and booted. The iOS driver setup/start commands are documented by `node scripts/ios-input-driver.mjs help`; use the explicit custom simulator set and UUID, not an arbitrary foreground Simulator window.

```sh
node --import tsx experiments/expo-design-theory/scripts/generate-design.mts
node scripts/prove-expo-design-theory.mjs --web-only
node experiments/expo-design-theory/scripts/native-proof.mjs --ios
node experiments/expo-design-theory/scripts/native-proof.mjs
node --import tsx experiments/expo-design-theory/scripts/finalize-proof.mts
```

After generating selected values, restart the CI Metro session and reload the actual native clients. The generator calls `compileRelationalKernels`, `runDecisionWorkflow`, then `resolveRelationalKernelOutputs`. It retains the authored input, measured cells, compilation, numeric workflow and resolved values under `artifacts/expo-design-theory/decisions/`. Browser cells never stand in for native measurements. This run uses mathematical selection; it does not benchmark a neural model.

[`proof-contract.mjs`](../experiments/expo-design-theory/scripts/proof-contract.mjs) re-exports the synchronous `validateExpoProof(proof, { root, checkSources })` from `scripts/expo-proof-contract.mjs`. It checks the complete canonical source manifest, recomputes the renderer identity, checks exact artifact hashes and roles, and requires unique renderer/scenario and native-stage sets before comparing input-provider records and numeric geometry. `validateTemplateProof(proof, { root })` separately verifies the blank builder shell against the current literal and exact policy allowlist, with one record per required browser/width and native platform. Duplicate records cannot substitute for omitted evidence. Both return `{ valid, failures, ... }` and perform no rendering or mutation. Synthetic rejection tests cover missing/duplicate sources, artifacts and scenarios, and fabricated receipt stages; they are protocol tests rather than renderer evidence.

## Independent blank template

The builder template copies only the pinned configuration and primitive adapters from the policy allowlist. The `SHELL` literal in `scripts/run-relay-builders.mjs` contains neutral placeholder text and a single measured interaction button. It has its own source identity and cannot reuse the original review app's receipt.

`node experiments/expo-design-theory/scripts/prove-template.mjs` copies the exact allowlist and literal into `artifacts/expo-template-smoke/app`, runs `npm ci`, exports production web, and exercises the button in Chromium/WebKit at three widths and actual iOS/Android. It uses separate Metro 8107/proxy 8108/observer 4334, and cleans up its own services. The result is `artifacts/expo-template-smoke/proof.json`. The independent run passed all eight checks: six web scenarios and two actual native button transitions. Its source identity is `2c3b5b30f8e867d8956186d0759a48b3f0d8302bc5da1084bd5c50e5f1b510e7`. Both spike and template validators accepted the current files at the recorded freeze.

## Explicit limits

The 2× tests exercise the app's real enlargement controls. OS Dynamic Type and Android system font-scale changes are outside the compiled scenarios; the recorded baseline was iOS `large` and Android `1.0`. Native release builds, physical hardware energy/thermal behavior, full screen-reader conformance, continuous native gestures beyond the exercised input path, and whole-app accessibility remain unverified. The browser proof includes keyboard Enter activation and reduced-motion preference; the app has no animation requiring a separate reduced-motion substitution.

The dependency audit retained five high-severity findings in Expo's transitive CLI chain (node-forge/Zod). The suggested force resolution would downgrade Expo across major versions and was not applied. The local experiment does not treat a successful build or this audit note as a security certification. No production deployment or package publication occurred.
