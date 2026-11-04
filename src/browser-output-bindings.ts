/** Current DOM facts for the existing binding checker; no search or declared-value fallback. */
import type {
  OutputBindingManifest,
  OutputBindingObservation,
} from './output-bindings.js';

export interface BrowserBindingContext {
  /** Read these identities from the running application's build/input snapshot. */
  current: OutputBindingManifest['current'];
  scenario: string;
  scenarioIdentity: string;
  resultRef: string;
}

/** Synchronous snapshot. Stable ids/data-testid identify actual property-bearing elements. */
export function collectBrowserOutputBindings(
  manifest: OutputBindingManifest,
  context: BrowserBindingContext,
  root: Document | Element = document,
) {
  const ownerDocument =
    root.nodeType === 9 ? (root as Document) : root.ownerDocument!;
  const view = ownerDocument.defaultView;
  if (!view)
    throw new Error('Binding collection requires a live browser document');
  if (!context.resultRef.trim())
    throw new Error('Binding collection requires a result reference');
  const observedAt = new Date().toISOString();
  const runtime = view.navigator.userAgent.slice(0, 200);
  const byId = new Map<string, Set<Element>>();
  const register = (element: Element) => {
    for (const id of [element.id, element.getAttribute('data-testid')]) {
      if (!id) continue;
      const nodes = byId.get(id) ?? new Set<Element>();
      nodes.add(element);
      byId.set(id, nodes);
    }
  };
  if (root.nodeType === 1) register(root as Element);
  root.querySelectorAll('[id], [data-testid]').forEach(register);
  const geometry: Record<
    string,
    { x: number; y: number; width: number; height: number }
  > = {};
  const observations: OutputBindingObservation[] = [];
  for (const binding of manifest.entries) {
    if (binding.platform !== 'web' || binding.scenario !== context.scenario)
      continue;
    const base = {
      binding: binding.id,
      current: { ...context.current },
      scenario: context.scenario,
      scenarioIdentity: context.scenarioIdentity,
      platform: 'web' as const,
      unit: binding.unit,
      surface: binding.target.surface,
      property: binding.target.property,
      sourceLocation: binding.target.sourceLocation,
      provider: 'browser' as const,
      runtime,
      resultRef: context.resultRef,
      observedAt,
    };
    const nodes = byId.get(binding.target.surface);
    const element = nodes?.size === 1 ? nodes.values().next().value : undefined;
    if (!element?.isConnected) {
      observations.push({
        ...base,
        status: 'unknown',
        detail:
          nodes && nodes.size > 1
            ? 'Surface identifier matches multiple elements; no value was inferred.'
            : 'No connected element has this id or data-testid.',
      });
      continue;
    }
    const box = element.getBoundingClientRect();
    geometry[binding.target.surface] = {
      x: box.x,
      y: box.y,
      width: box.width,
      height: box.height,
    };
    const style = view.getComputedStyle(element);
    const property = binding.target.property;
    if (
      property.includes('.') ||
      ['columns', 'nativeFinish'].includes(property)
    ) {
      observations.push({
        ...base,
        status: 'unsupported',
        detail:
          'This runtime/controller property cannot be established by computed CSS or a DOM rectangle.',
      });
      continue;
    }
    if (!element.getClientRects().length) {
      observations.push({
        ...base,
        status: 'unknown',
        detail:
          'The element has no rendered box; computed declarations alone do not establish a current rendered property.',
      });
      continue;
    }
    let raw: string;
    if (property === 'gap') {
      raw = style.rowGap === style.columnGap ? style.rowGap : '';
    } else if (property === 'borderColor') {
      const sides = [
        style.borderTopColor,
        style.borderRightColor,
        style.borderBottomColor,
        style.borderLeftColor,
      ];
      raw = sides.every((value) => value === sides[0]) ? sides[0]! : '';
    } else {
      raw = style[property as keyof CSSStyleDeclaration] as string;
    }
    let value: number | string | undefined;
    if (
      ['color', 'backgroundColor', 'borderColor', 'flexDirection'].includes(
        property,
      )
    ) {
      if (raw) value = raw;
    } else if (property === 'opacity') {
      if (raw?.trim() && Number.isFinite(Number(raw))) value = Number(raw);
    } else if (/^-?(?:\d+(?:\.\d*)?|\.\d+)px$/u.test(raw)) {
      value = Number.parseFloat(raw);
    } else if (property === 'letterSpacing' && raw === 'normal') {
      value = 0; // CSS normal letter spacing adds no tracking; kerning stays separate.
    }
    observations.push(
      value === undefined
        ? {
            ...base,
            status: 'unknown',
            detail: `CSS ${property} has no single resolved scalar (${raw || 'ambiguous'}); no expected value was substituted.`,
          }
        : {
            ...base,
            status: 'observed',
            value,
            detail: `Current resolved CSS ${property}. Width/height use CSS box-sizing semantics; separate viewport rectangles include transforms. Colors retain alpha and their computed color space; this is not a contrast/compositing check.`,
          },
    );
  }
  return {
    version: 1 as const,
    manifestIdentity: manifest.identity,
    current: { ...context.current },
    scenario: context.scenario,
    scenarioIdentity: context.scenarioIdentity,
    observedAt,
    viewport: {
      width: view.innerWidth,
      height: view.innerHeight,
      devicePixelRatio: view.devicePixelRatio,
    },
    observations,
    geometry,
    scope:
      'Actual DOM snapshot for consistency checks. Application identities and source locations are declarations, not authentication. No native, controller-parameter, accessibility, contrast or causal-consumption verification.',
  };
}
