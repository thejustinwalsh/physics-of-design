# Bold gallery: synthetic Astra design review

The gallery has a coherent, recognizable visual direction. This review found five significant defects in edit feedback and inspection readability; corrected captures now close those findings in the reviewed scenarios. The oversized title, acidic enamel hero and sharp chapter transition remain intact. The final closure evidence and its limits appear below.

This is a **synthetic model critique**, not human preference evidence, an award assessment or an aesthetic score. The review used the recorded [synthetic interview](../research/bold-brief-interview.json), [DESIGN.md](../DESIGN.md), the repository Design Theory skill and relevant references, the [integration audit](gallery-integration-audit.md), and the [skill comparison](skill-comparison.md). Impeccable's committed guidance at [`936867543ac2576920d663cc9803597f6044f3ac`](https://github.com/pbakaus/impeccable/tree/936867543ac2576920d663cc9803597f6044f3ac) informed the distinction between expressive presentation and predictable operation, semantic grouping, responsive topology and readable evidence. Its launcher and detector were not executed. This is a scoped rendered review using that knowledge, not a claim to have completed Impeccable's separate automated critique workflow.

## Evidence and identity

The baseline is the captured Chromium report dated `2026-10-25T11:59:11.130Z` and WebKit report dated `2026-10-25T12:01:03.384Z`, under `artifacts/design-theory/interactions-final-captured-{chromium,webkit}/`. I visually inspected Chromium hero, full-page and inspection images at 390, 834 and 1440 CSS-pixel viewport widths, desktop left/right DOM-light images and the phone DOM-light image. I also inspected the WebKit 834 hero and 390 inspection images. These are automated browser captures at device-like widths, not physical phone/iPad/Safari evidence.

The full-page images show a deliberate test end-state: Image & finish selected, Phone · 2× text selected, the call ledger expanded, and the composition headline lengthened with gutter/gap at their tested extremes. Findings about this state are not presented as default-page behavior. Local inspection crops in `/tmp/design-theory-astra-review/` contain unchanged pixels from the named full-page files; the durable originals are the evidence.

Baseline source identities from the reports:

| Input | SHA-256 |
| --- | --- |
| `DESIGN.md` | `3bc9b66ae3b4d059197c9156412ba7d2a682b93c55883d44c4cab8d367eee511` |
| `research/bold-brief-interview.json` | `e8414616b85e1b75064f6cc4ae9cf7b9d17133d7e756dfe94da01fa767f0cd55` |
| `examples/design-theory/FieldSession.jsx` | `fe3314ded77a465b092b989e8ae827777485d3bca128f2d1633062d82b7ce92f` |
| `examples/design-theory/LayoutPreview.jsx` | `bd5b16187b8a9d5ef3403fcb3ee1b3dd3539c439342a853e4335fbc92f80654f` |
| `examples/design-field/gallery-session.json` | `dff5fd1a867368feac27f135272341a815725c9197dc46a7ce4b540557a5d4d3` |

The saved field fixture was subsequently rebound to corrected receipt identities with the same selected tokens, according to the implementation owner. These images remain historical baseline evidence for the findings below; the final closure captures use the later identities. The surrounding React gallery is authored. Two saved selector calls selected within one field containing 972 numerical alternatives; they did not generate the whole gallery.

## Historical findings and required changes

### High: expose the region affected by the current field edit

**Observed:** In Image & finish with Phone · 2× text, the 560px-high preview shows only “Make the rules. Then bend…” at every captured host width. The image and both finish surfaces are below the visible preview. See [phone final](../artifacts/design-theory/interactions-final-captured-chromium/chromium-390-final.png), approximately y=3548–4108, and [desktop final](../artifacts/design-theory/interactions-final-captured-chromium/chromium-1440-final.png), approximately y=2212–2772. `Fixture` in `FieldSession.jsx` confirms `overflow: auto` with `maxHeight: 560`; this is an inner scrolling viewport, not proven lost content.

**Consequence:** A person comparing image/finish alternatives cannot see the property being compared in the visible result. The cutoff does not explain where the image went or signal a route to it. This is especially costly because showing connected consequences is the gallery's primary task.

**Change:** Preserve the true scenario scale and enlarged text. Provide an explicit “Show image & finish” destination and a visible scroll/position cue when the relevant region lies outside the preview. Keep control geometry stable; do not silently scroll the outer page on selection. A full-preview route is useful if it preserves the current tokens and scenario.

**Reusable rule:** An editing surface needs a declared affected region and an observable witness of its result. If that region does not intersect the current preview viewport, disclose its location and provide a direct navigation action. A valid layout box does not establish useful edit feedback. Verify this at default and enlarged text, including keyboard access to the offscreen content.

