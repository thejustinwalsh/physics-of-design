import { z } from 'zod';
import {
  ComponentContractSchema,
  solveComponentContract,
  componentContractSvg,
} from './component-contract.js';
import { MotionAnalyzeSchema, analyzeMotion } from './motion.js';
const escape = (v: unknown) =>
  String(v)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
export const ComponentInspectSchema = ComponentContractSchema;
export function inspectComponent(input: unknown) {
  const contract = solveComponentContract(input),
    svg = componentContractSvg(contract);
  return {
    contract,
    svg,
    html: `<!doctype html><html lang="en"><meta charset="utf-8"><style>body{margin:0;padding:24px;background:#111713;color:#eff5ec;font:14px system-ui}svg{max-width:100%;height:auto;background:#fff;border-radius:12px}pre{white-space:pre-wrap;line-height:1.5}h1{font-size:24px}</style><h1>Component relationship inspection</h1><p>Dimensions derive from the same contract as the proposed geometry. Unknown ink and missing renderer measurements remain unknown.</p>${svg}<details><summary>Exact contract and provenance</summary><pre>${escape(JSON.stringify(contract, null, 2))}</pre></details></html>`,
  };
}
export const MotionProofSchema = MotionAnalyzeSchema;
export function proofMotion(input: z.input<typeof MotionProofSchema>) {
  const analysis = analyzeMotion(input);
  const samples = analysis.samples;
  const data = JSON.stringify(samples).replaceAll('<', '\\u003c');
  return {
    analysis,
    html: `<!doctype html><html lang="en"><meta charset="utf-8"><style>body{background:#111713;color:#eef5ed;font:15px system-ui;padding:24px}.stage{height:240px;display:flex;align-items:center;border:1px solid #4c5d4e;overflow:hidden}#body{width:64px;height:64px;border-radius:20px;background:#d5ff3f}input{width:100%}button{padding:12px;margin:12px 0;background:#d5ff3f;color:#152000;border:0;border-radius:8px}pre{white-space:pre-wrap}</style><h1>Motion field inspection</h1><p>Scrub the analytic samples. The preview maps one declared position unit to 3 CSS pixels, from a 100px origin. Exact values remain in the sample readout. Reduced-motion playback stays still; scrubbing remains available.</p><div class="stage"><div id="body"></div></div><button id="play">Play release</button><input id="time" aria-label="Motion sample" type="range" min="0" max="${samples.length - 1}" value="0"><pre id="facts"></pre><script>const samples=${data};const slider=document.getElementById('time'),body=document.getElementById('body'),facts=document.getElementById('facts');function show(i){const s=samples[i];body.style.transform='translateX('+ (100+s.position*3)+'px)';facts.textContent=JSON.stringify(s,null,2)}slider.oninput=()=>show(Number(slider.value));let token=0;document.getElementById('play').onclick=()=>{const current=++token;if(matchMedia('(prefers-reduced-motion: reduce)').matches){slider.value=samples.length-1;show(samples.length-1);return}const start=performance.now();function tick(t){if(current!==token)return;let i=samples.findIndex(s=>s.time>=(t-start)/1000);if(i<0)i=samples.length-1;slider.value=i;show(i);if(i<samples.length-1)requestAnimationFrame(tick)}requestAnimationFrame(tick)};show(0)</script></html>`,
  };
}
