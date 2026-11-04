import test from 'node:test';
import assert from 'node:assert/strict';
import { parseXwd, registerXwdSample, screenFiducials, assertVirtualScreenEnvironment } from '../scripts/dom-surface-xwd.mjs';

function fixture({ width = 3, height = 2, byteOrder = 0, bits = 24, colors = 2, masks = [0xff0000, 0xff00, 0xff], visualClass = 4, extraStride = 0 } = {}) {
  const stride = Math.ceil(width * bits / 32) * 4 + extraStride, headerSize = 104;
  const bytes = Buffer.alloc(headerSize + colors * 12 + stride * height);
  const words = [headerSize, 7, 2, 24, width, height, 0, byteOrder, 32, 0, 32, bits, stride, visualClass, ...masks, 8, 256, colors, width, height, 0, 0, 0];
  words.forEach((v, i) => bytes.writeUInt32BE(v, i * 4));
  bytes.write('ci\0', 100);
  if (visualClass === 5) for (let i = 0; i < colors; i++) {
    const at = headerSize + i * 12;
    bytes.writeUInt32BE(i * 0x010101, at);
    for (let channel = 0; channel < 3; channel++) bytes.writeUInt16BE(i * 257, at + 4 + channel * 2);
  }
  function paint(x, y, rgb) {
    const shifts = masks.map(m => { let s = 0; while (((m >>> s) & 1) === 0) s++; return s; });
    const value = rgb.reduce((v, c, i) => (v | (c << shifts[i])) >>> 0, 0);
    const at = headerSize + colors * 12 + y * stride + x * bits / 8;
    bytes[byteOrder === 0 ? 'writeUIntLE' : 'writeUIntBE'](value, at, bits / 8);
  }
  return { bytes, paint };
}
for (const byteOrder of [0, 1]) for (const bits of [24, 32]) {
  test(`XWD MSB header / pixel byte order ${byteOrder} / ${bits}-bit stride and color-table offset`, () => {
    const f = fixture({ byteOrder, bits });
    f.paint(0, 0, [1, 2, 3]); f.paint(2, 1, [210, 161, 113]);
    const im = parseXwd(f.bytes);
    assert.deepEqual(im.pixel(0, 0), [1, 2, 3]);
    assert.deepEqual(im.pixel(2, 1), [210, 161, 113]);
    assert.throws(() => im.pixel(3, 0), /outside/);
  });
}
test('XWD follows channel masks rather than assuming RGB order', () => {
  const f = fixture({ masks: [0xff, 0xff0000, 0xff00] });
  f.paint(1, 1, [17, 88, 230]);
  assert.deepEqual(parseXwd(f.bytes).pixel(1, 1), [17, 88, 230]);
});
test('XWD fails closed on unsupported or malformed headers/payloads', () => {
  for (const [word, value] of [[0, 99], [1, 8], [2, 1], [3, 16], [4, 0], [6, 1], [7, 2], [9, 2], [10, 7], [11, 16], [12, 8], [13, 3], [14, 0xff00], [14, 0xff000000], [14, 0xf10000], [17, 10], [19, 4097]]) {
    const f = fixture(); f.bytes.writeUInt32BE(value, word * 4);
    assert.throws(() => parseXwd(f.bytes), undefined, `word ${word} = ${value}`);
  }
  const f = fixture();
  assert.throws(() => parseXwd(f.bytes.subarray(0, -1)), /payload/);
  assert.throws(() => parseXwd(Buffer.concat([f.bytes, Buffer.from([0])])), /payload/);
  f.bytes.writeUInt32LE(7, 4);
  assert.throws(() => parseXwd(f.bytes), /v7/);
});
function registeredFixture() {
  const f = fixture({ width: 100, height: 90, bits: 32 });
  const place = origin => { for (const m of screenFiducials) for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) f.paint(origin.x + m.x + x, origin.y + m.y + y, m.rgb); };
  place({ x: 7, y: 20 }); f.paint(57, 70, [136, 136, 136]);
  return { ...f, place };
}
test('two full fiducials register viewport origin and sample the same viewport pixel', () => {
  const f = registeredFixture();
  const r = registerXwdSample(parseXwd(f.bytes), screenFiducials, { x: 50, y: 50 });
  assert.deepEqual(r.origin, { x: 7, y: 20 });
  assert.deepEqual(r.screenPoint, { x: 57, y: 70 });
  assert.deepEqual(r.rgb, [136, 136, 136]);
});
test('registration rejects missing, partially obscured and duplicate markers', () => {
  assert.throws(() => registerXwdSample(parseXwd(fixture({ width: 100, height: 90 }).bytes), screenFiducials, { x: 50, y: 50 }), /not found/);
  const f = registeredFixture(); f.paint(11, 24, [0, 0, 0]);
  assert.throws(() => registerXwdSample(parseXwd(f.bytes), screenFiducials, { x: 50, y: 50 }), /not found/);
  const g = registeredFixture(); g.place({ x: 7, y: 50 });
  assert.throws(() => registerXwdSample(parseXwd(g.bytes), screenFiducials, { x: 50, y: 50 }), /Ambiguous/);
});
test('screen capture guard rejects macOS, local sessions, remote DISPLAY and headless mode', () => {
  const good = { platform: 'linux', headed: true, env: { GITHUB_ACTIONS: 'true', RUNNER_OS: 'Linux', DISPLAY: ':99', DESIGN_DOM_GPU_OS_SCREEN_DIAGNOSTIC: '1' } };
  assert.doesNotThrow(() => assertVirtualScreenEnvironment(good));
  for (const change of [{ platform: 'darwin' }, { headed: false }, { env: {} }, { env: { ...good.env, DISPLAY: 'otherhost:0' } }, { env: { ...good.env, GITHUB_ACTIONS: 'false' } }, { env: { ...good.env, DESIGN_DOM_GPU_OS_SCREEN_DIAGNOSTIC: '0' } }]) assert.throws(() => assertVirtualScreenEnvironment({ ...good, ...change }), /requires/);
});

for (const byteOrder of [0, 1]) test(`identity DirectColor honors padded 24-bit rows, byte order ${byteOrder}`, () => {
  const f = fixture({ byteOrder, visualClass: 5, colors: 256, extraStride: 8 });
  f.bytes.writeUInt32BE(8, 10 * 4);
  f.paint(0, 0, [3, 251, 17]); f.paint(2, 1, [249, 5, 239]);
  const image = parseXwd(f.bytes);
  assert.deepEqual(image.pixel(0, 0), [3, 251, 17]);
  assert.deepEqual(image.pixel(2, 1), [249, 5, 239]);
});
test('DirectColor rejects missing, duplicate and non-identity colormap entries', () => {
  assert.throws(() => parseXwd(fixture({ visualClass: 5 }).bytes), /complete identity/);
  const nonIdentity = fixture({ visualClass: 5, colors: 256 });
  nonIdentity.bytes.writeUInt16BE(42 * 257 + 1, 104 + 42 * 12 + 4);
  assert.throws(() => parseXwd(nonIdentity.bytes), /Non-identity/);
  const duplicate = fixture({ visualClass: 5, colors: 256 });
  duplicate.bytes.copy(duplicate.bytes, 104 + 42 * 12, 104 + 41 * 12, 104 + 42 * 12);
  assert.throws(() => parseXwd(duplicate.bytes), /complete identity/);
});
