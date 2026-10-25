# Apple HIG as executable, scoped design policy

The native design adopts Apple guidance as first-class policy with source IDs, applicability and evidence requirements. It does not turn every recommendation into a universal constant, and it does not claim that a geometry audit covers all HIG. Sources are pinned by retrieval date and content hashes in [the provenance record](../research/apple-hig-provenance.json).

`platform audit` consumes native point-coordinate observations, safe-area insets, labeled control frames, optional scaling observations and navigation-continuity evidence. It reports each check separately, with failures and unknowns. `overallConformance` stays null. The current [Apple accessibility guidance](https://developer.apple.com/design/human-interface-guidelines/accessibility) distinguishes 44×44 pt default controls from a 28×28 pt minimum on iOS/iPadOS. Fieldwork adopts 44 pt as its product baseline. Eight float32 relative epsilons at viewport magnitude are explicitly reported as coordinate-reconstruction tolerance; materially smaller controls still fail.

For a control frame `(x,y,w,h)` and safe insets `(l,t,r,b)` in a window `(W,H)`:

```text
min(w,h) >= adopted target size
x >= l; y >= t; x+w <= W-r; y+h <= H-b
```

Background imagery may extend beyond a safe area; interactive controls require explicit exceptions. This expresses [Apple's layout guidance](https://developer.apple.com/design/human-interface-guidelines/layout) as geometry without inventing a fixed device inset. The app reads actual native safe areas. Shared flex topology uses available measures and text scale: a sidebar is proposed only when sidebar width + enlarged reading minimum + gutters fit. The same destinations and selected task remain available when it becomes a tab layout.

[Typography guidance](https://developer.apple.com/design/human-interface-guidelines/typography) informs uncancelled Dynamic Type and natural-height reflow. Product acceptance asks for recorded 200% or greater text stress with content retained. Declaring `allowFontScaling` is insufficient evidence; absent measurements stay unknown. The native collector records actual `Text.onTextLayout`, view frames, system fontScale and visible controls. Full language quality, VoiceOver behavior and all accessibility categories still need their own review.

[Tab bars](https://developer.apple.com/design/human-interface-guidelines/tab-bars) and [sidebars](https://developer.apple.com/design/human-interface-guidelines/sidebars) inform stable destinations and recognizable navigation. Tests must exercise Back, search context, saves, reading resume and state restoration rather than merely counting rectangles. The website uses browser history; the app has independent native navigation, persistent local reading state and tablet adaptation.

[Color guidance](https://developer.apple.com/design/human-interface-guidelines/color) informs semantic roles and light/dark/increased-contrast variants. Palette checks use the separate color engine. A complete Apple color/appearance review cannot be inferred from contrast arithmetic alone. The prototype uses custom React Native controls, not a claim of UIKit Liquid Glass equivalence; native material fidelity and physical-device behavior remain explicit review boundaries.

For scrolling content, the observer measures actual scroll ancestors and intersects their frames with the target to establish `visibleBox`; safe-area checks use that visible geometry while target-size checks retain the full control dimensions. Fixed controls receive no scroll exception. Missing clips, stale revisions and incomplete captures are rejected. Android tap conversion explicitly records the status-bar screen offset instead of assuming window and screen origins coincide. A null inherited RN text cap remains unknown unless effective behavior is supplied; zero is the documented unlimited cap. Known content/scaling failures dominate missing evidence.
