import { z } from 'zod';
import {
  evaluateExpression,
  expressionRefs,
  type Expression,
} from './math-expression.js';

const Id = z.string().regex(/^[A-Za-z][A-Za-z0-9_-]{0,63}$/);
const Expr: z.ZodType<Expression> = z.lazy(() =>
  z.union([
    z.number().finite(),
    z.object({ ref: z.string().min(1).max(100) }).strict(),
    z
      .object({
        op: z.enum([
          'add',
          'sub',
          'mul',
          'div',
          'min',
          'max',
          'pow',
          'log2',
          'sqrt',
          'ceil',
          'abs',
          'lt',
          'lte',
          'if',
        ]),
        args: z.array(Expr).min(1).max(16),
      })
      .strict(),
  ]),
);
const Box = z.object({ x: Expr, y: Expr, width: Expr, height: Expr }).strict();
const MeasuredBox = z
  .object({
    x: z.number().finite(),
    y: z.number().finite(),
    width: z.number().finite().nonnegative(),
    height: z.number().finite().nonnegative(),
  })
  .strict();
const BaseNode = z.object({
  id: Id,
  label: z.string().min(1).max(200),
  role: z
    .enum(['region', 'text', 'image', 'control', 'surface'])
    .default('region'),
  parent: Id.optional(),
});
const Node = z.discriminatedUnion('evidence', [
  BaseNode.extend({
    evidence: z.literal('proposed'),
    box: Box,
    baseline: Expr.optional(),
  }).strict(),
  BaseNode.extend({
    evidence: z.literal('renderer-reported'),
    box: MeasuredBox,
    baseline: z.number().finite().nonnegative().optional(),
    receipt: z
      .object({
        renderer: z.string().min(1).max(200),
        inputIdentity: z.string().min(1).max(200),
        receiptId: z.string().min(1).max(200),
      })
      .strict(),
  }).strict(),
]);
const Relation = z
  .object({
    id: Id,
    kind: z.enum(['gap', 'alignment', 'ratio', 'baseline']),
    from: Id,
    to: Id,
    axis: z.enum(['x', 'y']).default('y'),
    edge: z.enum(['start', 'center', 'end']).default('start'),
    band: z
      .object({ min: z.number().finite(), max: z.number().finite() })
      .strict()
      .refine((b) => b.min <= b.max, 'Invalid relation band')
      .optional(),
    source: z.string().min(1).max(1000),
  })
  .strict();
export const WireframeSchema = z
  .object({
    version: z.literal(1),
    id: Id,
    screen: z
      .object({
        width: z.number().finite().positive().max(10000),
        height: z.number().finite().positive().max(30000),
        unit: z.enum(['css-px', 'pt', 'dp']),
      })
      .strict(),
    variables: z
      .record(
        Id,
        z
          .object({
            value: z.number().finite(),
            min: z.number().finite().optional(),
            max: z.number().finite().optional(),
            step: z.number().finite().positive().optional(),
            unit: z.string().min(1).max(40),
          })
          .strict(),
      )
      .refine((v) => Object.keys(v).length <= 64, 'At most64 variables')
      .default({}),
    derived: z
      .array(
        z
          .object({ id: Id, expression: Expr, unit: z.string().min(1).max(40) })
          .strict(),
      )
      .max(128)
      .default([]),
    nodes: z.array(Node).min(1).max(200),
    relations: z.array(Relation).max(400).default([]),
  })
  .strict();
export type Wireframe = z.infer<typeof WireframeSchema>;
export const WireframeInspectSchema = z
  .object({
    wireframe: WireframeSchema,
    interactive: z.boolean().default(true),
  })
  .strict();

