import { open } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { JsonExpansionBudget } from './json-expansion-budget.js';

export type DesignFileReference = {
  $designFile: string;
  sha256: string;
  pointer?: string;
};

export function designFileReference(
  file: string,
  bytes: Uint8Array,
  pointer = '',
): DesignFileReference {
  return {
    $designFile: path.resolve(file),
    sha256: createHash('sha256').update(bytes).digest('hex'),
    pointer,
  };
}

/** Explicit CLI transport, not an authenticated renderer or automatic MCP file reader. */
export async function resolveDesignFileReferences(
  input: unknown,
  baseDirectory = process.cwd(),
) {
  const files = new Map<string, { sha256: string; value: unknown }>();
  let total = 0;
  const budget = new JsonExpansionBudget();
  async function load(file: string) {
    const cached = files.get(file);
    if (cached) return cached;
    if (files.size >= 8)
      throw new Error('At most eight result files may be resolved per request');
    const h = await open(file, 'r');
    let bytes: Buffer;
    try {
      const stat = await h.stat();
      if (!stat.isFile())
        throw new Error('Referenced result must be a regular file');
      if (stat.size > 16 * 1024 * 1024)
        throw new Error('Result file exceeds 16 MiB');
      const buffer = Buffer.alloc(16 * 1024 * 1024 + 1);
      let used = 0;
      while (used < buffer.length) {
        const read = await h.read(buffer, used, buffer.length - used, null);
        if (!read.bytesRead) break;
        used += read.bytesRead;
      }
      if (used === buffer.length) throw new Error('Result file exceeds 16 MiB');
      total += used;
      if (total > 32 * 1024 * 1024)
        throw new Error('Referenced result files exceed 32 MiB');
      bytes = buffer.subarray(0, used);
    } finally {
      await h.close();
    }
    const result = {
      sha256: createHash('sha256').update(bytes).digest('hex'),
      value: JSON.parse(
        new TextDecoder('utf-8', { fatal: true }).decode(bytes),
      ) as unknown,
    };
    files.set(file, result);
    return result;
  }
  async function resolve(value: unknown, depth: number): Promise<unknown> {
    if (depth > 64)
      throw new Error('Reference input exceeds 64 nesting levels');
    // Resolve sequentially: reserving the bounded file budget must happen before
    // another sibling can start a read. Repeated references share one snapshot.
    if (Array.isArray(value)) {
      budget.add(value, depth);
      const items = [];
      for (const item of value) items.push(await resolve(item, depth + 1));
      return items;
    }
    if (!value || typeof value !== 'object') {
      budget.add(value, depth);
      return value;
    }
    const object = value as Record<string, unknown>;
    if (Object.hasOwn(object, '$designFile')) {
      if (
        Object.keys(object).some(
          (k) => !['$designFile', 'sha256', 'pointer'].includes(k),
        ) ||
        typeof object.$designFile !== 'string' ||
        !object.$designFile ||
        typeof object.sha256 !== 'string' ||
        !/^[a-f0-9]{64}$/u.test(object.sha256)
      )
        throw new Error(
          'File reference requires $designFile, sha256 and optional pointer only',
        );
      const pointer = object.pointer ?? '';
      if (
        typeof pointer !== 'string' ||
        (pointer !== '' && !pointer.startsWith('/')) ||
        /~(?![01])/u.test(pointer)
      )
        throw new Error('File pointer must be an RFC 6901 JSON pointer');
      const file = path.resolve(baseDirectory, object.$designFile),
        result = await load(file);
      if (result.sha256 !== object.sha256)
        throw new Error(
          'Referenced result file changed; inspect current evidence before reuse',
        );
      let selected = result.value;
      if (pointer !== '')
        for (const part of pointer.slice(1).split('/')) {
          const key = part.replaceAll('~1', '/').replaceAll('~0', '~');
          if (
            ['__proto__', 'prototype', 'constructor'].includes(key) ||
            !selected ||
            typeof selected !== 'object' ||
            !Object.hasOwn(selected, key)
          )
            throw new Error(
              `File pointer does not exist or is reserved: ${pointer}`,
            );
          selected = (selected as Record<string, unknown>)[key];
        }
      // Selected data is inert. It cannot recursively request reads from files
      // embedded in an untrusted receipt. Only references in the explicit input resolve.
      return budget.clone(selected, depth);
    }
    budget.add(value, depth);
    const entries: [string, unknown][] = [];
    for (const [key, item] of Object.entries(object))
      entries.push([key, await resolve(item, depth + 1)]);
    return Object.fromEntries(entries);
  }
  return resolve(input, 0);
}
