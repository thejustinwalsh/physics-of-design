// Diagnostic-only XWD v7 subset, not a product screenshot adapter.
// Primary layout: X.Org xorgproto-2024.1/include/X11/XWDFile.h.
// https://www.x.org/releases/individual/proto/xorgproto-2024.1.tar.xz
// Header words are always MSB-first; byte_order describes only image pixels.
// Xlib image stride may exceed its minimum. DirectColor needs its colormap:
// https://www.x.org/releases/X11R7.6/doc/libX11/specs/libX11/libX11.html
// This diagnostic accepts only complete identity DirectColor ramps.
import assert from 'node:assert/strict';

export const screenFiducials = [
  { id: 'dt-screen-a', x: 4, y: 4, width: 8, height: 8, rgb: [3, 251, 17] },
  { id: 'dt-screen-b', x: 28, y: 4, width: 8, height: 8, rgb: [249, 5, 239] },
];

export function assertVirtualScreenEnvironment({
  platform = process.platform,
  env = process.env,
  headed,
} = {}) {
  assert(
    platform === 'linux' && headed === true &&
      env.GITHUB_ACTIONS === 'true' && env.RUNNER_OS === 'Linux' &&
      /^:\d+(?:\.\d+)?$/.test(env.DISPLAY ?? '') &&
      env.DESIGN_DOM_GPU_OS_SCREEN_DIAGNOSTIC === '1',
    'Virtual-screen capture requires explicit headed Linux GitHub Actions and a local DISPLAY',
  );
}

export function parseXwd(bytes) {
  assert(Buffer.isBuffer(bytes) && bytes.length >= 101 && bytes.length <= 64 * 1024 * 1024, 'Invalid XWD length');
  const names = ['headerSize', 'version', 'format', 'depth', 'width', 'height',
    'xoffset', 'byteOrder', 'bitmapUnit', 'bitmapBitOrder', 'bitmapPad',
    'bitsPerPixel', 'bytesPerLine', 'visualClass', 'redMask', 'greenMask',
    'blueMask', 'bitsPerRgb', 'colormapEntries', 'ncolors', 'windowWidth',
    'windowHeight', 'windowX', 'windowY', 'borderWidth'];
  const header = Object.fromEntries(names.map((name, i) => [name, bytes.readUInt32BE(i * 4)]));
  const h = header;
  assert(h.headerSize >= 101 && h.headerSize <= 4096 && h.headerSize <= bytes.length && bytes[h.headerSize - 1] === 0, 'Invalid XWD name/header');
  assert(h.version === 7 && h.format === 2 && h.depth === 24 && [4, 5].includes(h.visualClass) && h.bitsPerRgb === 8, 'Only XWD v7 24-bit TrueColor or identity DirectColor ZPixmap is supported');
  assert(h.width > 0 && h.height > 0 && h.width <= 8192 && h.height <= 8192 && h.width * h.height <= 16 * 1024 * 1024, 'Invalid XWD dimensions');
  assert(h.xoffset === 0 && [0, 1].includes(h.byteOrder) && [0, 1].includes(h.bitmapBitOrder) && [8, 16, 32].includes(h.bitmapUnit) && [8, 16, 32].includes(h.bitmapPad) && [24, 32].includes(h.bitsPerPixel), 'Unsupported XWD packing');
  const pixelBytes = h.bitsPerPixel / 8;
  const minimumStride = Math.ceil(h.width * h.bitsPerPixel / h.bitmapPad) * h.bitmapPad / 8;
  assert(h.bytesPerLine >= minimumStride && h.bytesPerLine % (h.bitmapPad / 8) === 0, 'Invalid XWD stride');
  const masks = [h.redMask, h.greenMask, h.blueMask];
  const shifts = masks.map(mask => {
    assert(mask > 0 && mask < 2 ** h.bitsPerPixel, 'Invalid XWD channel mask');
    let shift = 0;
    while (((mask >>> shift) & 1) === 0) shift++;
    assert((mask >>> shift) === 255 && shift <= h.bitsPerPixel - 8, 'Only contiguous 8-bit XWD channels are supported');
    return shift;
  });
  assert((masks[0] & masks[1]) === 0 && (masks[0] & masks[2]) === 0 && (masks[1] & masks[2]) === 0, 'Overlapping XWD masks');
  const offset = h.headerSize + h.ncolors * 12;
  assert(h.ncolors <= 4096 && offset + h.bytesPerLine * h.height === bytes.length, 'Invalid XWD colors/pixel payload');
  if (h.visualClass === 5) {
    assert(h.ncolors === 256 && h.colormapEntries === 256, 'DirectColor requires complete identity ramps');
    const indices = masks.map(() => new Set());
    for (let i = 0; i < h.ncolors; i++) {
      const at = h.headerSize + i * 12, pixel = bytes.readUInt32BE(at);
      for (let channel = 0; channel < 3; channel++) {
        const index = (pixel & masks[channel]) >>> shifts[channel];
        assert(bytes.readUInt16BE(at + 4 + channel * 2) === index * 257, 'Non-identity DirectColor ramp is unsupported');
        indices[channel].add(index);
      }
    }
    assert(indices.every(values => values.size === 256), 'DirectColor requires complete identity ramps');
  }
  return {
    header,
    pixel(x, y) {
      assert(Number.isInteger(x) && Number.isInteger(y) && x >= 0 && y >= 0 && x < h.width && y < h.height, 'XWD sample outside image');
      const at = offset + y * h.bytesPerLine + x * pixelBytes;
      const word = h.byteOrder === 0 ? bytes.readUIntLE(at, pixelBytes) : bytes.readUIntBE(at, pixelBytes);
      return masks.map((mask, i) => (word & mask) >>> shifts[i]);
    },
  };
}

export function registerXwdSample(image, markers, point) {
  assert(markers.length === 2 && markers.every(m =>
    [m.x, m.y].every(Number.isInteger) && m.width === 8 && m.height === 8 &&
    m.rgb.length === 3 && m.rgb.every(v => Number.isInteger(v) && v >= 0 && v <= 255)), 'Invalid screen fiducials');
  assert(markers[0].rgb.some((v, i) => v !== markers[1].rgb[i]), 'Screen fiducials must differ');
  const same = (x, y, rgb) => image.pixel(x, y).every((v, i) => v === rgb[i]);
  const block = (x, y, m) => {
    if (x < 0 || y < 0 || x + 8 > image.header.width || y + 8 > image.header.height) return false;
    for (let dy = 0; dy < 8; dy++) for (let dx = 0; dx < 8; dx++) if (!same(x + dx, y + dy, m.rgb)) return false;
    return true;
  };
  const origins = [];
  for (let y = 0; y <= image.header.height - 8; y++) {
    for (let x = 0; x <= image.header.width - 8; x++) {
      if (!same(x, y, markers[0].rgb) || !block(x, y, markers[0])) continue;
      const origin = { x: x - markers[0].x, y: y - markers[0].y };
      if (origin.x < 0 || origin.y < 0 || !block(origin.x + markers[1].x, origin.y + markers[1].y, markers[1])) continue;
      origins.push(origin);
      assert(origins.length === 1, 'Ambiguous XWD fiducial registration');
    }
  }
  assert(origins.length === 1, 'XWD fiducials not found');
  const origin = origins[0], screenPoint = { x: origin.x + point.x, y: origin.y + point.y };
  return { header: image.header, origin, screenPoint, rgb: image.pixel(screenPoint.x, screenPoint.y) };
}
