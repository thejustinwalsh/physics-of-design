import {
  createDomSurfaceRecipe,
  sampleDomSurfaceLight,
  DOM_SURFACE_CSS,
} from '../../src/dom-surface';
import { createDomLightController } from '../../src/browser-dom-light';
export function mount(inputs) {
  const style = document.createElement('style');
  style.textContent =
    DOM_SURFACE_CSS +
    `*{box-sizing:border-box}body{margin:0;background:#112420;font:16px Arial,sans-serif}.proof-stage{display:flex;flex-wrap:wrap;gap:32px;padding:48px;background:radial-gradient(ellipse at 82% 76%,#e56e43,transparent 50%),repeating-linear-gradient(65deg,#142f2a 0 50px,#27423b 50px 100px)}.proof-card{flex:0 0 calc(50% - 16px);min-height:300px;padding:28px;display:flex;flex-direction:column;justify-content:space-between;gap:24px}.proof-card h2{font-size:32px;letter-spacing:-.035em;margin:0 0 14px}.proof-card p{line-height:1.5;margin:0}.proof-card .dt-dom-content{padding:14px}.proof-card small{font-weight:bold;letter-spacing:.13em}.negative-stage{background:#030405;padding:50px}.negative-stage .proof-card{width:360px;min-height:250px}.spacer{height:1800px}@media(max-width:650px){.proof-stage{padding:24px}.proof-card{flex-basis:100%}}`;
  document.head.append(style);
  const main = document.createElement('main');
  main.className = 'proof-stage';
  document.body.append(main);
  const recipes = inputs.map(createDomSurfaceRecipe),
    cards = [],
    controllers = [];
  const append = (recipe, index, parent) => {
    const card = document.createElement('article');
    card.className = 'dt-dom-surface proof-card';
    card.dataset.index = index;
    card.innerHTML = `<div class="dt-dom-content"><small data-contrast>${recipe.material.label.toUpperCase()}</small></div><div class="dt-dom-content"><h2 data-contrast>Light meets the page.</h2><p data-contrast>Readable content. Moving light. A material with its own character.</p></div>`;
    parent.append(card);
    const controller = createDomLightController(card, recipe, {
      clock: 'external',
      pointer: true,
      scroll: true,
    });
    cards.push(card);
    controllers.push(controller);
  };
  recipes.forEach((recipe, index) => append(recipe, index, main));
  const negative = createDomSurfaceRecipe({
    material: 'soft-glass',
    baseColor: '#ffffff',
    ink: '#000000',
    translucency: 0.98,
    contentShieldOpacity: 0,
    specularStrength: 0,
    light: { intensity: 0 },
  });
  const section = document.createElement('section');
  section.className = 'negative-stage';
  document.body.append(section);
  append(negative, 4, section);
  const spacer = document.createElement('div');
  spacer.className = 'spacer';
  document.body.append(spacer);
  const all = [...recipes, negative];
  return {
    cards,
    controllers,
    recipes: all,
    pose(x, y) {
      all.forEach((recipe, i) => {
        const sample = sampleDomSurfaceLight(recipe, { x, y });
        for (const [name, value] of Object.entries(sample.cssVariables))
          cards[i].style.setProperty(name, value);
      });
    },
    regions() {
      return cards.flatMap((card, index) =>
        [...card.querySelectorAll('[data-contrast]')].map((el) => {
          const r = el.getBoundingClientRect();
          const color = getComputedStyle(el).color;
          return {
            index,
            x: r.x + scrollX,
            y: r.y + scrollY,
            width: r.width,
            height: r.height,
            color,
          };
        }),
      );
    },
    hideText(hidden) {
      document
        .querySelectorAll('[data-contrast]')
        .forEach((el) => (el.style.visibility = hidden ? 'hidden' : 'visible'));
    },
  };
}
