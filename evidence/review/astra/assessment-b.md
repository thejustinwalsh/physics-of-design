# Assessment B — detector and browser evidence

Method: isolated Assessment B, `/root/astra_design_review/assessment_b`. Assessment A output was neither requested nor read. Target: frozen `artifacts/review/astra-input/`; original and coupled alternatives retain their actual `original` and `relaxed` IDs. Assessment date: 2026-10-24. No production edits.

## Deterministic scan

Ran exactly once:

```sh
IMPECCABLE_HOME=/Volumes/Depot/Developer/design-theory/artifacts/runtime/impeccable-cache artifacts/runtime/impeccable/.agents/skills/impeccable/scripts/impeccable detect --json artifacts/review/astra-input
```

Exit **2**, empty stderr, valid JSON. Scope: 21 HTML files (20 specimens and the review index); reports and support outputs are outside the scanned directory. **40 findings across 20 specimen files: 20 `cream-palette` warnings and 20 `repeating-stripes-gradient` advisories.** Each rule appears once in every `{hero,editorial}-{original,relaxed}-{360,390,834,1024,1440}.html`; index has none. All detector locations are **line 0**, so they are file-level signals, not precise source lines. Full absolute paths and rule counts are retained in [detector-summary.json](detector-summary.json); unmodified detector output is [detector.json](detector.json). `.impeccable/critique/ignore.md` does not exist.

Disposition:

- **Repeating stripes: false positive for the visible specimens.** Source CSS contains `body.guides article{background:repeating-linear-gradient(...)}`. Browser sample `editorial-relaxed-360` has empty body class and computed article background image `none`; representative screenshots also show a plain background. This is an inactive measurement guide, not the displayed surface decoration the rule describes.
- **Cream palette: factual color detection, not established design failure.** Browser confirms `rgb(246, 244, 237)` background and `rgb(23, 25, 24)` text. A shared neutral substrate in controlled typography specimens is not sufficient evidence of category sameness or poor authorship. Preserve this as an advisory about intent rather than a priority fix. Changing the palette would not address the measured mobile wrapping problem.
- The detector did **not** report the mobile broken word or excessive title height. Thus its 40 repeated style signals are not a count of 40 independent usability problems, and its silence on wrapping is not a responsive pass.

## Browser evidence and exact limitations

Used the native `mcp__cua_repl` browser first. Initial `createBrowserTab('iab', URL, {visible:true})` returned **“IAB visibility is not supported in a subagent thread”**. Retried with `visible:false`, which successfully created a fresh isolated tab (tab 1, browser 2) at `http://127.0.0.1:4391/index.html`. It was not a reused user or Assessment A tab.

Overlay capability preflight: the returned browser API explicitly documents `tab.playwright.evaluate` as **read-only**, and no mutable script API is exposed. Consequently setting `document.title` and appending a script are unavailable through the permitted API. No mutation was attempted through the read-only API, no detector script was injected, no `[Human]` overlay was claimed, and no Impeccable live server was started. There are no in-page detector console findings. Fallback signal is the real CLI detector plus native-browser screenshots and read-only rendered geometry. **No custom Playwright process was used**, because the background native browser succeeded.

All 20 pages were navigated and measured at their named widths, height 1000. Read-only evaluation collected block rectangles, computed font sizes/line heights/tracking, scroll/client widths, document widths/heights, and body/block maximum widths. A first query failed with `TypeError: parseFloat is not a function`; it was replaced by a compatible query returning raw CSS strings, then line counts were derived outside the page. This failure did not require a browser fallback. A malformed batch query was corrected before it executed; the succeeding batch returned all 20 rows.

Live screenshots visually inspected: hero-original-360, hero-relaxed-390, hero-relaxed-834, hero-original-1440, editorial-original-360, editorial-relaxed-360, editorial-relaxed-1440. `document.fonts.status` was `loaded` on the checked editorial relaxed pages. The frozen `hero-relaxed-390.png` was separately viewed and agrees with the fresh browser image, including the final isolated `s.`. Frozen screenshots are supplied review evidence, not newly captured native evidence. Older iOS images were not used; no native renderer, emulator, or native freshness claim was made.

The temporary viewport override was reset and the fresh tab closed. Parent-owned port 4391 was left running. Ports 4319/8087 and native emulators were untouched. No temporary server or injected source tag requires cleanup. Saved JSON/report files are intentional support artifacts. Target slug/snapshot/trend remain the parent synthesis responsibilities.

## Measurements

Full numeric evidence is in [browser-measurements.json](browser-measurements.json); source hashes are in [frozen-hashes.json](frozen-hashes.json). CSS pixel units throughout. Title/body line counts below are **line boxes inferred from rendered height divided by computed line height**; editorial body includes one blank line between its two paragraphs (subtract one for occupied text lines). They are not a Range-based per-glyph line analysis.

