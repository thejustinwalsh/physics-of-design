import { appleHigSources } from './apple-hig.js';
import type { EvidenceKind } from './state.js';

export type Source = {
  id: string;
  title: string;
  url: string;
  kind: EvidenceKind;
  scope: string;
  limitation: string;
  checked: string;
};
export const sources: Source[] = [
  {
    id: 'wcag-contrast',
    title: 'WCAG 2.2 contrast requirements',
    url: 'https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html',
    kind: 'standard',
    scope: 'Scoped text/non-text role contrast under declared applicability.',
    limitation:
      'No complete accessibility or aesthetic certification; native uses a conservative 4.5 text policy.',
    checked: '2026-10-24',
  },
  {
    id: 'oklab',
    title: 'OKLab/OKLCH color coordinates',
    url: 'https://bottosson.github.io/posts/oklab/',
    kind: 'measurement',
    scope: 'Perceptual color coordinate descriptors and distances.',
    limitation:
      'Not a salience, harmony or preference model; opaque sRGB adapter only.',
    checked: '2026-10-24',
  },
  {
    id: 'css-color',
    title: 'CSS Color 4',
    url: 'https://www.w3.org/TR/css-color-4/',
    kind: 'standard',
    scope: 'Color spaces, powerless hue and gamut terminology.',
    limitation:
      'Local bounded chroma reduction is not claimed to implement the CSS gamut mapping algorithm.',
    checked: '2026-10-24',
  },
  {
    id: 'music-review',
    title:
      'Di Stefano, Large & Spence (2026), Embodied Responses to Harmony and (Poly)Rhythm',
    url: 'https://doi.org/10.1111/nyas.70355',
    kind: 'empirical',
    scope:
      'Review of auditory ratio sensitivity and sensorimotor synchronization.',
    limitation:
      'Sensitivity is distinct from preference; cultural context matters. No ordinary UI typography validation.',
    checked: '2026-10-24',
  },
  {
    id: 'gregory',
    title: 'Owen Gregory (2011), Composing the New Canon',
    url: 'https://24ways.org/2011/composing-the-new-canon/',
    kind: 'heuristic',
    scope: 'Design precedent for musical proportions in typography and layout.',
    limitation:
      'Practitioner proposal, not a controlled visual-preference experiment.',
    checked: '2026-10-24',
  },
  {
    id: 'harvard',
    title: 'Clinch & Horton (2025), Typographic Scale',
    url: 'https://designsystem.harvardsites.harvard.edu/news/2025/05/typographic-scale',
    kind: 'heuristic',
    scope:
      'Production system describing a change from golden ratio to major third for minimum-size needs.',
    limitation:
      'One production context; does not establish causal aesthetic benefit.',
    checked: '2026-10-24',
  },
  {
    id: 'leading-study',
    title:
      'Becker, Heinrich, von Sichowsky & Wendt (1970), Reader Preferences for Typeface and Leading',
    url: 'https://journals.uc.edu/index.php/vl/article/view/5062',
    kind: 'empirical',
    scope:
      '80 participants ranked 48 print compositions; leading preferences varied by typeface.',
    limitation:
      'Four historical typefaces and printed specimens; not a numeric screen-typography rule.',
    checked: '2026-10-24',
  },
  {
    id: 'uswds',
    title: 'USWDS Typography',
    url: 'https://designsystem.digital.gov/components/typography/',
    kind: 'heuristic',
    scope: 'Conditional guidance for text size, measure, leading and tracking.',
    limitation:
      'Guidance for readable government sites, not a universal expressive-design optimum.',
    checked: '2026-10-24',
  },
  {
    id: 'wcag-spacing',
    title: 'W3C Understanding SC 1.4.12 Text Spacing',
    url: 'https://www.w3.org/WAI/WCAG21/Understanding/text-spacing.html',
    kind: 'standard',
    scope:
      'For applicable markup, simultaneous overrides: 1.5 line height, 2em paragraph gap, .12em tracking, .16em word spacing; preserve content/function.',
    limitation:
      'Override tolerance, not required default styling. This toolkit checks specimens, not complete WCAG conformance.',
    checked: '2026-10-24',
  },
  {
    id: 'inkphony',
    title: 'Han et al. (2023), Glancing Back at Your Hearing',
    url: 'https://doi.org/10.1016/j.displa.2023.102529',
    kind: 'empirical',
    scope:
      'Emotional Chinese calligraphy generated from musical features; perceived cross-modal connections.',
    limitation:
      'Expressive calligraphy, not ordinary UI reading or musical ratio validation.',
    checked: '2026-10-24',
  },
  {
    id: 'facades',
    title:
      'Beder, Pelowski & Imamoğlu (2024), Influence of Complexity and Gestalt Principles on Aesthetic Preferences for Building Façades',
    url: 'https://doi.org/10.16910/jemr.17.2.4',
    kind: 'empirical',
    scope: 'Façade complexity and grouping preferences.',
    limitation:
      'Different visual domain; not used to fit toolkit coefficients. Corrects reference [8] location.',
    checked: '2026-10-24',
  },
  {
    id: 'local-policy',
    title: 'Physics of Design spike policy v1',
    url: 'docs/adr-001.md',
    kind: 'heuristic',
    scope:
      'Explicit tunable starting ranges and search objectives for two archetypes.',
    limitation:
      'All numerical target values are engineering priors; no aesthetic calibration data.',
    checked: '2026-10-24',
  },
  {
    id: 'musical-prior',
    title: 'Visual musical landmark hypothesis v1',
    url: 'physics_of_design_white_paper.md',
    kind: 'hypothesis',
    scope: 'Optional soft peaks at specified logarithmic ratio landmarks.',
    limitation:
      'Disabled by default. No evidence yet that these improve visual preference over smooth priors.',
    checked: '2026-10-24',
  },
  {
    id: 'apple-layout',
    title: 'Apple Human Interface Guidelines: Layout and iPadOS',
    url: 'https://developer.apple.com/design/human-interface-guidelines/layout',
    kind: 'heuristic',
    scope:
      'Adapt to available windows, safe areas, resizing, localization and Dynamic Type; preserve content and reading order.',
    limitation:
      'Platform guidance, not numerical typography preference calibration.',
    checked: '2026-10-24',
  },
  {
    id: 'web-responsive',
    title: 'web.dev Learn Responsive Design: Typography and macro layouts',
    url: 'https://web.dev/learn/design/typography',
    kind: 'heuristic',
    scope:
      'Bound readable measure, adapt type to available space, preserve user text resizing and semantic flow.',
    limitation:
      'Specific numeric anchors in this project are editable local decisions; CSS Grid examples are not used under the flex-only requirement.',
    checked: '2026-10-24',
  },
  {
    id: 'rn-flexbox',
    title: 'React Native: Flexbox and useWindowDimensions',
    url: 'https://reactnative.dev/docs/flexbox',
    kind: 'measurement',
    scope:
      'Explicit shared flex properties; native defaults differ from web. Window/font-scale changes require recomputation.',
    limitation:
      'Shared layout primitives do not establish text-shaping parity.',
    checked: '2026-10-24',
  },
  {
    id: 'astra-responsive-review-2026-10-24',
    title: 'Astra + Impeccable independent design critique',
    url: 'docs/astra-design-review.md',
    kind: 'heuristic',
    scope:
      'Qualitative critique of frozen hero/editorial specimens; proposes smaller mobile headings, adaptive gutters and capped reading columns.',
    limitation:
      'Model design judgment, not human preference data, empirical aesthetic evidence, or a universal scoring rule.',
    checked: '2026-10-24',
  },
];

