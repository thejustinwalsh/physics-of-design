import { generateSurfaceTextures } from './surface.js';
import type { DomSurfaceRecipe } from './dom-surface.js';

/** Display encoding is separate from the shared probe's linear reflectance. */
export function domSurfaceLinearColor(hex: string): [number, number, number] {
  if (!/^#[0-9a-fA-F]{6}$/.test(hex))
    throw new Error('Expected an opaque six-digit sRGB hex color');
  return [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
}

/** Data-only tile; no baked illumination. Scalar finish/light edits never regenerate it. */
export function createDomSurfaceTexture(
  material: DomSurfaceRecipe['input']['material'],
  seed: number,
) {
  if (!['paper', 'enamel', 'brushed-metal', 'soft-glass'].includes(material))
    throw new Error('Unknown DOM surface material');
  const metal = material === 'brushed-metal',
    paper = material === 'paper';
  const field = generateSurfaceTextures({
    seed,
    size: metal ? 256 : 128,
    pattern: metal ? 'ridges' : paper ? 'noise' : 'cells',
    frequency: metal ? 64 : paper ? 48 : 32,
    directionDegrees: metal ? 90 : 0,
    normalStrength: metal ? 0.007 : paper ? 0.0025 : 0.0003,
    roughness: 0.5,
    roughnessVariation: 0.5,
  });
  const pixels = new Uint8Array(field.normal);
  for (let i = 0; i < pixels.length; i += 4) {
    let hash = (seed ^ Math.imul(i + 1, 374761393)) >>> 0;
    hash = Math.imul(hash ^ (hash >>> 13), 1274126177) >>> 0;
    // Reflectance grain is independent of the low-frequency normal/roughness field.
    pixels[i + 2] = paper ? hash >>> 24 : 128;
    pixels[i + 3] = field.roughness[i + 1]!;
  }
  return {
    pixels,
    width: field.width,
    height: field.height,
    encoding:
      'linear-normal-xy-reflectance-grain-b-signed-roughness-a' as const,
    sourceAlgorithm: field.algorithm,
  };
}

// A single clipped triangle; no scene graph, vertex buffers, mesh, or text rasterization.
export const DOM_SURFACE_VERTEX = `#version 300 es
precision highp float;
out vec2 uv;
void main(){vec2 p=vec2(float((gl_VertexID<<1)&2),float(gl_VertexID&2));uv=vec2(p.x,1.-p.y);gl_Position=vec4(p*2.-1.,0.,1.);}`;

/** Exact single-light terms follow probeSurface; see docs/dom-surface-research.md. */
export const DOM_SURFACE_FRAGMENT = `#version 300 es
precision highp float;
in vec2 uv;
out vec4 frag;
uniform sampler2D uTexture;
uniform vec3 uBase,uLightColor,uLight,uPlaneNormal;
uniform float uAspect,uRoughness,uMetalness,uVariation,uTextureAmount,uScale,uIntensity,uAmbient,uExposure,uPoint,uAlpha;
uniform int uOutput;
const float PI=3.141592653589793;
vec3 encodeSRGB(vec3 c){return mix(12.92*c,1.055*pow(max(c,vec3(0.)),vec3(1./2.4))-.055,step(vec3(.0031308),c));}
void response(vec3 n,vec3 v,vec3 l,float roughness,out vec3 diffuse,out vec3 specular){
  float nl=max(dot(n,l),0.),nv=max(dot(n,v),0.);
  vec3 h=normalize(l+v);
  float nh=max(dot(n,h),0.),vh=max(dot(v,h),0.);
  float alpha=max(.0004,roughness*roughness),a2=alpha*alpha;
  float d=nh*nh*(a2-1.)+1.;
  float distribution=a2/(PI*d*d);
  vec3 f0=mix(vec3(.04),uBase,uMetalness);
  vec3 fresnel=f0+(1.-f0)*pow(1.-vh,5.);
  float visibility=(nl+sqrt(a2+(1.-a2)*nl*nl))*(nv+sqrt(a2+(1.-a2)*nv*nv));
  diffuse=(1.-fresnel)*(1.-uMetalness)*uBase/PI*nl;
  specular=distribution*fresnel/max(visibility,1.e-12)*nl;
  if(nl<=0.||nv<=0.){diffuse=vec3(0.);specular=vec3(0.);}
}
void main(){
  vec4 grain=texture(uTexture,uv*vec2(uAspect,1.)*uScale);
  vec2 mapXY=grain.rg*2.-1.;
  vec3 n=normalize(uPlaneNormal+vec3(mapXY.x,-mapXY.y,0.)*uTextureAmount*2.0);
  float roughness=clamp(uRoughness+(grain.a*2.-1.)*uVariation,.02,1.);
  vec3 p=vec3((uv.x-.5)*2.*uAspect,(.5-uv.y)*2.,0.);
  vec3 v=normalize(vec3(-p.xy,3.5));
  vec3 delta=mix(uLight,uLight-p,uPoint),l=normalize(delta);
  // Point attenuation is normalized at the authored height; relative units, not lumens.
  float attenuation=mix(1.,uLight.z*uLight.z/max(dot(delta,delta),.0625),uPoint);
  vec3 diffuse,specular;response(n,v,l,roughness,diffuse,specular);
  diffuse*=uLightColor*uIntensity*6.*attenuation;
  specular*=uLightColor*uIntensity*6.*attenuation;
  // Authored room fill is deliberately separate from the directional BRDF.
  vec3 ambient=uBase*uAmbient*(1.-uMetalness)+mix(vec3(.04),uBase,uMetalness)*uAmbient;
  vec3 result=(diffuse+specular+ambient)*(1.+(grain.b-.5)*uTextureAmount*.12);
  if(uOutput==1)result=diffuse;
  if(uOutput==2)result=specular;
  if(uOutput==3){frag=vec4(n*.5+.5,1.);return;}
  if(uOutput==4){frag=vec4(vec3(roughness),1.);return;}
  result*=uExposure;
  // Reinhard mapping then exact sRGB transfer. Alpha composition is browser sRGB.
  result=result/(1.+result);
  frag=vec4(encodeSRGB(result),uAlpha);
}`;

export type DomSurfaceOutput =
  'lit' | 'diffuse' | 'specular' | 'normal' | 'roughness';
