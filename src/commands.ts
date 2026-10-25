import { EnergyAnalyzeSchema, analyzeEnergy } from './energy-analysis.js';
import {
  ComponentInspectSchema,
  inspectComponent,
  MotionProofSchema,
  proofMotion,
} from './inspection.js';
import {
  ComponentContractSchema,
  solveComponentContract,
} from './component-contract.js';
import { EnergySearchSchema, searchEnergy } from './energy.js';
import {
  DesignHandoffSchema,
  ReplayHandoffSchema,
  createDesignHandoff,
  replayDesignHandoff,
} from './decision-machine.js';
import {
  CompositionSolveSchema,
  solveComposition,
} from './composition-solver.js';
import {
  ColorConvertSchema,
  convertColor,
  PaletteRampSchema,
  paletteRamp,
  PaletteAnalyzeSchema,
  analyzePalette,
  PaletteCandidateSchema,
  paletteCandidates,
} from './palette.js';
import {
  MotionAnalyzeSchema,
  analyzeMotion,
  MotionCandidatesSchema,
  motionCandidates,
  MotionEmitSchema,
  emitMotion,
} from './motion.js';
import { CompositionPlanSchema, planComposition } from './composition-plan.js';
import { AppleAuditSchema, auditAppleHig } from './apple-hig.js';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { parseState, StateSchema } from './state.js';
import { inspectFont, shape } from './fonts.js';
import { registry } from './registry.js';
import { resolveLayout, responsivePatterns } from './responsive.js';
import { intervalCandidates, rhythm, CurveSchema } from './intervals.js';
import { perturb, graph } from './graph.js';
import { policy, PolicySchema, scoreRelations } from './factors.js';
import { BrowserRenderer, type Renderer } from './measurement.js';
import { NativeRenderer } from './native.js';
import { emitStyleX, nativeMapping, proofHtml } from './emission.js';
import { relax } from './search.js';
import {
  ChoiceRequestSchema,
  SelectorProfileSchema,
  selectChoice,
} from './selector.js';
import { EvaluationSchema, evaluate } from './evaluation.js';
import {
  ColorSystemSchema,
  ColorContextSchema,
  ColorCandidateOptionsSchema,
  analyzeColors,
  colorCandidates,
} from './color.js';
import { CompositionInputSchema, analyzeComposition } from './composition.js';
import { TuningExportSchema, exportTuning } from './tuning.js';
import {
  CorpusInputSchema,
  CorpusAnalyzeSchema,
  validateCorpus,
  analyzeCorpus,
} from './corpus.js';

