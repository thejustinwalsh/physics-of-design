# Assessment B follow-up — revised frozen specimens

Method: isolated B follow-up, `/root/astra_design_review/assessment_b`; no follow-up Assessment A findings consumed. Target `artifacts/review/astra-after/`, served by parent at `http://127.0.0.1:4392/`. All ten revised original specimens measured at 360, 390, 834, 1024, and 1440 CSS pixels, height 1000. Review date 2026-10-24. No production or emulator changes.

## Outcome supported by measurements

The checked mobile hero no longer splits words: both 360 and 390 render **“Make room” / “for what” / “matters.”** in three lines. Original before evidence recorded six lines at both sizes, with internal word breaks. Supporting copy starts at y=212.47 and 227.41, compared with y=630.55 in the preserved before measurements. Editorial mobile headings now occupy two lines, and prose width is 320/342px rather than 264/294px in the original before run. No horizontal document or block overflow was measured in any of the ten revised specimens.

The same loaded `hero-original-360.html` page **actually adapts when resized 360 → 834 → 390 without navigation or reload**: title sizes change 52 → 80 → 56px; padding changes 24 → 40 → 24px; heading lines change 3 → 2 → 3; supporting copy sizes change 22 → 24 → 22px. This is observed runtime adaptation, not an inference from three separately exported pages. This confirms behavior for this sequence; it does not prove every possible width or ResizeObserver implementation detail.

## Detector

Ran once:

```sh
IMPECCABLE_HOME=/Volumes/Depot/Developer/design-theory/artifacts/runtime/impeccable-cache artifacts/runtime/impeccable/.agents/skills/impeccable/scripts/impeccable detect --json artifacts/review/astra-after
```

Exit **2**, empty stderr, valid JSON. **20 findings: 10 `cream-palette` warnings and 10 `repeating-stripes-gradient` advisories**. Each rule occurs in every `{hero,editorial}-original-{360,390,834,1024,1440}.html`, always at line 0; review index has none. [Raw output](after-detector.json) and [counts with absolute file paths](after-detector-summary.json) are retained. The change from 40 before to 20 after is caused by scanning ten instead of twenty specimens, **not evidence of detector improvement**.

Same interpretation as the earlier B pass: the cream substrate is a real property, not by itself a quality failure; repeating stripes belong to inactive `body.guides article` CSS and are not visible in inspected captures. The inspected after source has that conditional guide rule and no body class attribute. The detector does not adjudicate the responsive improvements measured here.

## Exact browser/fallback provenance

Native capability was attempted first with `cua.createBrowserTab('iab','http://127.0.0.1:4392/index.html',{visible:false})`; result: **“Browser is not available: iab”**. A surface inventory returned `apps:[]`, `browsers:[]`, and **“The Mac is locked and automatic unlock could not unlock it. Ask the user to unlock the Mac manually before continuing.”** No attempt was made to bypass the lock or operate native apps.

The authorized fallback used a **fresh headless Playwright Chromium process**, an isolated page, and the parent-owned local server. Initial launch under the filesystem sandbox failed at Chromium's macOS MachPortRendezvousServer startup with **“Permission denied (1100)”**. The same scoped script was rerun with the tool's approved escalation and completed successfully. This was permission to start the isolated local browser, not native UI unlock. Browser closed in `finally` after measurements and captures. No reused profile or parent browser was attached.

Overlay was skipped: native mutable injection remains unavailable under its documented read-only evaluation API, and this task explicitly forbids using the fallback to inject the overlay. No Impeccable live server, injected script, `[Human]` tab, or in-page detector console result exists. This is honestly labeled fallback browser evidence, not native-browser or iOS proof.

The evidence script [measure-after.mjs](measure-after.mjs) waits for `document.fonts.ready` and two animation frames after navigation/resizing, reads rendered geometry and computed style, and groups per-character DOM Range rectangles into occupied text lines. All recorded pages report fonts loaded. These occupied-line counts exclude the blank paragraph separator, unlike the earlier height-derived line-box counts. Compare editorial prose against before line-box counts minus one.

