export type Entry = { id: string; seconds: number; completedAt: string };
export type Preferences = {
  motion: 'system' | 'reduced';
  accent: 'lime' | 'cobalt';
  checkIn: 'easy' | 'steady' | 'energized' | null;
};
export type StoredVela = { preferences: Preferences; entries: Entry[] };
export const INITIAL_PREFERENCES: Preferences = {
  motion: 'system',
  accent: 'lime',
  checkIn: null,
};
export const TOTAL_SECONDS = 22 * 60;
const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const isCheckIn = (value: unknown): value is Preferences['checkIn'] =>
  value === null ||
  value === 'easy' ||
  value === 'steady' ||
  value === 'energized';

/** Decode without coercion. Invalid storage stays behind the restore gate. */
export function readStored(raw: string): StoredVela {
  const value: unknown = JSON.parse(raw);
  if (
    !record(value) ||
    !record(value.preferences) ||
    !Array.isArray(value.entries) ||
    value.entries.length > 50
  )
    throw new Error('Invalid local data');
  const { motion, accent, checkIn } = value.preferences;
  if (
    (motion !== 'system' && motion !== 'reduced') ||
    (accent !== 'lime' && accent !== 'cobalt') ||
    !isCheckIn(checkIn)
  )
    throw new Error('Invalid local preferences');
  const ids = new Set<string>();
  const entries: Entry[] = value.entries.map((entry) => {
    if (
      !record(entry) ||
      typeof entry.id !== 'string' ||
      entry.id.length === 0 ||
      ids.has(entry.id) ||
      typeof entry.seconds !== 'number' ||
      !Number.isFinite(entry.seconds) ||
      entry.seconds < 0 ||
      entry.seconds > TOTAL_SECONDS ||
      typeof entry.completedAt !== 'string' ||
      !Number.isFinite(Date.parse(entry.completedAt))
    )
      throw new Error('Invalid local history');
    ids.add(entry.id);
    return {
      id: entry.id,
      seconds: entry.seconds,
      completedAt: entry.completedAt,
    };
  });
  return { preferences: { motion, accent, checkIn }, entries };
}
