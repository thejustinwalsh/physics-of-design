import { createServer, type IncomingMessage, type Server } from 'node:http';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import {
  parseState,
  type DesignState,
  type LayoutMeasurement,
  type BlockMeasurement,
  type Threshold,
} from './state.js';
import {
  fontIssues,
  designWarnings,
  geometryIssues,
  measurementKey,
  type Renderer,
  type MeasureOptions,
} from './measurement.js';
import { nativeMapping } from './emission.js';
import { resolveLayout } from './responsive.js';
import { colorIssues } from './design-color.js';

const n = z.number().finite();
const rect = z.object({
  x: n,
  y: n,
  width: n.nonnegative(),
  height: n.nonnegative(),
});
export const NativeReceiptSchema = z
  .object({
    inputHash: z.string(),
    engine: z.literal('react-native/Text+Yoga'),
    platform: z.enum(['native-ios', 'native-android']),
    runtime: z.object({
      reactNative: z.string(),
      os: z.string(),
      fontScale: n.positive(),
      pixelRatio: n.positive(),
      windowWidth: n.positive().optional(),
      windowHeight: n.positive().optional(),
      deviceType: z.string().optional(),
    }),
    loadedFonts: z.array(z.string()),
    blocks: z.array(
      z.object({
        id: z.string(),
        box: rect,
        lines: z.array(
          rect.extend({
            text: z.string(),
            start: n.int().nonnegative(),
            end: n.int().nonnegative(),
          }),
        ),
        inlineBounds: rect.nullable(),
        inkBounds: z.null(),
        overflowX: n.nonnegative(),
        overflowY: n.nonnegative(),
      }),
    ),
  })
  .strict();
type NativeReceipt = z.infer<typeof NativeReceiptSchema>;
type Job = {
  id: string;
  state: DesignState;
  inputHash: string;
  mapping: ReturnType<typeof nativeMapping>;
  leased: number;
  lease: string | null;
  fonts: Buffer[];
  created: number;
  receipt?: NativeReceipt;
  error?: string;
};
async function jsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let length = 0;
  for await (const chunk of req) {
    length += chunk.length;
    if (length > 2_000_000) throw new Error('request exceeds 2 MB');
    chunks.push(Buffer.from(chunk));
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
}
export function startNativeBridge(
  port = 4319,
  token = process.env.DESIGN_NATIVE_TOKEN,
): Promise<Server> {
  if (!token)
    throw new Error(
      'set DESIGN_NATIVE_TOKEN for the local native bridge and Expo harness',
    );
  const jobs = new Map<string, Job>();
  const clients = new Map<string, number>();
  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', `http://127.0.0.1:${port}`);
    const send = (status: number, body: unknown) => {
      res.writeHead(status, { 'content-type': 'application/json' });
      res.end(JSON.stringify(body));
    };
    if (
      req.headers.authorization !== `Bearer ${token}` &&
      url.searchParams.get('token') !== token
    ) {
      send(401, { error: 'unauthorized' });
      return;
    }
    try {
      for (const [id, j] of jobs)
        if (Date.now() - j.created > 300_000) jobs.delete(id);
      if (req.method === 'GET' && url.pathname === '/health') {
        send(200, {
          engine: 'native-bridge',
          pending: jobs.size,
          clients: [...clients]
            .filter(([, seen]) => Date.now() - seen < 5000)
            .map(([platform, seen]) => ({ platform, lastSeen: seen })),
        });
        return;
      }
      if (req.method === 'POST' && url.pathname === '/jobs') {
        if (jobs.size >= 256)
          throw new Error(
            'native queue is full; complete or cancel pending jobs',
          );
        const state = parseState(await jsonBody(req));
        if (state.platform === 'web')
          throw new Error('native jobs require a native platform');
        const mapping = nativeMapping(state);
        if (mapping.unsupported.length)
          throw new Error(mapping.unsupported.map((i) => i.message).join('; '));
        const job: Job = {
          id: randomUUID(),
          state,
          inputHash: measurementKey(state),
          mapping,
          leased: 0,
          lease: null,
          fonts: await Promise.all(
            state.blocks.map((b) => readFile(b.font.file)),
          ),
          created: Date.now(),
        };
        if (measurementKey(state) !== job.inputHash)
          throw new Error('font changed while creating native job');
        jobs.set(job.id, job);
        send(201, { id: job.id });
        return;
      }
      if (req.method === 'GET' && url.pathname === '/next') {
        const platform = url.searchParams.get('platform');
        if (!platform || !['native-ios', 'native-android'].includes(platform))
          throw new Error('native platform is required');
        clients.set(platform, Date.now());
        const job = [...jobs.values()].find(
          (j) =>
            j.state.platform === platform &&
            !j.receipt &&
            !j.error &&
            Date.now() - j.leased > 30_000,
        );
        if (!job) {
          res.writeHead(204);
          res.end();
          return;
        }
        if (measurementKey(job.state) !== job.inputHash) {
          job.error = 'Font content changed before lease';
          throw new Error(job.error);
        }
        const fontScale = Number(url.searchParams.get('fontScale') ?? 1);
        if (!Number.isFinite(fontScale) || fontScale <= 0 || fontScale > 5)
          throw new Error('invalid native font scale');
        job.mapping = nativeMapping(job.state, fontScale);
        job.leased = Date.now();
        job.lease = randomUUID();
        const address = server.address();
        if (!address || typeof address === 'string')
          throw new Error('bridge is not listening');
        send(200, {
          id: job.id,
          lease: job.lease,
          inputHash: job.inputHash,
          state: job.state,
          mapping: job.mapping,
          fonts: job.mapping.blocks.map((b, i) => ({
            alias: b.fontAlias,
            uri: `http://127.0.0.1:${address.port}/font/${job.id}/${i}?token=${encodeURIComponent(token)}`,
          })),
        });
        return;
      }
      const fontMatch = /^\/font\/([a-f0-9-]+)\/(\d+)$/.exec(url.pathname);
      if (req.method === 'GET' && fontMatch) {
        const job = jobs.get(fontMatch[1]!);
        const block = job?.state.blocks[Number(fontMatch[2])];
        if (!block) {
          send(404, { error: 'unknown font' });
          return;
        }
        res.writeHead(200, { 'content-type': 'font/ttf' });
        res.end(job!.fonts[Number(fontMatch[2])]);
        return;
      }
      const match = /^\/jobs\/([a-f0-9-]+)$/.exec(url.pathname);
      if (match) {
        const job = jobs.get(match[1]!);
        if (!job) {
          send(404, { error: 'unknown or expired job' });
          return;
        }
        if (req.method === 'GET') {
          send(200, { receipt: job.receipt ?? null, error: job.error ?? null });
          return;
        }
        if (req.method === 'DELETE') {
          jobs.delete(job.id);
          send(200, { cancelled: true });
          return;
        }
        if (req.method === 'POST') {
          if (
            !job.lease ||
            req.headers['x-design-lease'] !== job.lease ||
            Date.now() - job.leased > 30_000
          )
            throw new Error('stale or missing native job lease');
          if (job.receipt || job.error)
            throw new Error('native job already completed');
          const body = await jsonBody(req);
          if (body && typeof body === 'object' && 'error' in body) {
            job.error = z.object({ error: z.string() }).parse(body).error;
            send(200, { received: true });
            return;
          }
          const receipt = NativeReceiptSchema.parse(body);
          if (
            receipt.inputHash !== job.inputHash ||
            receipt.platform !== job.state.platform
          )
            throw new Error(
              'native receipt does not match the exact requested state/platform',
            );
          if (
            receipt.blocks.length !== job.state.blocks.length ||
            receipt.blocks.some((b, i) => b.id !== job.state.blocks[i]!.id)
          )
            throw new Error('native receipt block identities do not match');
          if (
            job.mapping.blocks.some(
              (b) => !receipt.loadedFonts.includes(b.fontAlias),
            )
          )
            throw new Error(
              'receipt does not confirm all requested fonts loaded',
            );
          job.receipt = receipt;
          send(200, { received: true });
          return;
        }
      }
      send(404, { error: 'unknown bridge endpoint' });
    } catch (error) {
      send(400, {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });
  return new Promise<Server>((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => resolve(server));
  });
}

