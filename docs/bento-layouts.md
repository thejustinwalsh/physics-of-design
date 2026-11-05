# Choose bento placements

`composition plan` optionally accepts a `bento` problem. It proposes ordered flex slicing layouts, keeps separate preference factors and reuses the existing energy/Pareto search. It emits stylesheet rules and proposed wireframe data, not components or a universal beauty score.

Build and run the recorded example:

```sh
npm run build
node dist/cli.js composition plan --input examples/bento/plan.json --output /tmp/bento.json --summary
```

The compact result contains exact hash-bound file references to candidate placements and the energy program. MCP exposes the same command through the existing catalog/execute tools; there is no additional discovery tool. Retain full receipts outside model context. A candidate contains the ordered flex tree, predicted boxes, individual consequences, generated StyleX or React Native stylesheet source, and a proposed wireframe. Feed its `/wireframe` reference into `wireframe inspect` for the existing inspection resource. Treat the drawing as proposed until a current renderer supplies observations.

Supply 1–8 regions, explicit frame height/unit, content minima and provenance. Supply area weights for every region or none. Optional aspect bands use logarithmic distance outside the authored ratio interval; allocation uses absolute log distance between actual and requested area shares; adjacency uses excess edge distance normalized by the frame diagonal; whitespace uses distance outside an authored gap-coverage band. These remain separate factors. No empirical preference or musical consonance is implied.

The engine enumerates ordered binary slicing trees with row/column splits and two allocation policies. Small families can be enumerated completely. Larger searches stop at the declared work limit and report incomplete coverage. Stack/strip seeds are explored first. `search-exhausted-without-witness` distinguishes a capped empty search from a completely enumerated `no-admissible-candidate` family. The existing energy search is exhaustive only over the visited placement pool. Pareto retention preserves conflicting consequences; it does not prove global optimal packing, explore arbitrary free positioning, or optimize every continuous split. DOM/semantic order is preserved; RTL mirrors rows.

`composition plan` supplies its content width and gap. The explicit bento unit scopes the caller's frame geometry: css-px for web, dp/pt for native. This is calculated geometry, not a measured root. Measured minima require a renderer provider, matching unit and input identity. Browser observations cannot be relabeled native. Authored minima remain assumptions. The generated styles report `rendererVerified: false`; separately verify actual safe content roots, Text/Yoga, wrapping and current content on each platform. Fixed frame height is explicit; the engine does not infer natural page height or suppress text scaling.

The energy program exposes source-bound `<region-id>.width` and `.height` derived quantities for the first two semantic regions in the declared frame unit. This bounded readout keeps large families within the existing expression-tree limit; full geometry for all regions remains behind placement references. Request only the relevant `consequenceKeys` (at most 16) in an existing decision stage so System1 sees semantic geometry rather than opaque candidate indices or residuals alone. Full boxes remain behind references.

Use the returned energy program within the existing decision workflow when a local selector should choose among viable alternatives. Bind current brief/content/font/frame identities and preserve the placement catalog. Matching existing decision recipes may replay; changed dimensions/content require re-solving and current renderer checks. The bento generator itself makes zero neural calls and creates no parallel cache or state-machine implementation.

Verification includes deterministic enumeration/feasibility/RTL/unit tests, actual CLI/MCP reference reuse into the wireframe inspector, and compiled React/StyleX geometry in Chromium/WebKit over six widths, two text scales, both directions and multiple finalists. Those fixtures test changed-copy content fit and unmount disposal. They do not establish native parity, task accessibility, reduced-motion topology transitions, human preference or better default design. Those remain product-level obligations.