function bounded(value: unknown, depth = 0, count = { n: 0 }): void {
  if (depth > 40 || ++count.n > 50000)
    throw new Error('Wireframe exceeds expression depth/size limit');
  if (value && typeof value === 'object')
    for (const child of Object.values(value)) bounded(child, depth + 1, count);
}
function checkExpression(e: Expression): void {
  if (typeof e === 'number' || 'ref' in e) return;
  const arity = ['log2', 'sqrt', 'ceil', 'abs'].includes(e.op)
    ? 1
    : ['sub', 'div', 'pow', 'lt', 'lte'].includes(e.op)
      ? 2
      : e.op === 'if'
        ? 3
        : null;
  if (arity !== null && e.args.length !== arity)
    throw new Error(`${e.op} requires ${arity} operands`);
  e.args.forEach(checkExpression);
}
export function resolveWireframe(input: unknown) {
  bounded(input);
  const w = WireframeSchema.parse(input);
  const values: Record<string, number> = {
    'screen.width': w.screen.width,
    'screen.height': w.screen.height,
  };
  for (const [id, v] of Object.entries(w.variables)) {
    if (
      (v.min !== undefined && v.value < v.min) ||
      (v.max !== undefined && v.value > v.max) ||
      (v.min !== undefined && v.max !== undefined && v.min > v.max)
    )
      throw new Error(`Variable ${id} outside authored bounds`);
    values[id] = v.value;
  }
  const names = new Set([...Object.keys(values)]);
  for (const d of w.derived) {
    if (names.has(d.id)) throw new Error(`Duplicate mathematical name ${d.id}`);
    names.add(d.id);
    checkExpression(d.expression);
  }
  const pending = [...w.derived];
  while (pending.length) {
    const i = pending.findIndex((d) =>
      expressionRefs(d.expression).every((r) => Object.hasOwn(values, r)),
    );
    if (i < 0) throw new Error('Unknown or cyclic wireframe dependency');
    const d = pending.splice(i, 1)[0]!;
    values[d.id] = evaluateExpression(d.expression, values);
  }
  const evaluate = (e: Expression) => {
    checkExpression(e);
    for (const ref of expressionRefs(e))
      if (!Object.hasOwn(values, ref))
        throw new Error(`Unknown wireframe input ${ref}`);
    const value = evaluateExpression(e, values);
    if (!Number.isFinite(value))
      throw new Error('Nonfinite wireframe geometry');
    return value;
  };
  const ids = new Set<string>();
  for (const n of w.nodes) {
    if (ids.has(n.id)) throw new Error(`Duplicate node ${n.id}`);
    ids.add(n.id);
  }
  const nodes = w.nodes.map((n) => {
    if (n.parent && !ids.has(n.parent))
      throw new Error(`Unknown parent ${n.parent}`);
    let parent = n.parent;
    const seen = new Set([n.id]);
    while (parent) {
      if (seen.has(parent)) throw new Error('Cyclic node hierarchy');
      seen.add(parent);
      parent = w.nodes.find((x) => x.id === parent)?.parent;
    }
    const box = Object.fromEntries(
      Object.entries(n.box).map(([key, expr]) => [key, evaluate(expr)]),
    ) as { x: number; y: number; width: number; height: number };
    if (box.width < 0 || box.height < 0)
      throw new Error(`Negative extent for ${n.id}`);
    // Include annotations and every rendered edge, not only input operands.
    [
      box.x,
      box.y,
      box.width,
      box.height,
      box.x + box.width,
      box.y + box.height,
      box.x + 32,
      box.y + 32,
      box.x - 32,
      box.y - 32,
      box.x + box.width + 32,
      box.y + box.height + 32,
    ].forEach(drawingCoordinate);
    if (n.baseline !== undefined) checkExpression(n.baseline);
    const baseline =
      n.baseline === undefined ? null : box.y + evaluate(n.baseline);
    if (baseline !== null) drawingCoordinate(baseline);
    return { ...n, box, baseline };
  });
  const relationIds = new Set<string>();
  const relations = w.relations.map((r) => {
    if (relationIds.has(r.id)) throw new Error(`Duplicate relation ${r.id}`);
    relationIds.add(r.id);
    const a = nodes.find((n) => n.id === r.from),
      b = nodes.find((n) => n.id === r.to);
    if (!a || !b) throw new Error(`Unknown relation node ${r.id}`);
    const size = r.axis === 'x' ? 'width' : 'height';
    let value: number | null;
    if (r.kind === 'gap') value = b.box[r.axis] - a.box[r.axis] - a.box[size];
    else if (r.kind === 'alignment') {
      const t = r.edge === 'start' ? 0 : r.edge === 'center' ? 0.5 : 1;
      value =
        b.box[r.axis] + t * b.box[size] - (a.box[r.axis] + t * a.box[size]);
    } else if (r.kind === 'baseline')
      value =
        a.baseline === null || b.baseline === null
          ? null
          : b.baseline - a.baseline;
    else value = a.box[size] === 0 ? null : b.box[size] / a.box[size];
    if (value !== null && !Number.isFinite(value))
      throw new Error(`Nonfinite relation ${r.id}`);
    return {
      ...r,
      value,
      interval:
        r.kind === 'ratio' && value !== null && value > 0
          ? Math.log2(value)
          : null,
      status:
        value === null
          ? 'unknown'
          : !r.band
            ? 'described'
            : value >= r.band.min && value <= r.band.max
              ? 'within-authored-band'
              : 'outside-authored-band',
    };
  });
  return {
    wireframe: w,
    values,
    nodes,
    relations,
    scope:
      'Proposed geometry or caller-supplied renderer receipts. No font shaping, ink bounds, accessibility or aesthetic validation is inferred. Edits recompute proposals; renderer-reported rectangles remain fixed to their original receipt.',
  };
}
export type ResolvedWireframe = ReturnType<typeof resolveWireframe>;
const esc = (s: unknown) =>
  String(s)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
