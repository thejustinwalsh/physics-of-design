# Energy, motion and selection review

Independent review, 2026-10-25. Read-only product review of `motion.ts`, `energy.ts`, `composition-solver.ts`, the selector extraction, and relevant expression/handoff boundaries. Initial findings below reproduced on the original fingerprints recorded at the end. The implementation owner fixed all four supported findings; independent verification is recorded next. Temporary probes used synthetic data and a temporary copied font; no native device or product font was changed.

## Final dispositions

All supported findings are closed on the final fingerprints below. No additional material motion-math defect was reproduced within the reviewed scope.

| Initial finding | Independent distinguishing verification |
| --- | --- |
| Invalid beam seeds abandon budget | Added regression reaches valid assignments 1 and 3 after invalid seeds 2, 0 and 4; five evaluations exhaust the domain. Four-evaluation budget stays bounded and returns one valid choice. |
| Recipe ignores choice policy | Six new `composition-solver.test.ts` tests include unchanged normalized-policy replay, increased-budget recomputation, selector readout/token changes, and changed checkpoint bytes at the same path. The recipe now carries policy identity separately from the pure handoff. |
| Machine-invalid choice aborts valid alternatives | Regression rejects `sqrt(-1)` before selection while retaining +1; all-invalid inputs return no handoff. A separate case requires every declared scenario to resolve. |
| Single viable choice bypasses font freshness | Reran the temporary-font probe: it now rejects with `candidate font content changed during selection; remeasure before choosing`. Guard runs before shortcuts and after model selection. |
| Factor counter understates invalid work | Invalid-seed regression now observes five attempted factor evaluations, including the three throwing candidates. |

The final focused lane passes 58/58 tests across palette/color, component contract, energy and composition solver. The energy/composition portion is 21 tests. Existing motion tests and the 24,040-position independent extrema probe remain the motion evidence; no new runtime animation parity is inferred.

## Original verified findings (fixed)

### P2 — Invalid beam seeds can discard the remaining search budget

`energy.ts:87–94` builds its frontier only from successfully evaluated seeds. Use one variable `x ∈ [0,1,2,3,4]`, one preference factor `1 / (x*(x-2)*(x-4))`, target band `[0,0]`, scale/weight 1, one empty scenario, and `{method:'beam',maxEvaluations:100}`. The three seeds 2, 0 and 4 divide by zero. Search stops after three evaluations with an empty candidate list and 97 evaluations unused. Exhaustive search with the same program finds valid assignments 1 and 3 in five evaluations.

This is not a false global-infeasibility certificate—the result correctly reports an incomplete search—but it defeats the intended recovery from undefined candidate arithmetic. Retain a deterministic fallback enumeration or expansion of invalid seeds until a viable frontier is found or the budget is spent. Regression should distinguish invalid seeds from a genuinely exhausted domain.

### P2 — Recipe reuse ignores changed search and selector policy

`composition-solver.ts:9` replays before considering `options` or `selector`. With `x ∈ [0,1,2,3,4]` and preferred target 4, an exhaustive one-evaluation solve chooses 0. A fresh five-evaluation solve chooses 4. Supplying the first handoff as `recipe` together with the new five-evaluation options returns `replayed`, assignment 0, and zero evaluations. Selector changes are likewise not represented in the replay identity.

Program/machine identity still protects mathematical validity. The missing boundary is choice-policy freshness: requesting a broader search cannot improve the cached result. Bind normalized search and selection policy to the composition recipe, or expose explicit reuse-versus-resolve semantics that do not silently ignore supplied options. Test unchanged-policy replay separately from increased-budget and selector-policy changes.

### P2 — Machine-invalid selected candidate aborts an otherwise solvable composition

`composition-solver.ts:12–18` chooses among energy-program candidates before checking machine expressions. Use `x ∈ [-1,1]`, preference target -1, no hard factors, and a machine region binding `width = sqrt(x)`. Both assignments are numerically valid for the energy program. The solver selects -1 and throws `Nonfinite sqrt result`; +1 produces a valid binding but is never tried.

`createDesignHandoff` correctly refuses the invalid result, so a model cannot certify this failure. Filter handoff-resolvable candidates before deterministic or neural selection, preserve rejection reasons, and continue through the bounded alternatives. A regression should verify +1 survives and the model never receives the invalid -1 option.

### P2 — Single viable choice bypasses final font freshness check

`selector.ts:162–169` returns the sole viable choice before the `measurementKey` check used after multi-choice selection. A synthetic renderer computed the last stress receipt, then changed a temporary copy of its font. `selectChoice` returned `selected:'only'`, `modelCalled:false`, although the verified base hash differed from the current state/font hash.