### Medium: reflow phone evidence into readable relationship records

**Observed:** The phone relationship table retains four columns across about 350px. Source paths and explanation prose wrap into narrow one/two-word stacks; the image-retention explanation alone occupies a tall strip. The expanded call ledger also breaks result hashes into short fragments. See the [390 final](../artifacts/design-theory/interactions-final-captured-chromium/chromium-390-final.png), y≈4400–5900. The source table uses 13px text and full available width; no semantic phone topology is defined.

**Consequence:** The table technically contains the evidence, but comparing a value with its meaning requires following long fragmented columns. Reducing type size would worsen the actual reading task.

**Change:** At constrained widths, render one relationship record with its name, value/status and explanation together. Retain the side-by-side table where each column has a useful measure. Keep exact IDs and full hashes available in an expandable technical detail or export; show a stable short label in the main record.

**Reusable rule:** Responsive evidence must preserve the association between claim, value and source. Choose table versus records from the content's minimum useful measures, not a universal tablet column count. Test complete source descriptions and long identifiers, not only short numeric cells.

### Medium: keep inspection labels off the content being measured

**Observed:** Solid numbered badges sit inside the top-left of measured rectangles. They cover the beginning of “FIELD NOTES,” “OBJECTS / ISSUE 001,” and “Made with intention.” The footer overlap is clearly visible in both [Chromium phone inspection](../artifacts/design-theory/interactions-final-captured-chromium/chromium-390-inspection.png) and [WebKit phone inspection](../artifacts/design-theory/interactions-final-captured-webkit/webkit-390-inspection.png). The rectangles themselves remain attached to the rendered elements.

**Consequence:** Inspection conceals the content it is supposed to explain. Exact box agreement cannot detect that failure because the annotation is a separate layer.

**Change:** Put badges outside the content rectangles using available gutters or short leaders, with an external legend fallback when there is no free space. Do not move the measured text to accommodate the overlay. Keep selection hit areas and the selected-region identity intact.

**Reusable rule:** Annotation placement has its own collision constraints against readable text and controls. Test badge rectangles separately from proposal/renderer box agreement, across scaled previews and changed content.

### Medium: place desktop inspection details beside the selected composition

**Observed:** In the [1440 inspection capture](../artifacts/design-theory/interactions-final-captured-chromium/chromium-1440-inspection.png), the preview occupies the left region while the right region is largely empty. Region selection, observed/proposed dimensions, headline editing and equations begin underneath the entire preview. The 834 image has the same relationship.

**Consequence:** The selected region and the explanation are unnecessarily separated at widths that have room for adjacency. Long content increases this separation. This falls short of the recorded desktop goal of adjacent operative inspection.

**Change:** Put the selected-region details into the stable side panel with the existing controls when both regions retain useful measures. Keep phone controls before the preview and details after it. Avoid changing the active slider's coordinate space as detail content grows.

**Reusable rule:** A selected object and its actionable explanation form one task group. Use available width to preserve their visual association, while independently enforcing stable direct-manipulation geometry. Verify the long-title state and all region selections after reflow.

### Medium: make static 3D instructions match the available response

**Observed:** The material study is explicitly labeled “Static illustration” and exposes “Activate 3D study,” but it simultaneously says “Move your pointer to shift the light” and shows active roughness/metalness/texture controls. See [desktop final](../artifacts/design-theory/interactions-final-captured-chromium/chromium-1440-final.png), y≈4968–5500. `Surface.jsx` stores pending settings while unactivated; the static illustration cannot display those material changes.

**Consequence:** The current instructions promise immediate visible feedback that this state cannot provide. Avoiding automatic GPU initialization remains a useful implementation choice; the affordance needs to explain that choice.

**Change:** In the static state, say the controls prepare settings for the 3D study and place the activation action beside them, or disable the unavailable operations with an explanatory state. Show the pointer-light instruction only after rendering is ready. Keep the live DOM-light study available independently.

**Reusable rule:** Affordances and help text must derive from actual renderer capability/state. Distinguish editable pending parameters from visible live effects. Verify static, preparing, ready, fallback and context-loss states without initializing 3D merely because an unrelated slider moves.

## Composition judgment and preserved strengths

The title and primary action lead at 390px. The 834px hero remains a purposeful split with readable measures, and the 1440px hero uses asymmetry and scale confidently. The acidic panel, warm substrate, near-black typography and vermilion controls establish a consistent world. The exact phrase break across “Then bend” is expressive and intelligible here; uniform heading balancing would weaken the intended emphasis.

Character is concentrated in the hero and acidic registration strip. The operative chapters are more conventional, which serves the comparison and inspection task. Adding decorative motion or more display-scale type would not solve the identified usability defects. The sharp chapter transitions already provide sufficient interruption without putting controls in motion.

