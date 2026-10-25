import { analyzeColors, contrastRatio, type ColorSystem } from './color.js';
import type { DesignState, Issue } from './state.js';
import { resolveLayout } from './responsive.js';

export const defaultColors: ColorSystem = {
  tokens: { canvas: '#f6f4ed', ink: '#171918', accent: '#22745d' },
  roles: [],
  harmony: 'free',
};
export function stateColors(state: DesignState) {
  return state.colors ?? defaultColors;
}
export function renderedColorAnalysis(input: DesignState) {
  const state = resolveLayout(input).state,
    system = stateColors(state);
  const declared = analyzeColors(system);
  const ratio = contrastRatio(system.tokens.ink!, system.tokens.canvas!);
  const text = state.blocks.map((block) => {
    // Native points are not inferred to be CSS px: conservatively retain 4.5.
    const large =
      state.platform === 'web' &&
      (block.size >= 24 ||
        (block.size >= 18.6666666667 && block.weight >= 700));
    const minimum = large ? 3 : 4.5;
    return {
      id: block.id,
      ratio,
      minimum,
      passes: ratio >= minimum,
      size: block.size,
      weight: block.weight,
      source:
        'https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html',
      scope:
        state.platform === 'web'
          ? 'Opaque declared sRGB text/canvas; authored CSS size before user enlargement.'
          : 'Conservative 4.5 text policy on native; no CSS px/point equivalence inferred.',
    };
  });
  return {
    declared,
    text,
    hardConstraintsPass:
      declared.hardConstraintsPass && text.every((t) => t.passes),
  };
}
export function colorIssues(state: DesignState): Issue[] {
  const analysis = renderedColorAnalysis(state);
  return [
    ...analysis.text
      .filter((text) => !text.passes)
      .map((text) => ({
        code: 'text-contrast',
        block: text.id,
        severity: 'hard' as const,
        message: `Declared ink/canvas contrast ${text.ratio.toFixed(3)} is below ${text.minimum}.`,
      })),
    ...analysis.declared.roles
      .filter((role) => role.passes === false)
      .map((role) => ({
        code: 'role-contrast',
        block: role.id,
        severity: 'hard' as const,
        message: `Declared ${role.use} role contrast ${role.ratio.toFixed(3)} is below ${role.minimum}.`,
      })),
  ];
}