const DRAWING_LIMIT = 1e7;
function drawingCoordinate(value: number): number {
  if (!Number.isFinite(value) || Math.abs(value) > DRAWING_LIMIT)
    throw new Error(
      'Wireframe drawing coordinate exceeds finite ±10,000,000 budget',
    );
  return value;
}
const num = (n: number) => Math.round(drawingCoordinate(n) * 100) / 100;
export function wireframeSvg(
  resolved: ResolvedWireframe,
  selected?: string,
): string {
  const { wireframe: w, nodes, relations } = resolved;
  const pad = 42;
  const line = (x1: number, y1: number, x2: number, y2: number) =>
    `<path d="M${num(x1)} ${num(y1)}L${num(x2)} ${num(y2)}" fill="none" stroke="#947156" stroke-width="1"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-pad} ${-pad} ${w.screen.width + pad * 2} ${w.screen.height + pad * 2}" role="img" aria-label="${esc(w.id)} technical drawing in ${w.screen.unit}" style="font:11px ui-monospace,monospace;width:100%;height:auto;max-height:800px"><rect width="${w.screen.width}" height="${w.screen.height}" fill="#fffcf4" stroke="#293b33"/>${nodes
    .map((n) => {
      const b = n.box;
      return `<g data-wireframe-node="${n.id}" tabindex="0" role="button" aria-label="${esc(n.label)} ${num(b.width)} by ${num(b.height)} ${w.screen.unit}, ${n.evidence}"><rect x="${b.x}" y="${b.y}" width="${b.width}" height="${b.height}" fill="${n.id === selected ? '#f1cbb9' : n.role === 'image' ? '#d6ded4' : '#ebeee7'}" fill-opacity=".7" stroke="${n.id === selected ? '#b33d22' : '#526859'}" stroke-dasharray="${n.evidence === 'proposed' ? '4 3' : 'none'}"/><text x="${b.x + 6}" y="${b.y + 15}" fill="#263b31">${esc(n.label)}</text>${line(b.x, b.y - 7, b.x + b.width, b.y - 7)}<text x="${b.x + b.width / 2}" y="${b.y - 11}" text-anchor="middle" fill="#654b3c">${num(b.width)} × ${num(b.height)}</text>${n.baseline !== null ? `<path d="M${b.x} ${n.baseline}h${b.width}" stroke="#b33d22" stroke-dasharray="2 3"/>` : ''}</g>`;
    })
    .join('')}${relations
    .filter((r) => r.kind === 'gap')
    .map((r) => {
      const a = nodes.find((n) => n.id === r.from)!,
        b = nodes.find((n) => n.id === r.to)!;
      const x =
        r.axis === 'y'
          ? Math.min(a.box.x, b.box.x) - 12
          : a.box.x + a.box.width;
      const y =
        r.axis === 'y'
          ? a.box.y + a.box.height
          : Math.min(a.box.y, b.box.y) - 12;
      return (
        line(x, y, r.axis === 'y' ? x : b.box.x, r.axis === 'y' ? b.box.y : y) +
        `<text x="${x + 4}" y="${y + 12}" fill="#8a3e28">${esc(r.id)} ${r.value === null ? '?' : num(r.value)}</text>`
      );
    })
    .join(
      '',
    )}<text x="0" y="${w.screen.height + 24}" fill="#293b33">${w.screen.width} × ${w.screen.height} ${w.screen.unit} · dashed = proposal · solid = renderer-reported</text></svg>`;
}
export function inspectWireframe(input: unknown) {
  bounded(input);
  const r = WireframeInspectSchema.parse(input);
  const resolved = resolveWireframe(r.wireframe);
  const svg = wireframeSvg(resolved);
  const payload = JSON.stringify(r.wireframe).replaceAll('<', '\\u003c');
  const controls = r.interactive
    ? Object.entries(r.wireframe.variables)
        .map(
          ([id, v]) =>
            `<label>${esc(id)} (${esc(v.unit)}) <input data-variable="${id}" type="number" value="${v.value}" step="${v.step ?? 1}" ${v.min === undefined ? '' : `min="${v.min}"`} ${v.max === undefined ? '' : `max="${v.max}"`}></label>`,
        )
        .join('')
    : '';
  const html = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Design Theory — ${esc(r.wireframe.id)}</title><style>body{background:#f6f2e8;color:#263b31;font:14px system-ui;margin:20px}header{display:flex;gap:16px;flex-wrap:wrap;align-items:center}label{display:flex;gap:6px;align-items:center}input{width:80px;font:inherit}#drawing{margin-top:24px}#notice{padding:12px;border:1px solid #c3c8bc}button{font:inherit;padding:8px}</style><header><strong>Technical relationships</strong>${controls}</header><p id="notice">Editable proposals. Renderer-reported boxes retain their original receipt. Select a node to share its identity with the agent.</p><div id="drawing">${svg}</div><script>const input=${payload};const send=(selection)=>parent.postMessage({designTheoryWireframeEdit:{session:window.__DESIGN_FRAME_SESSION__??null,wireframeId:input.id,variables:Object.fromEntries(Object.entries(input.variables).map(([id,v])=>[id,v.value])),selection:selection||null}},'*');document.querySelectorAll('[data-variable]').forEach(el=>el.addEventListener('change',()=>{const id=el.dataset.variable;const value=el.valueAsNumber;if(!Number.isFinite(value)||!el.checkValidity())return;input.variables[id].value=value;document.querySelector('#notice').textContent='Edit sent; drawing awaits deterministic recomputation by the host.';send();}));document.querySelectorAll('[data-wireframe-node]').forEach(el=>{const select=()=>send(el.dataset.wireframeNode);el.addEventListener('click',select);el.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();select();}});});</script></html>`;
  return { ...resolved, svg, html };
}
