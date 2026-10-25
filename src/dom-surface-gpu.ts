import type { DomSurfaceRecipe, DomSurfaceLightSample } from './dom-surface.js';
import {
  createDomSurfaceTexture,
  domSurfaceLinearColor,
  DOM_SURFACE_VERTEX,
  DOM_SURFACE_FRAGMENT,
  type DomSurfaceOutput,
} from './dom-surface-shading.js';
export type { DomSurfaceOutput } from './dom-surface-shading.js';

export interface DomSurfaceGpuOptions {
  pixelRatio?: number;
  maxPixels?: number;
  output?: DomSurfaceOutput;
}

/** A retained decorative layer. Capability/context loss selects CSS; caller arithmetic throws. */
export function createDomSurfaceGpu(
  element: HTMLElement,
  initial: DomSurfaceRecipe,
  options: DomSurfaceGpuOptions = {},
) {
  const ratio =
    options.pixelRatio ??
    Math.min(1.5, element.ownerDocument.defaultView!.devicePixelRatio || 1);
  const maxPixels = options.maxPixels ?? 750_000;
  if (
    !Number.isFinite(ratio) ||
    ratio <= 0 ||
    ratio > 2 ||
    !Number.isInteger(maxPixels) ||
    maxPixels < 1024 ||
    maxPixels > 2_000_000
  )
    throw new Error(
      'pixelRatio must be (0,2], maxPixels an integer in [1024,2000000]',
    );
  const outputs: DomSurfaceOutput[] = [
    'lit',
    'diffuse',
    'specular',
    'normal',
    'roughness',
  ];
  if (options.output !== undefined && !outputs.includes(options.output))
    throw new Error('Unknown material output');
  const canvas = element.ownerDocument.createElement('canvas');
  canvas.className = 'dt-dom-light-canvas';
  canvas.setAttribute('aria-hidden', 'true');
  const originalRenderer = element.getAttribute('data-dom-renderer');
  const stats = {
    draws: 0,
    textureBuilds: 0,
    textureUploads: 0,
    programBuilds: 0,
    pixels: 0,
    initializationMs: 0,
    initializationTaskMaxMs: 0,
    initializationTasks: 0,
    parallelCompile: false,
    textureBuildMs: 0,
    status: 'initializing',
    reason: '',
  };
  let gl: WebGL2RenderingContext | null = null;
  let program: WebGLProgram | null = null,
    texture: WebGLTexture | null = null;
  let recipe = initial,
    disposed = false,
    width = 1,
    height = 1,
    key = '',
    output = options.output ?? 'lit',
    suspended = false;
  let tile: ReturnType<typeof createDomSurfaceTexture> | null = null;
  let latest: DomSurfaceLightSample | null = null,
    dirty = true,
    lastKey = '';
  const win = element.ownerDocument.defaultView!;
  let pending = 0,
    drawFrame = 0,
    pendingIdle = false,
    initializationStart = 0;
  let phase: 'context' | 'link' | 'texture' = 'context';
  let parallel: KHR_parallel_shader_compile | null = null;
  const uniforms = new Map<string, WebGLUniformLocation | null>();
  function cancelDraw() {
    if (drawFrame) win.cancelAnimationFrame(drawFrame);
    drawFrame = 0;
  }
  function fallback(reason: string) {
    cancelDraw();
    stats.status = 'fallback';
    stats.reason = reason;
    canvas.hidden = true;
    element.setAttribute('data-dom-renderer', 'css');
  }
  function release() {
    if (gl && program) gl.deleteProgram(program);
    if (gl && texture) gl.deleteTexture(texture);
    program = texture = null;
    uniforms.clear();
  }
  function compile(type: number, source: string) {
    const shader = gl!.createShader(type)!;
    gl!.shaderSource(shader, source);
    gl!.compileShader(shader);
    return shader;
  }
  function upload() {
    if (!gl || !texture || suspended || gl.isContextLost()) return;
    if (!tile) {
      const start = performance.now();
      tile = createDomSurfaceTexture(
        recipe.input.material,
        recipe.input.textureSeed,
      );
      stats.textureBuilds++;
      stats.textureBuildMs += performance.now() - start;
    }
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      tile.width,
      tile.height,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      tile.pixels,
    );
    gl.texParameteri(
      gl.TEXTURE_2D,
      gl.TEXTURE_MIN_FILTER,
      gl.LINEAR_MIPMAP_LINEAR,
    );
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
    gl.generateMipmap(gl.TEXTURE_2D);
    stats.textureUploads++;
  }
  function initialize() {
    if (disposed || suspended || stats.status !== 'initializing') return;
    const start = performance.now();
    if (!initializationStart) initializationStart = start;
    try {
      if (phase === 'context') {
        gl = canvas.getContext('webgl2', {
          alpha: true,
          premultipliedAlpha: false,
          antialias: false,
          depth: false,
          stencil: false,
          powerPreference: 'low-power',
          preserveDrawingBuffer: false,
        });
        if (!gl) {
          fallback('WebGL2 unavailable');
          return;
        }
        parallel = gl.getExtension('KHR_parallel_shader_compile');
        stats.parallelCompile = parallel !== null;
        let vertex: WebGLShader | null = null,
          fragment: WebGLShader | null = null;
        try {
          vertex = compile(gl.VERTEX_SHADER, DOM_SURFACE_VERTEX);
          fragment = compile(gl.FRAGMENT_SHADER, DOM_SURFACE_FRAGMENT);
          program = gl.createProgram()!;
          gl.attachShader(program, vertex);
          gl.attachShader(program, fragment);
          gl.linkProgram(program);
        } finally {
          if (vertex) gl.deleteShader(vertex);
          if (fragment) gl.deleteShader(fragment);
        }
        phase = 'link';
        schedule(16);
        return;
      }
      if (phase === 'link') {
        if (
          parallel &&
          !gl!.getProgramParameter(program!, parallel.COMPLETION_STATUS_KHR)
        ) {
          schedule(16);
          return;
        }
        if (!gl!.getProgramParameter(program!, gl!.LINK_STATUS))
          throw new Error(
            gl!.getProgramInfoLog(program!) ?? 'Shader link failed',
          );
        stats.programBuilds++;
        for (const name of [
          'Texture',
          'Base',
          'LightColor',
          'Light',
          'PlaneNormal',
          'Aspect',
          'Roughness',
          'Metalness',
          'Variation',
          'TextureAmount',
          'Scale',
          'Intensity',
          'Ambient',
          'Exposure',
          'Point',
          'Alpha',
          'Output',
        ])
          uniforms.set(name, gl!.getUniformLocation(program!, `u${name}`));
        texture = gl!.createTexture();
        phase = 'texture';
        schedule();
        return;
      }
      upload();
      stats.status = 'ready';
      stats.reason = '';
      canvas.hidden = false;
      element.setAttribute('data-dom-renderer', 'webgl');
      if (latest) draw(latest);
    } catch (error) {
      release();
      fallback(error instanceof Error ? error.message : String(error));
    } finally {
      stats.initializationMs = performance.now() - initializationStart;
      stats.initializationTaskMaxMs = Math.max(
        stats.initializationTaskMaxMs,
        performance.now() - start,
      );
      stats.initializationTasks++;
    }
  }
  function update(next: DomSurfaceRecipe) {
    recipe = next;
    dirty = true;
    const nextKey = `${recipe.input.material}:${recipe.input.textureSeed}`;
    if (key !== nextKey) {
      key = nextKey;
      tile = null;
      upload();
    }
  }
  function resize(cssWidth: number, cssHeight: number) {
    width = Math.max(1, cssWidth);
    height = Math.max(1, cssHeight);
    const scale = Math.min(ratio, Math.sqrt(maxPixels / (width * height)));
    const w = Math.max(1, Math.floor(width * scale)),
      h = Math.max(1, Math.floor(height * scale));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
      dirty = true;
    }
    stats.pixels = w * h;
    if (latest) draw(latest);
  }
  function draw(sample: DomSurfaceLightSample) {
    latest = sample;
    if (disposed || suspended || !gl || !program || stats.status !== 'ready')
      return;
    if (drawFrame || (!dirty && sampleKey(sample) === lastKey)) return;
    // Coalesce external-clock samples and synchronous recipe/output edits at presentation.
    drawFrame = win.requestAnimationFrame(() => {
      drawFrame = 0;
      if (latest) submit(latest);
    });
  }
  function sampleKey(sample: DomSurfaceLightSample) {
    return [...sample.normal, ...sample.lightDirection]
      .map((v) => Math.round(v * 100000))
      .join(':');
  }
  function submit(sample: DomSurfaceLightSample) {
    if (
      disposed ||
      suspended ||
      !gl ||
      !program ||
      stats.status !== 'ready' ||
      gl.isContextLost()
    )
      return;
    const renderKey = sampleKey(sample);
    if (!dirty && renderKey === lastKey) return;
    const r = recipe.input;
    // CSS percentage coordinates use down-positive y; shader world uses up-positive y.
    // Light direction already contains the host's pointer/scroll/tilt target, including maxTilt=0.
    const light = sample.lightDirection.map(
      (v) => (v * r.light.z) / sample.lightDirection[2]!,
    ) as [number, number, number];
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.useProgram(program);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.uniform1i(uniforms.get('Texture')!, 0);
    gl.uniform3fv(uniforms.get('Base')!, domSurfaceLinearColor(r.baseColor));
    gl.uniform3fv(
      uniforms.get('LightColor')!,
      domSurfaceLinearColor(r.light.color),
    );
    gl.uniform3f(uniforms.get('Light')!, light[0], -light[1], light[2]);
    gl.uniform3f(
      uniforms.get('PlaneNormal')!,
      sample.normal[0]!,
      -sample.normal[1]!,
      sample.normal[2]!,
    );
    const scalars = {
      Aspect: width / height,
      Roughness: r.roughness,
      Metalness: r.metalness,
      Variation: r.roughnessVariation,
      TextureAmount: r.textureAmount,
      Scale: r.textureScale,
      Intensity: r.light.intensity,
      Ambient: r.light.ambient,
      Exposure: r.exposure,
      Point: r.light.kind === 'point' ? 1 : 0,
      Alpha: 1 - r.translucency,
    };
    for (const [name, value] of Object.entries(scalars))
      gl.uniform1f(uniforms.get(name)!, value);
    gl.uniform1i(uniforms.get('Output')!, outputs.indexOf(output));
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    // Submission is nonblocking; presented pixels remain the renderer proof's responsibility.
    gl.flush();
    dirty = false;
    lastKey = renderKey;
    stats.draws++;
  }
  function onLost(event: Event) {
    event.preventDefault();
    fallback('WebGL context lost');
  }
  function onRestored() {
    release();
    dirty = true;
    phase = 'context';
    initializationStart = 0;
    stats.status = 'initializing';
    schedule();
  }
  canvas.addEventListener('webglcontextlost', onLost);
  canvas.addEventListener('webglcontextrestored', onRestored);
  update(recipe);
  element.prepend(canvas);
  // Keep the readable CSS frame available while the small optional program initializes.
  function schedule(delay = 0) {
    if (pending || disposed || suspended || stats.status !== 'initializing')
      return;
    pendingIdle = delay === 0 && typeof win.requestIdleCallback === 'function';
    const run = () => {
      pending = 0;
      initialize();
    };
    pending = pendingIdle
      ? win.requestIdleCallback(run, { timeout: 500 })
      : win.setTimeout(run, delay);
  }
  schedule();
  return {
    canvas,
    stats,
    setSuspended(value: boolean) {
      suspended = value;
      if (suspended) cancelDraw();
      if (!suspended) {
        schedule();
        if (stats.status === 'ready' && !tile) upload();
        if (latest) draw(latest);
      }
    },
    draw,
    resize,
    update,
    setOutput(next: DomSurfaceOutput) {
      if (!outputs.includes(next)) throw new Error('Unknown material output');
      output = next;
      dirty = true;
      if (latest) draw(latest);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      cancelDraw();
      if (pending) {
        if (pendingIdle) win.cancelIdleCallback(pending);
        else win.clearTimeout(pending);
      }
      release();
      canvas.removeEventListener('webglcontextlost', onLost);
      canvas.removeEventListener('webglcontextrestored', onRestored);
      canvas.remove();
      stats.status = 'disposed';
      if (originalRenderer === null)
        element.removeAttribute('data-dom-renderer');
      else element.setAttribute('data-dom-renderer', originalRenderer);
    },
  };
}
