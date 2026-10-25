import test from 'node:test';
import assert from 'node:assert/strict';
import {
  analyzeRasterPixels,
  analyzeMediaFile,
  MediaAnalyzeSchema,
} from '../src/media.js';
import { mediaCropCandidates } from '../src/media-geometry.js';

const region = { x: 0, y: 0, width: 1, height: 1 };
const blackText = {
  id: 'text',
  region,
  foreground: [0, 0, 0] as [number, number, number],
};
const whiteText = {
  ...blackText,
  foreground: [1, 1, 1] as [number, number, number],
};

test('full-region contrast catches an unsampled failing pixel', () => {
  const pixels = new Uint8Array([
    0, 0, 0, 255, 255, 255, 255, 255, 0, 0, 0, 255,
  ]);
  const result = analyzeRasterPixels(pixels, 3, 1, {
    sampleLimit: 1,
    contrastRegions: [whiteText],
  });
  assert.equal(result.sampledDescriptors.samples, 1);
  assert.equal(result.sampledDescriptors.meanRelativeLuminance, 0);
  assert.equal(result.contrastRegions[0]!.pixelsVisited, 3);
  assert.equal(result.contrastRegions[0]!.decodedPixelRatioRange!.min, 1);
  assert.equal(result.contrastRegions[0]!.status, 'fail');
});

test('black/white contrast extrema and interpolation bound are analytically known', () => {
  const pixels = new Uint8Array([255, 255, 255, 255]);
  const result = analyzeRasterPixels(pixels, 1, 1, {
    contrastRegions: [blackText],
  });
  assert.equal(result.contrastRegions[0]!.conservativeRatioLowerBound, 21);
  assert.equal(result.contrastRegions[0]!.status, 'pass');
  const mixed = analyzeRasterPixels(
    new Uint8Array([0, 0, 0, 255, 255, 255, 255, 255]),
    2,
    1,
    { contrastRegions: [{ ...blackText, foreground: [0.5, 0.5, 0.5] }] },
  );
  assert.equal(mixed.contrastRegions[0]!.conservativeRatioLowerBound, 1);
});

test('transparent colors remain unknown until a backdrop is authored', () => {
  const pixels = new Uint8Array([0, 0, 0, 0]);
  const unknown = analyzeRasterPixels(pixels, 1, 1, {
    contrastRegions: [blackText],
  });
  assert.equal(unknown.sampledDescriptors.meanRelativeLuminance, null);
  assert.equal(unknown.contrastRegions[0]!.status, 'unknown');
  const known = analyzeRasterPixels(pixels, 1, 1, {
    contrastRegions: [{ ...blackText, backdrop: [1, 1, 1] }],
  });
  assert.equal(known.contrastRegions[0]!.conservativeRatioLowerBound, 21);
});

test('invalid buffers, nonfinite inputs and regions beyond the source are rejected', () => {
  assert.throws(() => analyzeRasterPixels(new Uint8Array(4), 2, 1));
  assert.throws(() => analyzeRasterPixels(new Uint8Array(4), NaN, 1));
  assert.throws(() =>
    mediaCropCandidates({
      sourceWidth: 100,
      sourceHeight: 100,
      width: 50,
      height: 50,
      subjects: [{ x: 1, y: 0, width: 1e-300, height: 1 }],
    }),
  );
  assert.equal(
    MediaAnalyzeSchema.safeParse({
      file: 'x',
      contrastRegions: [{ ...blackText, region: { ...region, x: 0.1 } }],
    }).success,
    false,
  );
  assert.equal(
    MediaAnalyzeSchema.safeParse({ file: 'x', quality: 1 }).success,
    false,
  );
});

test('all cover candidates fill their destination and retain explicit authored/unknown distinctions', () => {
  for (const width of [100, 300, 900]) {
    const result = mediaCropCandidates({
      sourceWidth: 600,
      sourceHeight: 400,
      width,
      height: 300,
    });
    for (const crop of result.candidates) {
      assert.ok(
        crop.drawWidth + 1e-9 >= width && crop.drawHeight + 1e-9 >= 300,
      );
      assert.ok(
        crop.offsetX <= 0 && crop.offsetX + crop.drawWidth >= width - 1e-9,
      );
      assert.ok(
        crop.offsetY <= 0 && crop.offsetY + crop.drawHeight >= 300 - 1e-9,
      );
      assert.equal(crop.penalties.subjectLoss, null);
      assert.equal(crop.penalties.focalDisplacement, null);
    }
  }
});

test('subject-loss policy selects the visible authored subject and weights can change selection', () => {
  const request = {
    sourceWidth: 600,
    sourceHeight: 300,
    width: 300,
    height: 300,
    focal: { x: 0, y: 0.5 },
    subjects: [{ x: 0.8, y: 0.3, width: 0.15, height: 0.3 }],
  };
  const subjectsFirst = mediaCropCandidates(request);
  assert.equal(subjectsFirst.candidates[0]!.penalties.subjectLoss, 0);
  const focalFirst = mediaCropCandidates({
    ...request,
    weights: { subjectLoss: 0, focalDisplacement: 10 },
  });
  assert.equal(focalFirst.candidates[0]!.visibleSource.x, 0);
  assert.notEqual(
    subjectsFirst.candidates[0]!.visibleSource.x,
    focalFirst.candidates[0]!.visibleSource.x,
  );
});

test('real local original raster decodes with source hash and full-resolution region evidence', async () => {
  const result = await analyzeMediaFile({
    file: 'native/assets/fieldwork/headland.png',
    sampleLimit: 32,
    provenance: {
      origin: 'original-generated',
      source: 'research/fieldwork-asset-provenance.json',
      expectedSha256:
        '8fee5f6272e740a888eb4212c52223758a7c94a2db4c234aa9b2ab389ce639a3',
    },
    contrastRegions: [
      { ...whiteText, region: { x: 0, y: 0, width: 0.1, height: 0.1 } },
    ],
  });
  assert.equal(result.width, 1536);
  assert.equal(result.height, 1024);
  assert.equal(result.mime, 'image/png');
  assert.equal(result.provenance.hashVerified, true);
  assert.equal(result.provenance.rightsStatus, 'unknown');
  assert.equal(result.contrastRegions[0]!.pixelsVisited, 154 * 103);
  assert.ok(result.sampledDescriptors.samples <= 32);
  assert.ok(result.metadataUnknown.includes('calibrated albedo'));
});

test('mismatched provenance rejects before raster decode', async () => {
  await assert.rejects(
    analyzeMediaFile({
      file: 'native/assets/fieldwork/headland.png',
      provenance: { expectedSha256: '0'.repeat(64) },
    }),
    /expectedSha256/,
  );
});
