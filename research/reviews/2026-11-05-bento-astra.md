# Bento placement review — 2026-11-05

Synthetic independent source review by a `gpt-6-astra` subagent. The reviewer read the skill and current implementation/tests; it did not run a browser, native driver, selector or server. This is engineering critique, not human preference evidence.

Findings and resolution:

1. Default 512-attempt enumeration missed a feasible 320×2000 mobile stack of six, seven or eight 180×100 regions. The generator now seeds ordered column/row spines from the same family, skips their later duplicates, and retains exact family counts. A capped empty run now reports `search-exhausted-without-witness` separately from a fully enumerated empty family. Regression covers all three region counts.
2. Length-valued flex growth failed CSS's partial free-space behavior when the factors summed below one. Growth is now each child span divided by available span. A .5×.5 frame is covered in unit and actual Chromium/WebKit tests.
3. Browser receipts lacked exact input/content/source identity. Cases now record plan identity and rendered-input identity; receipts include before/after source snapshots. Geometry-only candidate IDs remain geometry identities rather than content identities.

The reviewer also requested meaningful unit-bearing dimensions for the existing staged selector. Four derived width/height consequences for the first two semantic regions now complement aggregate residuals. Full geometry stays behind references. An initial attempt to expose every coordinate exceeded the existing expression-tree guard on the largest case; it was replaced by the bounded readout, without raising that guard or reducing placement exploration. The reviewer independently bounded the final worst case (eight lookup trees) at 40,888 structural visits plus small metadata/guard overhead, below the 50,000 limit.

Follow-up static review found the fixes coherent and no further correctness blocker. It did not verify native parity, interactions, motion or aesthetic quality.

Root verification, retained outside model context: `artifacts/bento-affected-current.log`, `artifacts/bento/context/receipt.json`, `artifacts/bento/{chromium,webkit}-flex.json`, and `artifacts/bento-browser-corrected.log`. Initial local browser launches failed under sandbox Mach-port restrictions; the same checks ran with reviewed browser execution permissions. Two corrected browser tests passed, with 52 current renderer cases each, including subpixel, six ordinary widths, RTL and enlarged changed content. Exact CLI/MCP placement references produced identical proposed wireframe-inspector facts. These facts do not prove native Yoga parity, task accessibility, token advantage or visual preference.
