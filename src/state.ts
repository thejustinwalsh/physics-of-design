import { z } from 'zod';
import { ResponsiveSchema } from './responsive.js';
import { ColorSystemSchema } from './color.js';

const finite = z.number().finite();
const positive = finite.positive();
export const FontSchema = z
  .object({
    file: z.string().min(1),
    family: z.string().min(1),
    axes: z.record(z.string().regex(/^[A-Za-z0-9]{4}$/), finite).default({}),
    opticalSizing: z.enum(['auto', 'none']).default('none'),
  })
  .strict();
export const BlockSchema = z
  .object({
    id: z.string().regex(/^[a-z][a-z0-9-]*$/),
    role: z.enum(['title', 'subtitle', 'prose']),
    text: z.string().min(1).regex(/\S/u, 'text must contain visible content'),
    font: FontSchema,
    size: positive.max(1000),
    weight: finite.min(1).max(1000),
    kerning: z.enum(['auto', 'none']).default('auto'),
    features: z
      .record(z.string().regex(/^(?!kern$)[A-Za-z0-9]{4}$/), z.boolean())
      .default({}),
    trackingEm: finite.min(-0.2).max(1),
    leading: positive.max(5),
    measure: positive.max(10000),
    align: z.enum(['left', 'center', 'right']).default('left'),
    direction: z.enum(['ltr', 'rtl', 'auto']).default('auto'),
    language: z.string().default('en'),
    maxHeight: positive.nullable().default(null),
  })
  .strict();
export const StateSchema = z
  .object({
    version: z.literal(1),
    archetype: z.enum(['hero', 'editorial']),
    platform: z.enum(['web', 'native-ios', 'native-android']).default('web'),
    viewport: z
      .object({
        width: positive.max(10000),
        height: positive.max(10000),
        textScale: positive.max(5).default(1),
      })
      .strict(),
    padding: finite.nonnegative().max(500),
    blocks: z.array(BlockSchema).min(2).max(8),
    gaps: z.array(finite.nonnegative()).max(7),
    locks: z.array(z.string()).default([]),
    responsive: ResponsiveSchema.nullable().default(null),
    colors: ColorSystemSchema.nullable().default(null),
  })
  .strict()
  .superRefine((s, ctx) => {
    if (s.responsive)
      for (const anchor of s.responsive.anchors) {
        for (const id of Object.keys(anchor.blocks))
          if (!s.blocks.some((b) => b.id === id))
            ctx.addIssue({
              code: 'custom',
              path: ['responsive'],
              message: `unknown responsive block ${id}`,
            });
        for (const block of s.blocks) {
          const v = anchor.blocks[block.id];
          if (!v) continue;
          if (
            block.size * v.sizeScale > 1000 ||
            block.measure * v.measureScale > 10000 ||
            block.leading + v.leadingDelta <= 0 ||
            block.leading + v.leadingDelta > 5 ||
            block.trackingEm + v.trackingDelta < -0.2 ||
            block.trackingEm + v.trackingDelta > 1
          )
            ctx.addIssue({
              code: 'custom',
              path: ['responsive'],
              message: `responsive values for ${block.id} exceed the state bounds`,
            });
        }
      }
    if (s.gaps.length !== s.blocks.length - 1)
      ctx.addIssue({
        code: 'custom',
        path: ['gaps'],
        message: 'one gap is required between each adjacent pair',
      });
    if (new Set(s.blocks.map((b) => b.id)).size !== s.blocks.length)
      ctx.addIssue({
        code: 'custom',
        path: ['blocks'],
        message: 'block ids must be unique',
      });
    if (s.padding * 2 >= s.viewport.width)
      ctx.addIssue({
        code: 'custom',
        path: ['padding'],
        message: 'padding leaves no text width',
      });
    if (!s.blocks.some((b) => b.role === 'title'))
      ctx.addIssue({
        code: 'custom',
        path: ['blocks'],
        message: 'a title is required',
      });
    if (!s.blocks.some((b) => b.role !== 'title'))
      ctx.addIssue({
        code: 'custom',
        path: ['blocks'],
        message:
          'a subtitle or prose block is required for the title relationship',
      });
  });
export type DesignState = z.infer<typeof StateSchema>;
export type TextBlock = DesignState['blocks'][number];
export type Platform = DesignState['platform'];
export type EvidenceKind =
  'empirical' | 'heuristic' | 'hypothesis' | 'standard' | 'measurement';
export type Issue = {
  code: string;
  block?: string;
  severity: 'hard' | 'unsupported' | 'note';
  message: string;
};
export type Rect = { x: number; y: number; width: number; height: number };
export type Line = Rect & { text: string; start: number; end: number };
export type BlockMeasurement = {
  id: string;
  box: Rect;
  lines: Line[];
  inlineBounds: Rect | null;
  inkBounds: Rect | null;
  overflowX: number;
  overflowY: number;
  thresholds?: { narrower: Threshold; wider: Threshold };
};
export type Threshold = {
  bracket: [number, number] | null;
  distance: [number, number] | null;
  searched: [number, number];
  precision: number;
  signature: 'line-breaks';
};
export type LayoutMeasurement = {
  inputHash: string;
  platform: Platform;
  engine: string;
  runtime: Record<string, string | number>;
  blocks: BlockMeasurement[];
  issues: Issue[];
  feasible: boolean;
  textSpacing: { tested: boolean; issues: Issue[] };
  scope: string[];
};

export function parseState(value: unknown): DesignState {
  return StateSchema.parse(value);
}
export function effectiveWidth(state: DesignState, block: TextBlock): number {
  return Math.min(block.measure, state.viewport.width - state.padding * 2);
}
export function round(n: number, precision = 1000): number {
  return Math.round(n * precision) / precision;
}
