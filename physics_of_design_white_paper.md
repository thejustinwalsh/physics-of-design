# The Physics of Design

Musical intervals as a mathematical language for typography and layout

Research white paper — October 2026

## Abstract

This paper proposes a design-tool system in which font sizes, tracking, leading, text measure, hierarchy and whitespace are continuously coupled choices. Musical intervals and scales provide a mathematically useful analogy: relative ratios can be represented on a logarithmic axis; recurring interval patterns create visual rhythm; departures can produce tension. The proposal is to score candidate decisions conditional on neighboring decisions, not to score entire designs. A local choice model such as SemIf selects among multiple plausible alternatives; deterministic measurement establishes facts and constraints. The aim is better first-pass React/React Native layouts at lower token and iteration cost.

## 1. Evidence and limits

Direct evidence: A 2026 synthesis of music perception finds that small-integer ratios in harmonic frequencies and rhythmic durations are especially salient in auditory perception [1]. This does not demonstrate that the same ratios cause visual beauty. Designers have explicitly proposed musical ratios for web typography [2]. HarvardSites documents evolving a real typographic scale from a golden-ratio basis to a major-third basis [3]. An experimental typography study of 80 participants and 48 compositions found that preferred leading depended on typeface [4]. USWDS publishes conditional advice linking text size, tracking, measure and leading [5]. WCAG requires content to tolerate user-adjusted text spacing [6]. A music-to-calligraphy study found perceptible links between musical rhythm and expressive typography [7], but did not establish rules for ordinary UI text.

Research hypothesis: recurring visual interval families, structured rhythm and sparse deviations predict design preferences beyond readability, platform constraints and genre. This must be tested, not assumed.

## 2. Visual intervals and scales

For two positive, comparable dimensions a and b, define a visual interval:

I(a,b) = log2(a/b)

It is additive: I(a,c) = I(a,b) + I(b,c), invariant to uniform scaling, and reversible by changing sign. Candidate musical landmarks include unison 1:1, minor third 6:5, major third 5:4, fourth 4:3, fifth 3:2, and octave 2:1. These are hypothesized soft attractors, not hard tokens or proven aesthetic optima. Equal-tempered musical intervals are not identical to just-intonation ratios.

A conditional compatibility function could be a mixture of soft peaks:

A(r|C) = Σ_k π_k(C) exp(-(log2(r)-μ_k)^2 / (2σ_k²))

Here r is a ratio, C includes context, and μ, π, σ are parameters to calibrate. This is a proposed model, not an empirically validated scoring rule. It must allow off-scale solutions and multiple maxima. One ratio should not be imposed on all relationships: display/body, heading/subtitle, line-height/font-size and whitespace have different perceptual functions.

## 3. Rhythm, expectation, entropy and near-failure tension

A sequence of gaps g1…gn can be analyzed through normalized intervals, repeated motifs, subdivisions, and departures from a local rhythm. Repetition establishes an expectation; an exceptional gap can act like syncopation. Define surprise as -log P(x|C), where P must come from observed design distributions or a validated model, not arbitrary confidence logits. Entropy of gap bins measures variation, not aesthetic quality. Spatial order and semantic grouping matter: identical histograms can describe very different designs.

Track two distinct types of tension: (a) deviation from an established interval/rhythm; (b) proximity to actual thresholds such as line wrapping, clipping, collision, and readability failures. High tension can be intentional, but hard accessibility and content-preservation constraints remain binding. A near-wrap headline may be expressive; one that loses content is defective.

## 4. Coupled factor system

Let X contain font family, variable axes, size, weight, tracking, leading, measure, title/prose relation, margins, gap sequence, alignment, viewport and platform. Each factor depends on a small neighborhood:

• tracking(font, size, weight, optical axis, script)
• leading(font metrics, size, measure, line count)
• measure(font, size, text, available width)
• hierarchy(display size/weight, body size/weight)
• whitespace(ink bounds, semantic proximity, surrounding geometry)
• rhythm(gap interval sequence, repeated patterns)
• responsive(all relevant variables, viewport, text scaling, platform)

Factor outputs include measured evidence, a conditional compatibility curve, uncertainty, provenance and candidate alternatives. Do not collapse all factors into a universal beauty score. Use feasibility filtering and multiobjective/Pareto ranking. Every variable stays revisable. Perturbing a value invalidates dependent factors and triggers local re-optimization. Line breaks and font choices are discontinuous: combine discrete candidate search with continuous local refinement, not gradient descent alone.

