import { createDomSurfaceRecipe, DOM_SURFACE_CSS } from '../../src/dom-surface';
import { probeSurface } from '../../src/surface';
import { domSurfaceLinearColor } from '../../src/dom-surface-shading';
import { createDomLightController } from '../../src/browser-dom-light';
export function mount(inputs) {
  const style = document.createElement('style');
  style.textContent =
    DOM_SURFACE_CSS +
    `
  *{box-sizing:border-box}body{margin:0;background:#111b1d;color:#e9eadc;font:15px Arial,sans-serif}.proof-head{padding:32px 40px 26px;display:flex;justify-content:space-between;align-items:end;border-bottom:1px solid #ffffff26}.proof-head h1{font-size:38px;line-height:1;letter-spacing:-.05em;margin:8px 0 0}.proof-head p{max-width:34ch;line-height:1.5;margin:0;color:#c4d1cc}.proof-stage{display:flex;flex-wrap:wrap;gap:22px;padding:28px 40px;background:radial-gradient(ellipse at 80% 90%,#39514a,transparent 70%)}.proof-card{position:relative;flex:0 0 calc(50% - 11px);min-height:360px;padding:30px;display:flex;flex-direction:column;justify-content:space-between;gap:20px}.proof-card h2{font-size:42px;line-height:.96;letter-spacing:-.055em;margin:0;max-width:8ch}.proof-card p{line-height:1.45;max-width:28ch;margin:12px 0 0}.proof-card small{font-size:10px;font-weight:800;letter-spacing:.14em}.proof-card button{font:inherit;font-size:11px;font-weight:700;letter-spacing:.05em;background:transparent;color:inherit;border:1px solid currentColor;padding:8px 14px;min-height:38px;border-radius:3px;cursor:pointer}.proof-card .dt-dom-content{background:transparent}.proof-card footer{display:flex;align-items:center;justify-content:space-between}.proof-card footer span{font-size:11px;font-weight:700}.proof-card [data-contrast]{position:relative;z-index:1}.controls{padding:22px 40px;display:flex;gap:20px;align-items:center}.controls label{display:flex;flex-direction:column;width:400px;gap:8px}.controls input{width:100%;height:36px;accent-color:#d7f45c}.controls button{font:inherit;background:#d7f45c;color:#152014;padding:12px 20px;border:0}.proof-note{padding:0 40px 28px;color:#aabbaf;max-width:85ch;font-size:12px;line-height:1.6}.spacer{height:1600px}.proof-card[data-dom-surface=soft-glass] .dt-dom-content{background:rgb(var(--dt-base-channels)/var(--dt-shield));padding:8px;border-radius:6px}.proof-card:focus-within{outline:3px solid #d7f45c;outline-offset:5px}@media(max-width:650px){.proof-stage{padding:20px;gap:20px}.proof-card{flex-basis:100%;min-height:320px}.proof-head{padding:24px;display:block}.proof-head p{margin-top:20px}.controls{padding:20px;flex-wrap:wrap}.controls label{width:100%}.proof-head h1{font-size:32px}.proof-note{padding:0 20px 24px}}`;
  document.head.append(style);
  document.body.innerHTML = `<header class="proof-head"><div><small>DESIGN THEORY / MATERIAL INSTRUMENT 01</small><h1>Light finds the surface.</h1></div><p>One lighting rig. Four finishes. Live HTML remains selectable, readable and operable.</p></header><div class="controls"><label>Enamel roughness <output id="finish-value">0.24</output><input id="finish" aria-label="Enamel roughness" type="range" min="0.02" max="1" step="0.01" value="0.24"></label><button id="replay">Move the light</button><span id="action-status" role="status">Ready</span></div><main class="proof-stage"></main><p class="proof-note">Lambert / GGX plane lighting with procedural normal and roughness maps. Glass is an alpha composite with CSS backdrop blur. Ambient fill and tone mapping are authored. The content above is ordinary HTML.</p><div class="spacer"></div>`;
  const copy = [
    [
      'Keep the grain.',
      'Uncoated stock. Soft light breaks across the fibers.',
      'READ / MARK / KEEP',
    ],
    [
      'Make it vivid.',
      'Colored pigment under a smooth, reflective finish.',
      'PIGMENT / GLAZE / LIGHT',
    ],
    [
      'Follow the cut.',
      'Directional grooves catch a narrow ribbon of light.',
      'BRUSH / REFLECT / REPEAT',
    ],
    [
      'Let light through.',
      'A translucent tint holds its place over the room.',
      'TRANSMIT / FILTER / READ',
    ],
  ];
  const cards = [],
    controllers = [],
    recipes = inputs.map(createDomSurfaceRecipe);
  const stage = document.querySelector('.proof-stage');
  recipes.forEach((recipe, index) => {
    const card = document.createElement('article');
    card.className = 'proof-card dt-dom-surface';
    card.dataset.index = index;
    card.innerHTML = `<small data-contrast>0${index + 1} / ${recipe.material.label.toUpperCase()}</small><div class="dt-dom-content"><h2 data-contrast>${copy[index][0]}</h2><p data-contrast>${copy[index][1]}</p></div><footer class="dt-dom-content"><span data-contrast>${copy[index][2]}</span><button data-contrast>Inspect ↗</button></footer>`;
    stage.append(card);
    cards.push(card);
    controllers.push(
      createDomLightController(card, recipe, {
        clock: 'external',
        renderer: 'webgl',
        scroll: false,
        maxTiltDegrees: 0,
        gpu: { pixelRatio: 1, maxPixels: 500000 },
      }),
    );
    card.querySelector('button').onclick = () =>
      (document.querySelector('#action-status').textContent =
        `Inspecting ${recipe.material.label}`);
  });
  let frame = 0,
    last = 0,
    playing = false,
    t = 0;
  const intervals = [];
  function tick(time) {
    const dt = last ? Math.min(0.05, (time - last) / 1000) : 0;
    if (last) intervals.push(time - last);
    last = time;
    if (playing) {
      t += dt;
      controllers.forEach((c) =>
        c.setLightTarget({ x: Math.sin(t * 1.3), y: Math.cos(t * 0.9) * 0.5 }),
      );
    }
    controllers.forEach((c) => c.sample(dt));
    frame = requestAnimationFrame(tick);
  }
  frame = requestAnimationFrame(tick);
  const change = (index, patch) => {
    recipes[index] = createDomSurfaceRecipe({
      ...recipes[index].input,
      ...patch,
    });
    controllers[index].updateRecipe(recipes[index]);
  };
  document.querySelector('#finish').oninput = (e) => {
    change(1, { roughness: Number(e.target.value) });
    document.querySelector('#finish-value').textContent = Number(
      e.target.value,
    ).toFixed(2);
  };
  document.querySelector('#replay').onclick = () => {
    playing = !playing;
    document.querySelector('#replay').textContent = playing
      ? 'Hold the light'
      : 'Move the light';
  };
  return {
    cards,
    controllers,
    recipes,
    intervals,
    change,
    replace(index, input) {
      recipes[index] = createDomSurfaceRecipe(input);
      controllers[index].updateRecipe(recipes[index]);
      if (index === 1) {
        document.querySelector('#finish').value =
          recipes[index].input.roughness;
        document.querySelector('#finish-value').textContent =
          recipes[index].input.roughness.toFixed(2);
      }
    },
    pose(x, y) {
      playing = false;
      controllers.forEach((c) => {
        c.setLightTarget({ x, y });
        c.sample(1);
      });
    },
    play(value) {
      playing = value;
    },
    oracle(index, output) {
      const recipe = recipes[index].input,
        card = cards[index].getBoundingClientRect(),
        rect = cards[index].querySelector('canvas').getBoundingClientRect();
      const x = Math.floor(rect.x + rect.width / 2),
        y = Math.floor(rect.y + rect.height / 2);
      const px =
          (((x + 0.5 - rect.x) / rect.width - 0.5) * 2 * card.width) /
          card.height,
        py = (0.5 - (y + 0.5 - rect.y) / rect.height) * 2;
      const sample = controllers[index].sample(0),
        light = sample.lightDirection.map(
          (v) => (v * recipe.light.z) / sample.lightDirection[2],
        );
      light[1] *= -1;
      const delta =
        recipe.light.kind === 'point'
          ? [light[0] - px, light[1] - py, light[2]]
          : light;
      const attenuation =
        recipe.light.kind === 'point'
          ? recipe.light.z ** 2 / delta.reduce((s, v) => s + v * v, 0)
          : 1;
      const probe = probeSurface({
        surface: {
          baseColor: domSurfaceLinearColor(recipe.baseColor),
          roughness: recipe.roughness,
          metalness: recipe.metalness,
        },
        view: [-px, -py, 3.5],
        light: delta,
      });
      const term =
          output === 'diffuse' ? probe.diffuseBrdf : probe.specularBrdf,
        color = domSurfaceLinearColor(recipe.light.color);
      const expected = term.map((n, i) => {
        const radiance =
          n *
          probe.terms.nDotL *
          color[i] *
          recipe.light.intensity *
          6 *
          attenuation *
          recipe.exposure;
        const v = radiance / (1 + radiance);
        return (
          255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055)
        );
      });
      return { x: x + scrollX, y: y + scrollY, expected };
    },
    regions() {
      return cards.flatMap((card, index) =>
        [...card.querySelectorAll('[data-contrast]')].map((el) => {
          const r = el.getBoundingClientRect();
          return {
            index,
            x: r.x + scrollX,
            y: r.y + scrollY,
            width: r.width,
            height: r.height,
            color: getComputedStyle(el).color,
          };
        }),
      );
    },
    hideText(value) {
      document
        .querySelectorAll('[data-contrast]')
        .forEach((el) => (el.style.visibility = value ? 'hidden' : 'visible'));
    },
    stop() {
      cancelAnimationFrame(frame);
      playing = false;
    },
    dispose() {
      cancelAnimationFrame(frame);
      controllers.forEach((c) => c.dispose());
    },
  };
}
