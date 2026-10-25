import { createSurfaceScene } from './surface-scene.js';

let scene,
  pendingSettings,
  pendingFrame,
  pendingId,
  scheduled = false;
let initializedAt,
  firstPresentation = true,
  disposed = false;
const fail = (error) =>
  self.postMessage({
    type: 'error',
    message: error instanceof Error ? error.message : String(error),
  });
// The host supplies animation time. This callback only presents explicitly
// requested work at a worker rendering opportunity; it does not run a loop.
const schedule = () => {
  if (scheduled || disposed) return;
  scheduled = true;
  const present = () => {
    scheduled = false;
    if (disposed) return;
    try {
      const started = performance.now();
      const settings = pendingSettings,
        frame = pendingFrame,
        id = pendingId;
      pendingSettings = pendingFrame = pendingId = undefined;
      if (settings) scene.update(settings);
      const draw = scene.render(frame ?? { reduced: true });
      if (firstPresentation) {
        firstPresentation = false;
        self.postMessage({
          type: 'ready',
          initializationMilliseconds: performance.now() - initializedAt,
          draw,
        });
      }
      self.postMessage({
        type: 'frame',
        id,
        draw,
        renderMilliseconds: performance.now() - started,
      });
    } catch (error) {
      fail(error);
    }
  };
  if (typeof self.requestAnimationFrame === 'function')
    self.requestAnimationFrame(present);
  else setTimeout(present, 0);
};
self.onmessage = ({ data }) => {
  try {
    if (data.type === 'init') {
      initializedAt = performance.now();
      data.canvas.addEventListener('webglcontextlost', (event) => {
        event.preventDefault();
        fail(new Error('WebGL context lost'));
      });
      scene = createSurfaceScene(data.canvas, data.settings);
      schedule();
    } else if (data.type === 'config') {
      pendingSettings = { ...pendingSettings, ...data.settings };
      schedule();
    } else if (data.type === 'frame') {
      pendingFrame = data.frame;
      pendingId = data.id;
      schedule();
    } else if (data.type === 'dispose') {
      disposed = true;
      scene?.dispose();
      self.close();
    }
  } catch (error) {
    fail(error);
  }
};
