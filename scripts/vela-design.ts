import { inspectDesignContext } from '../src/design-context.js';
import * as z from 'zod';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import {
  searchEnergy,
  type Expression,
  type EnergyProgram,
} from '../src/energy.js';
import {
  createDesignHandoff,
  type DesignHandoffInput,
  replayDesignHandoff,
} from '../src/decision-machine.js';
import { analyzePalette } from '../src/palette.js';
import { fontDigest, loadFont } from '../src/fonts.js';
import { summarizeMotion } from '../src/motion.js';
async function compileDirection(direction: 'momentum' | 'field-notes') {
  const fieldNotes = direction === 'field-notes';
  const designContext = await inspectDesignContext({
    file: 'examples/vela/DESIGN.md',
  });
  if (designContext.status !== 'found')
    throw Error('Vela requires its recorded DESIGN.md');
  const ref = (name: string): Expression => ({ ref: name });
  const op = (
    name: Extract<Expression, { op: string }>['op'],
    ...args: Expression[]
  ): Expression => ({ op: name, args });
  const brief = {
    intent:
      'Vela is a bold, precise training journal for people who want purposeful movement, not a gamified medical authority. Ink, electric lime and cobalt; oversized confident numerals; asymmetric editorial hierarchy; generous grouped space; one primary action per screen; expressive spring page entrances with clear anticipation, hold and release. Phone-first native app, useful iPad split/rail adaptation and desktop companion. Content and accessible controls remain intact under text enlargement and reduced motion.',
    source: 'examples/vela/brief.md; user direction October 2026',
  };
  if (fieldNotes) {
    brief.intent =
      'Vela Field Notes is an authored alternative for the same training journal: warm paper, charcoal and terracotta; smaller editorial hierarchy, compact ruled grouping, shallow corners, short low-overshoot motion. Preserve all six screens, state, text enlargement and reduced motion. These are editable brief preferences, not human preference evidence.';
    brief.source = 'examples/vela/DESIGN.md: authored Field Notes direction';
  }
  const content = z
    .record(
      z.string().regex(/^[a-z][a-z0-9-]*$/),
      z
        .object({
          role: z.enum(['heading', 'prose']),
          default: z.string().min(1),
          compact: z.string().min(1),
          expanded: z.string().min(1),
        })
        .strict(),
    )
    .parse(JSON.parse(await readFile('examples/vela/content.json', 'utf8')));
  const heavyFont = loadFont('assets/fonts/Lato-Black.ttf');
  const advanceEm = (text: string) =>
    heavyFont.layout(text).positions.reduce((sum, p) => sum + p.xAdvance, 0) /
    heavyFont.unitsPerEm;
  const headlineEm = Math.max(
      ...Object.values(content)
        .filter((row) => row.role === 'heading')
        .flatMap((row) => [row.default, row.compact, row.expanded])
        .flatMap((text) => text.split(/\\n|\s+/))
        .filter(Boolean)
        .map((word) => advanceEm(word + '.')),
    ),
    timerEm = advanceEm('22:00');
  const timerPairEm = Math.max(
    ...Array.from({ length: 60 }, (_, i) =>
      advanceEm(String(i).padStart(2, '0')),
    ),
  );
  const directionLabelEm = Math.max(
    ...['Momentum', 'Field Notes'].map(advanceEm),
  );
  const navLabelEm = Math.max(
    ...['Today', 'Insights', 'Profile'].map(advanceEm),
  );
  const derived: EnergyProgram['derived'] = [];
  const calc = (
    id: string,
    expression: Expression,
    unit: string,
    kind: 'calculated' | 'predicted' = 'calculated',
  ) =>
    derived.push({
      id,
      expression,
      unit,
      provenance: {
        kind,
        source:
          'Vela brief geometry v1; editable art direction, not universal beauty',
      },
    });
  calc(
    'pageGutter',
    op(
      'min',
      ref('gutter'),
      op('mul', ref('width'), 0.08),
      op('max', 8, op('div', op('sub', ref('paneWidth'), 280), 2)),
    ),
    'dp',
  );
  calc('gap', op('mul', ref('space'), ref('density')), 'dp');
  calc('navRailWidth', op('if', ref('navRail'), 220, 0), 'dp');
  calc('paneWidth', op('sub', ref('width'), ref('navRailWidth')), 'dp');
  calc(
    'contentWidth',
    op(
      'min',
      1120,
      op('sub', ref('paneWidth'), op('mul', 2, ref('pageGutter'))),
    ),
    'dp',
  );
  calc(
    'titleSize',
    op(
      'min',
      ref('display'),
      op('max', 40, op('mul', ref('paneWidth'), 0.18)),
      op(
        'div',
        op('sub', ref('contentWidth'), 2),
        op('add', headlineEm, op('mul', 8, ref('tracking'))),
      ),
    ),
    'dp',
  );
  calc(
    'timerSize',
    op(
      'min',
      op('mul', ref('titleSize'), 1.1),
      op(
        'div',
        op('sub', ref('timerInnerWidth'), fieldNotes ? 4 : 2),
        op('mul', ref('textScale'), op('add', timerPairEm, ref('tracking'))),
      ),
    ),
    'dp',
    'predicted',
  );
  calc(
    'timerInnerWidth',
    op('sub', ref('contentWidth'), op('mul', 2, ref('pageGutter'))),
    'dp',
  );
  calc(
    'timerStacked',
    op(
      'lt',
      ref('timerInnerWidth'),
      op(
        'mul',
        ref('textScale'),
        ref('timerSize'),
        op('add', timerEm, op('mul', 4, ref('tracking'))),
      ),
    ),
    'boolean',
  );
  calc(
    'predictedHeadlineLines',
    op(
      'add',
      1,
      op(
        'ceil',
        op(
          'div',
          op(
            'mul',
            ref('titleSize'),
            ref('textScale'),
            op('add', headlineEm, op('mul', 8, ref('tracking'))),
          ),
          ref('contentWidth'),
        ),
      ),
    ),
    'lines',
    'predicted',
  );
  calc(
    'predictedHeadlineHeight',
    op(
      'mul',
      ref('predictedHeadlineLines'),
      ref('titleSize'),
      ref('titleLeading'),
      ref('textScale'),
    ),
    'dp',
    'predicted',
  );
  calc(
    'compactHierarchy',
    op('lt', op('mul', ref('height'), 0.42), ref('predictedHeadlineHeight')),
    'boolean',
    'predicted',
  );
  calc('operatingHeadingSize', op('mul', ref('body'), 1.4), 'dp');
  calc(
    'sectionHeadingSize',
    op(
      'if',
      ref('compactHierarchy'),
      ref('operatingHeadingSize'),
      op('mul', ref('body'), 2.2),
    ),
    'dp',
  );
  calc(
    'expressiveHeadingSize',
    op(
      'if',
      ref('compactHierarchy'),
      ref('operatingHeadingSize'),
      ref('titleSize'),
    ),
    'dp',
  );
  calc('heroActionFirst', ref('compactHierarchy'), 'boolean');
  calc('navLabelSize', op('mul', ref('body'), 0.63), 'dp');
  calc('railLabelSize', op('mul', ref('body'), 0.85), 'dp');
  calc(
    'navCompact',
    op(
      'lt',
      ref('contentWidth'),
      op(
        'mul',
        3,
        op(
          'max',
          52,
          op(
            'add',
            op('mul', navLabelEm, ref('body'), 0.63, ref('textScale')),
            op('mul', ref('gap'), 0.6),
          ),
        ),
      ),
    ),
    'boolean',
    'predicted',
  );
  calc(
    'sessionNumeralSize',
    op(
      'if',
      ref('compactHierarchy'),
      op('mul', ref('body'), 1.65),
      op('mul', ref('titleSize'), 1.5),
    ),
    'dp',
  );
  calc(
    'phaseStacked',
    op('lt', ref('contentWidth'), op('mul', ref('body'), 18, ref('textScale'))),
    'boolean',
    'predicted',
  );
  calc('bodySize', ref('body'), 'dp');
  calc('sectionGap', op('mul', ref('gap'), 2), 'dp');
  calc(
    'paired',
    op(
      'lte',
      op('add', op('mul', 2, 300, ref('textScale')), ref('gap')),
      ref('contentWidth'),
    ),
    'boolean',
  );
  calc(
    'navRail',
    op('lte', op('add', 220, op('mul', 500, ref('textScale'))), ref('width')),
    'boolean',
  );
  calc(
    'cardWidth',
    op(
      'if',
      ref('paired'),
      op('div', op('sub', ref('contentWidth'), ref('sectionGap')), 2),
      ref('contentWidth'),
    ),
    'dp',
  );
  calc(
    'compactDirectionLabels',
    op(
      'lt',
      op(
        'sub',
        ref('cardWidth'),
        op('add', op('mul', 2, ref('pageGutter')), fieldNotes ? 30 : 28),
      ),
      op('mul', directionLabelEm, ref('body'), ref('textScale')),
    ),
    'boolean',
    'predicted',
  );
  calc(
    'hierarchy',
    op('log2', op('div', ref('titleSize'), ref('body'))),
    'octaves',
  );
  calc('trackingTarget', op('mul', ref('titleSize'), -0.00055), 'em');
  calc(
    'trackingResidual',
    op('sub', ref('tracking'), ref('trackingTarget')),
    'em',
  );
  calc(
    'leadingTarget',
    op(
      'min',
      1.65,
      op(
        'max',
        1.4,
        op(
          'add',
          1.35,
          op('mul', op('div', ref('contentWidth'), ref('body')), 0.004),
        ),
      ),
    ),
    'ratio',
  );
  calc(
    'leadingResidual',
    op('sub', ref('bodyLeading'), ref('leadingTarget')),
    'ratio',
  );
  calc(
    'displayLeadingResidual',
    op(
      'sub',
      ref('titleLeading'),
      op('sub', 1.2, op('mul', ref('titleSize'), 0.001)),
    ),
    'ratio',
  );
  calc('groupRatio', op('div', ref('gap'), ref('body')), 'ratio');
  calc(
    'dampingRatio',
    op('div', ref('damping'), op('mul', 2, op('sqrt', ref('stiffness')))),
    'ratio',
  );
  // zeta is restricted below 1, allowing a closed-form peak overshoot for a stationary target and v0=0.
  calc(
    'overshoot',
    op(
      'pow',
      Math.E,
      op(
        'div',
        op('mul', -Math.PI, ref('dampingRatio')),
        op('sqrt', op('sub', 1, op('pow', ref('dampingRatio'), 2))),
      ),
    ),
    'ratio',
  );
  calc('pageDistance', op('mul', ref('gap'), fieldNotes ? 0.45 : 1.5), 'dp');
  // A cheap forecast only; actual title line fragments are verified in the native/browser renderer.
  calc(
    'titleFill',
    op(
      'div',
      op(
        'mul',
        ref('titleSize'),
        op('add', headlineEm, op('mul', 8, ref('tracking'))),
      ),
      ref('contentWidth'),
    ),
    'ratio',
    'predicted',
  );
  const factor = (
    id: string,
    expression: Expression,
    min: number,
    max: number,
    scale: number,
    weight: number,
    category: string,
    mode: 'hard' | 'preference' = 'preference',
  ): EnergyProgram['factors'][number] => ({
    id,
    expression,
    bands: [{ min, max }],
    scale,
    weight,
    category,
    mode,
    provenance: {
      kind: mode === 'hard' ? 'heuristic' : 'brief',
      source:
        mode === 'hard'
          ? 'Vela supported geometry contract; renderer verification remains pending'
          : brief.source,
    },
  });
  const program: EnergyProgram = {
    version: 1,
    id: fieldNotes ? 'vela-field-notes' : 'vela-momentum-v2',
    brief,
    identity: {
      policy: fieldNotes
        ? 'vela-field-notes-v1'
        : 'vela-momentum-v2-responsive-directions',
      font: fontDigest('assets/fonts/Lato-Black.ttf'),
      designDocument: designContext.sha256,
      math: 'energy-v1',
      motion: 'stationary spring; RN 0.88 underdamped mapping',
    },
    variables: [
      {
        id: 'display',
        unit: 'dp',
        values: fieldNotes ? [44, 48, 52, 56] : [56, 60, 64, 68, 72, 76, 80],
      },
      { id: 'titleLeading', unit: 'ratio', values: [1.08, 1.12, 1.16] },
      { id: 'bodyLeading', unit: 'ratio', values: [1.4, 1.5, 1.6] },
      { id: 'body', unit: 'dp', values: [17, 18, 19] },
      {
        id: 'space',
        unit: 'dp',
        values: fieldNotes ? [14, 16, 18] : [16, 18, 20, 22, 24],
      },
      { id: 'density', unit: 'ratio', values: [0.9, 1, 1.1] },
      { id: 'gutter', unit: 'dp', values: [20, 24, 28] },
      {
        id: 'radius',
        unit: 'dp',
        values: fieldNotes ? [4, 6, 8] : [20, 24, 28, 32],
      },
      {
        id: 'tracking',
        unit: 'em',
        values: fieldNotes
          ? [-0.025, -0.02, -0.015]
          : [-0.045, -0.04, -0.035, -0.03, -0.025],
      },
      {
        id: 'stiffness',
        unit: 'normalized/s²',
        values: fieldNotes ? [260, 300, 340] : [170, 200, 230, 260],
      },
      {
        id: 'damping',
        unit: 'normalized/s',
        values: fieldNotes ? [28, 30, 32] : [18, 20, 22, 24],
      },
    ],
    scenarios: [
      { width: 320, height: 740 },
      { width: 844, height: 320 },
      { width: 390, height: 700 },
      { width: 390, height: 844 },
      { width: 834, height: 1210 },
      { width: 1440, height: 1024 },
    ].flatMap(({ width, height }) =>
      [1, 2, 3.6].map((textScale) => ({
        id: `w${width}h${height}s${textScale}`,
        values: { width, height, textScale, reducedMotion: 0 },
      })),
    ),
    derived,
    factors: [
      factor(
        'minimum-content',
        ref('contentWidth'),
        280,
        1440,
        20,
        1,
        'content',
        'hard',
      ),
      factor(
        'native-underdamped',
        ref('dampingRatio'),
        0.5,
        0.95,
        0.1,
        1,
        'motion',
        'hard',
      ),
      factor(
        'body-legibility',
        ref('body'),
        17,
        20,
        1,
        1,
        'readability',
        'hard',
      ),
      factor(
        'editorial-hierarchy',
        ref('hierarchy'),
        1.8,
        2.15,
        0.18,
        2,
        'hierarchy',
      ),
      factor(
        'tracking-size-coupling',
        ref('trackingResidual'),
        -0.003,
        0.003,
        0.01,
        1.5,
        'typography',
      ),
      factor(
        'body-leading-measure',
        ref('leadingResidual'),
        -0.03,
        0.03,
        0.1,
        1.2,
        'typography',
      ),
      factor(
        'display-leading-size',
        ref('displayLeadingResidual'),
        -0.015,
        0.015,
        0.04,
        1,
        'typography',
      ),
      factor(
        'grouping-space',
        ref('groupRatio'),
        fieldNotes ? 0.75 : 1.02,
        fieldNotes ? 1 : 1.28,
        0.2,
        1.2,
        'proximity',
      ),
      factor(
        'headline-tension',
        ref('titleFill'),
        0.7,
        0.94,
        0.2,
        1,
        'expressive-tension',
      ),
      factor(
        'motion-release',
        ref('overshoot'),
        fieldNotes ? 0.001 : 0.035,
        fieldNotes ? 0.015 : 0.085,
        0.03,
        2,
        'motion',
      ),
      factor(
        'surface-radius',
        op('div', ref('radius'), ref('gap')),
        fieldNotes ? 0.2 : 1.15,
        fieldNotes ? 0.5 : 1.4,
        0.25,
        0.6,
        'geometry',
      ),
    ],
  };
  const bindings = Object.fromEntries(
    [
      'titleSize',
      'bodySize',
      'pageGutter',
      'gap',
      'sectionGap',
      'cardWidth',
      'contentWidth',
      'paired',
      'navRail',
      'navRailWidth',
      'paneWidth',
      'pageDistance',
      'titleLeading',
      'bodyLeading',
      'timerSize',
      'compactDirectionLabels',
      'timerStacked',
      'timerInnerWidth',
      'compactHierarchy',
      'heroActionFirst',
      'navCompact',
      'navLabelSize',
      'railLabelSize',
      'sessionNumeralSize',
      'phaseStacked',
      'operatingHeadingSize',
      'sectionHeadingSize',
    ].map((x) => [x, ref(x)]),
  );
  bindings.radius = ref('radius');
  bindings.tracking = ref('tracking');
  const headingBindings = (role: 'expressive' | 'section' | 'operating') => ({
    ...bindings,
    headingSize: ref(
      role === 'expressive'
        ? 'expressiveHeadingSize'
        : role === 'section'
          ? 'sectionHeadingSize'
          : 'operatingHeadingSize',
    ),
  });
  const route = (event: string, target: string) => ({
    event,
    target,
    motion: 'page',
  });
  const copy = (normal: string, compact = normal) => ({
    default: normal,
    compact,
    source:
      'examples/vela/brief.md — authored equivalent responsive copy, no user-generated content replacement',
  });
  const machine: DesignHandoffInput['machine'] = {
    id: 'vela',
    initial: 'today',
    content: {
      today: copy('Build\nmomentum', 'Build\nyour pace'),
      detail: copy('Steady\nbuild'),
      complete: copy('You\nshowed up', 'You\ndid it'),
      insights: copy('Your\nrhythm', 'Your\npace'),
      profile: copy('Make\nit yours'),
      'phase-0': copy('Find your rhythm', 'Warm up'),
      'phase-1': copy('Hold your pace', 'Hold pace'),
      'phase-2': copy('Ease back'),
      'complete-empty': copy('No session\nsaved', 'No time\nsaved'),
    },
    states: [
      {
        id: 'today',
        purpose: 'Understand readiness and choose one purposeful session',
        regions: [
          {
            id: 'screen',
            role: 'dashboard',
            bindings: headingBindings('expressive'),
          },
        ],
        on: [
          route('OPEN_SESSION', 'detail'),
          route('INSIGHTS', 'insights'),
          route('PROFILE', 'profile'),
        ],
      },
      {
        id: 'detail',
        purpose: 'Inspect an interval session before committing',
        regions: [
          {
            id: 'screen',
            role: 'detail',
            bindings: headingBindings('section'),
          },
        ],
        on: [route('BACK', 'today'), route('START', 'active')],
      },
      {
        id: 'active',
        purpose: 'Run, pause, resume and finish a local training timer',
        regions: [
          {
            id: 'screen',
            role: 'session',
            bindings: headingBindings('operating'),
          },
        ],
        on: [
          route('FINISH', 'complete'),
          route('DISCARD', 'today'),
          route('BACK', 'detail'),
        ],
      },
      {
        id: 'complete',
        purpose: 'Release effort and record the completed local session',
        regions: [
          {
            id: 'screen',
            role: 'completion',
            bindings: headingBindings('expressive'),
          },
        ],
        on: [route('DONE', 'today'), route('INSIGHTS', 'insights')],
      },
      {
        id: 'insights',
        purpose:
          'Review clearly labeled sample history and local completed sessions',
        regions: [
          {
            id: 'screen',
            role: 'insights',
            bindings: headingBindings('section'),
          },
        ],
        on: [route('TODAY', 'today'), route('PROFILE', 'profile')],
      },
      {
        id: 'profile',
        purpose: 'Control appearance and motion preferences',
        regions: [
          {
            id: 'screen',
            role: 'settings',
            bindings: headingBindings('section'),
          },
        ],
        on: [route('TODAY', 'today'), route('INSIGHTS', 'insights')],
      },
    ],
    motions: {
      page: {
        stiffness: ref('stiffness'),
        damping: ref('damping'),
        mass: 1,
        channel: 'translateY',
        reducedMotion: 'opacity-fade',
      },
    },
    buildContract: {
      layout: 'flex',
      web: 'React + StyleX',
      native: 'React Native Text + Yoga',
      requirements: [
        'Use resolved region bindings and transition topology, not hardcoded replacement geometry',
        'Maintain natural text heights, 44pt minimum iOS control targets and safe areas',
        'Native font scaling stays enabled; reflow topology changes with text scale',
        'Reduced motion substitutes a short opacity transition with no spatial movement',
        'Final rendering and task proofs required before accepted status',
      ],
    },
  };
  for (const [id, row] of Object.entries(content)) {
    machine.content![id] = {
      ...copy(row.default, row.compact),
      source: 'examples/vela/content.json — authored product copy',
    };
    machine.content![id + '-expanded'] = {
      ...copy(row.expanded, row.expanded),
      source:
        'examples/vela/content.json — synthetic long-copy stress fixture, not human evidence',
    };
  }
  for (const state of machine.states) {
    for (const region of state.regions) {
      region.bindings.persistentActions = [
        'detail',
        'active',
        'complete',
      ].includes(state.id)
        ? 1
        : 0;
      region.bindings.actionDockMaxHeight = op('mul', ref('height'), 0.45);
    }
  }
  const colors = fieldNotes
    ? {
        canvas: '#f5efe5',
        surface: '#fffaf2',
        ink: '#29221d',
        muted: '#6b5145',
        lime: '#8e2b24',
        cobalt: '#e2c2a5',
        'on-lime': '#ffffff',
        'on-cobalt': '#29221d',
      }
    : {
        canvas: '#111310',
        surface: '#232621',
        ink: '#f5f6ed',
        muted: '#b4b9ac',
        lime: '#d5ff3f',
        cobalt: '#3d44e8',
        'on-lime': '#152000',
        'on-cobalt': '#ffffff',
      };
  const directionMetadata = {
    id: direction,
    label: fieldNotes ? 'Field Notes' : 'Momentum',
    shortLabel: fieldNotes ? 'Paper' : 'Ink',
    kind: 'authored' as const,
    source: fieldNotes ? 'examples/vela/DESIGN.md' : 'examples/vela/brief.md',
    finish: fieldNotes ? 'ruled-paper' : 'ink-instrument',
    colorScheme: fieldNotes ? 'light' : 'dark',
    actionLabel: fieldNotes ? 'Terracotta' : 'Electric lime',
    heldLabel: fieldNotes ? 'Warm ochre' : 'Deep cobalt',
    choreography: {
      durationSeconds: fieldNotes ? 0.42 : 0.8,
      staggerSeconds: fieldNotes ? 0.025 : 0.065,
    },
  };
  const semanticColors = {
    ...colors,
    action: colors.lime,
    held: colors.cobalt,
    'on-action': colors['on-lime'],
    'on-held': colors['on-cobalt'],
    border: fieldNotes ? '#b4a294' : '#41473d',
    separator: fieldNotes ? '#d1c2b5' : '#353a32',
    focus: fieldNotes ? '#8e2b24' : '#d5ff3f',
  };
  const palette = analyzePalette({
    system: {
      tokens: semanticColors,
      roles: [
        {
          id: 'body',
          foreground: 'ink',
          background: 'canvas',
          use: 'text',
          source: ['Vela visual brief'],
        },
        {
          id: 'muted',
          foreground: 'muted',
          background: 'surface',
          use: 'text',
          source: ['Vela visual brief'],
        },
        {
          id: 'primary-action',
          foreground: 'on-action',
          background: 'action',
          use: 'text',
          source: ['Vela visual brief'],
        },
        {
          id: 'session',
          foreground: 'on-held',
          background: 'held',
          use: 'text',
          source: ['Vela visual brief'],
        },
        {
          id: 'surface-text',
          foreground: 'ink',
          background: 'surface',
          use: 'text',
          source: [brief.source],
        },
        {
          id: 'canvas-secondary',
          foreground: 'muted',
          background: 'canvas',
          use: 'text',
          source: [brief.source],
        },
        {
          id: 'focus',
          foreground: 'focus',
          background: 'canvas',
          adjacentBackgrounds: ['surface', 'held'],
          use: 'non-text',
          source: [brief.source],
        },
      ],
    },
  });
  if (palette.summary.status !== 'pass')
    throw Error(`Vela ${direction} declared palette roles failed`);
  const search = searchEnergy({
    program,
    options: { maxEvaluations: 4096, beamWidth: 16, rounds: 12, limit: 6 },
  });
  if (!search.candidates.length) throw new Error('No admissible design');
  let assignment = search.candidates[0]!.assignment;
  let selection: unknown = {
    policy:
      'deterministic finite-pool candidate, authored direction; not aesthetic validation',
    modelCalled: false,
  };
  try {
    const recorded = JSON.parse(
      await readFile(
        fieldNotes
          ? 'examples/vela/choice.field-notes.json'
          : 'examples/vela/choice.momentum-v2.json',
        'utf8',
      ),
    );
    if (recorded.programIdentity !== search.programIdentity) {
      if (!process.argv.includes('--reselect-math'))
        throw new Error(
          'Saved Vela choice is stale; reselect after a policy edit',
        );
    } else {
      assignment = recorded.assignment;
      selection = recorded.selection;
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  const handoff = createDesignHandoff({ program, assignment, machine });
  const motion = summarizeMotion({
    spring: {
      mass: 1,
      stiffness: handoff.assignment.stiffness!,
      damping: handoff.assignment.damping!,
    },
    coordinate: { unit: 'dp', from: 32, to: 0 },
    durationSeconds: 2,
  });
  const replay = replayDesignHandoff({
    program,
    machine,
    recipe: handoff,
    scenario: program.scenarios[0]!.values,
  });
  await mkdir('examples/vela', { recursive: true });
  await mkdir('artifacts/vela', { recursive: true });
  await writeFile(
    fieldNotes
      ? 'examples/vela/problem.field-notes.json'
      : 'examples/vela/problem.json',
    JSON.stringify({ program, machine }, null, 2) + '\n',
  );
  await writeFile(
    fieldNotes
      ? 'examples/vela/design.field-notes.generated.json'
      : 'examples/vela/design.generated.json',
    JSON.stringify(
      {
        direction: directionMetadata,
        colors: semanticColors,
        handoff,
        palette,
        motion,
        selection,
      },
      null,
      2,
    ) + '\n',
  );
  await writeFile(
    fieldNotes
      ? 'artifacts/vela/search.field-notes.json'
      : 'artifacts/vela/search.json',
    JSON.stringify({ search, replay }, null, 2) + '\n',
  );
  console.log(
    JSON.stringify(
      {
        statistics: search.statistics,
        assignment: handoff.assignment,
        palette,
        motion,
        replay: replay.status,
      },
      null,
      2,
    ),
  );
}
await compileDirection('momentum');
await compileDirection('field-notes');
