import { spawn } from 'node:child_process';
import { readFile, writeFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execute, parseState, hash, inspectFont } from '../dist/index.js';
const root = process.cwd(),
  dir = 'artifacts/evaluation-v2';
await mkdir(dir, { recursive: true });
const config = JSON.parse(
  await readFile('research/benchmark-tasks.json', 'utf8'),
);
let trials = [],
  products = [];
try {
  trials = JSON.parse(
    await readFile(`${dir}/observations.json`, 'utf8'),
  ).trials;
  products = JSON.parse(await readFile(`${dir}/products.json`, 'utf8'));
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}
const guidance =
  'Use the supplied real content and fonts. Keep a clear title-to-prose relationship. Consider size, weight, tracking, leading, measure and adjacent whitespace together. Keep content readable and preserved at widths 320, 390, 767 and 1280, and text scales 1 and 2. Values are revisable. No numerical ratio establishes visual beauty. Return the final state as a JSON object only with exactly the existing state keys and platform=web. Do not add responsive, layout, or other keys. Preserve block IDs, roles and language. Keep scalar dimensions within the existing schema, preserving every content character and font file; adjust size, trackingEm, leading, measure, gaps and padding as needed. Do not call tools or read files; all task inputs are in this prompt.';
async function agent(prompt, work, output) {
  const start = performance.now();
  const child = spawn(
    'codex',
    [
      'exec',
      '--json',
      '--ephemeral',
      '--ignore-user-config',
      '--skip-git-repo-check',
      '--sandbox',
      'read-only',
      '-C',
      work,
      '-',
    ],
    { stdio: ['pipe', 'pipe', 'pipe'] },
  );
  child.stdin.end(prompt);
  let raw = '',
    diagnostics = '';
  child.stdout.on('data', (c) => (raw += c));
  child.stderr.on('data', (c) => (diagnostics += c));
  const timeout = setTimeout(() => child.kill('SIGTERM'), 300000);
  const code = await new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('close', resolve);
  });
  clearTimeout(timeout);
  await writeFile(`${output}.events.jsonl`, raw);
  await writeFile(`${output}.stderr.txt`, diagnostics);
  if (code !== 0)
    throw new Error(`coding agent failed (${code}); see ${output}.stderr.txt`);
  const events = raw.split('\n').filter(Boolean).map(JSON.parse),
    completed = events.find((e) => e.type === 'turn.completed');
  if (!completed?.usage) throw new Error('missing real token usage receipt');
  const messages = events.filter(
    (e) => e.type === 'item.completed' && e.item?.type === 'agent_message',
  );
  let text = messages.at(-1)?.item.text ?? '';
  text = text.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');
  return {
    state: JSON.parse(text),
    usage: completed.usage,
    latencyMs: performance.now() - start,
    events: events.length,
  };
}
for (const task of config.tasks) {
  const base = parseState(
    JSON.parse(await readFile(`examples/${task.archetype}.json`, 'utf8')),
  );
  base.blocks[0].text = task.title;
  base.blocks[1].text = task.prose;
  base.padding = 24;
  const fonts = base.blocks.map((b) => {
    const f = inspectFont(b.font.file);
    return {
      family: b.font.family,
      weight: f.staticWeight,
      unitsPerEm: f.unitsPerEm,
      metrics: f.metrics,
    };
  });
  // Rotate arm order across projects to limit fixed warm-cache/order bias. Same CLI/default coding model in all arms.
  const arms = ['guidance-only', 'tools-smooth', 'tools-musical'];
  const offset = parseInt(hash(task.projectId).slice(0, 8), 16) % 3;
  for (const condition of [...arms.slice(offset), ...arms.slice(0, offset)]) {
    if (
      trials.some(
        (t) => t.projectId === task.projectId && t.condition === condition,
      )
    )
      continue;
    const runDir = `${dir}/${task.projectId}/${condition}`;
    await mkdir(runDir, { recursive: true });
    const start = performance.now();
    let packet = null;
    if (condition !== 'guidance-only') {
      const result = await execute('system relax', {
        state: base,
        maxCandidates: 3,
        widths: [320, 390, 767, 1280],
        textScales: [1, 2],
        policy: { prior: condition === 'tools-musical' ? 'musical' : 'smooth' },
        select: {
          gguf:
            process.env.DESIGN_GGUF ??
            'artifacts/runtime/Qwen3.5-4B-Q4_K_M.gguf',
          criterion: task.criterion,
          auditDirectory: `${runDir}/selector-audit`,
        },
      });
      await writeFile(`${runDir}/tools.json`, JSON.stringify(result, null, 2));
      const selected = result.candidates.find(
        (c) => c.id === result.selection?.selected,
      );
      packet = {
        selection: result.selection,
        state: selected?.state ?? null,
        alternatives: result.candidates
          .filter((c) => c.viable)
          .map((c) => ({
            id: c.id,
            state: c.state,
            factors: c.relations.factors.map((f) => ({
              id: f.id,
              kind: f.kind,
              value: f.value,
              compatibility: f.compatibility,
              uncertainty: f.uncertainty,
            })),
          })),
        scope:
          'Measured scenarios only. The local model selects; it does not establish aesthetics or validity.',
      };
    }
    const prompt = [
      guidance,
      `Art direction: ${task.criterion}`,
      `Initial state: ${JSON.stringify(base)}`,
      `Font facts: ${JSON.stringify(fonts)}`,
      packet ? `Local design tools: ${JSON.stringify(packet)}` : '',
    ].join('\n\n');
    await writeFile(`${runDir}/prompt.txt`, prompt);
    const work = await mkdtemp(
      path.join(tmpdir(), 'physics-agent-evaluation-'),
    );
    try {
      const result = await agent(prompt, work, `${runDir}/agent`);
      let invalid = null;
      try {
        result.state = parseState(result.state);
      } catch (error) {
        invalid = String(error);
      }
      if (
        !invalid &&
        (result.state.blocks.length !== base.blocks.length ||
          result.state.blocks.some(
            (b, i) =>
              b.text !== base.blocks[i]?.text ||
              b.font.file !== base.blocks[i]?.font.file ||
              b.id !== base.blocks[i]?.id ||
              b.role !== base.blocks[i]?.role ||
              b.language !== base.blocks[i]?.language,
          ))
      )
        invalid = 'agent changed fixed content/font/identity';
      if (invalid) {
        await writeFile(
          `${runDir}/invalid.json`,
          JSON.stringify({ error: invalid, state: result.state }, null, 2),
        );
        await mkdir(`${runDir}/proof`, { recursive: true });
        await writeFile(
          `${runDir}/proof/specimen.html`,
          '<!doctype html><html lang="en"><p>This first-pass alternative could not produce a valid specimen.</p></html>',
        );
        trials.push({
          projectId: task.projectId,
          taskId: task.taskId,
          agentId: 'codex-cli-configured-default-constant-run',
          seed: config.seed,
          condition,
          tokens: result.usage.input_tokens + result.usage.output_tokens,
          latencyMs: performance.now() - start,
          attempts: 1,
          hardFailures: 1,
          responsiveFailures: 8,
        });
        products.push({
          projectId: task.projectId,
          taskId: task.taskId,
          seed: config.seed,
          condition,
          directory: runDir,
          usage: result.usage,
          agentLatencyMs: result.latencyMs,
          firstPass: true,
          invalid,
        });
        await writeFile(
          `${dir}/observations.json`,
          JSON.stringify({ trials, preferences: [] }, null, 2),
        );
        await writeFile(
          `${dir}/products.json`,
          JSON.stringify(products, null, 2),
        );
        console.log(
          JSON.stringify({ task: task.projectId, condition, invalid }),
        );
        continue;
      }
      for (const [i, b] of result.state.blocks.entries())
        if (
          b.text !== base.blocks[i]?.text ||
          b.font.file !== base.blocks[i]?.font.file
        )
          throw new Error('agent changed fixed content/font; invalid trial');
      await writeFile(
        `${runDir}/state.json`,
        JSON.stringify(result.state, null, 2),
      );
      const measurements = [];
      for (const width of [320, 390, 767, 1280])
        for (const textScale of [1, 2])
          measurements.push(
            await execute('layout measure', {
              state: {
                ...result.state,
                viewport: { ...result.state.viewport, width, textScale },
              },
              probes: false,
              spacing: true,
            }),
          );
      await writeFile(
        `${runDir}/measurements.json`,
        JSON.stringify(measurements, null, 2),
      );
      await execute('proof', {
        state: result.state,
        directory: `${runDir}/proof`,
        interactive: false,
      });
      const usage = result.usage;
      trials.push({
        projectId: task.projectId,
        taskId: task.taskId,
        agentId: 'codex-cli-configured-default-constant-run',
        seed: config.seed,
        condition,
        tokens: usage.input_tokens + usage.output_tokens,
        latencyMs: performance.now() - start,
        attempts: 1,
        hardFailures: measurements[0].issues.filter(
          (i) => i.severity === 'hard',
        ).length,
        responsiveFailures: measurements.filter((m) => !m.feasible).length,
      });
      products.push({
        projectId: task.projectId,
        taskId: task.taskId,
        seed: config.seed,
        condition,
        directory: runDir,
        usage,
        agentLatencyMs: result.latencyMs,
        firstPass: true,
      });
      await writeFile(
        `${dir}/observations.json`,
        JSON.stringify({ trials, preferences: [] }, null, 2),
      );
      await writeFile(
        `${dir}/products.json`,
        JSON.stringify(products, null, 2),
      );
      console.log(
        JSON.stringify({
          task: task.projectId,
          condition,
          trial: trials.at(-1),
        }),
      );
    } finally {
      await rm(work, { recursive: true, force: true });
    }
  }
}
await writeFile(
  `${dir}/analysis.json`,
  JSON.stringify(
    await execute('evaluate', { trials, preferences: [] }),
    null,
    2,
  ),
);
