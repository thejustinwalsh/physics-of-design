import { App } from '@modelcontextprotocol/ext-apps';
import type { DesignState } from './state.js';

// Bundled separately for the optional MCP App. The headless commands never load this module.
const app = new App(
  { name: 'Physics of Design specimens', version: '0.1.0' },
  {},
);
const frame = document.querySelector<HTMLIFrameElement>('iframe')!;
const status = document.querySelector<HTMLElement>('#status')!;
const choices = document.querySelector<HTMLSelectElement>('#choices')!;
const recompute = document.querySelector<HTMLButtonElement>('#recompute')!;
const choose = document.querySelector<HTMLButtonElement>('#choose')!;
let state: DesignState | undefined;
let candidates: { id: string; state: DesignState }[] = [];
let revision = 0;
async function show(next: DesignState) {
  const ticket = ++revision;
  state = next;
  status.textContent = 'Rendering local specimen…';
  const result = await app.callServerTool({
    name: 'design_execute',
    arguments: { command: 'proof', input: { state: next, interactive: true } },
  });
  if (ticket === revision) display(result);
}
function display(result: {
  _meta?: Record<string, unknown> | undefined;
  structuredContent?: unknown;
}) {
  if (typeof result._meta?.proofHtml === 'string') {
    frame.srcdoc = result._meta.proofHtml;
    status.textContent =
      'Editable preview. Geometry is verified by renderer tools; this view is not an aesthetic score.';
  }
  if (result._meta?.state) state = result._meta.state as DesignState;
  const structured = result._meta?.result ?? result.structuredContent;
  const content =
    structured && typeof structured === 'object'
      ? (structured as Record<string, unknown>)
      : undefined;
  if (Array.isArray(content?.candidates)) {
    candidates = (
      content.candidates as {
        id: string;
        state: DesignState;
        viable: boolean;
      }[]
    ).filter((c) => c.viable);
    choices.replaceChildren(
      ...candidates.map((c) => {
        const o = document.createElement('option');
        o.value = c.id;
        o.textContent = `${c.id} · ${c.state.blocks.map((b) => `${b.font.family} ${b.size}`).join(' / ')}`;
        return o;
      }),
    );
    choose.disabled = !candidates.length;
    if (candidates[0]) void show(candidates[0].state);
    else status.textContent = 'No viable alternatives in measured scenarios.';
  }
}
app.ontoolresult = display;
window.addEventListener('message', (e) => {
  if (
    e.source !== frame.contentWindow ||
    !e.data ||
    typeof e.data !== 'object' ||
    !('physicsDesignState' in e.data)
  )
    return;
  state = e.data.physicsDesignState as DesignState;
  ++revision;
  choose.disabled = true;
  status.textContent =
    'Edited: tracking, leading, measure, wrapping, whitespace and responsive factors need recomputation.';
});
choices.onchange = () => {
  const selected = candidates.find((c) => c.id === choices.value);
  if (selected) {
    choose.disabled = false;
    void show(selected.state);
  }
};
recompute.onclick = async () => {
  if (!state) return;
  status.textContent = 'Measuring coupled alternatives…';
  try {
    display(
      await app.callServerTool({
        name: 'design_execute',
        arguments: {
          command: 'system relax',
          input: {
            state,
            maxCandidates: 3,
            widths: [state.viewport.width, 360],
            textScales: [1, 2],
            pinned: ['/blocks/0/size'],
          },
        },
      }),
    );
  } catch (e) {
    status.textContent = String(e);
  }
};
choose.onclick = async () => {
  const selected = candidates.find((c) => c.id === choices.value);
  if (selected) {
    await app.updateModelContext({
      content: [
        {
          type: 'text',
          text: `Human art-direction tie-break selected viable candidate ${selected.id}. This expresses a preference, not aesthetic or accessibility validation.`,
        },
      ],
    });
    status.textContent = `Human choice recorded: ${selected.id}`;
  }
};
void app.connect().catch((e) => {
  status.textContent = String(e);
});