The DOM-light captures visibly change the panel orientation/light response while keeping text on an opaque readable shield. This is a successful visual connection between material appearance and actual interface content. I did not measure contrast from these screenshots and do not infer physical material accuracy or motion smoothness from two endpoints.

## Limits and correction status

The retained Chromium report records 27 drag scenarios, 165 passing action assertions and no runtime errors; WebKit records 27, 169 and no runtime errors. Chromium's later trace-export harness failure is retained separately. These are other tooling's recorded observations, not interactions independently performed by this reviewer. Full drag continuity, keyboard behavior, reduced-motion behavior, disposal, changed-state exports and physical hardware performance are not reverified by this visual review. The review inspected 390/834/1440 windows; 320px, iPad landscape/narrow window and browser zoom still need the relevant runtime evidence.

## Corrected visual closure

All five original findings are closed **for the inspected states**, using the source-bound [closure report](../artifacts/design-theory/review-closure/report.json) and its current captures. The report records **40 passing checks, zero failed checks and zero errors** across Chromium and WebKit at 390, 834 and 1440px. These are targeted local closure checks under concurrent verification load, not a performance benchmark or a replacement for the full interaction lane.

| Finding | Observed correction and evidence |
| --- | --- |
| Offscreen image/finish consequence | The [phone consequence capture](../artifacts/design-theory/review-closure/chromium-390-consequence.png) follows the actual “Show image & finish” action at Phone · 2× text. The whole image and both finish surfaces are visible, with a scrollable-viewport explanation and a return-to-type action. The report records full vertical intersection of the affected region at all three widths in both engines. |
| Compressed phone evidence | The [phone relationship records](../artifacts/design-theory/review-closure/webkit-390-records.png) group each name, value, contribution and source across the available width. The [phone ledger](../artifacts/design-theory/review-closure/chromium-390-ledger.png) also uses records, so hashes and evidence descriptions no longer become narrow vertical columns. |
| Badges conceal measured copy | The [phone badge capture](../artifacts/design-theory/review-closure/chromium-390-badges.png) shows readable nav, metadata and footer with labels in a reserved external rail. The report measures each badge's right edge about 6px before the corresponding content's left edge. |
| Detached desktop inspection details | The [desktop inspector](../artifacts/design-theory/review-closure/chromium-1440-inspector.png) and [tablet inspector](../artifacts/design-theory/review-closure/webkit-834-inspector.png) put the selected-region control, observed/proposed geometry and equation beside the preview. Phone controls remain before the preview. |
| Static material affordance mismatch | The [static material capture](../artifacts/design-theory/review-closure/chromium-1440-static-material.png) now says “Activate 3D to light this form” and explains that 3D edits are retained for activation. It also explains that roughness updates the independent live DOM study. The static illustration no longer promises pointer relighting. |

During closure, the tablet/desktop captures revealed a further **medium** identity defect: the image badge said `04` while the selector said `03 · Focal image`. That evidence is preserved under `artifacts/design-theory/review-closure-before-region-id/`. The final desktop/tablet images now show image `03` and action `04`, and the report asserts agreement for every semantic region across both engines and all three widths. The reusable rule is that inspection identity must come from the semantic region ID, never its current responsive iteration order. The earlier tablet-adjacency attempt remains separately preserved under `review-closure-before-ipad-adjustment/`.

Final closure source identities:

| Source | SHA-256 |
| --- | --- |
| `examples/design-theory/web.jsx` | `92e780529fb821b6d3f5cb77312eac9371e6ded440c8269d23461aac7cd4f67c` |
| `examples/design-theory/LayoutPreview.jsx` | `dbb1692fce0f55c0ebc21467f1dc339a063a82fa3189d20cf37f4090bd0068ed` |
| `examples/design-theory/FieldSession.jsx` | `6a2e6956984a95a81fe52ab9acc7d99d6008cbec525a8cad7e3bdab3e4169fba` |
| `examples/design-field/gallery-session.json` | `03290b87193f0bf73b7425c6de5697858a1383e3118f65fb1faebf68826278ca` |
| `artifacts/vela/web/design-theory/app.js` | `98259bfe5a38d2113038b7be13e98a8f772698de2b3617348db910dbbdb52598` |

I independently inspected the final phone consequence, phone records, phone badges, tablet/desktop inspector and static material pixels. The full keyboard, long-content, continuous-drag, disposal and reduced-motion regression claims remain owned by their separately recorded runtime checks. No unresolved high or medium visual finding remains from this scoped review; that statement does not establish human preference, general aesthetic superiority or hardware behavior.
