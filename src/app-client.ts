import { App } from '@modelcontextprotocol/ext-apps';
import { StateSchema, type DesignState } from './state.js';
import { WireframeSchema, type Wireframe } from './wireframe.js';

const app = new App({ name: 'Design Theory specimens', version: '0.1.0' }, {});
const frame = document.querySelector<HTMLIFrameElement>('iframe')!;
const status = document.querySelector<HTMLElement>('#status')!;
const choices = document.querySelector<HTMLSelectElement>('#choices')!;
const recompute = document.querySelector<HTMLButtonElement>('#recompute')!;
const choose = document.querySelector<HTMLButtonElement>('#choose')!;
type Candidate = { id: string; state: DesignState };
type View =
  | { kind: 'empty' | 'inspection' }
  | { kind: 'specimen'; state: DesignState; candidates: Candidate[] }
  | { kind: 'wireframe'; definition: Wireframe; selectedNode: string | null };
type ToolResult = {
  isError?: boolean | undefined;
  content?: unknown[] | undefined;
  _meta?: Record<string, unknown> | undefined;
  structuredContent?: unknown;
};
let view: View = { kind: 'empty' };
let epoch = 0,
  geometryRevision = 0,
  selectionRevision = 0;
let frameSession: string | null = null;
let frameRevision = 0;
const ticket = () => ({ epoch, geometryRevision });
const current = (t: ReturnType<typeof ticket>) =>
  t.epoch === epoch && t.geometryRevision === geometryRevision;