Kerning (font shaping) and tracking (additional letter spacing) must be distinct. Musical ratios cannot determine correct kerning; actual font metrics and shaping are required. Use real browser/native renderers for final verification.

## 5. Empirical corpus plan

Build an attributed, licensed corpus of award-winning web/editorial designs, stratified by genre, audience, platform and year. Include comparable non-award production work and controlled perturbations of the same designs. Collect multi-viewport geometry and computed typography where permitted; screenshots alone cannot reveal font metrics or responsive rules.

Extract log size ratios, line-height ratios, tracking normalized to em, gap interval motifs, baseline cadence, hierarchy, local entropy, whitespace geometry, alignment groups, and distance to wrap/collision thresholds. Test whether interval families recur above matched controls, whether they predict pairwise designer preference on held-out projects, and whether perturbing away from them changes preference. Control for font family, genre, trend, designer and selection bias.

Falsification: if simple musical ratios provide no predictive advantage over smooth conditional geometry models, remove those priors while keeping the live factor graph and tools.

## 6. Tool architecture

Independent Unix-style JSON tools, with thin MCP wrappers:

• design font inspect — axes, metrics, glyph coverage, OpenType features.
• design text shape — glyph advances, kerning, line breaks, ink bounds.
• design intervals candidates — candidate size/spacing relationships with provenance.
• design relations score — conditional choice scores, factor breakdowns, multiple peaks.
• design layout measure — rendered geometry and threshold distances.
• design system perturb — change one variable, invalidate affected factors.
• design system relax — local search preserving multiple viable configurations.
• design proof — visual title/prose/spacing specimens, optionally as MCP App.

SemIf with a quantized Qwen3.5-4B is the provisional single local selector among viable alternatives; it must not generate validity or aesthetic scores. The main agent proposes and implements. The human is a tie-breaker during art direction; routine implementation should run unattended.

## 7. Platform mapping

Keep a platform-neutral relational state. Web output targets React + StyleX (fontSize, lineHeight, letterSpacing, fontFamily, fontWeight, width and layout rules). React Native uses Text style properties, Yoga constraints and device-specific measurement. Evaluate React Strict DOM as a shared subset, not as proof that CSS and native text shaping match. Verify optical sizing, variable axes, fallback and font loading on actual platforms. Stress test localization, text scaling and responsive reflow.

## 8. First experiment

Only two text-focused archetypes: bold marketing hero/title/subtitle and editorial heading/prose. No component catalog. Start with actual content and font files, measure and generate candidate ratios, tracking, leading, measure and gaps. Show multiple viable solutions. Perturb title size and demonstrate coupled recomputation, discontinuous line-break detection and responsive adaptation. Render browser and native specimens.

Compare the same coding agent with design guidance alone versus design guidance plus tools. Measure first-pass human preference, tokens, latency, attempts to acceptance, hard failures and sensitivity to changed content. Pre-register acceptance thresholds. Do not benchmark five decision models.

## 9. References

[1] Di Stefano et al. (2026), Embodied Responses to Harmony and (Poly)Rhythm. https://pmc.ncbi.nlm.nih.gov/articles/PMC13452428/
[2] Owen (2011), Composing the New Canon: Music, Harmony, Proportion. https://24ways.org/2011/composing-the-new-canon/
[3] HarvardSites (2025), Typographic Scale. https://designsystem.harvardsites.harvard.edu/news/2025/05/typographic-scale
[4] Reader Preferences for Typeface and Leading, Visible Language. https://journals.uc.edu/index.php/vl/article/view/5062
[5] U.S. Web Design System, Typography. https://designsystem.digital.gov/components/typography/
[6] W3C WAI, Understanding Text Spacing. https://www.w3.org/WAI/WCAG21/Understanding/text-spacing.html
[7] Glancing Back at Your Hearing: Generating Emotional Calligraphy Typography from Musical Rhythm. https://www.sciencedirect.com/science/article/pii/S0141938223001622
[8] Influence of Complexity and Gestalt Principles on Aesthetic Preferences for Building Façades (2024). https://www.mdpi.com/1995-8692/17/2/10

## Conclusion

The defensible mathematical transfer is logarithmic intervals, relational ratios, repeated patterns, conditional expectations and coupled optimization. The unproven claim is that musical consonance ratios predict visual preference. The proposed system is useful even if that hypothesis fails, because it exposes measurable relationships and keeps choices revisable.
