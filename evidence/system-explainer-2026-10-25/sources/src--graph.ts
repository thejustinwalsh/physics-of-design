import { parseState, type DesignState } from './state.js';

export type FactorNode = { id: string; reads: string[]; dependsOn: string[] };
export function graph(state: DesignState): FactorNode[] {
  const nodes: FactorNode[] = [];
  for (const [i, b] of state.blocks.entries()) {
    const p = `/blocks/${i}`;
    nodes.push(
      { id: `metrics:${b.id}`, reads: [`${p}/font`, `${p}/id`], dependsOn: [] },
      {
        id: `shape:${b.id}`,
        reads: [
          'font',
          'text',
          'size',
          'weight',
          'kerning',
          'features',
          'trackingEm',
          'language',
          'direction',
        ].map((k) => `${p}/${k}`),
        dependsOn: [`metrics:${b.id}`],
      },
      {
        id: `layout:${b.id}`,
        reads: [
          `${p}/measure`,
          `${p}/leading`,
          `${p}/align`,
          `${p}/maxHeight`,
          `${p}/role`,
          '/viewport',
          '/padding',
          '/platform',
          '/responsive',
          '/gaps',
        ],
        dependsOn: [
          `shape:${b.id}`,
          ...(i ? [`layout:${state.blocks[i - 1]!.id}`] : []),
        ],
      },
      {
        id: `tracking:${b.id}`,
        reads: [`${p}/size`, `${p}/weight`, `${p}/font`, `${p}/language`],
        dependsOn: [`metrics:${b.id}`, `layout:${b.id}`],
      },
      {
        id: `leading:${b.id}`,
        reads: [`${p}/leading`, `${p}/role`],
        dependsOn: [`metrics:${b.id}`, `layout:${b.id}`],
      },
      {
        id: `measure:${b.id}`,
        reads: [`${p}/measure`, `${p}/role`, '/archetype'],
        dependsOn: [`layout:${b.id}`],
      },
      {
        id: `color:${b.id}`,
        reads: [
          '/colors',
          `${p}/size`,
          `${p}/weight`,
          '/responsive',
          '/viewport',
          '/platform',
        ],
        dependsOn: [],
      },
    );
  }
  const layouts = state.blocks.map((b) => `layout:${b.id}`);
  nodes.push(
    {
      id: 'hierarchy',
      reads: [
        '/archetype',
        ...state.blocks.flatMap((_, i) => [
          `/blocks/${i}/size`,
          `/blocks/${i}/weight`,
          `/blocks/${i}/role`,
        ]),
      ],
      dependsOn: [],
    },
    { id: 'whitespace', reads: ['/gaps'], dependsOn: layouts },
    { id: 'rhythm', reads: ['/gaps'], dependsOn: ['whitespace'] },
    { id: 'color-harmony', reads: ['/colors'], dependsOn: [] },
    { id: 'composition', reads: ['/viewport'], dependsOn: layouts },
    {
      id: 'responsive',
      reads: ['/viewport', '/platform'],
      dependsOn: [...layouts, 'whitespace', 'hierarchy'],
    },
  );
  return nodes;
}
export function overlaps(a: string, b: string): boolean {
  return a === b || a.startsWith(`${b}/`) || b.startsWith(`${a}/`);
}
export function invalidated(state: DesignState, paths: string[]): string[] {
  const nodes = graph(state);
  const affected = new Set<string>();
  for (const node of nodes)
    if (node.reads.some((r) => paths.some((p) => overlaps(r, p))))
      affected.add(node.id);
  let changed = true;
  while (changed) {
    changed = false;
    for (const node of nodes)
      if (
        !affected.has(node.id) &&
        node.dependsOn.some((d) => affected.has(d))
      ) {
        affected.add(node.id);
        changed = true;
      }
  }
  return nodes.filter((n) => affected.has(n.id)).map((n) => n.id);
}
export function perturb(state: DesignState, path: string, value: unknown) {
  if (
    !path.startsWith('/') ||
    path
      .split('/')
      .some((k) => ['__proto__', 'constructor', 'prototype'].includes(k))
  )
    throw new Error('path must be a safe JSON pointer');
  if (state.locks.some((lock) => overlaps(lock, path)))
    throw new Error(
      `path ${path} is locked; remove the lock explicitly before editing`,
    );
  const next = structuredClone(state);
  const keys = path
    .slice(1)
    .split('/')
    .map((s) => s.replace(/~1/g, '/').replace(/~0/g, '~'));
  let parent: unknown = next;
  for (const key of keys.slice(0, -1)) {
    if (!parent || typeof parent !== 'object' || !Object.hasOwn(parent, key))
      throw new Error(`unknown state path ${path}`);
    parent = (parent as Record<string, unknown>)[key];
  }
  const last = keys.at(-1)!;
  if (!parent || typeof parent !== 'object' || !Object.hasOwn(parent, last))
    throw new Error(`unknown state path ${path}`);
  (parent as Record<string, unknown>)[last] = value;
  return {
    state: parseState(next),
    changed: [path],
    invalidated: invalidated(state, [path]),
    measurementStatus: 'invalidated; remeasure before selection',
  };
}
