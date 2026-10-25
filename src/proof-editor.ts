import type { DesignState } from './state.js';
import type { FactorNode } from './graph.js';
import { perturb, overlaps } from './graph.js';
import { collectTypographyElement } from './typography-browser.js';
type ProofWindow = Window & {
  __POD_STATE__: DesignState;
  __DESIGN_FRAME_SESSION__?: string;
  __POD_GRAPH__: FactorNode[];
  __POD_APPLY_STATE__?: (state: DesignState) => void;
  __POD_FONTS__: {
    font: DesignState['blocks'][number]['font'];
    weight: number;
    alias: string;
  }[];
};
const context = window as unknown as ProofWindow,
  state = context.__POD_STATE__;
const controls = document.getElementById('controls')!,
  status = document.getElementById('status')!;
let guides = false;
function dependencies(pointer: string) {
  const affected = new Set(
    context.__POD_GRAPH__
      .filter((n) =>
        n.reads.some(
          (p) =>
            p === pointer ||
            p.startsWith(`${pointer}/`) ||
            pointer.startsWith(`${p}/`),
        ),
      )
      .map((n) => n.id),
  );
  let changed = true;
  while (changed) {
    changed = false;
    for (const n of context.__POD_GRAPH__)
      if (!affected.has(n.id) && n.dependsOn.some((d) => affected.has(d))) {
        affected.add(n.id);
        changed = true;
      }
  }
  return [...affected];
}
function edited(pointer: string) {
  if (context.__POD_APPLY_STATE__) {
    for (const el of document.querySelectorAll<HTMLElement>('[data-block]'))
      for (const property of [
        'font-size',
        'line-height',
        'letter-spacing',
        'width',
        'margin-top',
        'font-family',
        'font-weight',
        'font-optical-sizing',
        'font-variation-settings',
      ])
        el.style.removeProperty(property);
    context.__POD_APPLY_STATE__(structuredClone(state));
  }
  status.textContent = `Edited; remeasure affected factors: ${dependencies(pointer).join(', ')}`;
  window.parent.postMessage(
    {
      physicsDesignState: state,
      changed: pointer,
      session: context.__DESIGN_FRAME_SESSION__ ?? null,
    },
    '*',
  );
  if (guides) drawBaselines();
}
function field(
  label: string,
  value: number,
  pointer: string,
  onchange: (n: number) => void,
) {
  const l = document.createElement('label');
  l.textContent = label;
  const input = document.createElement('input');
  input.type = 'number';
  input.step = 'any';
  input.value = String(value);
  input.disabled = state.locks.some((lock) => overlaps(lock, pointer));
  input.onchange = () => {
    if (!Number.isFinite(input.valueAsNumber)) return;
    try {
      perturb(state, pointer, input.valueAsNumber);
    } catch (error) {
      status.textContent = String(error);
      input.value = String(value);
      return;
    }
    onchange(input.valueAsNumber);
    edited(pointer);
  };
  l.append(input);
  controls.append(l);
}
function drawBaselines() {
  document.getElementById('baselines')?.remove();
  if (!guides) return;
  const overlay = document.createElement('div');
  overlay.id = 'baselines';
  overlay.style.cssText = 'position:absolute;inset:0;pointer-events:none';
  for (const b of state.blocks) {
    const el = document.querySelector<HTMLElement>(`[data-block="${b.id}"]`)!;
    if ((el.textContent?.length ?? 0) > 4096) {
      el.dataset.baselineEvidence = 'unavailable: excerpt exceeds probe budget';
      continue;
    }
    const facts = collectTypographyElement(el, 64);
    el.dataset.baselineEvidence = JSON.stringify({
      measured: facts.lines.filter((l) => l.baseline !== null).length,
      unavailable: facts.lines.filter((l) => l.baseline === null).length,
      omitted: facts.omittedLines,
    });
    // Draw only coordinates whose probes preserved every original grapheme rectangle.
    for (const measured of facts.lines) {
      if (measured.baseline === null) continue;
      const box = el.getBoundingClientRect(),
        line = document.createElement('div');
      line.dataset.baselineBlock = b.id;
      line.dataset.baseline = String(measured.baseline);
      line.style.cssText = `position:absolute;left:${box.x + window.scrollX}px;top:${box.y + window.scrollY + measured.baseline}px;width:${box.width}px;border-top:1px solid #ae3b6580`;
      overlay.append(line);
    }
  }
  document.body.append(overlay);
}
for (const [i, b] of state.blocks.entries()) {
  const el = document.querySelector<HTMLElement>(`[data-block="${b.id}"]`)!;
  const prefix = `/blocks/${i}`;
  field(`${b.id} size`, b.size, `${prefix}/size`, (v) => {
    b.size = v;
    el.style.fontSize = `${v * state.viewport.textScale}px`;
    el.style.lineHeight = `${v * b.leading * state.viewport.textScale}px`;
    el.style.letterSpacing = `${v * b.trackingEm * state.viewport.textScale}px`;
  });
  field(`${b.id} tracking (em)`, b.trackingEm, `${prefix}/trackingEm`, (v) => {
    b.trackingEm = v;
    el.style.letterSpacing = `${v * b.size * state.viewport.textScale}px`;
  });
  field(`${b.id} leading`, b.leading, `${prefix}/leading`, (v) => {
    b.leading = v;
    el.style.lineHeight = `${v * b.size * state.viewport.textScale}px`;
  });
  field(`${b.id} measure`, b.measure, `${prefix}/measure`, (v) => {
    b.measure = v;
    el.style.width = `${v}px`;
  });
  const label = document.createElement('label');
  label.textContent = `${b.id} font comparison`;
  const select = document.createElement('select');
  select.setAttribute('aria-label', `${b.id} font comparison`);
  select.disabled = state.locks.some(
    (lock) =>
      overlaps(lock, `${prefix}/font`) || overlaps(lock, `${prefix}/weight`),
  );
  context.__POD_FONTS__.forEach((f, index) => {
    const o = document.createElement('option');
    o.value = String(index);
    o.textContent = f.font.family;
    if (f.font.file === b.font.file) select.value = o.value;
    select.append(o);
    if (f.font.file === b.font.file) o.selected = true;
  });
  select.onchange = () => {
    const f = context.__POD_FONTS__[Number(select.value)]!;
    b.font = structuredClone(f.font);
    b.weight = f.weight;
    el.style.fontFamily = f.alias;
    el.style.fontWeight = String(f.weight);
    el.style.fontOpticalSizing = f.font.opticalSizing;
    el.style.fontVariationSettings =
      Object.entries(f.font.axes)
        .map(([tag, value]) => `"${tag}" ${value}`)
        .join(', ') || 'normal';
    edited(`${prefix}/font`);
  };
  label.append(select);
  controls.append(label);
  if (i)
    field(`gap ${i}`, state.gaps[i - 1]!, `/gaps/${i - 1}`, (v) => {
      state.gaps[i - 1] = v;
      el.style.marginTop = `${v}px`;
    });
}
document.getElementById('guides')!.onclick = () => {
  guides = !guides;
  drawBaselines();
};
document.getElementById('grid')!.onclick = () =>
  document.body.classList.toggle('guides');
document.getElementById('download')!.onclick = () => {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(
    new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' }),
  );
  a.download = 'edited-state.json';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
};
window.addEventListener('resize', () => {
  if (guides) drawBaselines();
});
