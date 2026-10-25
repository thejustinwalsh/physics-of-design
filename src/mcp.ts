import { z } from 'zod';
import { ResultStore, summarizeResult } from './mcp-context.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { build } from 'esbuild';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { commandSchemas, execute, type Command } from './commands.js';
import { designCatalog } from './catalog.js';
import type { SelectorExecutionOptions } from './selector.js';
import type { RequestHandlerExtra } from '@modelcontextprotocol/sdk/shared/protocol.js';
import type {
  ServerRequest,
  ServerNotification,
} from '@modelcontextprotocol/sdk/types.js';

const uiUri = 'ui://design-theory/specimens.html';
export async function appHtml() {
  const js = fileURLToPath(new URL('./app-client.js', import.meta.url));
  const bundle = await build({
    entryPoints: [
      existsSync(js)
        ? js
        : fileURLToPath(new URL('./app-client.ts', import.meta.url)),
    ],
    bundle: true,
    write: false,
    platform: 'browser',
    format: 'iife',
    minify: true,
  });
  return `<!doctype html><html lang="en"><meta charset="utf-8"><style>body{margin:0;background:#f6f4ed;font:13px system-ui;color:#171918}nav{padding:12px;display:flex;gap:12px;align-items:center;flex-wrap:wrap}iframe{border:0;width:100%;height:760px}button,select{font:inherit;padding:7px}#status{padding:12px}</style><nav><select id="choices" aria-label="Compare viable candidates"></select><button id="recompute">Recompute coupled alternatives</button><button id="choose" disabled>Choose this direction</button></nav><div id="status">Call design_specimen to load a local specimen.</div><iframe title="Editable typography specimen" sandbox="allow-scripts allow-same-origin allow-downloads"></iframe><script>${bundle.outputFiles[0]!.text.replaceAll('</script', '<\\/script')}</script></html>`;
}
export async function serveMcp() {
  const server = new McpServer({ name: 'design-theory', version: '0.1.0' });
  const store = new ResultStore();
  const profile = process.env.DESIGN_MCP_PROFILE ?? 'compact';
  if (!['compact', 'full'].includes(profile))
    throw new Error('DESIGN_MCP_PROFILE must be compact or full');
  const isCommand = (value: string): value is Command =>
    Object.hasOwn(commandSchemas, value);
  function execution(
    extra: RequestHandlerExtra<ServerRequest, ServerNotification>,
  ): SelectorExecutionOptions {
    let sequence = 0;
    const token = extra._meta?.progressToken;
    return {
      signal: extra.signal,
      ...(token !== undefined
        ? {
            onProgress: (progress) => {
              void extra
                .sendNotification({
                  method: 'notifications/progress',
                  params: {
                    progressToken: token,
                    progress: ++sequence,
                    message: JSON.stringify(progress),
                  },
                })
                .catch(() => {});
            },
          }
        : {}),
    };
  }
  async function run(
    command: Command,
    input: unknown,
    response: 'summary' | 'full',
    options: SelectorExecutionOptions = {},
  ) {
    try {
      const resolved = store.resolve(input);
      const result = await execute(command, resolved, options);
      const ref = store.put(result);
      const isUi = [
        'proof',
        'system relax',
        'component inspect',
        'motion proof',
        'wireframe inspect',
      ].includes(command);
      const view =
        command === 'proof' || response === 'summary'
          ? summarizeResult(command, result, ref)
          : result;
      let meta: Record<string, unknown> = {};
      if (isUi)
        meta = { result, state: (resolved as { state?: unknown }).state };
      if (
        ['component inspect', 'motion proof', 'wireframe inspect'].includes(
          command,
        )
      )
        meta = {
          ...meta,
          proofHtml: (result as { html: string }).html,
          inspection: command,
          ...(command === 'wireframe inspect'
            ? { wireframe: (result as { wireframe: unknown }).wireframe }
            : {}),
        };
      if (command === 'proof') {
        const proof = result as { html?: string; files?: { html: string } };
        meta.proofHtml =
          proof.html ?? (await readFile(proof.files!.html, 'utf8'));
      }
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(view) }],
        structuredContent: view as Record<string, unknown>,
        ...(isUi ? { _meta: meta } : {}),
      };
    } catch (error) {
      return {
        isError: true,
        content: [
          {
            type: 'text' as const,
            text: error instanceof Error ? error.message : String(error),
          },
        ],
      };
    }
  }
  server.registerTool(
    'design_catalog',
    {
      description:
        'List design commands, or fetch one input schema. Load details only when needed.',
      inputSchema: z.object({ command: z.string().optional() }).strict(),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false,
      },
    },
    async ({ command }) => {
      if (command && !isCommand(command))
        return {
          isError: true,
          content: [{ type: 'text', text: 'Unknown design command' }],
        };
      const result = designCatalog(command as Command | undefined);
      return {
        content: [{ type: 'text', text: JSON.stringify(result) }],
        structuredContent: result,
      };
    },
  );
  const envelope = z
    .object({
      command: z.string(),
      input: z.record(z.string(), z.unknown()),
      response: z.enum(['summary', 'full']).default('summary'),
    })
    .strict();
  server.registerTool(
    'design_execute',
    {
      description:
        'Execute a catalog command. Default summaries retain full session results; reuse {$designRef:"pod:N",pointer:"/path"} inside input. CLI and MCP share validation.',
      inputSchema: envelope,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        openWorldHint: false,
      },
    },
    async ({ command, input, response }, extra) =>
      isCommand(command)
        ? run(command, input, response, execution(extra))
        : {
            isError: true,
            content: [{ type: 'text', text: 'Unknown design command' }],
          },
  );
  server.registerTool(
    'design_specimen',
    {
      description:
        'Inspect typography, component or layout drawings and motion; edit coupled variables in the optional MCP App.',
      inputSchema: z
        .object({
          command: z
            .enum([
              'proof',
              'system relax',
              'component inspect',
              'motion proof',
              'wireframe inspect',
            ])
            .default('proof'),
          input: z.record(z.string(), z.unknown()),
        })
        .strict(),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        openWorldHint: false,
      },
      _meta: { ui: { resourceUri: uiUri } },
    },
    async ({ command, input }, extra) =>
      run(command, input, 'summary', execution(extra)),
  );
  if (profile === 'full')
    for (const command of Object.keys(commandSchemas) as Command[]) {
      const isUi = [
        'proof',
        'system relax',
        'component inspect',
        'motion proof',
        'wireframe inspect',
      ].includes(command);
      server.registerTool(
        `design_${command.replaceAll(' ', '_')}`,
        {
          description: `design ${command}`,
          inputSchema: commandSchemas[command],
          annotations: {
            readOnlyHint: ![
              'proof',
              'choice select',
              'system relax',
              'composition solve',
              'decision run',
              'field run',
            ].includes(command),
            destructiveHint: false,
            openWorldHint: false,
          },
          ...(isUi ? { _meta: { ui: { resourceUri: uiUri } } } : {}),
        },
        async (
          input: unknown,
          extra: RequestHandlerExtra<ServerRequest, ServerNotification>,
        ) => run(command, input, 'full', execution(extra)),
      );
    }
  for (const [name, uri] of [
    ['specimens', uiUri],
    ['legacy-specimens', 'ui://physics-of-design/specimens.html'],
  ] as const)
    server.registerResource(
      name,
      uri,
      {
        mimeType: 'text/html;profile=mcp-app',
        _meta: {
          ui: { csp: { connectDomains: [], resourceDomains: ['data:'] } },
        },
      },
      async () => ({
        contents: [
          {
            uri,
            mimeType: 'text/html;profile=mcp-app',
            text: await appHtml(),
          },
        ],
      }),
    );
  await server.connect(new StdioServerTransport());
}
