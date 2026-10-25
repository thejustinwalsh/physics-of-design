import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import session from '../design-field/gallery-session.json';
import {
  DESIGN_FIELD_MOTION_ROLES as roles,
  DESIGN_FIELD_VARIABLE_LABELS as label,
} from '../../src/design-field-vocabulary';
import { createDomSurfaceRecipe, DOM_SURFACE_CSS } from '../../src/dom-surface';
const scenarios = [
  { id: 'phone', label: 'Phone', width: 390, height: 844, textScale: 1 },
  { id: 'ipad', label: 'iPad', width: 834, height: 1194, textScale: 1 },
  { id: 'desktop', label: 'Desktop', width: 1440, height: 1000, textScale: 1 },
  {
    id: 'phone-large',
    label: 'Phone · 2× text',
    width: 390,
    height: 844,
    textScale: 2,
  },
];
const eq = (a, b) =>
  JSON.stringify(Object.entries(a).sort()) ===
  JSON.stringify(Object.entries(b).sort());
const num = (n) => (Number.isFinite(n) ? Number(n.toFixed(3)) : 'unknown');
const fontUrl = (file) => `../assets/${file.split('/').at(-1)}`;
const button = {
  border: '1px solid currentColor',
  background: 'transparent',
  color: 'inherit',
  padding: '10px 14px',
  cursor: 'pointer',
  minHeight: 44,
};
const code = {
  fontFamily: 'ui-monospace,monospace',
  fontSize: 12,
  overflowWrap: 'anywhere',
};
function download(value, name) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }),
  );
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function Fixture({ tokens: t, scenario: s, stage }) {
  const host = useRef(null),
    scene = useRef(null),
    media = useRef(null),
    [scale, setScale] = useState(1),
    [height, setHeight] = useState(400);
  useLayoutEffect(() => {
    const outer = new ResizeObserver(([e]) =>
      setScale(Math.min(1, e.contentRect.width / s.width)),
    );
    outer.observe(host.current);
    return () => outer.disconnect();
  }, [s.width]);
  useLayoutEffect(() => {
    const inner = new ResizeObserver(([e]) => setHeight(e.contentRect.height));
    inner.observe(scene.current);
    return () => inner.disconnect();
  }, []);
  const reveal = (part) => {
    const target = part === 'expression' ? media.current : scene.current;
    const scroller = host.current;
    if (!target || !scroller) return;
    scroller.scrollTop +=
      target.getBoundingClientRect().top -
      scroller.getBoundingClientRect().top -
      scroller.clientTop;
    if (part === 'expression') target.focus({ preventScroll: true });
  };
  useLayoutEffect(() => {
    reveal(stage);
  }, [stage, s.id, scale, height]);
  const finishes = [t.roughness, t.counterRoughness].map((roughness, i) =>
    createDomSurfaceRecipe({
      material: i ? 'brushed-metal' : 'enamel',
      baseColor: i ? '#b7bec4' : '#a32d14',
      ink: '#171b18',
      roughness,
      radius: 0,
      elevation: 0,
    }),
  );
  const b = session.brief,
    pad = s.width < 600 ? 20 : 36,
    available = Math.min(t.contentMax, s.width - pad * 2);
  return (
    <>
      <div
        style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}
      >
        <button type="button" style={button} onClick={() => reveal('reading')}>
          Show type & action
        </button>
        <button
          type="button"
          style={button}
          onClick={() => reveal('expression')}
        >
          Show image & finish
        </button>
      </div>
      <p style={{ fontSize: 12, lineHeight: 1.5 }}>
        Scrollable viewport · full content preserved. Use these controls to
        reach each consequence, including at 2× text.
      </p>
      <div
        ref={host}
        role="region"
        aria-label="Scrollable design-field preview"
        tabIndex={0}
        style={{
          minWidth: 0,
          width: '100%',
          background: 'var(--paper,#f2f0e6)',
          color: 'var(--ink,#171b18)',
          border: '1px solid #999',
          overflow: 'auto',
          maxHeight: 560,
        }}
        data-field-preview
        data-field-scenario={s.id}
      >
        <div
          style={{
            width: s.width * scale,
            height: height * scale,
            position: 'relative',
          }}
        >
          <div
            ref={scene}
            style={{
              width: s.width,
              transform: `scale(${scale})`,
              transformOrigin: 'top left',
              paddingBottom: pad,
              position: 'absolute',
              top: 0,
              left: 0,
            }}
          >
            <div style={{ width: available, margin: 'auto', paddingTop: pad }}>
              <h3
                data-field-title
                style={{
                  margin: 0,
                  padding: 0,
                  fontFamily: 'FieldSessionTitle',
                  fontWeight: b.titleFont.weight,
                  fontSize:
                    Math.min(t.titleSize, s.width * 0.135) * s.textScale,
                  lineHeight: b.typography.titleLeading,
                  letterSpacing: `${b.typography.titleTrackingEm}em`,
                  fontOpticalSizing: b.titleFont.opticalSizing,
                  fontVariationSettings:
                    Object.entries(b.titleFont.axes ?? {})
                      .map(([tag, v]) => `"${tag}" ${v}`)
                      .join(',') || 'normal',
                }}
              >
                {b.title}
              </h3>
              <p
                data-field-body
                style={{
                  margin: `${t.gap}px 0 0`,
                  padding: 0,
                  width: Math.min(t.contentMax * 0.55, available, 680),
                  fontFamily: 'FieldSessionBody',
                  fontWeight: b.bodyFont.weight,
                  fontSize: t.bodySize * s.textScale,
                  lineHeight: t.leading,
                  letterSpacing: `${b.typography.bodyTrackingEm}em`,
                  fontOpticalSizing: b.bodyFont.opticalSizing,
                  fontVariationSettings:
                    Object.entries(b.bodyFont.axes ?? {})
                      .map(([tag, v]) => `"${tag}" ${v}`)
                      .join(',') || 'normal',
                }}
              >
                {b.body}
              </p>
              <a
                href="#field-evidence"
                style={{
                  ...button,
                  display: 'inline-flex',
                  alignItems: 'center',
                  textDecoration: 'none',
                  marginTop: t.gap,
                  fontFamily: 'FieldSessionBody',
                  fontSize: 16,
                  background: 'var(--signal,#d8f42c)',
                  color: '#171b18',
                }}
              >
                {b.action} ↘
              </a>
              <div
                ref={media}
                data-field-media
                role="group"
                aria-label="Current image and finish consequences"
                tabIndex={-1}
                style={{
                  display: 'flex',
                  alignItems: 'stretch',
                  gap: 0,
                  marginTop: t.gap,
                }}
              >
                <img
                  alt="Original illustrated still life"
                  src="../still-life.svg"
                  style={{
                    display: 'block',
                    width: available * t.imageShare,
                    aspectRatio: t.imageAspect,
                    objectFit: 'cover',
                    objectPosition: `${b.image.focalX * 100}% ${b.image.focalY * 100}%`,
                  }}
                />
                <div
                  style={{ flex: 1, display: 'flex', flexDirection: 'column' }}
                >
                  {finishes.map((recipe, i) => (
                    <div
                      key={i}
                      className={recipe.className}
                      {...recipe.attributes}
                      title={`${recipe.material.label}; declared roughness ${recipe.input.roughness}`}
                      style={{
                        ...recipe.cssVariables,
                        flex: 1,
                        transform: 'none',
                        boxShadow: 'none',
                      }}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
function FieldSession() {
  const original = session.stages.map((stage) =>
    Math.max(
      0,
      stage.alternatives.findIndex((a) => eq(a.assignment, stage.assignment)),
    ),
  );
  const [indices, setIndices] = useState(original),
    [scenarioIndex, setScenario] = useState(0),
    [tab, setTab] = useState('reading');
  const reading = session.stages[0].alternatives[indices[0]],
    expression = session.stages[1].alternatives[indices[1]],
    tokens = { ...reading.assignment, ...expression.assignment };
  const readingChanged = !eq(reading.assignment, session.stages[0].assignment),
    exact =
      !readingChanged &&
      eq(expression.assignment, session.stages[1].assignment);
  const stage = session.stages.find((s) => s.id === tab),
    stageIndex = tab === 'reading' ? 0 : 1,
    current = stage.alternatives[indices[stageIndex]],
    scenario = scenarios[scenarioIndex];
  const factors = current.factors.filter((f) => f.scenario === scenario.id),
    work = stage.work.find((w) => w.alternative === current.id);
  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent('design-field-preview', {
        detail: {
          identity: session.identity,
          tokens,
          exactSavedChoice: exact,
          conditionedExpressionStale: readingChanged,
          neuralCalls: 0,
        },
      }),
    );
  }, [indices[0], indices[1]]);
  const reset = () => setIndices(original);
  return (
    <section
      id="field-session"
      data-field-session
      style={{
        padding: '80px max(20px,5vw)',
        background: 'var(--ink,#171b18)',
        color: 'var(--paper,#f2f0e6)',
      }}
    >
      <style>{`${DOM_SURFACE_CSS}@font-face{font-family:FieldSessionTitle;src:url(${fontUrl(session.brief.titleFont.file)});font-weight:${session.brief.titleFont.weight}}@font-face{font-family:FieldSessionBody;src:url(${fontUrl(session.brief.bodyFont.file)});font-weight:${session.brief.bodyFont.weight}}.field-grid{display:flex;flex-wrap:wrap;gap:32px}.field-grid>div{flex:1 1 320px;min-width:0}.field-table{border-collapse:collapse;width:100%;font-size:13px}.field-table td,.field-table th{border-bottom:1px solid #8886;padding:9px 7px;text-align:left;vertical-align:top}.field-table th{font-weight:600}`}</style>
      <p
        style={{
          textTransform: 'uppercase',
          letterSpacing: '.15em',
          fontSize: 12,
        }}
      >
        An executable design field / {session.brief.sourceKind}
      </p>
      <h1
        style={{
          fontSize: 'clamp(36px,5vw,72px)',
          lineHeight: 1,
          letterSpacing: '-.04em',
          maxWidth: 900,
          margin: '20px 0',
        }}
      >
        Compare a direction.
      </h1>
      <p style={{ maxWidth: 760, lineHeight: 1.6 }}>{session.brief.intent}</p>
      <p data-field-ledger-summary style={{ ...code, maxWidth: 900 }}>
        {session.measurement.cells} measured text cells ·{' '}
        {session.statistics.evaluated} numeric alternatives ·{' '}
        {session.selection.neuralCalls} saved local neural readouts · unchanged
        replay: {session.replay.neuralCalls} neural calls. No model runs when
        you compare below.
      </p>
      <div className="field-grid">
        <div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {session.stages.map((s) => (
              <button
                key={s.id}
                type="button"
                aria-pressed={tab === s.id}
                onClick={() => setTab(s.id)}
                style={{
                  ...button,
                  background:
                    tab === s.id ? 'var(--signal,#d8f42c)' : 'transparent',
                  color: tab === s.id ? '#171b18' : 'inherit',
                }}
              >
                {s.id === 'reading' ? '1 · Type & space' : '2 · Image & finish'}
              </button>
            ))}
          </div>
          <p style={{ fontSize: 14, lineHeight: 1.5 }}>
            {tab === 'reading'
              ? 'Each option passed measured text and authored action-reach guards. Picking another makes the next stage’s conditioned choice stale.'
              : 'These options were calculated using the saved type/space choice. Motion is a categorical role, not a numerical physical force.'}
          </p>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            Retained {tab} alternative
            <select
              data-field-alternative
              aria-label={`Retained ${tab} alternative`}
              value={indices[stageIndex]}
              onChange={(e) =>
                setIndices((old) =>
                  old.map((v, i) =>
                    i === stageIndex ? Number(e.target.value) : v,
                  ),
                )
              }
              style={{
                padding: 12,
                minHeight: 44,
                background: 'var(--paper,#f2f0e6)',
                color: 'var(--ink,#171b18)',
                maxWidth: '100%',
              }}
            >
              {stage.alternatives.map((a, i) => (
                <option key={a.id} value={i}>
                  {tab === 'reading'
                    ? `${a.assignment.titleSize}px title / ${a.assignment.bodySize}px body · leading ${a.assignment.leading} · content cap ${a.assignment.contentMax}px · gap ${a.assignment.gap}px`
                    : `${Math.round(a.assignment.imageShare * 100)}% image · ratio ${a.assignment.imageAspect}:1 · finish ${a.assignment.roughness}/${a.assignment.counterRoughness} · ${roles[a.assignment.motionRole]}`}
                  {eq(a.assignment, stage.assignment) ? ' · saved choice' : ''}
                </option>
              ))}
            </select>
          </label>
          <p style={{ fontSize: 12, lineHeight: 1.5 }}>
            Base choices. The selected viewport and text scale determine the
            rendered title size and available measure.
          </p>
          <details style={{ marginTop: 16 }}>
            <summary>Technical preference cost</summary>
            <p style={{ fontSize: 13, lineHeight: 1.6 }}>
              {String(current.energy)} under this saved authored objective.
              Equal costs mean this objective does not rank those options; they
              are not equal-quality claims. Compare actual outcomes and
              relationships before choosing.
            </p>
          </details>
          <dl
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: '8px 20px',
              fontSize: 14,
            }}
          >
            {Object.entries(current.assignment).map(([key, value]) => (
              <React.Fragment key={key}>
                <dt style={{ flex: '1 0 65%' }}>{label[key] ?? key}</dt>
                <dd style={{ margin: 0, flex: '0 0 25%', ...code }}>
                  {key === 'motionRole' ? roles[value] : value}
                </dd>
              </React.Fragment>
            ))}
          </dl>
          <p
            data-field-evidence-status
            style={{
              padding: 14,
              border: '1px solid #ffffff55',
              fontSize: 14,
              lineHeight: 1.5,
            }}
          >
            {readingChanged
              ? 'Expression stage stale: typography changed. Preview only; rerun the conditioned stage before using its old factor evidence.'
              : exact
                ? 'Saved choice: its exact standalone fixture passed six Chromium layout scenarios. This embedded preview is a new render, not that saved receipt.'
                : 'Retained mathematical alternative: source text cells were measured, but this full combination has not received a finalist renderer check.'}
          </p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" onClick={reset} style={button}>
              Restore saved choice
            </button>
            <button
              type="button"
              onClick={() =>
                download(
                  {
                    version: 1,
                    sessionIdentity: session.identity,
                    sourceIdentity: session.measurement.identity,
                    selectedTokens: tokens,
                    selectedAlternativeIds: [reading.id, expression.id],
                    status: exact
                      ? 'saved-choice-copy'
                      : 'preview-needs-revalidation',
                    conditionedExpressionStale: readingChanged,
                    neuralCalls: 0,
                  },
                  'design-field-choice.json',
                )
              }
              style={button}
            >
              Export current choice
            </button>
          </div>
        </div>
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              display: 'flex',
              gap: 8,
              flexWrap: 'wrap',
              marginBottom: 12,
            }}
          >
            {scenarios.map((s, i) => (
              <button
                key={s.id}
                type="button"
                aria-pressed={scenarioIndex === i}
                onClick={() => setScenario(i)}
                style={{
                  ...button,
                  background: scenarioIndex === i ? '#ffffff20' : 'transparent',
                }}
              >
                {s.label}
              </button>
            ))}
          </div>
          <Fixture tokens={tokens} scenario={scenario} stage={tab} />
          <p style={{ fontSize: 12, lineHeight: 1.5 }}>
            Scaled viewport preview: {scenario.width}px · text scale{' '}
            {scenario.textScale}. Shared DOM surface recipes illustrate two
            roughness parameters; they do not reproduce the gallery’s physically
            based material renderer. Motion role: {roles[tokens.motionRole]}.
          </p>
        </div>
      </div>
      <details
        id="field-evidence"
        style={{ marginTop: 36, scrollMarginTop: 24 }}
      >
        <summary style={{ fontSize: 20 }}>
          Inspect relationships, costs and saved evidence
        </summary>
        {readingChanged && tab === 'expression' ? (
          <p>
            Conditioning changed. Return to the saved reading choice to inspect
            applicable expression evidence, or rerun the executable session.
          </p>
        ) : (
          <div
            data-field-relationships
            style={{ display: 'flex', flexDirection: 'column', gap: 12 }}
          >
            {factors.map((f) => (
              <article
                key={f.id}
                style={{
                  borderTop: '1px solid #8886',
                  paddingBlock: 14,
                  minWidth: 0,
                }}
              >
                <h4
                  style={{
                    fontSize: 15,
                    margin: '0 0 10px',
                    overflowWrap: 'anywhere',
                  }}
                >
                  {f.id} · {scenario.label}
                </h4>
                <dl
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: '8px 16px',
                    fontSize: 13,
                    margin: 0,
                  }}
                >
                  <dt>Observed value</dt>
                  <dd style={{ margin: 0 }}>{num(f.value)}</dd>
                  <dt>Preference contribution</dt>
                  <dd style={{ margin: 0 }}>
                    {f.mode === 'hard'
                      ? `Hard guard · ${f.residual === 0 ? 'pass' : 'fail'}`
                      : num(f.energy)}
                  </dd>
                </dl>
                <p style={{ ...code, lineHeight: 1.6, marginBottom: 0 }}>
                  Evidence · {f.provenance.kind}
                  <br />
                  {f.provenance.source}
                </p>
              </article>
            ))}
          </div>
        )}
        <details style={{ marginTop: 20 }}>
          <summary>Saved-choice pressures and alternative work</summary>
          <p style={{ fontSize: 13 }}>
            Finite differences describe this authored preference function per
            variable unit. They are not physical forces, perceptual
            measurements, or universal quality scores. Categorical motion roles
            have no slope.
          </p>
          <ul>
            {stage.pressures.map((p) => (
              <li key={p.variable} style={{ margin: '10px 0' }}>
                <strong>{label[p.variable] ?? p.variable}</strong>:{' '}
                {p.variable === 'motionRole'
                  ? 'categorical alternatives; slope not interpreted'
                  : `negative preference slope ${num(p.negativeEnergySlope)} per ${p.unit}`}
                <span style={{ ...code, display: 'block' }}>
                  {p.probes
                    .map(
                      (n) =>
                        `${n.value}: ${'energyChange' in n ? `Δ ${num(n.energyChange)}, ${n.hardFailures} hard failures` : n.status}`,
                    )
                    .join(' / ')}
                </span>
              </li>
            ))}
          </ul>
          <p>
            Selected alternative versus saved choice: Δ preference cost{' '}
            {num(work?.totalPreferenceChange ?? 0)}. Individual changed
            contributions remain in the exported session.
          </p>
        </details>
        <details style={{ marginTop: 16 }}>
          <summary>Actual call ledger, source identity and replay</summary>
          <p style={{ fontSize: 13 }}>
            The brief was produced by a labeled synthetic interview, not
            silently attributed to a human. The saved selection mode is{' '}
            {session.selection.mode}. Current local comparison state is separate
            from the saved machine recipe.
          </p>
          <div
            data-field-call-ledger
            style={{ display: 'flex', flexDirection: 'column', gap: 16 }}
          >
            {session.ledger.map((entry, i) => (
              <article
                key={i}
                style={{
                  borderTop: '1px solid #8886',
                  paddingTop: 12,
                  minWidth: 0,
                }}
              >
                <p style={{ ...code, lineHeight: 1.6 }}>
                  {entry.command}
                  <br />
                  {entry.function}
                </p>
                <p style={{ fontSize: 13 }}>{entry.evidenceKind}</p>
                <p style={{ ...code, lineHeight: 1.6 }}>
                  Result hash
                  <br />
                  {entry.resultHash}
                </p>
              </article>
            ))}
          </div>
          <p style={code}>
            Source-bound session: {session.identity}
            <br />
            Rerun: DESIGN_SEMIF_BIN=./scripts/semif-local.sh node
            scripts/prove-design-field.mjs --selector --publish-fixture
          </p>
          <button
            type="button"
            onClick={() => download(session, 'design-field-session.json')}
            style={button}
          >
            Export saved evidence
          </button>
        </details>
      </details>
    </section>
  );
}

export default React.memo(FieldSession);