export const factorRegistry = [
  {
    id: 'color-contrast',
    variables: ['colors', 'fontSize', 'fontWeight', 'responsive'],
    sources: ['wcag-contrast'],
    kind: 'standard',
    uncertainty:
      'Declared opaque sRGB pairs only; verify rendered size, use and backdrop.',
  },
  {
    id: 'color-harmony',
    variables: ['colors', 'huePreference', 'chroma', 'lightness'],
    sources: ['oklab', 'css-color', 'local-policy'],
    kind: 'heuristic',
    uncertainty:
      'Uncalibrated authored hue convention; insufficient chromatic support causes abstention.',
  },
  {
    id: 'composition',
    variables: [
      'measuredRectangles',
      'semanticGroups',
      'readingOrder',
      'viewport',
    ],
    sources: ['local-policy'],
    kind: 'measurement',
    uncertainty:
      'Rectangle geometry is not glyph ink, visual attention or aesthetic preference.',
  },
  {
    id: 'tracking',
    variables: [
      'font',
      'axes',
      'size',
      'weight',
      'kerning',
      'trackingEm',
      'language',
      'direction',
    ],
    sources: ['uswds', 'local-policy'],
    kind: 'heuristic',
    uncertainty: 'high: numeric targets uncalibrated',
  },
  {
    id: 'leading',
    variables: ['font', 'size', 'leading', 'measure', 'lineBreaks'],
    sources: ['leading-study', 'uswds', 'local-policy'],
    kind: 'heuristic',
    uncertainty: 'high: study supports dependence, not these coefficients',
  },
  {
    id: 'measure',
    variables: [
      'text',
      'font',
      'size',
      'trackingEm',
      'measure',
      'viewport',
      'lineBreaks',
    ],
    sources: ['uswds', 'local-policy'],
    kind: 'heuristic',
    uncertainty: 'high: genre and content dependent',
  },
  {
    id: 'hierarchy',
    variables: ['size', 'weight', 'titleToProse'],
    sources: ['harvard', 'gregory', 'local-policy', 'musical-prior'],
    kind: 'hypothesis',
    uncertainty: 'high: no preference calibration',
  },
  {
    id: 'whitespace',
    variables: ['inlineBounds', 'inkBounds', 'gaps', 'alignment'],
    sources: ['local-policy'],
    kind: 'heuristic',
    uncertainty: 'high: inline geometry is not optical whitespace',
  },
  {
    id: 'rhythm',
    variables: ['gaps', 'semanticOrder'],
    sources: ['local-policy', 'musical-prior'],
    kind: 'hypothesis',
    uncertainty: 'entropy and motifs are descriptive only',
  },
  {
    id: 'responsive',
    variables: [
      'viewport',
      'responsive',
      'textScale',
      'platform',
      'font',
      'lineBreaks',
      'gaps',
    ],
    sources: ['wcag-spacing'],
    kind: 'measurement',
    uncertainty: 'only measured scenarios; no full accessibility certification',
  },
] as const;
export function registry() {
  return {
    version: 1,
    sources,
    factors: factorRegistry,
    platformGuidance: appleHigSources,
    licensePolicy:
      'Store metadata and short paraphrases. Do not ingest third-party screenshots or redistribute font files without a recorded license.',
  };
}
