# Inspect a layout before implementation

Run `design wireframe inspect --input examples/wireframe/hero.json`. The JSON result contains resolved rectangles, separate relationship observations, SVG and optional interactive HTML. In MCP, call `design_specimen` with command `wireframe inspect` and the same input to open its UI resource. No browser or model is required for the CLI calculation.

An inspection shares the actual equations rather than a screenshot approximation. Change `headingHeight`: the supporting prose and image move through their dependencies. Change `gutter`: widths and shared alignment move together. Node selection and variable edits reach the agent through the MCP App host. The host recomputes on the server and records the exact edited values as human direction. No preference or edit grants a validation receipt.

Dimensions use one declared unit per drawing: CSS pixels, points or density-independent pixels. Expressions use the same portable evaluator as the energy engine. Gaps remain signed; overlap can be intentional. Authored bands report their own failures individually. Ratios include logarithmic intervals only for positive dimensions. A missing baseline or zero denominator remains unknown.

Dashed rectangles are proposals. Solid rectangles are caller-supplied renderer observations, with renderer, input identity and receipt identity attached. Their coordinates must be literal values and remain fixed when proposal variables change. The tool does not authenticate those receipts, recalculate font shaping, infer ink bounds or certify accessibility. Remeasure the implementation before treating edited proposals as current facts.

This is an inspection surface, not a component catalog or a drag-and-drop composer. Precise component anatomy remains available through `component solve` and `component inspect`.
