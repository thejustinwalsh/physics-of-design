/** Budget the expanded value, including every repeated reference, before cloning. */
export class JsonExpansionBudget {
  private bytes = 0;
  private nodes = 0;
  add(value: unknown, depth: number) {
    if (depth > 64)
      throw new Error('Expanded request exceeds 64 nesting levels');
    if (++this.nodes > 1_000_000)
      throw new Error('Expanded request exceeds one million nodes');
    if (Array.isArray(value)) this.bytes += 2 + Math.max(0, value.length - 1);
    else if (value && typeof value === 'object') {
      const keys = Object.keys(value);
      this.bytes += 2 + Math.max(0, keys.length - 1);
      for (const key of keys)
        this.bytes += Buffer.byteLength(JSON.stringify(key)) + 1;
    } else this.bytes += Buffer.byteLength(JSON.stringify(value) ?? 'null');
    if (this.bytes > 32 * 1024 * 1024)
      throw new Error('Expanded request exceeds 32 MiB');
  }
  clone(value: unknown, depth: number): unknown {
    const pending = [{ values: [value][Symbol.iterator](), depth }];
    while (pending.length) {
      const frame = pending.at(-1)!,
        next = frame.values.next();
      if (next.done) {
        pending.pop();
        continue;
      }
      this.add(next.value, frame.depth);
      if (next.value && typeof next.value === 'object')
        pending.push({
          values: Array.isArray(next.value)
            ? next.value.values()
            : Object.values(next.value)[Symbol.iterator](),
          depth: frame.depth + 1,
        });
    }
    return structuredClone(value);
  }
}