| Specimen | Width | Title/body font | Title/body rendered width | Title/body line boxes | Body starts at y |
|---|---:|---:|---:|---:|---:|
| hero-original | 360 | 88 / 24 | 232 / 232 | 6 / 5 | 630.55 |
| hero-original | 390 | 88 / 24 | 262 / 262 | 6 / 5 | 630.55 |
| hero-original | 834 | 88 / 24 | 706 / 660 | 2 / 2 | 271.52 |
| hero-original | 1024 | 88 / 24 | 896 / 660 | 2 / 2 | 271.52 |
| hero-original | 1440 | 88 / 24 | 1080 / 660 | 2 / 2 | 271.52 |
| hero-relaxed | 360 | 114.4 / 24 | 312 / 312 | 6 / 4 | 750.95 |
| hero-relaxed | 390 | 114.4 / 24 | 342 / 342 | 6 / 3 | 750.95 |
| hero-relaxed | 834 | 114.4 / 24 | 786 / 543.63 | 2 / 2 | 283.77 |
| hero-relaxed | 1024 | 114.4 / 24 | 976 / 543.63 | 2 / 2 | 283.77 |
| hero-relaxed | 1440 | 114.4 / 24 | 1232 / 543.63 | 2 / 2 | 283.77 |
| editorial-original | 360 | 44 / 21 | 264 / 264 | 3 / 25 | 219.82 |
| editorial-original | 390 | 44 / 21 | 294 / 294 | 3 / 22 | 219.82 |
| editorial-original | 834 | 44 / 21 | 738 / 650 | 1 / 11 | 121.27 |
| editorial-original | 1024 | 44 / 21 | 760 / 650 | 1 / 11 | 121.27 |
| editorial-original | 1440 | 44 / 21 | 760 / 650 | 1 / 11 | 121.27 |
| editorial-relaxed | 360 | 57.2 / 21 | 312 / 312 | 4 / 21 | 282.22 |
| editorial-relaxed | 390 | 57.2 / 21 | 342 / 342 | 3 / 20 | 222.96 |
| editorial-relaxed | 834 | 57.2 / 21 | 786 / 652.60 | 1 / 11 | 104.45 |
| editorial-relaxed | 1024 | 57.2 / 21 | 929.17 / 652.60 | 1 / 11 | 104.45 |
| editorial-relaxed | 1440 | 57.2 / 21 | 929.17 / 652.60 | 1 / 11 | 104.45 |

Every document's `scrollWidth` equaled its requested viewport width; every measured block's `scrollWidth` equaled `clientWidth`. This establishes **no measured horizontal box overflow**, not successful word wrapping. All blocks use `overflow-wrap:anywhere`, which avoids overflow by allowing arbitrary internal word breaks. Body element `max-width` is `none`; text blocks have `max-width:100%` plus authored widths. The body-text caps are hero original 660, hero relaxed 543.635, editorial original 650, editorial relaxed 652.602. Editorial caps remain essentially stable across variants.

Article padding: hero original 64; editorial original 48; both relaxed variants 24. The content is a left-aligned flex column with two text blocks. Hero original gap 28 versus relaxed 26.176; editorial original gap 24 versus relaxed 21.188. At 360, editorial original article height is 1081.49 and document scroll height 1081; remaining document heights are 1000. Vertical scrolling here is ordinary reading flow, not an overflow defect.

## Findings supported by this evidence

1. **P1 — Mobile hero title is not a viable responsive treatment in either variant.** At 360 and 390 both titles use six lines. Original 360 visibly breaks `matters.` as `matte` / `rs.`; relaxed 390 breaks it as `matter` / `s.`. The coupled variant reduces padding but increases size from 88 to 114.4; its heading height grows from 538.55 to 700.78 and the subtitle moves down from y=630.55 to y=750.95. This is a regression in access to supporting copy even though the subtitle itself uses fewer lines. Fix through a mobile title size and available-width rule, with intact words and deliberate line grouping checked at 360 and 390. Use ordinary flex/Yoga container padding and text-width constraints; do not require Grid or absolute layout. Candidate values need a fresh render before they can be called successful. Suggested command: `$impeccable adapt`.

2. **P2 — Original mobile editorial padding creates a narrow, lengthy reading column.** At 360 the 48px gutters leave 264px for 21px Spectral prose, producing 24 occupied text lines. Relaxed 24px gutters leave 312px and produce 20 occupied lines, a measurable improvement without reducing body size. At 390, occupied lines fall from 21 to 19. Preserve the wider mobile prose area; retain the approximately 650px cap at larger sizes. This needs only flex/Yoga padding and maximum text width. Suggested command: `$impeccable layout`.

3. **P2 — Coupled editorial title growth spends part of the mobile spacing gain.** At 360 the heading changes from three lines at 44px to four at 57.2px; body starts 62.40px later (219.82 → 282.22) despite smaller gutters and gap. At 390 its three-line height still grows (147.82 → 177.77), but the 24px top inset nearly offsets that growth. The result is width-sensitive and cannot be called generally improved merely because total article height decreases. Keep the useful prose width change while assessing mobile title size independently. Flex/Yoga can retain separate title and prose width caps and explicit responsive font sizes. Suggested command: `$impeccable typeset`.

These are proposed priorities grounded in rendered evidence, not an independent aesthetic score or a claim that the next design has been validated. There is no basis here to invent navigation, a CTA, imagery, forms, empty states, or interactive task requirements: the index explicitly identifies these as typography specimens. The wide captures demonstrate intact reading flow and bounded prose measure; they do not establish all intermediate breakpoint behavior, 200% text scaling, language expansion, or native parity.

Questions are owned by parent synthesis after Assessment A is complete; this file is an isolated evidence contribution, not the final user critique.
