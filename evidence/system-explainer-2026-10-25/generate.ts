import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {compileEnergy,searchEnergy} from '../../src/energy.ts';
import {graph,invalidated} from '../../src/graph.ts';
import {parseState} from '../../src/state.ts';
import {runDecisionWorkflow} from '../../src/decision-workflow.ts';
import {describeValidationPlan,checkValidation} from '../../src/validation-machine.ts';
import {resolveOutputBindings,checkOutputBindings} from '../../src/output-bindings.ts';
import {hash} from '../../src/identity.ts';
import {contrastRatio} from '../../src/color.ts';
import {createDrivenMotion} from '../../src/motion-dynamics.ts';
import {probeSurface} from '../../src/surface.ts';
import {resolveDesignRuntime} from '../../src/decision-runtime.ts';
const out='evidence/system-explainer-2026-10-25';
const read=(p:string)=>JSON.parse(readFileSync(p,'utf8'));
const save=(p:string,d:unknown)=>writeFileSync(`${out}/${p}`,JSON.stringify(d,null,2)+'\n');
mkdirSync(`${out}/receipts`,{recursive:true});mkdirSync(`${out}/sources`,{recursive:true});
const sha=(b:any)=>createHash('sha256').update(b).digest('hex');
const sources=['src/energy.ts','src/graph.ts','src/decision-workflow.ts','src/decision-runtime.ts','src/decision-machine.ts','src/validation-machine.ts','src/output-bindings.ts','src/relational-kernels.ts','src/design-field.ts','src/design-context.ts','src/selector.ts','src/mcp-context.ts','src/commands.ts','src/color.ts','src/palette.ts','src/typography-inspection.ts','src/typography-browser.ts','src/motion-dynamics.ts','src/surface.ts','src/dom-surface-gpu.ts','src/browser-dom-light.ts'];
const receipts=['artifacts/verification-design-theory-final/summary.json','artifacts/design-field-streaming-selector/gallery-session.json','artifacts/relational-kernels-final/receipt.json','artifacts/relational-kernels-final/bindings.json','artifacts/choice-effectiveness/report.json','artifacts/dom-surfaces-gpu/summary.json','artifacts/design-theory/material-integration/report.json','artifacts/expo-design-theory/proof.json','artifacts/expo-template-smoke/proof.json','evidence/workflow-comparison-2026-10-25/evaluation/adjudication.json'];
const manifest=existsSync(`${out}/manifest.json`)?read(`${out}/manifest.json`):{capturedAt:new Date().toISOString(),sources:sources.map(p=>{const b=readFileSync(p);const name=p.replaceAll('/','--');writeFileSync(`${out}/sources/${name}`,b);return {path:p,copy:`sources/${name}`,sha256:sha(b)};}),receipts:receipts.map(p=>{const b=readFileSync(p);const name=p.replaceAll('/','--');writeFileSync(`${out}/receipts/${name}`,b);return {path:p,copy:`receipts/${name}`,sha256:sha(b)};})};
for(const entry of manifest.sources)if(sha(readFileSync(entry.path))!==entry.sha256)throw Error(`Source changed since snapshot: ${entry.path}. Preserve this bundle and create a new dated snapshot.`);
save('manifest.json',manifest);
const prov={kind:'brief',source:'Authored teaching problem; no human preference evidence'};
const energy:any={version:1,id:'teaching-choice',brief:{intent:'Expose incompatible preference targets and an independent hard cap',source:'Explainer authored teaching input'},variables:[{id:'titleSize',unit:'css-px',values:[24,32,40,48,56,64,72]}],scenarios:[{id:'teaching',values:{}}],factors:[{id:'size-cap',expression:{ref:'titleSize'},bands:[{min:24,max:64}],scale:8,mode:'hard',category:'feasibility',provenance:prov},{id:'quiet',expression:{ref:'titleSize'},bands:[{min:24,max:32}],scale:8,mode:'preference',weight:1,category:'direction',provenance:prov},{id:'bold',expression:{ref:'titleSize'},bands:[{min:56,max:64}],scale:8,mode:'preference',weight:1,category:'direction',provenance:prov}]};
const energyCases=[];
for(const cap of [48,64,72])for(const boldWeight of [.25,1,4]){const p=structuredClone(energy);p.factors[0].bands[0].max=cap;p.factors[2].weight=boldWeight;const c=compileEnergy(p);energyCases.push({cap,boldWeight,program:c.program,all:energy.variables[0].values.map((titleSize:number)=>c.evaluate({titleSize})),search:searchEnergy({program:p,options:{method:'exhaustive',maxEvaluations:20,limit:7,retention:'pareto-diverse'}})});}
const state=parseState(read('examples/editorial.json'));
const paths=['/blocks/0/size','/blocks/0/font','/blocks/0/text','/gaps','/colors','/viewport'];
const dependency={source:'examples/editorial.json',state,nodes:graph(state),changes:paths.map(path=>({path,invalidated:invalidated(state,[path])}))};
const request=read('examples/workflow/editorial-mathematical.json');
const first=await runDecisionWorkflow(request);
const replay=await runDecisionWorkflow({...request,recipe:first.recipe,mode:'replay'});
const changed=structuredClone(request);changed.workflow.stages[0].program.factors[0].bands=[{min:700,max:740}];
const stale=await runDecisionWorkflow({...changed,recipe:first.recipe,mode:'replay'});
const recompute=await runDecisionWorkflow({...changed,recipe:first.recipe,mode:'search'});
const workflow={input:request,changedInput:changed,first,replay,stale,recompute};
const plan:any={version:1,id:'teaching-gate',designIdentity:hash('teaching-design'),scenarios:['phone','ipad','desktop'].map((id,i)=>({id,platform:'web',width:[390,834,1440][i],height:1000,textScale:1,colorScheme:'light',reducedMotion:false,contentId:'teaching-copy',source:'Authored gate teaching inputs'})),phases:[{id:'measure',purpose:'Demonstrate receipt identity guards',requirements:['phone','ipad','desktop'].map(id=>({id:`geometry-${id}`,scenario:id,tool:'illustrative-observation',inputIdentity:hash(id),evidenceKind:'deterministic',rationale:'Teaching declaration; not a renderer observation'}))}]};
const pd=describeValidationPlan(plan);
const declarations=pd.requirements.map(r=>({requirement:r.id,planIdentity:pd.identity,designIdentity:plan.designIdentity,inputIdentity:r.inputIdentity,tool:r.tool,evidenceKind:r.evidenceKind,outcome:'pass',resultRef:'teaching-declaration-only',observedAt:manifest.capturedAt,detail:'Authored declaration to exercise gate mechanics, not real renderer evidence'}));
const gates:any={};
for(const mode of ['missing-ipad','matching','stale-copy','failed-ipad','unsupported-ipad']){const rs=structuredClone(declarations);if(mode==='missing-ipad')rs.splice(1,1);if(mode==='stale-copy')rs[1].inputIdentity=hash('new-copy');if(mode==='failed-ipad')rs[1].outcome='fail';if(mode==='unsupported-ipad')rs[1].outcome='unsupported';gates[mode]=checkValidation({plan,receipts:rs,advance:1});}
const source={fontSize:18},current={designIdentity:hash('design'),sourceIdentity:hash('source'),inputIdentity:hash('input'),resultIdentity:hash(source)},scenarioIdentity=hash('phone');
const binding=resolveOutputBindings({operation:'resolve',current,source:{value:source,identity:hash(source)},bindings:[{id:'body-size',scenario:'phone',scenarioIdentity,platform:'web',unit:'css-px',pointer:'/fontSize',target:{surface:'body',property:'fontSize',sourceLocation:'teaching-component'},tolerance:0}]});
const observation:any={binding:'body-size',current,scenario:'phone',scenarioIdentity,platform:'web',unit:'css-px',surface:'body',property:'fontSize',sourceLocation:'teaching-component',status:'observed',value:18,provider:'browser',runtime:'Authored teaching declaration',resultRef:'teaching-declaration-only',observedAt:manifest.capturedAt,detail:'Exercises binding checker; not a measured browser property'};
const bindings:any={};
for(const mode of ['matching','override','stale','wrong-provider','unknown','unbound']){let obs=[structuredClone(observation)];if(mode==='override')obs[0].value=20;if(mode==='stale')obs[0].scenarioIdentity=hash('changed');if(mode==='wrong-provider')obs[0].provider='native-ios';if(mode==='unknown')obs[0].status='unknown';if(mode==='unbound')obs=[];bindings[mode]=checkOutputBindings({operation:'check',manifest:binding,current,observations:obs});}
const motion=createDrivenMotion({position:0,target:1,spring:{mass:1,stiffness:100,damping:12}});const motionSamples=[];
for(let i=0;i<=120;i++){if(i===30)motion.retarget(.4);motionSamples.push(motion.snapshot());motion.advance(1/60);}
const materials=[.15,.45,.8].map(roughness=>({roughness,probe:probeSurface({surface:{baseColor:[.4,.2,.08],roughness,metalness:0},light:[.4,.2,1]})}));
const colors=['#333333','#777777','#aaaaaa'].map(foreground=>({foreground,background:'#ffffff',ratio:contrastRatio(foreground,'#ffffff')}));
const field=read(`${out}/receipts/artifacts--design-field-streaming-selector--gallery-session.json`);
const portable:any={assignment:{gap:24},program:{scenarios:[{id:'phone',values:{width:390,textScale:1}},{id:'desktop',values:{width:1440,textScale:1}}],derived:[{id:'contentWidth',expression:{op:'sub',args:[{ref:'width'},40]}}],factors:[{id:'content-fit',expression:{ref:'contentWidth'},mode:'hard',bands:[{min:320,max:1400}],scenarioBands:{phone:[{min:320,max:400}],desktop:[{min:1000,max:1400}]}}]},machine:{states:[{id:'reading',regions:[{id:'body',role:'prose',bindings:{width:{ref:'contentWidth'},gap:{ref:'gap'}}}],on:[]}],motions:{}}};
const scenarios:any={};
for(const [name,width,scenarioId,base] of [['phone',390,undefined,false],['desktop',1440,undefined,false],['unsampled',834,undefined,false],['explicit-base',834,undefined,true],['false-name',834,'phone',false],['outside',1600,undefined,true]] as any[]){try{scenarios[name]=resolveDesignRuntime({...portable,...(base?{runtimePolicy:{unsampledScenarioBands:'base'}}:{})},{width,textScale:1},scenarioId?{scenarioId}:{});}catch(e){scenarios[name]={error:String(e)}}}
const data={manifest,energyCases,dependency,workflow,gates,bindings,scenarios,motionSamples,materials,colors,field:{statistics:field.statistics,replay:field.replay,partialReplay:field.partialReplay,tokens:field.tokens,validation:field.validation,selection:field.selection,lookahead:field.lookahead}};
save('engine-results.json',data);save('teaching-energy-input.json',energy);save('teaching-gate-input.json',{plan,declarations});save('teaching-binding-input.json',{binding,observation});
console.log(JSON.stringify({capturedAt:manifest.capturedAt,energyCases:energyCases.length,workflow:Object.fromEntries(Object.entries(workflow).filter(([k])=>!k.toLowerCase().includes('input')).map(([k,v]:any)=>[k,{keys:Object.keys(v),statistics:v.statistics}])),sourceFiles:sources.length,receipts:receipts.length}));