export class NativeRenderer implements Renderer {
  constructor(
    private endpoint = 'http://127.0.0.1:4319',
    private token = process.env.DESIGN_NATIVE_TOKEN,
    private timeout = 45_000,
  ) {
    const u = new URL(endpoint);
    if (
      u.protocol !== 'http:' ||
      !['127.0.0.1', 'localhost', '[::1]'].includes(u.hostname)
    )
      throw new Error('native bridge must be a local HTTP endpoint');
    if (!token)
      throw new Error(
        'set DESIGN_NATIVE_TOKEN to use the actual native bridge',
      );
  }
  async close() {}
  private async request(state: DesignState): Promise<LayoutMeasurement> {
    state = parseState(state);
    const inputHash = measurementKey(state);
    const issues = [
      ...fontIssues(state),
      ...colorIssues(state),
      ...nativeMapping(state).unsupported,
    ];
    if (issues.some((i) => i.severity === 'unsupported'))
      throw new Error(issues.map((i) => i.message).join('; '));
    const created = await fetch(`${this.endpoint}/jobs`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${this.token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(state),
      signal: AbortSignal.timeout(5000),
    });
    if (!created.ok) throw new Error(`native bridge: ${await created.text()}`);
    const { id } = z
      .object({ id: z.string().uuid() })
      .parse(await created.json());
    const start = Date.now();
    let receipt: NativeReceipt | undefined;
    try {
      while (Date.now() - start < this.timeout) {
        const response = await fetch(`${this.endpoint}/jobs/${id}`, {
          headers: { authorization: `Bearer ${this.token}` },
          signal: AbortSignal.timeout(5000),
        });
        if (!response.ok)
          throw new Error(`native bridge status ${response.status}`);
        const result = z
          .object({
            receipt: NativeReceiptSchema.nullable(),
            error: z.string().nullable(),
          })
          .parse(await response.json());
        if (result.error) throw new Error(`native harness: ${result.error}`);
        if (result.receipt) {
          receipt = result.receipt;
          break;
        }
        await new Promise((r) => setTimeout(r, 150));
      }
      if (!receipt)
        throw new Error(
          'No native receipt. Start native/ in an iOS simulator or Android emulator with the matching token; browser/Yoga approximations are never substituted.',
        );
      if (
        receipt.inputHash !== inputHash ||
        measurementKey(state) !== inputHash ||
        receipt.platform !== state.platform
      )
        throw new Error('native receipt hash/platform mismatch');
      for (const [i, b] of receipt.blocks.entries()) {
        const original = state.blocks[i]!.text.replace(/\s/gu, '');
        const delivered = b.lines
          .map((l) => l.text)
          .join('')
          .replace(/\s/gu, '');
        if (original !== delivered)
          issues.push({
            code: 'missing-content',
            block: b.id,
            severity: 'hard',
            message: 'Native text lines do not preserve the requested content',
          });
      }
      for (const block of receipt.blocks)
        if (
          block.box.x < -0.75 ||
          block.box.x + block.box.width > state.viewport.width + 0.75
        )
          issues.push({
            code: 'viewport-overflow',
            block: block.id,
            severity: 'hard',
            message: 'Native text box extends outside the requested viewport.',
          });
      const runtime: Record<string, string | number> = {};
      for (const [key, value] of Object.entries(receipt.runtime))
        if (value !== undefined) runtime[key] = value;
      issues.push(
        ...geometryIssues(receipt.blocks),
        ...designWarnings(state, { blocks: receipt.blocks, runtime }),
      );
      return {
        inputHash: receipt.inputHash,
        platform: receipt.platform,
        engine: receipt.engine,
        runtime,
        blocks: receipt.blocks,
        issues,
        feasible: !issues.some(
          (i) => i.severity === 'hard' || i.severity === 'unsupported',
        ),
        textSpacing: { tested: false, issues: [] },
        scope: [
          'Actual Text.onTextLayout and View.onLayout from React Native/Yoga.',
          'No glyph ink bounds or complete WCAG audit.',
          'Native user font scaling is reported separately from requested textScale.',
          'Only this platform/version/device/viewport was measured.',
        ],
      };
    } finally {
      await fetch(`${this.endpoint}/jobs/${id}`, {
        method: 'DELETE',
        headers: { authorization: `Bearer ${this.token}` },
        signal: AbortSignal.timeout(5000),
      }).catch(() => undefined);
    }
  }
  async measure(
    state: DesignState,
    options: MeasureOptions = {},
  ): Promise<LayoutMeasurement> {
    if (state.platform === 'web')
      throw new Error('NativeRenderer requires a native state');
    const result = await this.request(state);
    if (!options.probes) return result;
    for (const [i, b] of result.blocks.entries()) {
      const signature = JSON.stringify(b.lines.map((l) => l.text));
      const width = b.box.width;
      const probe = async (w: number) => {
        const s = resolveLayout(
          state,
          Number(result.runtime.fontScale ?? 1),
        ).state;
        s.blocks[i]!.measure = w;
        s.viewport.width = Math.max(s.viewport.width, w + 2 * s.padding);
        return JSON.stringify(
          (await this.request(s)).blocks[i]!.lines.map((l) => l.text),
        );
      };
      const threshold = async (d: -1 | 1): Promise<Threshold> => {
        const limit = d === -1 ? 1 : Math.max(width * 2, width + 512);
        let same = width,
          changed: number | null = null;
        for (let step = 1; ; step *= 2) {
          const w =
            d === -1
              ? Math.max(limit, width - step)
              : Math.min(limit, width + step);
          if ((await probe(w)) !== signature) {
            changed = w;
            break;
          }
          same = w;
          if (w === limit) break;
        }
        const searched: [number, number] = [
          Math.min(width, same, changed ?? same),
          Math.max(width, same, changed ?? same),
        ];
        if (changed !== null) {
          let edge: number = changed;
          for (let j = 0; j < 24 && Math.abs(edge - same) > 0.25; j++) {
            const mid = (edge + same) / 2;
            if ((await probe(mid)) === signature) same = mid;
            else edge = mid;
          }
          changed = edge;
        }
        return {
          bracket:
            changed === null
              ? null
              : [Math.min(same, changed), Math.max(same, changed)],
          distance:
            changed === null
              ? null
              : [
                  Math.min(Math.abs(width - same), Math.abs(width - changed)),
                  Math.max(Math.abs(width - same), Math.abs(width - changed)),
                ],
          searched,
          precision: 0.25,
          signature: 'line-breaks',
        };
      };
      b.thresholds = {
        narrower: await threshold(-1),
        wider: await threshold(1),
      };
    }
    return result;
  }
}
