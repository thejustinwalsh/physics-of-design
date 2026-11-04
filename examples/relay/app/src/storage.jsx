import { namespace } from './model.mjs';
export const storage = {
  read: async () => localStorage.getItem(namespace),
  write: async (value) => localStorage.setItem(namespace, value),
  clear: async () => localStorage.removeItem(namespace),
};
export async function exportState(value) {
  const blob = new Blob([value], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'relay-demo-state.json';
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return 'Downloaded relay-demo-state.json';
}
