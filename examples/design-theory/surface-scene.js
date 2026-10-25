import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import {
  generateSurfaceTextures,
  mapSurfaceToThree,
} from '../../src/surface.ts';

// The same renderer supports an OffscreenCanvas worker or a bounded main-thread fallback.
export function createSurfaceScene(canvas, settings) {
  const context = canvas.getContext('webgl2', {
    alpha: true,
    antialias: true,
    powerPreference: 'low-power',
  });
  if (!context) throw new Error('WebGL2 unavailable');
  const renderer = new THREE.WebGLRenderer({
    canvas,
    context,
    antialias: true,
    alpha: true,
    powerPreference: 'low-power',
  });
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 30);
  camera.position.set(0, 0.15, 6.5);
  const room = new RoomEnvironment();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const environment = pmrem.fromScene(room, 0.05);
  scene.environment = environment.texture;
  room.dispose();
  pmrem.dispose();
  const key = new THREE.DirectionalLight(0xfff5e3, 3.4);
  key.position.set(-3, 5, 4);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xc8e0d5, 1.5);
  fill.position.set(4, 0, 3);
  scene.add(fill);
  const group = new THREE.Group();
  scene.add(group);
  const generated = generateSurfaceTextures({
    size: 64,
    pattern: 'noise',
    frequency: 12,
    normalStrength: 0.025,
  });
  const normal = new THREE.DataTexture(
    generated.normal,
    generated.width,
    generated.height,
    THREE.RGBAFormat,
  );
  normal.colorSpace = THREE.NoColorSpace;
  normal.needsUpdate = true;
  normal.wrapS = normal.wrapT = THREE.RepeatWrapping;
  const roughnessTexture = new THREE.DataTexture(
    new Uint8Array(generated.roughness),
    generated.width,
    generated.height,
    THREE.RGBAFormat,
  );
  roughnessTexture.colorSpace = THREE.NoColorSpace;
  roughnessTexture.needsUpdate = true;
  roughnessTexture.wrapS = roughnessTexture.wrapT = THREE.RepeatWrapping;
  const pairedRoughness = roughnessTexture.clone();
  pairedRoughness.image = {
    ...roughnessTexture.image,
    data: new Uint8Array(generated.roughness),
  };
  pairedRoughness.needsUpdate = true;
  const material = new THREE.MeshStandardMaterial({
    normalMap: normal,
    roughnessMap: roughnessTexture,
    normalScale: new THREE.Vector2(0.11, 0.11),
    envMapIntensity: 1.15,
  });
  const pairedMaterial = material.clone();
  pairedMaterial.roughnessMap = pairedRoughness;
  const torus = new THREE.TorusGeometry(0.83, 0.27, 24, 80);
  const ring1 = new THREE.Mesh(torus, material);
  ring1.rotation.set(0.37, -0.53, 0.12);
  ring1.position.set(-0.21, 0.38, 0);
  const ring2 = new THREE.Mesh(torus, pairedMaterial);
  ring2.rotation.set(1.26, 0.53, -0.23);
  ring2.position.set(0.24, -0.52, -0.02);
  group.add(ring1, ring2);
  const sphereGeometry = new THREE.SphereGeometry(0.24, 32, 24);
  const beadMaterial = new THREE.MeshStandardMaterial({
    color: 0xdcb67d,
    roughness: 0.25,
    metalness: 1,
  });
  const bead = new THREE.Mesh(sphereGeometry, beadMaterial);
  bead.position.set(0.9, 0.95, 0.06);
  group.add(bead);
  const update = (next) => {
    if (next.surface) {
      const recipe = mapSurfaceToThree(next.surface);
      material.color.setRGB(
        ...recipe.colorLinearSRGB,
        THREE.LinearSRGBColorSpace,
      );
      material.roughness = 1;
      material.metalness = recipe.metalness;
      roughnessTexture.image.data.set(
        generateSurfaceTextures({
          size: 64,
          frequency: 12,
          roughness: recipe.roughness,
          roughnessVariation: 0.12,
        }).roughness,
      );
      roughnessTexture.needsUpdate = true;
    }
    if (next.accentSurface) {
      const recipe = mapSurfaceToThree(next.accentSurface);
      pairedMaterial.color.setRGB(
        ...recipe.colorLinearSRGB,
        THREE.LinearSRGBColorSpace,
      );
      pairedMaterial.roughness = 1;
      pairedMaterial.metalness = recipe.metalness;
      pairedRoughness.image.data.set(
        generateSurfaceTextures({
          size: 64,
          frequency: 12,
          roughness: recipe.roughness,
          roughnessVariation: 0.12,
        }).roughness,
      );
      pairedRoughness.needsUpdate = true;
    }
    if (next.normalScale !== undefined) {
      normal.repeat.setScalar(next.normalScale);
      roughnessTexture.repeat.setScalar(next.normalScale);
      pairedRoughness.repeat.setScalar(next.normalScale);
    }
    if (next.normalStrength !== undefined) {
      material.normalScale.setScalar(next.normalStrength);
      pairedMaterial.normalScale.setScalar(next.normalStrength);
    }
    if (next.width && next.height) {
      const dpr = Math.min(
        next.dpr || 1,
        1.5,
        Math.sqrt(900000 / (next.width * next.height)),
      );
      renderer.setPixelRatio(dpr);
      renderer.setSize(next.width, next.height, false);
      camera.aspect = next.width / next.height;
      camera.updateProjectionMatrix();
    }
  };
  update(settings);
  let disposed = false;
  return {
    update,
    render({ time = 0, x = 0, y = 0, reduced = false } = {}) {
      if (disposed) return;
      group.rotation.y = x * 0.28 + (reduced ? 0 : Math.sin(time * 0.3) * 0.12);
      group.rotation.x = y * 0.14;
      group.rotation.z = -0.1 + (reduced ? 0 : Math.sin(time * 0.22) * 0.035);
      group.position.y = reduced ? 0 : Math.sin(time * 0.65) * 0.06;
      key.position.x = -3 + x * 4;
      key.position.y = 5 + y * 3;
      renderer.render(scene, camera);
      return {
        drawCalls: renderer.info.render.calls,
        triangles: renderer.info.render.triangles,
      };
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      torus.dispose();
      sphereGeometry.dispose();
      normal.dispose();
      roughnessTexture.dispose();
      pairedRoughness.dispose();
      material.dispose();
      pairedMaterial.dispose();
      beadMaterial.dispose();
      environment.dispose();
      renderer.dispose();
    },
  };
}
