import { open } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { z } from 'zod';

export const DesignContextSchema = z
  .object({
    file: z.string().min(1).default('DESIGN.md'),
    includeContent: z.boolean().default(false),
    expectedSha256: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .optional(),
    requiredSections: z
      .array(z.string().trim().min(1).max(120))
      .max(32)
      .default([]),
  })
  .strict();

/** Read an authored contract without guessing tokens, rules or human approval from prose. */
export async function inspectDesignContext(input: unknown) {
  const r = DesignContextSchema.parse(input);
  const file = path.resolve(r.file);
  let bytes: Buffer;
  try {
    const handle = await open(file, 'r');
    try {
      const buffer = Buffer.alloc(65537);
      let used = 0;
      while (used < buffer.length) {
        const result = await handle.read(
          buffer,
          used,
          buffer.length - used,
          null,
        );
        if (!result.bytesRead) break;
        used += result.bytesRead;
      }
      bytes = buffer.subarray(0, used);
    } finally {
      await handle.close();
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    return {
      status: 'missing' as const,
      file,
      sha256: null,
      sections: [],
      missingSections: r.requiredSections,
      scope:
        'No design contract found. Establish a brief before authoring DESIGN.md; do not invent approval.',
    };
  }
  if (bytes.length > 65536)
    throw new Error(
      'Design context exceeds 64 KiB; use a focused DESIGN.md and linked references',
    );
  const content = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  if (r.expectedSha256 && r.expectedSha256 !== sha256)
    throw new Error(
      'Design context changed; invalidate dependent choices and inspect the new contract',
    );
  const sections: { title: string; level: number; line: number }[] = [];
  let fence: string | null = null;
  for (const [index, line] of content.split(/\r?\n/u).entries()) {
    const marker = line.match(/^\s{0,3}(`{3,}|~{3,})/u)?.[1];
    if (marker) {
      if (!fence) fence = marker;
      else if (
        marker[0] === fence[0] &&
        marker.length >= fence.length &&
        /^\s{0,3}[`~]+\s*$/u.test(line)
      )
        fence = null;
      continue;
    }
    if (fence) continue;
    const heading = line.match(/^\s{0,3}(#{1,6})\s+(.+?)(?:\s+#+)?\s*$/u);
    if (heading)
      sections.push({
        title: heading[2]!,
        level: heading[1]!.length,
        line: index + 1,
      });
  }
  const names = new Set(sections.map((s) => s.title.toLowerCase()));
  return {
    status: 'found' as const,
    file,
    sha256,
    byteLength: bytes.length,
    sections: sections.slice(0, 64),
    totalSections: sections.length,
    omittedSections: Math.max(0, sections.length - 64),
    missingSections: r.requiredSections.filter(
      (s) => !names.has(s.toLowerCase()),
    ),
    ...(r.includeContent ? { content } : {}),
    scope:
      'Authored design contract and document structure only. No prose-to-constraint inference, aesthetic validity or human approval is implied. Bind its hash to dependent workflows.',
  };
}
