import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true });
const observations = [];
try {
  const page = await browser.newPage();
  for (const device of ['iphone-palette-device', 'android-palette-device'])
    for (const archetype of ['hero', 'editorial']) {
      const base = `artifacts/responsive/${device}/${archetype}`;
      const data = JSON.parse(await readFile(`${base}.json`, 'utf8'));
      const bytes = await readFile(`${base}.png`);
      const counts = await page.evaluate(
        async ({ uri, tokens }) => {
          const image = new Image();
          image.src = uri;
          await image.decode();
          const canvas = document.createElement('canvas');
          canvas.width = image.width;
          canvas.height = image.height;
          const context = canvas.getContext('2d', { colorSpace: 'srgb' });
          context.drawImage(image, 0, 0);
          const pixels = context.getImageData(
            0,
            0,
            canvas.width,
            canvas.height,
          ).data;
          return Object.fromEntries(
            Object.entries(tokens).map(([name, hex]) => {
              const rgb = [1, 3, 5].map((offset) =>
                parseInt(hex.slice(offset, offset + 2), 16),
              );
              let count = 0;
              for (let i = 0; i < pixels.length; i += 4)
                if (
                  rgb.every((channel, index) => pixels[i + index] === channel)
                )
                  count++;
              return [name, count];
            }),
          );
        },
        {
          uri: `data:image/png;base64,${bytes.toString('base64')}`,
          tokens: data.state.colors.tokens,
        },
      );
      assert.ok(counts.canvas > 1000 && counts.ink > 1000);
      observations.push({
        device,
        archetype,
        declaredTokens: data.state.colors.tokens,
        exactPixelCounts: counts,
      });
    }
  await writeFile(
    'artifacts/responsive/palette-visual-check.json',
    JSON.stringify(
      {
        passed: true,
        observations,
        scope:
          'Actual screenshot pixels decoded to sRGB. Presence of declared colors is not complete accessibility validation. Root also visually inspected all four images.',
      },
      null,
      2,
    ) + '\n',
  );
} finally {
  await browser.close();
}