This shortcut predates the selector refactor; it is not attributed to the extraction. Use the same freshness guard for every successful return. The regression should mutate only a temporary font after the final measurement and require rejection or remeasurement.

## Distinguishing checks and non-findings

- 38 existing energy, motion and decision-machine tests passed. Four selected selector/transport tests also passed, including rejected candidates and malformed balanced readouts. These contract fixtures do not run a real language model.
- An independent grid checked 24,040 analytic positions against reported all-time extrema across undamped, underdamped, near-critical, critical and overdamped regimes with large positive/negative initial velocities. No bounds violation was found. Existing tests additionally check external closed forms, the differential equation, monotone energy, critical-limit stability and interpolation bounds.
- The settling certificate follows from `E <= min(k*positionTolerance²,m*speedTolerance²)/2` and nonincreasing unforced energy. It is explicitly conservative; it does not claim earliest perceived settling.
- Inspected installed React Native `SpringAnimation.js` confirms its `zeta >= 1` branch uses the critical formula. Rejecting overdamped native mapping is supported; no native parity claim is inferred from web samples.
- Multiple preferred bands implement distance to their union, preserving separate zero-residual wells rather than pulling all values to zero. Hard failures remain excluded regardless of preference weights. Invalid arithmetic counts toward the unique-state budget and does not become a passing candidate.
- Model results are restricted to declared option IDs. Mathematical handoffs recheck hard factors, and renderer verification remains pending. No model override of validity was reproduced.
- Original diagnostic precision finding: `factorEvaluations` excluded work before invalid arithmetic threw. The owner replaced this with an actual attempt counter; final regression verifies it as described above.

Probe files for this session: `/private/tmp/energy-motion-review-probe.mts` and `/private/tmp/selector-stale-review.mts`. No aesthetic verdict follows from these deterministic checks; full-product visual and task review is separate.

## Original source fingerprints

```text
9f9502b04059d4aafe53d0250b9c750f3a27b9c88537c7759dd6bdea4342ea1d  src/motion.ts
537fa25f21ad91ad5376818b19d60f0bcc9291c03d517eccb78eb1b851cb6b10  src/energy.ts
31e86342ad9f3ca144768a7c62cb134749bde358787afd2c87a5ad3ef2fdbe07  src/composition-solver.ts
283fc7d28fc9e6824ed4d45e7dd71a0e9c0d9a9c4afb163957dfb7407fb0cd03  src/selector.ts
5f8d737c64742772f3be04522c59a6f954c55fbd6d8dd59659bfaf9a358ea1ce  src/math-expression.ts
4ed64170b80683e4e30136a625fc014c363198d15979cd8c9b340f95d102d486  src/decision-machine.ts
```

## Verified final source fingerprints

```text
9f9502b04059d4aafe53d0250b9c750f3a27b9c88537c7759dd6bdea4342ea1d  src/motion.ts
75309893f143158f85af01077d779a1144b539d35ebc9d673489271ed454f4cc  src/energy.ts
d9406ec97f474ebc3cd23e4db3286f01676daf63ec71b9073f509326a9e67ef8  src/composition-solver.ts
971821cc77d7f9b501a0eb2215fbc925005167c9ac821d3e71307a141552dbaf  src/selector.ts
47b045df46595f061a91846165e5c12d5c17ff3ed296f9acb223fa10ff1ca6eb  test/composition-solver.test.ts
f970994db25379f43d1460639ea5b48fc36650b7368c7a39bd9e9a82307ca988  test/energy.test.ts
```

## Choice-graph and work-budget addendum

The later graph/budget revision passes 24 tests across `energy-analysis`, `energy` and `composition-solver`. Graph reconstruction follows recorded local mutations from a seed to each returned candidate; visited assignments are deduplicated. Invalid-seed fallback records recovered assignments as fresh roots, without inventing a valid edge from an undefined parent. AST-node counting is conservative for lazy expression branches; both observation and expression-operation caps constrain the number of evaluated states. No additional material bug was reproduced in this bounded check.

The operation upper bound covers energy-program expression visits. It does not cover compilation, callback/machine-binding validation, Pareto comparison or total CPU time; it must not be presented as an all-work execution limit. These graph nodes remain calculated alternatives, not renderer measurements or proof that an agent independently reconsidered each choice.

```text
8c1913c45de46a090802c0070ee88e6d2ce9d08d50b4095433dad4de9e3e6cc3  src/energy.ts
1dfe3ec5909655b8194dfb2ca57cfa069536eb5c825d0d78f1c5adb5e7b60415  test/energy-analysis.test.ts
```
