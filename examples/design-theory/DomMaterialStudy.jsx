import React, { useMemo, useRef, useState } from 'react';
import { createDomSurfaceRecipe, DOM_SURFACE_CSS } from '../../src/dom-surface';
import { useDomMaterial } from './useDomMaterial';
import { InteractionRange } from './InteractionRange.jsx';
import presets from '../dom-surfaces/gpu-recipes.json';

const copy = [
  [
    'Paper',
    'A little friction.',
    'Fine grain. Broad light. A surface that asks you to slow down.',
    'READ / MARK / KEEP',
  ],
  [
    'Enamel',
    'Turn up the color.',
    'A compact highlight moves across a smooth, saturated finish.',
    'BRIGHT / SMOOTH / BOLD',
  ],
  [
    'Brushed metal',
    'Follow the grain.',
    'Fine directional lines stretch the light into a band.',
    'LINE / DIRECTION / EDGE',
  ],
  [
    'Soft glass',
    'Let the room in.',
    'A softened backdrop and a quiet tint. Clear content stays in front.',
    'LAYER / FILTER / READ',
  ],
];
function MaterialCard({ preset, index, roughness, lightTarget }) {
  const ref = useRef(null),
    statusRef = useRef(null);
  const recipe = useMemo(
    () =>
      createDomSurfaceRecipe({
        ...preset,
        ...(roughness === undefined ? {} : { roughness }),
      }),
    [preset, roughness],
  );
  useDomMaterial(ref, recipe, { id: 'study', target: lightTarget, statusRef });
  const [name, title, body, footer] = copy[index];
  return (
    <article
      ref={ref}
      className="dt-dom-surface dom-study-card"
      data-dom-surface={preset.material}
      style={recipe.cssVariables}
      aria-label={`${name} lit material surface`}
    >
      <div className="dom-study-top">
        <span className="dt-dom-content dom-study-label">
          <span data-material-contrast>
            0{index + 1} / {name.toUpperCase()}
          </span>
        </span>
        <span aria-hidden="true" className="dom-study-symbol">
          {['≋', '✳', '↗', '◌'][index]}
        </span>
      </div>
      <div className="dt-dom-content dom-study-copy">
        <h3 data-material-contrast>{title}</h3>
        <p data-material-contrast>{body}</p>
      </div>
      <div className="dt-dom-content dom-study-footer">
        <span data-material-contrast>{footer}</span>
      </div>
      <span
        ref={statusRef}
        data-dom-renderer-status
        data-material-contrast
        className="dom-study-renderer"
      >
        CSS preview · preparing material light
      </span>
    </article>
  );
}
/** The gallery's shared GSAP/Lenis clock drives the selected retained DOM adapter. */
export function DomMaterialStudy({
  roughness,
  materialName,
  onRoughnessChange,
  material,
  onMaterialChange,
}) {
  const [localMaterial, setLocalMaterial] = useState('enamel');
  const selected = Math.max(
    0,
    presets.findIndex((p) => p.material === (material ?? localMaterial)),
  );
  const [lightDirection, setLightDirection] = useState('pointer');
  const lightTarget =
    lightDirection === 'pointer'
      ? null
      : { x: lightDirection === 'left' ? -0.75 : 0.75, y: -0.3 };
  const [localFinish, setLocalFinish] = useState(null);
  const finish =
    roughness ??
    localFinish ??
    createDomSurfaceRecipe(presets[selected]).input.roughness;
  return (
    <section className="dom-study" aria-label="Light on everyday surfaces">
      <style>{DOM_SURFACE_CSS + studyCss}</style>
      <div className="dom-study-heading">
        <div>
          <span className="dom-study-eyebrow">LIGHT, ON THE PAGE</span>
          <h2>
            Give the interface
            <br />
            some substance.
          </h2>
        </div>
        <p>
          Move across the surfaces. Scroll past them. The light and shadow
          follow one shared rig.
          {materialName ? ` Current study: ${materialName}.` : ''}
        </p>
      </div>
      <div
        className="dom-study-tabs"
        role="group"
        aria-label="Choose a material"
      >
        {presets.map((preset, index) => (
          <button
            key={preset.material}
            type="button"
            aria-pressed={selected === index}
            onClick={() => {
              const finish = createDomSurfaceRecipe(preset).input.roughness;
              if (onMaterialChange) onMaterialChange(preset.material, finish);
              else {
                setLocalMaterial(preset.material);
                setLocalFinish(finish);
              }
            }}
          >
            {copy[index][0]}
          </button>
        ))}
      </div>
      <label className="dom-study-finish">
        <span>Finish · {finish.toFixed(2)}</span>
        <InteractionRange
          aria-label="Surface finish roughness"
          min="0.05"
          max="0.95"
          step="0.01"
          value={finish}
          onChange={(event) => {
            const next = Number(event.target.value);
            if (onRoughnessChange) onRoughnessChange(next);
            else setLocalFinish(next);
          }}
        />
        <small>Smooth highlight ↔ broad, matte light</small>
      </label>
      <div className="dom-study-tabs" role="group" aria-label="Light direction">
        {[
          ['left', 'Light from left'],
          ['right', 'Light from right'],
          ['pointer', 'Follow pointer'],
        ].map(([id, label]) => (
          <button
            key={id}
            type="button"
            aria-pressed={lightDirection === id}
            onClick={() => setLightDirection(id)}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="dom-study-grid">
        <MaterialCard
          preset={presets[selected]}
          index={selected}
          roughness={finish}
          lightTarget={lightTarget}
        />
      </div>
      <p className="dom-study-note">
        Normal and roughness textures shape a bounded Lambert/GGX material plane
        beneath ordinary HTML. CSS remains the fallback. Glass uses alpha tint
        and backdrop blur, not refraction. Ambient fill and exposure are
        authored.
      </p>
    </section>
  );
}
const studyCss = `
.dom-study{position:relative;margin:36px 0 12px;padding:clamp(20px,4vw,48px);border-radius:30px;background:radial-gradient(ellipse at 90% 64%,#e67a4c 0,transparent 44%),linear-gradient(145deg,#172f2c,#294542 70%);color:#f5edd5;overflow:hidden;}
.dom-study-heading{display:flex;justify-content:space-between;align-items:flex-end;gap:32px;margin-bottom:32px;}.dom-study-eyebrow{font-size:11px;font-weight:800;letter-spacing:.16em;}.dom-study-heading h2{font:inherit;font-size:clamp(32px,4.4vw,62px);line-height:1.02;letter-spacing:-.045em;font-weight:800;margin:12px 0 0;}.dom-study-heading>p{max-width:270px;font-size:14px;line-height:1.55;margin:0;color:#dedfce;}
.dom-study-finish{display:flex;flex-direction:column;gap:8px;width:min(100%,420px);margin:0 0 26px;color:#f5edd5;}.dom-study-finish>span{font-size:13px;font-weight:750;font-variant-numeric:tabular-nums;}.dom-study-finish input{width:100%;min-height:36px;accent-color:#f4d16c;}.dom-study-finish small{font-size:11px;color:#dedfce;}
.dom-study-tabs{display:flex;flex-wrap:wrap;gap:8px;margin:0 0 24px;}.dom-study-tabs button{font:inherit;font-size:12px;font-weight:750;min-height:44px;padding:11px 17px;border:1px solid #dfdfc866;border-radius:999px;background:transparent;color:#f5edd5;cursor:pointer;}.dom-study-tabs button[aria-pressed="true"]{background:#f4d16c;color:#292318;border-color:#f4d16c;}.dom-study-tabs button:focus-visible{outline:3px solid #fff;outline-offset:3px;}.dom-study-grid{display:flex;flex-wrap:wrap;gap:26px;}.dom-study-card{padding:clamp(24px,4vw,44px);min-height:360px;flex:1 1 420px;display:flex;flex-direction:column;justify-content:space-between;gap:22px;}.dom-study-top{display:flex;justify-content:space-between;align-items:center;gap:12px;}.dom-study-label{padding:6px 8px;font-size:11px;letter-spacing:.1em;font-weight:800;}.dom-study-symbol{position:relative;z-index:1;font-size:90px;line-height:.8;font-weight:700;}.dom-study-copy{padding:13px 15px;}.dom-study-copy h3{font:inherit;font-size:clamp(36px,6vw,72px);font-weight:800;line-height:1.06;letter-spacing:-.04em;margin:0 0 12px;}.dom-study-copy p{font-size:14px;line-height:1.5;max-width:33ch;margin:0;}.dom-study-footer{padding:7px 9px;align-self:flex-start;font-size:10px;letter-spacing:.12em;font-weight:800;}.dom-study-renderer{position:relative;z-index:1;font-size:10px;line-height:1.5;}.dom-study-note{font-size:12px;line-height:1.5;color:#dedfce;max-width:70ch;margin:28px 0 0;}
@media(max-width:680px){.dom-study-heading{display:block;}.dom-study-heading>p{margin-top:20px;max-width:100%;}.dom-study-grid{gap:22px;}.dom-study-card{min-height:280px;}.dom-study{border-radius:20px;}}
`;
