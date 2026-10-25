# Deliberate Friction — fresh first-pass build

Build a complete new four-section design workbench for design-minded developers and art directors. This is an original implementation, not a reproduction of an existing gallery. Work autonomously within 15 minutes; no human feedback or child agents. You may test and correct your own work inside that budget. Do not read any other condition, parent project source, current gallery, old artifacts, or outside design skills. Read DESIGN.md and synthetic-interview.json; the interview is authored synthetic direction, not user preference evidence.

Use React 19, StyleX 0.19, esbuild, semantic HTML and flex/flex-wrap only (no CSS grid). The supplied build helper transforms StyleX in src/*.jsx. Native CSS for fonts, pseudo-elements, media queries and dynamic variables is allowed. Only supplied local fonts and original SVG art; no network assets or extra packages. Ordinary shell, browser/Playwright, source editing, screenshot and math tools are allowed equally. No other models, generated imagery or external critiques. Do not fabricate measurements, solver results, adoption or quality scores.

Deliver four connected sections with real content and distinct roles:
1. Set the intent: “Make the rules. Then bend them.” / “A design field for deliberate friction.” Explain who it serves and one primary action that opens/focuses the workbench.
2. Feel the response: a real readable DOM material panel (paper and enamel must differ), pointer-driven light and bounded scroll-driven decorative registration strip. Label CSS approximation. Content and controls stay stable; no scroll traps or essential reveals.
3. Inspect the consequence: editable composition, native controls and current renderer observations. Two working modes, Compose and Inspect, preserve the same edits. Edit a multiline headline, font size, measure and finish roughness. Select the actual preview headline in Inspect; draw an overlay tied to its current DOM rectangle and show current width/height, line-fragment count with method/limits, and current input identity. Distinguish proposed values and observed geometry. Recompute after edits, resize and fonts load. A detached static drawing does not meet the task.
4. Keep a direction: save current inputs locally, replay saved inputs after changing them, reset to defaults, and download editable JSON with inputs, DESIGN.md identity and current measured receipt. No action should be decorative or silently stale.

Art direction: bold editorial asymmetry, large type, sharp chapter cuts and electric accents. Near-black/warm paper/acid yellow direction, cobalt enamel/cool silver counterdirection. Do not turn this into an identical generic card wall. Precise controls must remain readable and stationary while dragged. No universal aesthetic score. Assets are original demonstration art and OFL fonts.

Required stable test hooks (unique data-testid values):
- sections: intent-section, response-section, workbench-section, keep-section
- buttons: open-workbench, mode-compose, mode-inspect, material-paper, material-enamel, save, replay, reset, export
- controls: headline-input (textarea), font-size (native range), measure (native range), roughness (native range)
- rendered nodes: preview-headline, material-surface, scroll-registration, inspection-overlay, measurement-output, status
- mode buttons expose aria-pressed; overlay visible in Inspect. measurement-output contains JSON in textContent with {inputIdentity:string,observed:{x,y,width,height,lineFragmentCount},method:string}; coordinates in viewport CSS pixels from the current actual headline. Test hooks do not replace accessible labels.
- downloaded JSON contains {version:1,inputs:{headline,fontSize,measure,roughness,material},designIdentity:string,measurement:{inputIdentity,observed,method}}. Export updates measurement before download.

Test desktop1440×1000, phone390×844, narrow320×800, iPad834×1112 and1024×768; text enlargement200% (all authored text sizes, not merely controls), reduced motion, longer headline, keyboard controls and continuous pointer drags. Maintain visible focus, semantic reading order, no horizontal page overflow, readable content shield and every task at reduced motion. Pause hidden/offscreen animation and clean up. Browser screenshots are local browser evidence, not hardware Safari claims.

Run npm run build to produce public/index.html. Keep implementation in src and public; use existing assets/build helper. Record your own attempts, actual commands, observations and unknowns in BUILD-REPORT.md; include a machine-readable evidence.json with checks actually performed and toolkit calls if used. Do not replace absent observations with estimates. Leave the final artifact ready to serve. First-pass means one uninterrupted budget with self-testing permitted; no post-evaluation fixes.
