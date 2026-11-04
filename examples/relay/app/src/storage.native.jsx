// Native adapter exception: Expo file persistence and platform share sheet.
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { namespace } from './model.mjs';
const file = () => new File(Paths.document, namespace + '.json');
export const storage = {
  read: async () => (file().exists ? file().text() : null),
  write: async (value) => file().write(value),
  clear: async () => {
    if (file().exists) file().delete();
  },
};
export async function exportState(value) {
  const output = new File(Paths.cache, namespace + '-export.json');
  output.write(value);
  if (!(await Sharing.isAvailableAsync()))
    return (
      'Export file prepared at ' +
      output.uri +
      '. Native sharing is unavailable on this device.'
    );
  await Sharing.shareAsync(output.uri, {
    mimeType: 'application/json',
    UTI: 'public.json',
    dialogTitle: 'Export Relay synthetic demo state',
  });
  return 'Export file prepared and native share sheet closed. Delivery is not asserted.';
}
