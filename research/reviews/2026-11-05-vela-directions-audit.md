# Vela direction audit

Synthetic Astra source audit found that Vela currently implements one ink/lime/cobalt art direction with action-color options. That does not establish the active goal's distinct brief-driven Vela styles. Relay's separate whole-palette directions cannot substitute for it. This requirement remains open.

The implementation should parameterize the existing Vela compiler and generate independently validated direction-specific handoffs, preserving the six-screen product, content, current selection provenance and session state. No new universal style or beauty score is needed. Each direction binds brief, font metrics, semantic palette roles, typography/spacing/radius candidate domains and motion settings. Saved choices must be namespaced by program/direction identity. Changed briefs must not silently reuse the original choice.

An authored alternative for exploration is Field Notes: warm paper, charcoal ink and terracotta/oxblood emphasis; calmer smaller editorial hierarchy, ruled compact groupings, shallow corners and short low-overshoot motion. This is a proposed product direction, not a human preference result. Preserve the existing energetic direction as an equal selectable alternative. No teal default is implied.

Concrete integration seams are scripts/vela-design.ts, examples/vela/web.jsx, native/VelaApp.tsx, examples/vela/web-motion.js and scripts/build-vela.mjs. Replace color-name assumptions (lime/cobalt), hardcoded dark separators/backgrounds and document focus/caret/selection colors with semantic direction roles. Runtime memoization must include direction identity. Keep the existing controller/scheduler rather than adding another animation layer.

Proof must cover both directions and all six screens at phone/iPad/desktop, enlargement and changed content; actual start/pause/finish, persistence and switching during a session; focus, reduced motion and disposal. Palette role checks stay separate from actual composited renderer checks. Native claims need actual native results. This report is an implementation audit, not delivered feature evidence.
