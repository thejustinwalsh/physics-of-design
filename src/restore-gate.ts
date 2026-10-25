/** A failed or incomplete restore must never authorize overwriting unknown stored data. */
export function createRestoreGate<T>(io: {
  read: () => Promise<string | null>;
  write: (serialized: string) => Promise<void>;
  decode: (raw: string | null) => T;
}) {
  let restored = false;
  let generation = 0;
  return {
    async restore(): Promise<T> {
      const attempt = ++generation;
      restored = false;
      const value = io.decode(await io.read());
      if (attempt !== generation) throw new Error('Restore attempt superseded');
      restored = true;
      return value;
    },
    async save(value: T): Promise<void> {
      if (!restored)
        throw new Error('Saving is blocked until restoration succeeds');
      await io.write(JSON.stringify(value));
    },
  };
}
