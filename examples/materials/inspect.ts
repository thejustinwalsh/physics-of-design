import { readFile, writeFile } from 'node:fs/promises';
import { analyzeMediaFile } from '../../src/media.js';
import { mediaCropCandidates } from '../../src/media-geometry.js';
import {
  probeSurface,
  mapSurfaceToThree,
  generateSurfaceTextures,
} from '../../src/surface.js';

const media = JSON.parse(
  await readFile(new URL('./headland-media.json', import.meta.url), 'utf8'),
);
const recipes = JSON.parse(
  await readFile(new URL('./recipes.json', import.meta.url), 'utf8'),
);
const report = {
  media: await analyzeMediaFile(media.analysis),
  crops: mediaCropCandidates(media.crop),
  surfaces: recipes.recipes.map(
    (recipe: { id: string; surface: unknown; texture: unknown }) => {
      const texture = generateSurfaceTextures(recipe.texture);
      return {
        id: recipe.id,
        probe: probeSurface({ surface: recipe.surface }),
        mapping: mapSurfaceToThree(recipe.surface),
        texture: {
          width: texture.width,
          height: texture.height,
          parameters: texture.parameters,
          algorithm: texture.algorithm,
          encoding: texture.encoding,
          roughnessMapSemantics: texture.roughnessMapSemantics,
        },
      };
    },
  ),
};
await writeFile(
  new URL('./measured-report.json', import.meta.url),
  JSON.stringify(report, null, 2) + '\n',
);
console.log(
  JSON.stringify(
    {
      width: report.media.width,
      height: report.media.height,
      sha256: report.media.sha256,
      decoder: report.media.decoder,
      contrast: report.media.contrastRegions.map((r) => ({
        id: r.id,
        lowerBound: r.conservativeRatioLowerBound,
        status: r.status,
      })),
      cropCount: report.crops.candidates.length,
    },
    null,
    2,
  ),
);