## Measured after geometry

Raw data including exact line text, rectangles, font metrics, overflow values, and the dynamic resize sequence: [after-browser-measurements.json](after-browser-measurements.json). Fresh file hashes: [after-frozen-hashes.json](after-frozen-hashes.json).

| Specimen | Width | Title/body size | Title/body width | Occupied title/body lines | Body y | Article x/width |
|---|---:|---:|---:|---:|---:|---:|
| hero | 360 | 52 / 22 | 312 / 312 | 3 / 3 | 212.47 | 0 / 360 |
| hero | 390 | 56 / 22 | 342 / 342 | 3 / 3 | 227.41 | 0 / 390 |
| hero | 834 | 80 / 24 | 754 / 660 | 2 / 2 | 231.19 | 0 / 834 |
| hero | 1024 | 88 / 24 | 928 / 660 | 2 / 2 | 255.50 | 0 / 1024 |
| hero | 1440 | 96 / 24 | 1000 / 660 | 2 / 2 | 291.81 | 80 / 1280 |
| editorial | 360 | 36 / 21 | 320 / 320 | 2 / 19 | 120.63 | 0 / 360 |
| editorial | 390 | 38 / 21 | 342 / 342 | 2 / 19 | 131.09 | 0 / 390 |
| editorial | 834 | 44 / 21 | 720 / 650 | 1 / 10 | 113.27 | 9 / 816 |
| editorial | 1024 | 44 / 21 | 720 / 650 | 1 / 10 | 121.27 | 104 / 816 |
| editorial | 1440 | 44 / 21 | 720 / 650 | 1 / 10 | 121.27 | 312 / 816 |

Body element `max-width` remains `none`; the relevant body-text caps remain **660px hero / 650px editorial**. The editorial article is centered at 816px for the larger views, and the hero is centered at 1280px at 1440. No measured page expands the document width beyond the viewport; every block scroll width equals client width. Both mobile title and body blocks have intact whole-word lines in the inspected hero screenshots. Editorial header is “The shape of a” / “thoughtful pause” at 360 and 390.

Fresh headless screenshots were captured for all ten pages under `after-browser-{id}.png`. Visually inspected in this evidence pass: [hero 360](after-browser-hero-original-360.png), [hero 390](after-browser-hero-original-390.png), [editorial 360](after-browser-editorial-original-360.png), [editorial 1440](after-browser-editorial-original-1440.png). Other widths have measured geometry and saved screenshots, but are not claimed as individually visually inspected here.

## Scope of conclusion and preservation caveat

The prior P1 broken-word mobile hero failure is resolved **at the checked 360/390 widths**, and the prior narrow editorial measure and oversized mobile heading have improved in the observed output. The evidence does not establish aesthetic superiority by a numerical score, all intermediate widths, zoom/text scaling, translations, native parity, or the coupled alternatives (only ten original specimens were revised here). No additional issue is promoted solely to satisfy a quota.

The original `astra-input` HTML/PNG directory was accidentally regenerated after the first independent critique. Per [artifact-regeneration-note.md](artifact-regeneration-note.md), this follow-up uses the preserved before report, raw browser measurements, and detector JSON as its before evidence; it does **not** use current `astra-input` files as old screenshots. Its original hashes remain a record, not a recovered original file set. The browser engine also changed from native in-app browser to headless Chromium, so minor fractional geometry differences are not attributed exclusively to design changes. The large wrapping and font-size differences are directly observed and independently documented in the respective runs.

No server was started by B; parent owns cleanup of port 4392. The isolated Chromium process was closed. No temporary source mutation or overlay cleanup remains. Evidence script, screenshots, hashes, and JSON are intentional report support. Parent owns final synthesis/questions, snapshot, and trend reporting after A completes.