const record = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
function failure(error: unknown, t: ReturnType<typeof ticket>) {
  if (!current(t)) return;
  status.textContent = `Could not recompute: ${String(error)}. The drawing retains its previous geometry.`;
  choose.disabled = true;
}
function clearControls() {
  choices.replaceChildren();
  choose.disabled = true;
  choose.textContent = 'Choose this direction';
  recompute.disabled = true;
}
function renderFrame(html: string) {
  frameSession = `${epoch}:${geometryRevision}:${++frameRevision}`;
  frame.srcdoc = html.replace(
    '<script>',
    `<script>window.__DESIGN_FRAME_SESSION__=${JSON.stringify(frameSession)};`,
  );
}
function display(result: ToolResult, t: ReturnType<typeof ticket>) {
  if (!current(t)) return;
  if (result.isError) {
    failure(
      result.content?.map((item) => record(item)?.text ?? '').join('\n') ||
        'Tool returned an error',
      t,
    );
    return;
  }
  const meta = result._meta ?? {};
  if (meta.wireframe) {
    const definition = WireframeSchema.parse(meta.wireframe);
    const previous = view;
    const selectedNode =
      previous.kind === 'wireframe' &&
      previous.definition.id === definition.id &&
      definition.nodes.some((node) => node.id === previous.selectedNode)
        ? previous.selectedNode
        : null;
    view = { kind: 'wireframe', definition, selectedNode };
    clearControls();
    choose.disabled = false;
    recompute.disabled = false;
    choose.textContent = 'Share geometry direction';
    if (typeof meta.proofHtml === 'string') renderFrame(meta.proofHtml);
    status.textContent =
      'Layout equations are editable. Dashed boxes are proposals; solid boxes retain their caller-supplied renderer receipts.';
    return;
  }
  const content = record(meta.result ?? result.structuredContent);
  if (Array.isArray(content?.candidates)) {
    const candidates = (
      content.candidates as (Candidate & { viable: boolean })[]
    ).filter((candidate) => candidate.viable);
    choices.replaceChildren(
      ...candidates.map((candidate) => {
        const option = document.createElement('option');
        option.value = candidate.id;
        option.textContent = `${candidate.id} · ${candidate.state.blocks.map((block) => `${block.font.family} ${block.size}`).join(' / ')}`;
        return option;
      }),
    );
    if (candidates[0]) {
      view = { kind: 'specimen', state: candidates[0].state, candidates };
      void show(candidates[0].state);
    } else {
      view = { kind: 'empty' };
      choose.disabled = true;
      status.textContent = 'No viable alternatives in measured scenarios.';
    }
    return;
  }
  if (typeof meta.proofHtml === 'string') {
    renderFrame(meta.proofHtml);
    if (meta.state) {
      const candidates = view.kind === 'specimen' ? view.candidates : [];
      view = { kind: 'specimen', state: meta.state as DesignState, candidates };
      recompute.disabled = false;
      choose.disabled = !candidates.length;
      choose.textContent = 'Choose this direction';
    } else {
      view = { kind: 'inspection' };
      clearControls();
    }
    status.textContent = meta.inspection
      ? `${String(meta.inspection)} — exact contract, provenance and pending verification.`
      : 'Editable preview. Geometry is verified by renderer tools; this view is not an aesthetic score.';
  }
}
async function runTool(
  command: string,
  input: unknown,
  t: ReturnType<typeof ticket>,
) {
  try {
    display(
      await app.callServerTool({
        name: 'design_execute',
        arguments: { command, input },
      }),
      t,
    );
  } catch (error) {
    failure(error, t);
  }
}
async function show(state: DesignState) {
  const candidates = view.kind === 'specimen' ? view.candidates : [];
  view = { kind: 'specimen', state, candidates };
  geometryRevision++;
  choose.disabled = true;
  status.textContent = 'Rendering local specimen…';
  await runTool('proof', { state, interactive: true }, ticket());
}
// A new host result starts a new view, invalidating every old async continuation.
app.ontoolresult = (result) => {
  epoch++;
  geometryRevision = 0;
  selectionRevision = 0;
  view = { kind: 'empty' };
  frameSession = null;
  clearControls();
  frame.srcdoc = '';
  try {
    display(result, ticket());
  } catch (error) {
    failure(error, ticket());
  }
};
window.addEventListener('message', (event) => {
  if (event.source !== frame.contentWindow) return;
  const message = record(event.data);
  if (!message) return;
  if (Object.hasOwn(message, 'designTheoryWireframeEdit')) {
    if (view.kind !== 'wireframe') return;
    const edit = record(message.designTheoryWireframeEdit);
    const variables = record(edit?.variables);
    if (
      !edit ||
      !variables ||
      edit.session !== frameSession ||
      edit.wireframeId !== view.definition.id ||
      Object.keys(edit).some(
        (key) =>
          !['session', 'wireframeId', 'variables', 'selection'].includes(key),
      ) ||
      Object.keys(variables).some(
        (id) =>
          !Object.hasOwn(
            view.kind === 'wireframe' ? view.definition.variables : {},
            id,
          ),
      )
    )
      return;
    const selection = edit.selection;
    if (
      selection !== null &&
      (typeof selection !== 'string' ||
        !view.definition.nodes.some((node) => node.id === selection))
    )
      return;
    const changes: { variable: string; value: number }[] = [];
    for (const [id, value] of Object.entries(variables)) {
      const variable = view.definition.variables[id]!;
      if (
        typeof value !== 'number' ||
        !Number.isFinite(value) ||
        (variable.min !== undefined && value < variable.min) ||
        (variable.max !== undefined && value > variable.max)
      )
        return;
      if (value !== variable.value) changes.push({ variable: id, value });
    }
    // The host owns equations, nodes and receipts. The iframe can change only
    // declared numeric variables and a node selection, never the definition.
    const definition = structuredClone(view.definition);
    for (const change of changes)
      definition.variables[change.variable]!.value = change.value;
    view = {
      kind: 'wireframe',
      definition,
      selectedNode: selection as string | null,
    };
    selectionRevision++;
    if (changes.length) geometryRevision++;
    const t = ticket(),
      selectionTicket = selectionRevision;
    void app
      .updateModelContext({
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              kind: 'human-wireframe-direction',
              wireframe: definition.id,
              changes,
              selectedNode: selection,
              validation: 'pending; proposal edits do not validate rendering',
            }),
          },
        ],
      })
      .then(() => {
        if (
          current(t) &&
          selectionTicket === selectionRevision &&
          !changes.length
        )
          status.textContent = `Selected ${selection ?? 'layout'}; identity shared with the agent.`;
      })
      .catch((error) => {
        if (current(t) && selectionTicket === selectionRevision)
          status.textContent = `Could not share direction: ${String(error)}`;
      });
    if (changes.length) {
      choose.disabled = true;
      status.textContent = 'Recomputing proposed geometry…';
      void runTool(
        'wireframe inspect',
        { wireframe: definition, interactive: true },
        t,
      );
    }
    return;
  }
  if (
    view.kind !== 'specimen' ||
    message.session !== frameSession ||
    !Object.hasOwn(message, 'physicsDesignState')
  )
    return;
  const edited = StateSchema.safeParse(message.physicsDesignState);
  if (
    !edited.success ||
    JSON.stringify(edited.data) === JSON.stringify(view.state)
  )
    return;
  view = { ...view, state: edited.data };
  geometryRevision++;
  choose.disabled = true;
  status.textContent =
    'Edited: tracking, leading, measure, wrapping, whitespace and responsive factors need recomputation.';
});
choices.onchange = () => {
  if (view.kind !== 'specimen') return;
  const selected = view.candidates.find(
    (candidate) => candidate.id === choices.value,
  );
  if (selected) void show(selected.state);
};
recompute.onclick = async () => {
  if (view.kind !== 'wireframe' && view.kind !== 'specimen') return;
  geometryRevision++;
  choose.disabled = true;
  const t = ticket();
  if (view.kind === 'wireframe') {
    status.textContent = 'Recomputing proposed geometry…';
    await runTool(
      'wireframe inspect',
      { wireframe: view.definition, interactive: true },
      t,
    );
  } else {
    status.textContent = 'Measuring coupled alternatives…';
    const state = view.state;
    await runTool(
      'system relax',
      {
        state,
        maxCandidates: 3,
        widths: [state.viewport.width, 360],
        textScales: [1, 2],
        pinned: ['/blocks/0/size'],
      },
      t,
    );
  }
};
choose.onclick = async () => {
  const t = ticket(),
    selectionTicket = selectionRevision;
  let text: string, confirmation: string;
  if (view.kind === 'wireframe') {
    text = JSON.stringify({
      kind: 'human-wireframe-direction',
      wireframe: view.definition.id,
      variables: Object.fromEntries(
        Object.entries(view.definition.variables).map(([id, value]) => [
          id,
          value.value,
        ]),
      ),
      selectedNode: view.selectedNode,
      validation:
        'Art direction only; rendering and accessibility remain unverified.',
    });
    confirmation = 'Geometry direction shared with the agent.';
  } else if (view.kind === 'specimen') {
    const selected = view.candidates.find(
      (candidate) => candidate.id === choices.value,
    );
    if (!selected) return;
    text = `Human art-direction tie-break selected viable candidate ${selected.id}. This expresses a preference, not aesthetic or accessibility validation.`;
    confirmation = `Human choice recorded: ${selected.id}`;
  } else return;
  try {
    await app.updateModelContext({ content: [{ type: 'text', text }] });
    if (current(t) && selectionTicket === selectionRevision)
      status.textContent = confirmation;
  } catch (error) {
    if (current(t) && selectionTicket === selectionRevision)
      status.textContent = `Could not share direction: ${String(error)}`;
  }
};
void app.connect().catch((error) => {
  status.textContent = String(error);
});
