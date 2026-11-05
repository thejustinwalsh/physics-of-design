export interface BrowserInspectionContext {
  sourceIdentity: string;
  /** Small exact current-input key, not a claim of cryptographic authenticity. */
  inputKey: string;
}
export interface InspectionRect {
  x: number;
  y: number;
  width: number;
  height: number;
}
export interface BrowserElementInspection {
  provider: 'browser';
  coordinateSpace: 'layout-viewport-css-px';
  status:
    | 'measured'
    | 'missing'
    | 'ambiguous'
    | 'detached'
    | 'hidden'
    | 'paused'
    | 'disposed';
  targetId: string;
  context: BrowserInspectionContext;
  generation: number;
  sequence: number;
  observedAt: string;
  runtime: string;
  box: InspectionRect | null;
  contentBox: {
    width: number;
    height: number;
    provider: 'ResizeObserver';
    coordinateSpace: 'local-content-css-px';
  } | null;
  computed: Record<string, string | null> | null;
  intersection: {
    isIntersecting: boolean;
    ratio: number;
    provider: 'IntersectionObserver';
  } | null;
  clip:
    | { status: 'rectangular-bounds'; box: InspectionRect }
    | { status: 'unknown'; reason: string }
    | null;
  visualViewport: {
    width: number;
    height: number;
    offsetLeft: number;
    offsetTop: number;
    scale: number;
  } | null;
  detail: string;
}
export interface BrowserElementInspectorOptions {
  root?: Document | Element;
  targetId: string;
  context: BrowserInspectionContext;
  onSample?: (receipt: BrowserElementInspection) => void;
}
const rect = (r: InspectionRect): InspectionRect => ({
  x: r.x,
  y: r.y,
  width: r.width,
  height: r.height,
});
const intersect = (a: InspectionRect, b: InspectionRect): InspectionRect => {
  const x = Math.max(a.x, b.x),
    y = Math.max(a.y, b.y);
  return {
    x,
    y,
    width: Math.max(0, Math.min(a.x + a.width, b.x + b.width) - x),
    height: Math.max(0, Math.min(a.y + a.height, b.y + b.height) - y),
  };
};
const contentSignature = (element: Element, style: CSSStyleDeclaration) =>
  JSON.stringify([
    style.display,
    style.boxSizing,
    style.width,
    style.height,
    style.writingMode,
    style.paddingTop,
    style.paddingRight,
    style.paddingBottom,
    style.paddingLeft,
    style.borderTopWidth,
    style.borderRightWidth,
    style.borderBottomWidth,
    style.borderLeftWidth,
    element.clientWidth,
    element.clientHeight,
  ]);
const ignored = (node: Node) =>
  Boolean(
    (node.nodeType === 1 ? (node as Element) : node.parentElement)?.closest(
      '[data-design-inspection-ui]',
    ),
  );
const copyContext = (context: BrowserInspectionContext) => {
  if (
    !context ||
    !context.sourceIdentity?.trim() ||
    !context.inputKey?.trim() ||
    context.sourceIdentity.length > 256 ||
    context.inputKey.length > 8192
  )
    throw new Error(
      'Inspection requires a source identity and a small current input key',
    );
  return Object.freeze({
    sourceIdentity: context.sourceIdentity,
    inputKey: context.inputKey,
  });
};

/** Event-driven, read-only facts for a real current element. No timer, target
 * style mutation, declared-value fallback or text-baseline inference. Only
 * visible active target/ancestor animations keep a frame loop running.
 * Overlay/control DOM must carry data-design-inspection-ui to avoid feedback.
 */
