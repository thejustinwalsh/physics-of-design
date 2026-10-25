# Responsive typography and flex layout rules

The system adapts to available container or app-window space. Mobile, iPad and desktop are named verification scenarios, not device-detection branches. A narrow iPad window uses the narrow composition; a large phone in landscape can use a wider one if its content fits.

## Provenance and scope

Apple's layout guidance calls for consistent adaptation to resizing, safe areas, localization and Dynamic Type, including iPad multitasking. It supports changing adjacent arrangements to stacks when larger text needs room. These are platform practices, not a fitted typography scale. [Apple Layout](https://developer.apple.com/design/human-interface-guidelines/layout), [iPadOS](https://developer.apple.com/design/human-interface-guidelines/designing-for-ipados).

React Native documents differences from CSS flex defaults and a window hook that updates when dimensions or font scale change. Both emitters therefore set direction, wrapping, grow, shrink and basis explicitly. Embedded web specimens observe their own container; native host applications should supply the measured container width and current window/font-scale context. Flex does not imply identical web/native shaping. [Flexbox](https://reactnative.dev/docs/flexbox), [useWindowDimensions](https://reactnative.dev/docs/usewindowdimensions).

Web.dev connects type size, user enlargement, line length and leading, and warns against viewport-only font sizing that prevents resizing. The shared resolver preserves the requested text enlargement and applies a bounded width ramp to the authored size. This avoids maintaining separate CSS-only and native sizing formulas. [Responsive typography](https://web.dev/learn/design/typography), [macro layouts](https://web.dev/learn/design/macro-layouts).

W3C reflow, 200% resizing, and text-spacing overrides are distinct checks. They are tested as content-preservation constraints, not aesthetic scores or mandatory default spacing. [Reflow](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html), [Resize Text](https://www.w3.org/WAI/WCAG22/Understanding/resize-text.html), [Text Spacing](https://www.w3.org/WAI/WCAG22/Understanding/text-spacing.html).

The numeric anchors in the example files come from [Astra's Impeccable critique](astra-design-review.md) and subsequent rendered checks. They are editable design heuristics. No musical ratio, model confidence, font-size limit, character count or line-count target becomes a universal beauty or accessibility rule.

## Implemented relational patterns

- **Stack:** preserve reading order and natural height. Use at narrow widths, enlarged text, and whenever reading benefits from one path.
- **Capped reading column:** preserve a prose measure cap while increasing or centering the surrounding space. A tablet does not automatically require two columns.
- **Content-fit split:** an optional two-text-block flex row. Both minimum text measures and the gap must fit at the effective text scale, or the resolver returns a stack. No CSS Grid is emitted.

`design responsive patterns` exposes the pattern contract and representative phone, iPad split/portrait/landscape and desktop scenarios. `design responsive resolve` exposes the effective variables at any width. `responsive.anchors` holds strictly ordered width anchors, block-relative size/measure scales, leading/tracking adjustments, gutter, gap scale, content cap and pattern. Values interpolate between anchors and stop at the endpoints. Structural changes use the lower active anchor plus measured-space eligibility. All anchor values and source attribution remain in the editable state.

A change to the base title size still affects its responsive sizes. Coupled search changes base typography and gaps, then every viewport resolves and renders the same candidate. User textScale is applied after authored responsive sizing and is never reduced to meet an expressive line-count preference. Native system fontScale remains additional and is reported separately.

Ordinary-word fragmentation and excessive heading dominance are design-review concerns. At large user text sizes or in languages with long words, emergency wrapping may be necessary. Content loss, clipping and true overlap remain hard failures; a visual reviewer should not turn every unusual wrap into an accessibility defect.

## Verification scenarios

Use the actual window/container dimensions, then test around every anchor and structural transition, intermediate widths, 320px reflow, 200% text, long and translated content, RTL/script-specific shaping, iPad narrow windows and rotation. Browser viewport tests, virtual native artboards, actual tablet simulators and physical hardware are different evidence classes and must remain labeled.

The source-attributed registry records these practices. The measurement receipts establish only the executed renderer/version/device/scenario; they do not certify all native capabilities or complete WCAG conformance.
