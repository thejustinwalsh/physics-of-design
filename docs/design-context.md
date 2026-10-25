# Keep direction in DESIGN.md

Write a focused `DESIGN.md` beside the product before generating choices. Record audience, task, expressive intent, type/composition relationships, color/material roles, responsive topology, motion policy, exceptions and unresolved questions. Link large reference collections instead of embedding them. Distinguish user direction, synthetic assumptions, measurements and untested preferences.

The repository [skill](../.agents/skills/design-theory/SKILL.md) activates this practice. The toolkit supports many visual directions; this repository's [example contract](../DESIGN.md) describes only its current gallery.

```sh
printf '%s\n' '{"file":"DESIGN.md","requiredSections":["Intent and provenance"]}' | ./dist/cli.js context inspect
```

The command returns a byte SHA-256, headings and missing requested sections. It reads at most 64 KiB, rejects invalid UTF-8 and preserves exact bytes. `includeContent:true` includes full text in CLI/full output; compact MCP output excludes it. `expectedSha256` rejects a changed document. Missing files return `status:"missing"`, without invented direction or approval.

In MCP, discover `context inspect` through `design_catalog`, then call `design_execute` with that command and the same input. Keep the result reference for exact content; do not repeatedly inject the whole document into context. Section checks are structural, not a semantic quality gate.

Set `brief.designContext` to the document path when using the [design field](design-field.md). A changed contract invalidates saved choices while separately bound text/font measurements remain reusable. The tool does not infer executable constraints from prose: encode the relevant numeric domains, authored bands and weights explicitly.

For [matched workflow trials](workflow-comparison.md), give both arms the same document and feedback policy. A good brief is part of realistic design work. Record model usage, implementation attempts, tool calls and rendered behavior separately from preference judgments.