export function createBrowserElementInspector(
  options: BrowserElementInspectorOptions,
) {
  const root = options.root ?? globalThis.document;
  if (!root) throw new Error('Element inspection requires a live document');
  const document =
    root.nodeType === 9 ? (root as Document) : root.ownerDocument!;
  const view = document.defaultView;
  if (!view) throw new Error('Element inspection requires a live document');
  if (!view.ResizeObserver || !view.IntersectionObserver)
    throw new Error(
      'Element inspection requires resize and intersection observation',
    );
  let targetId = options.targetId,
    context = copyContext(options.context),
    target: Element | null = null;
  let disposed = false,
    generation = 0,
    sequence = 0,
    frame = 0,
    reads = 0,
    resolutions = 0;
  let resize: ResizeObserver | null = null,
    intersectionObserver: IntersectionObserver | null = null,
    intersection: BrowserElementInspection['intersection'] = null,
    contentBox: BrowserElementInspection['contentBox'] = null;
  let contentStamp: string | null = null;
  let matchesCache: Element[] | null = null;
  const consumeMutations = (records: MutationRecord[]) => {
    const relevant = records.filter(
      (record) =>
        !ignored(record.target) ||
        (record.attributeName === 'data-design-inspection-ui' &&
          target &&
          (record.target === target || record.target.contains(target))),
    );
    if (
      relevant.some(
        (record) =>
          record.type === 'childList' ||
          record.attributeName === 'id' ||
          record.attributeName === 'data-testid' ||
          record.attributeName === 'data-design-inspection-ui',
      )
    )
      matchesCache = null;
    return relevant.length > 0;
  };
  const validateId = (id: string) => {
    if (!id?.trim() || id.length > 256)
      throw new Error('Inspection requires a stable element identifier');
  };
  validateId(targetId);
  const find = () => {
    if (
      matchesCache &&
      matchesCache.every(
        (element) =>
          element.isConnected &&
          (root.nodeType === 9
            ? element.ownerDocument === document
            : root === element || root.contains(element)) &&
          (element.id === targetId ||
            element.getAttribute('data-testid') === targetId) &&
          !ignored(element),
      )
    )
      return matchesCache;
    resolutions++;
    const matches = new Set<Element>();
    const register = (element: Element) => {
      if (
        (element.id === targetId ||
          element.getAttribute('data-testid') === targetId) &&
        !ignored(element)
      )
        matches.add(element);
    };
    if (root.nodeType === 1) register(root as Element);
    root.querySelectorAll('[id], [data-testid]').forEach(register);
    matchesCache = [...matches];
    return matchesCache;
  };
  const queue = () => {
    if (!disposed && !frame && options.onSample)
      frame = view.requestAnimationFrame(() => {
        frame = 0;
        if (!disposed) {
          const receipt = read();
          options.onSample?.(receipt);
          if (receipt.status === 'measured' && intersection?.isIntersecting) {
            for (
              let element = target;
              element;
              element = element.parentElement
            ) {
              if (
                element
                  .getAnimations()
                  .some((animation) => animation.playState === 'running')
              ) {
                queue();
                break;
              }
            }
          }
        }
      });
  };
  const observe = (element: Element | null) => {
    resize?.disconnect();
    intersectionObserver?.disconnect();
    resize = null;
    intersectionObserver = null;
    intersection = null;
    contentBox = null;
    contentStamp = null;
    target = element;
    if (!element) return;
    const epoch = generation;
    resize = new view.ResizeObserver((entries) => {
      if (
        disposed ||
        epoch !== generation ||
        target !== element ||
        !element.isConnected
      )
        return;
      const entry = entries.find((entry) => entry.target === element);
      if (!entry) return;
      contentBox = {
        width: entry.contentRect.width,
        height: entry.contentRect.height,
        provider: 'ResizeObserver',
        coordinateSpace: 'local-content-css-px',
      };
      contentStamp = contentSignature(element, view.getComputedStyle(element));
      queue();
    });
    resize.observe(element);
    intersectionObserver = new view.IntersectionObserver((entries) => {
      if (
        disposed ||
        epoch !== generation ||
        target !== element ||
        !element.isConnected
      )
        return;
      const entry = entries.find((entry) => entry.target === element);
      if (entry) {
        intersection = {
          isIntersecting: entry.isIntersecting,
          ratio: entry.intersectionRatio,
          provider: 'IntersectionObserver',
        };
        queue();
      }
    });
    intersectionObserver.observe(element);
  };
  const clipFor = (
    element: Element,
    box: InspectionRect,
  ): BrowserElementInspection['clip'] => {
    let clip = intersect(box, {
      x: 0,
      y: 0,
      width: view.innerWidth,
      height: view.innerHeight,
    });
    for (
      let parent = element.parentElement;
      parent;
      parent = parent.parentElement
    ) {
      const style = view.getComputedStyle(parent);
      const horizontal = ['hidden', 'clip', 'scroll', 'auto'].includes(
        style.overflowX,
      );
      const vertical = ['hidden', 'clip', 'scroll', 'auto'].includes(
        style.overflowY,
      );
      if (!horizontal && !vertical) continue;
      if (style.transform !== 'none')
        return {
          status: 'unknown',
          reason:
            'A transformed clipping ancestor needs a different coordinate adapter',
        };
      const r = parent.getBoundingClientRect();
      // Rectangular outer bounds only. Rounded masks, occlusion and exact
      // scrollbar/border clipping are deliberately not inferred.
      const bounds = {
        x: horizontal ? r.x : clip.x,
        y: vertical ? r.y : clip.y,
        width: horizontal ? r.width : clip.width,
        height: vertical ? r.height : clip.height,
      };
      clip = intersect(clip, bounds);
    }
    return { status: 'rectangular-bounds', box: clip };
  };
  const read = (): BrowserElementInspection => {
    reads++;
    const base = {
      provider: 'browser' as const,
      coordinateSpace: 'layout-viewport-css-px' as const,
      targetId,
      context: { ...context },
      generation,
      sequence: ++sequence,
      observedAt: new Date().toISOString(),
      runtime: view.navigator.userAgent.slice(0, 200),
      box: null,
      contentBox: null,
      computed: null,
      intersection: null,
      clip: null,
      visualViewport: view.visualViewport
        ? {
            width: view.visualViewport.width,
            height: view.visualViewport.height,
            offsetLeft: view.visualViewport.offsetLeft,
            offsetTop: view.visualViewport.offsetTop,
            scale: view.visualViewport.scale,
          }
        : null,
    };
    if (disposed)
      return {
        ...base,
        status: 'disposed',
        detail: 'Inspector disposed; no current element was read',
      };
    if (document.hidden)
      return {
        ...base,
        status: 'paused',
        detail: 'Document hidden; geometry not read',
      };
    if (consumeMutations(mutations.takeRecords())) queue();
    const matches = find();
    if (matches.length !== 1) {
      if (target) {
        generation++;
        observe(null);
      }
      return {
        ...base,
        generation,
        status: matches.length ? 'ambiguous' : 'missing',
        detail: matches.length
          ? 'Identifier matches multiple elements; no target was chosen'
          : 'No current element has this identifier',
      };
    }
    const element = matches[0]!;
    if (!element.isConnected)
      return {
        ...base,
        generation,
        status: 'detached',
        detail: 'Target is detached from its document',
      };
    if (element !== target) {
      generation++;
      observe(element);
    }
    const style = view.getComputedStyle(element);
    if (
      !element.getClientRects().length ||
      style.display === 'none' ||
      style.visibility === 'hidden'
    )
      return {
        ...base,
        generation,
        status: 'hidden',
        detail: 'No visible rendered box; prior geometry was not reused',
      };
    const box = rect(element.getBoundingClientRect());
    return {
      ...base,
      generation,
      status: 'measured',
      box,
      contentBox:
        contentBox &&
        style.display !== 'inline' &&
        contentStamp === contentSignature(element, style)
          ? { ...contentBox }
          : null,
      intersection: intersection ? { ...intersection } : null,
      computed: Object.fromEntries(
        [
          'boxSizing',
          'display',
          'position',
          'opacity',
          'visibility',
          'transform',
          'paddingTop',
          'paddingRight',
          'paddingBottom',
          'paddingLeft',
          'borderTopWidth',
          'borderRightWidth',
          'borderBottomWidth',
          'borderLeftWidth',
          'fontFamily',
          'fontSize',
          'fontWeight',
          'fontVariationSettings',
          'fontOpticalSizing',
          'fontKerning',
          'fontFeatureSettings',
          'letterSpacing',
          'lineHeight',
          'color',
          'backgroundColor',
          'rowGap',
          'columnGap',
        ].map((key) => {
          const value = style[key as keyof CSSStyleDeclaration];
          return [
            key,
            typeof value === 'string' && value.length ? value : null,
          ];
        }),
      ),
      clip: clipFor(element, box),
      detail:
        'Current axis-aligned viewport bounds and computed CSS. Clipping bounds do not establish occlusion; ink and baselines are not measured.',
    };
  };
  const mutations = new view.MutationObserver((records) => {
    if (!disposed && consumeMutations(records)) queue();
  });
  mutations.observe(document.documentElement, {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
    attributeFilter: [
      'id',
      'data-testid',
      'data-design-inspection-ui',
      'class',
      'style',
      'hidden',
      'dir',
    ],
  });
  document.addEventListener('scroll', queue, { capture: true, passive: true });
  document.addEventListener('visibilitychange', queue);
  const motionEvents = [
    'animationstart',
    'animationend',
    'animationcancel',
    'transitionrun',
    'transitionend',
    'transitioncancel',
  ];
  motionEvents.forEach((event) =>
    document.addEventListener(event, queue, true),
  );
  view.addEventListener('resize', queue, { passive: true });
  view.visualViewport?.addEventListener('resize', queue, { passive: true });
  view.visualViewport?.addEventListener('scroll', queue, { passive: true });
  document.fonts?.addEventListener('loadingdone', queue);
  document.fonts?.addEventListener('loadingerror', queue);
  queue();
  return {
    read,
    invalidate: queue,
    update(next: { targetId: string; context: BrowserInspectionContext }) {
      if (disposed) return false;
      validateId(next.targetId);
      const input = copyContext(next.context);
      if (
        next.targetId === targetId &&
        input.sourceIdentity === context.sourceIdentity &&
        input.inputKey === context.inputKey
      )
        return true;
      generation++;
      if (next.targetId !== targetId) {
        matchesCache = null;
        observe(null);
      } else observe(target);
      targetId = next.targetId;
      context = input;
      queue();
      return true;
    },
    stats: () => ({
      reads,
      resolutions,
      generation,
      sequence,
      pendingFrame: frame !== 0,
      disposed,
      observers: disposed
        ? 0
        : 1 + Number(resize !== null) + Number(intersectionObserver !== null),
    }),
    dispose() {
      if (disposed) return;
      disposed = true;
      generation++;
      if (frame) view.cancelAnimationFrame(frame);
      frame = 0;
      mutations.disconnect();
      resize?.disconnect();
      intersectionObserver?.disconnect();
      resize = null;
      intersectionObserver = null;
      intersection = null;
      target = null;
      matchesCache = null;
      contentBox = null;
      contentStamp = null;
      document.removeEventListener('scroll', queue, true);
      document.removeEventListener('visibilitychange', queue);
      motionEvents.forEach((event) =>
        document.removeEventListener(event, queue, true),
      );
      view.removeEventListener('resize', queue);
      view.visualViewport?.removeEventListener('resize', queue);
      view.visualViewport?.removeEventListener('scroll', queue);
      document.fonts?.removeEventListener('loadingdone', queue);
      document.fonts?.removeEventListener('loadingerror', queue);
    },
  };
}
