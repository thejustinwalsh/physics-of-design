# Responsive rule research

Reviewed 2026-10-24 for the Physics of Design hero and editorial text specimens. These are source-attributed recommendations, not experimental validation of beauty or a proof of accessibility conformance.

| Source | Supported principle | Application here | Evidence class |
| --- | --- | --- | --- |
| [W3C Reflow, SC 1.4.10](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html) | Ordinary horizontal text reflows at 320 CSS pixels without loss or two-dimensional scrolling. | Test real emitted web content at 320, including enlarged views. Do not hide excess text to pass a viewport check. | Normative criterion explained by W3C; requires renderer verification. |
| [W3C Resize Text, SC 1.4.4](https://www.w3.org/WAI/WCAG22/Understanding/resize-text.html) | Text can reach 200% enlargement without losing content/function. | Test separately from narrow-width wrapping. A fluid font rule must not cancel user enlargement. | Normative criterion explained by W3C; requires renderer verification. |
| [W3C Text Spacing, SC 1.4.12](https://www.w3.org/WAI/WCAG22/Understanding/text-spacing.html) | Users may override line height to 1.5, paragraph spacing to 2em, tracking to .12em, word spacing to .16em without loss. | Add an override test; these numbers are not mandatory authored defaults. | Normative criterion explained by W3C; web markup applicability. |
| [Apple HIG Layout](https://developer.apple.com/design/human-interface-guidelines/layout) | iPad windows resize across a broad range; test system arrangements and avoid unnecessary structural changes. | Treat iPad portrait/landscape as evidence cases, not device gates. Include narrow multitasking windows. | Platform guidance. |
| [React Native Flexbox](https://reactnative.dev/docs/flexbox) | Native and web defaults differ, including direction and shrink; native flex shorthand takes a number. | Emit explicit direction, wrapping, growth, shrinkage and basis. Resolve responsive values before mapping to Yoga. | API contract; validate pinned runtime support. |
| [React Native useWindowDimensions](https://reactnative.dev/docs/usewindowdimensions) | Window dimensions and font scale update reactively. | Respond to window/font changes; use container measurements for an embedded specimen rather than assuming full-screen width. | API contract plus project-specific inference for embedded surfaces. |
| [GOV.UK Layout](https://design-system.service.gov.uk/styles/layout/) | Start narrow, use available widths rather than device assumptions, keep prose lines around a maximum of 75 characters. | Preserve a single readable editorial column across widths. Transfer the measure principle using flex; do not copy its grid implementation. | Design-system heuristic. |
| [USWDS Typography](https://designsystem.digital.gov/components/typography/) | A 45–90 character range, target about 66, depends on leading and passage length. | Use a configurable measure preference, distinguish Latin prose from short subtitles and non-Latin scripts. | Design-system heuristic; differs from GOV.UK, so not a universal law. |
| [web.dev Typography](https://web.dev/learn/design/typography/) | Responsive type depends on available width, size, measure, leading and user preferences. | Couple display scale to container width while keeping reading roles stable and zoomable. | Practitioner guidance. |

The numerical typography ranges above disagree slightly by source and context. A measured count of characters on a rendered line is a fact about that rendering. Whether it is comfortable is a revisable design judgment. Do not train or calibrate the factor score from this review's Nielsen table.

Proposed source-level rule contract:

- Inputs: container inline size, available block size when relevant, safe-area/inset ownership, font scale, writing direction, locale, content/face metrics and archetype. Device names label test fixtures only.
- Constraints: no missing text, no unintended horizontal overflow, no overlap, preserved source/reading order, no hidden scaling, explicit flex properties in both mappings.
- Preferences: bounded display scaling, authored readable body measure, heading-to-body contrast, whitespace rhythm, line-count preference and optional wide-layout eligibility. Expose each as configurable and record why it exists.
- Topology: column is valid for both current archetypes at all widths. Only offer a wrapping row variant when independently meaningful groups benefit and both actual text measures fit. The current title and its supporting paragraph do not justify a universal tablet row.
- Stress: 320/360/390, representative intermediate widths, 834, 1024, 1440; transitions immediately on either side; iPad-like narrow windows; 200% scaling; spacing overrides; long unbroken words and expanded/RTL content. Do not describe browser-sized captures as iPad simulator or device evidence.
