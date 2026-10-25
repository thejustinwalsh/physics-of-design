import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const commit = 'e7db6ca603fd4862010383ff17ffd6cc4ffac1c0';
const entries = [
  ['lato', 'Lato-Regular.ttf'],
  ['lato', 'Lato-Black.ttf'],
  ['spectral', 'Spectral-Regular.ttf'],
  [
    'robotoflex',
    'RobotoFlex[GRAD,XOPQ,XTRA,YOPQ,YTAS,YTDE,YTFI,YTLC,YTUC,opsz,slnt,wdth,wght].ttf',
  ],
  ['notosansarabic', 'NotoSansArabic[wdth,wght].ttf'],
];
const output = path.join(root, 'assets/fonts');
await mkdir(output, { recursive: true });
let old;
try {
  old = JSON.parse(await readFile(path.join(output, 'manifest.json'), 'utf8'));
} catch (e) {
  if (e.code !== 'ENOENT') throw e;
}
const files = [];
for (const [family, file] of [
  ...entries,
  ...['lato', 'spectral', 'robotoflex', 'notosansarabic'].map((f) => [
    f,
    'OFL.txt',
  ]),
]) {
  const name = file === 'OFL.txt' ? `${family}-OFL.txt` : file;
  const url = `https://raw.githubusercontent.com/google/fonts/${commit}/ofl/${family}/${encodeURIComponent(file)}`;
  const result = await fetch(url);
  if (!result.ok) throw new Error(`${result.status} ${url}`);
  const bytes = Buffer.from(await result.arrayBuffer());
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  const expected = old?.files.find((f) => f.file === name)?.sha256;
  if (expected && expected !== sha256)
    throw new Error(`checksum mismatch: ${name}`);
  await writeFile(path.join(output, name), bytes);
  files.push({
    file: name,
    url,
    sha256,
    license: 'SIL Open Font License 1.1',
    licenseFile: `${family}-OFL.txt`,
  });
}
await writeFile(
  path.join(output, 'manifest.json'),
  JSON.stringify(
    { repository: 'https://github.com/google/fonts', commit, files },
    null,
    2,
  ) + '\n',
);
process.stderr.write(
  `Verified ${files.length} font/license assets from pinned google/fonts revision.\n`,
);