const StateInput = z.object({ state: StateSchema });
export const commandSchemas = {
  registry: z.object({}).strict(),
  'component solve': ComponentContractSchema,
  'component inspect': ComponentInspectSchema,
  'motion proof': MotionProofSchema,
  'energy search': EnergySearchSchema,
  'energy analyze': EnergyAnalyzeSchema,
  'composition solve': CompositionSolveSchema,
  'decision handoff': DesignHandoffSchema,
  'decision replay': ReplayHandoffSchema,
  'color convert': ColorConvertSchema,
  'palette ramp': PaletteRampSchema,
  'palette analyze': PaletteAnalyzeSchema,
  'palette candidates': PaletteCandidateSchema,
  'motion analyze': MotionAnalyzeSchema,
  'motion candidates': MotionCandidatesSchema,
  'motion emit': MotionEmitSchema,
  'composition plan': CompositionPlanSchema,
  'platform audit': AppleAuditSchema,
  'color analyze': z
    .object({
      system: ColorSystemSchema,
      context: ColorContextSchema.optional(),
    })
    .strict(),
  'color candidates': z
    .object({
      system: ColorSystemSchema,
      options: ColorCandidateOptionsSchema.optional(),
    })
    .strict(),
  'composition analyze': CompositionInputSchema,
  'training export': TuningExportSchema,
  'responsive patterns': z.object({}).strict(),
  'responsive resolve': StateInput.extend({
    systemFontScale: z.number().finite().positive().max(5).default(1),
  }).strict(),
  'font inspect': z
    .object({ file: z.string().min(1), text: z.string().default('') })
    .strict(),
  'text shape': StateInput.extend({
    blockId: z.string(),
    probes: z.boolean().default(false),
  }).strict(),
  'intervals candidates': z
    .object({
      base: z.number().finite().positive(),
      min: z.number().finite().positive(),
      max: z.number().finite().positive(),
      prior: z.enum(['smooth', 'musical']).default('smooth'),
      curve: CurveSchema.optional(),
    })
    .strict(),
  'relations score': StateInput.extend({
    policy: PolicySchema.optional(),
  }).strict(),
  'layout measure': StateInput.extend({
    probes: z.boolean().default(true),
    spacing: z.boolean().default(true),
  }).strict(),
  'system graph': StateInput.strict(),
  'system perturb': StateInput.extend({
    path: z.string(),
    value: z.unknown(),
  }).strict(),
  'system relax': StateInput.extend({
    maxCandidates: z.number().int().min(1).max(9).default(9),
    widths: z.array(z.number().finite().positive()).min(1).max(4).optional(),
    textScales: z
      .array(z.number().finite().positive())
      .min(1)
      .max(3)
      .optional(),
    pinned: z.array(z.string()).default([]),
    select: z
      .object({
        criterion: z.string().min(1),
        gguf: z.string().min(1),
        profile: SelectorProfileSchema.optional(),
        readout: z.enum(['single', 'balanced']).optional(),
        maxPromptTokens: z.number().int().min(512).max(16384).optional(),
        auditDirectory: z.string().optional(),
      })
      .strict()
      .optional(),
    policy: PolicySchema.optional(),
  }).strict(),
  'rhythm analyze': z
    .object({
      gaps: z.array(z.number().finite().nonnegative()),
      binWidth: z.number().finite().positive().default(0.25),
      windowSize: z.number().int().min(1).max(101).default(5),
      observed: z
        .object({
          counts: z.record(z.string(), z.number().finite().nonnegative()),
          source: z.string().min(1),
        })
        .optional(),
    })
    .strict(),
  emit: StateInput.extend({ target: z.enum(['stylex', 'native']) }).strict(),
  proof: StateInput.extend({
    directory: z.string().min(1).optional(),
    interactive: z.boolean().default(true),
  }).strict(),
  'choice select': ChoiceRequestSchema,
  evaluate: EvaluationSchema,
  'corpus validate': CorpusInputSchema,
  'corpus analyze': CorpusAnalyzeSchema,
};
export type Command = keyof typeof commandSchemas;
export function rendererFor(platform: string): Renderer {
  return platform === 'web'
    ? new BrowserRenderer()
    : new NativeRenderer(process.env.DESIGN_NATIVE_URL);
}
export async function execute(
  command: Command,
  input: unknown,
): Promise<unknown> {
  let renderer: Renderer | undefined;
  try {
    switch (command) {
      case 'component solve':
        return solveComponentContract(input);
      case 'component inspect':
        return inspectComponent(input);
      case 'motion proof':
        return proofMotion(commandSchemas[command].parse(input));
      case 'energy analyze':
        return analyzeEnergy(commandSchemas[command].parse(input));
      case 'energy search':
        return searchEnergy(commandSchemas[command].parse(input));
      case 'composition solve':
        return solveComposition(commandSchemas[command].parse(input));
      case 'decision handoff':
        return createDesignHandoff(commandSchemas[command].parse(input));
      case 'decision replay':
        return replayDesignHandoff(commandSchemas[command].parse(input));
      case 'color convert':
        return convertColor(commandSchemas[command].parse(input));
      case 'palette ramp':
        return paletteRamp(commandSchemas[command].parse(input));
      case 'palette analyze':
        return analyzePalette(commandSchemas[command].parse(input));
      case 'palette candidates':
        return paletteCandidates(commandSchemas[command].parse(input));
      case 'motion analyze':
        return analyzeMotion(commandSchemas[command].parse(input));
      case 'motion candidates':
        return motionCandidates(commandSchemas[command].parse(input));
      case 'motion emit':
        return emitMotion(commandSchemas[command].parse(input));
      case 'composition plan':
        return planComposition(commandSchemas[command].parse(input));
      case 'platform audit':
        return auditAppleHig(input);
      case 'training export':
        return exportTuning(input);
      case 'color analyze': {
        const r = commandSchemas[command].parse(input);
        return analyzeColors(r.system, r.context);
      }
      case 'color candidates': {
        const r = commandSchemas[command].parse(input);
        return colorCandidates(r.system, r.options);
      }
      case 'composition analyze':
        return analyzeComposition(commandSchemas[command].parse(input));
      case 'responsive patterns':
        commandSchemas[command].parse(input);
        return responsivePatterns;
      case 'responsive resolve': {
        const r = commandSchemas[command].parse(input);
        return resolveLayout(r.state, r.systemFontScale);
      }
      case 'registry':
        commandSchemas[command].parse(input);
        return registry();
      case 'font inspect': {
        const r = commandSchemas[command].parse(input);
        return inspectFont(r.file, r.text);
      }
      case 'text shape': {
        const r = commandSchemas[command].parse(input);
        const b = r.state.blocks.find((b) => b.id === r.blockId);
        if (!b) throw new Error(`unknown block ${r.blockId}`);
        renderer = rendererFor(r.state.platform);
        const measured = await renderer.measure(r.state, { probes: r.probes });
        return {
          ...shape(b),
          lineBreaks: measured.blocks.find((m) => m.id === b.id)!.lines,
          renderer: measured.engine,
          measurement: measured,
        };
      }
      case 'intervals candidates': {
        const r = commandSchemas[command].parse(input);
        return intervalCandidates(r.base, r.min, r.max, r.prior, r.curve);
      }
      case 'relations score': {
        const r = commandSchemas[command].parse(input);
        renderer = rendererFor(r.state.platform);
        return scoreRelations(
          r.state,
          await renderer.measure(r.state, { spacing: true }),
          r.policy,
        );
      }
      case 'layout measure': {
        const r = commandSchemas[command].parse(input);
        renderer = rendererFor(r.state.platform);
        return await renderer.measure(r.state, {
          probes: r.probes,
          spacing: r.spacing,
        });
      }
      case 'system graph': {
        const r = commandSchemas[command].parse(input);
        return {
          nodes: graph(r.state),
          note: 'Directed dependencies describe measurement/invalidation, not a joint aesthetic probability distribution.',
        };
      }
      case 'system perturb': {
        const r = commandSchemas[command].parse(input);
        return perturb(r.state, r.path, r.value);
      }
      case 'system relax': {
        const r = commandSchemas[command].parse(input);
        renderer = rendererFor(r.state.platform);
        const result = await relax(r.state, renderer, {
          maxCandidates: r.maxCandidates,
          pinned: r.pinned,
          ...(r.widths ? { widths: r.widths } : {}),
          ...(r.textScales ? { textScales: r.textScales } : {}),
          policy: r.policy ?? policy(),
        });
        const selection =
          r.select && result.viableIds.length
            ? await selectChoice(
                {
                  candidates: result.candidates
                    .filter((c) => c.viable)
                    .map((c) => ({ id: c.id, state: c.state })),
                  criterion: r.select.criterion,
                  gguf: r.select.gguf,
                  ...(r.select.profile ? { profile: r.select.profile } : {}),
                  ...(r.select.readout ? { readout: r.select.readout } : {}),
                  ...(r.select.maxPromptTokens
                    ? { maxPromptTokens: r.select.maxPromptTokens }
                    : {}),
                  widths: result.search.widths,
                  textScales: result.search.textScales,
                  ...(r.select.auditDirectory
                    ? { auditDirectory: r.select.auditDirectory }
                    : {}),
                },
                renderer,
              )
            : null;
        return { ...result, selection };
      }
      case 'rhythm analyze': {
        const r = commandSchemas[command].parse(input);
        return rhythm(r.gaps, r.binWidth, r.observed, r.windowSize);
      }
      case 'emit': {
        const r = commandSchemas[command].parse(input);
        return r.target === 'stylex'
          ? {
              source: emitStyleX(r.state),
              fontLoading:
                'Provide @font-face declarations using the aliases in the source. design proof emits an offline font-embedded HTML artifact.',
            }
          : nativeMapping(r.state);
      }
      case 'proof': {
        const r = commandSchemas[command].parse(input);
        const html = await proofHtml(r.state, r.interactive);
        if (!r.directory)
          return {
            html,
            source: emitStyleX(r.state),
            native: nativeMapping(r.state),
            measured: false,
          };
        const dir = path.resolve(r.directory);
        await mkdir(dir, { recursive: true });
        const files = {
          html: path.join(dir, 'specimen.html'),
          stylex: path.join(dir, 'specimen.stylex.jsx'),
          native: path.join(dir, 'specimen.native.json'),
          state: path.join(dir, 'state.json'),
        };
        await writeFile(files.html, html);
        await writeFile(files.stylex, emitStyleX(r.state));
        await writeFile(
          files.native,
          JSON.stringify(nativeMapping(r.state), null, 2) + '\n',
        );
        await writeFile(files.state, JSON.stringify(r.state, null, 2) + '\n');
        return {
          files,
          measured: false,
          note: 'Proof previews are editable. Rerun layout measure/relax after edits; previews are not verification receipts.',
        };
      }
      case 'choice select': {
        const r = commandSchemas[command].parse(input);
        if (new Set(r.candidates.map((c) => c.state.platform)).size !== 1)
          throw new Error('select within one target platform');
        renderer = rendererFor(r.candidates[0]!.state.platform);
        return await selectChoice(r, renderer);
      }
      case 'corpus validate':
        return validateCorpus(commandSchemas[command].parse(input));
      case 'corpus analyze': {
        const r = commandSchemas[command].parse(input);
        const platforms = new Set(
          r.records.flatMap((r) => (r.state ? [r.state.platform] : [])),
        );
        if (platforms.size > 1)
          throw new Error('analyze one platform per corpus request');
        renderer = rendererFor([...platforms][0] ?? 'web');
        return await analyzeCorpus(r, renderer);
      }
      case 'evaluate':
        return evaluate(commandSchemas[command].parse(input));
    }
  } finally {
    await renderer?.close();
  }
}
export function stateFromDocument(input: unknown) {
  return parseState(input);
}
