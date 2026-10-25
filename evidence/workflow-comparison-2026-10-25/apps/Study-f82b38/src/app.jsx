import React, {useState, useRef, useEffect, useLayoutEffect, useCallback} from 'react';
import {createRoot} from 'react-dom/client';
import * as stylex from '@stylexjs/stylex';

const DESIGN_ID = 'DESIGN.md · sha256:3bc9b66ae3b4d059197c9156412ba7d2a682b93c55883d44c4cab8d367eee511';
// A single retained frame queue serves geometry and decorative updates.
const frameJobs=new Set();let frameHandle=0;
function scheduleFrame(job){frameJobs.add(job);if(!frameHandle)frameHandle=requestAnimationFrame(()=>{frameHandle=0;const jobs=[...frameJobs];frameJobs.clear();for(const run of jobs)run()})}
function cancelFrame(job){frameJobs.delete(job);if(!frameJobs.size&&frameHandle){cancelAnimationFrame(frameHandle);frameHandle=0}}
const STORAGE_KEY = 'deliberate-friction.direction.v1';
const DEFAULTS = {headline:'Order.\nWith room\nto bend.',fontSize:72,measure:94,roughness:65,material:'paper'};
const METHOD = 'Headline.getBoundingClientRect() in viewport CSS pixels; lineFragmentCount counts nonzero Range.getClientRects() for its text. Blank lines are excluded; browser text fragments are not guaranteed semantic lines. No aesthetic score.';
const s = stylex.create({
  regionSiteHeader:{"display": "flex", "alignItems": "center", "justifyContent": "space-between", "gap": "2rem", "margin": "0 5.55%", "padding": "1.75rem 0", "borderBottom": "1px solid var(--ink)"},
  regionWordmark:{"display": "flex", "gap": ".8rem", "textDecoration": "none", "fontWeight": "900", "fontSize": "1.12rem", "lineHeight": "1.03", "letterSpacing": "-.02em"},
  regionHeroBottom:{"display": "flex", "justifyContent": "space-between", "alignItems": "flex-end", "gap": "2rem", "marginTop": "4.5rem", "paddingBottom": "4rem"},
  regionHeroDeck:{"fontSize": "1.75rem", "fontFamily": "StudySerif,serif", "lineHeight": "1.25", "flex": "1"},
  regionHeroCopy:{"fontSize": "1rem", "lineHeight": "1.6", "flex": "1"},
  regionHeroFoot:{"borderTop": "1px solid var(--rule)", "paddingTop": "1.25rem", "display": "flex", "justifyContent": "space-between", "gap": "1rem", "color": "var(--muted)", "fontSize": ".75rem"},
  regionResponseLayout:{"display": "flex", "gap": "8%", "alignItems": "center", "padding": "4.5rem 0 4rem"},
  regionResponseCopy:{"flex": "0 1 37%", "minWidth": "0"},
  regionMaterialStage:{"flex": "1", "minWidth": "0"},
  regionMaterialSurface:{"position": "relative", "minHeight": "29rem", "padding": "1.5rem 1.75rem", "isolation": "isolate", "display": "flex", "flexDirection": "column", "overflow": "hidden", "boxShadow": "0 16px 35px #0005"},
  regionSurfaceTop:{"display": "flex", "justifyContent": "space-between", "alignItems": "center", "position": "relative", "zIndex": "1", "fontSize": ".7rem", "letterSpacing": ".04em"},
  regionMaterialMessage:{"position": "relative", "zIndex": "2", "marginTop": "3rem", "width": "fit-content", "maxWidth": "92%", "padding": ".2rem .55rem .45rem 0", "background": "#e9e9df"},
  regionSurfaceFoot:{"position": "relative", "zIndex": "2", "display": "flex", "justifyContent": "space-between", "gap": "1rem", "fontSize": ".7rem", "marginTop": "auto", "paddingTop": "3rem"},
  regionMaterialCaption:{"display": "flex", "justifyContent": "space-between", "gap": "1rem", "fontSize": ".75rem", "color": "#b6b7a8", "paddingTop": ".8rem"},
  regionBenchHeading:{"display": "flex", "justifyContent": "space-between", "alignItems": "center", "gap": "2rem", "padding": "3.25rem 0 2.25rem"},
  regionBenchLayout:{"display": "flex", "alignItems": "flex-start", "gap": "3rem"},
  regionControls:{"flex": "0 0 19rem", "minWidth": "0"},
  regionControlHeading:{"display": "flex", "alignItems": "center", "justifyContent": "space-between", "borderTop": "2px solid var(--ink)", "padding": "1.1rem 0 1.5rem"},
  regionFieldLabel:{"display": "flex", "justifyContent": "space-between", "alignItems": "baseline", "gap": "1rem", "fontSize": ".9rem", "fontWeight": "700", "marginBottom": ".6rem"},
  regionRangeField:{"marginTop": "1.9rem"},
  regionCurrentMaterial:{"display": "flex", "alignItems": "center", "gap": ".65rem", "borderTop": "1px solid var(--rule)", "paddingTop": "1.25rem", "marginTop": "1.9rem", "fontSize": ".85rem"},
  regionPreviewColumn:{"flex": "1", "minWidth": "0"},
  regionComposition:{"position": "relative", "isolation": "isolate", "minHeight": "38rem", "padding": "2rem 2.25rem", "display": "flex", "flexDirection": "column"},
  regionCompositionTop:{"display": "flex", "alignItems": "center", "justifyContent": "space-between", "gap": "1rem", "fontSize": ".8rem", "paddingBottom": "2.75rem"},
  regionCompositionBottom:{"display": "flex", "justifyContent": "space-between", "gap": "1.5rem", "alignItems": "flex-end", "marginTop": "auto", "paddingTop": "2.5rem"},
  regionCompositionMeta:{"display": "flex", "justifyContent": "space-between", "gap": "1rem", "borderTop": "1px solid currentColor", "paddingTop": "1rem", "marginTop": "1.5rem", "fontSize": ".65rem", "letterSpacing": ".04em"},
  regionInspector:{"display": "flex", "gap": "3rem", "borderTop": "1px solid var(--ink)", "marginTop": "3rem", "paddingTop": "1.75rem", "alignItems": "flex-start"},
  regionInspectorIntro:{"flex": "0 0 19rem", "minWidth": "0"},
  regionObservationData:{"flex": "1", "minWidth": "0"},
  regionMetricPair:{"display": "flex", "gap": "2rem", "justifyContent": "space-between"},
  regionProposed:{"display": "flex", "justifyContent": "space-between", "gap": "1rem", "fontSize": ".75rem", "borderTop": "1px solid var(--rule)", "marginTop": "1rem", "paddingTop": ".8rem"},
  regionKeepLayout:{"display": "flex", "gap": "8%", "paddingTop": "3.75rem", "alignItems": "flex-start"},
  regionKeepCopy:{"flex": "1", "minWidth": "0"},
  regionKeepActions:{"flex": "1", "minWidth": "0", "maxWidth": "36rem"},
  regionSaveState:{"display": "flex", "gap": "1rem", "alignItems": "center", "paddingBottom": "1.5rem"},
  regionActionPair:{"display": "flex", "gap": ".75rem"},
  regionResetRow:{"display": "flex", "justifyContent": "space-between", "alignItems": "center", "gap": "1rem", "paddingTop": ".75rem", "fontSize": ".75rem"},
  regionStatus:{"fontSize": ".8rem", "borderTop": "1px solid #7b8c15", "paddingTop": "1rem", "marginTop": ".75rem", "minHeight": "4rem", "lineHeight": "1.5"},
  page:{display:'flex',flexDirection:'column',minWidth:0},
  row:{display:'flex',alignItems:'center',flexWrap:'wrap'},
  split:{display:'flex',flexWrap:'wrap',alignItems:'flex-start'},
  column:{display:'flex',flexDirection:'column',minWidth:0},
  button:{display:'inline-flex',alignItems:'center',justifyContent:'space-between',gap:'1.25rem',minHeight:48,padding:'0.85rem 1.2rem',borderWidth:1,borderStyle:'solid',borderColor:'currentColor',fontWeight:700,cursor:'pointer',textDecoration:'none'},
  small:{fontSize:'0.8rem',lineHeight:1.5},
  title:{fontWeight:900,letterSpacing:'-0.035em',lineHeight:1.02},
  full:{width:'100%',minWidth:0},
  metric:{display:'flex',justifyContent:'space-between',gap:'1rem',paddingBlock:'0.7rem',borderBottomWidth:1,borderBottomStyle:'solid',borderBottomColor:'#c4c2b9'},
});
function Arrow({diagonal=false}){return <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d={diagonal?'M5 19 19 5M5 5h14v14':'M3 12h17m-7-7 7 7-7 7'} stroke="currentColor" strokeWidth="1.8"/></svg>}
function Cross({className=''}){return <svg className={className} width="32" height="32" viewBox="0 0 32 32" aria-hidden="true"><path d="M16 0v32M0 16h32" stroke="currentColor" strokeWidth="1"/><circle cx="16" cy="16" r="10" fill="none" stroke="currentColor"/></svg>}
function TensionArt(){return <svg className="tension-art" viewBox="0 0 460 300" fill="none" aria-hidden="true"><g stroke="currentColor" strokeWidth="1.5">{Array.from({length:12},(_,i)=><ellipse key={i} cx="230" cy="150" rx={55+i*11} ry="116" transform={`rotate(${i*8-44} 230 150)`}/>)}<path d="M0 150h460M230 0v300" strokeDasharray="3 8"/></g><circle cx="230" cy="150" r="9" fill="currentColor"/></svg>}
function identity(inputs){let h=2166136261;for(const c of JSON.stringify(inputs)){h^=c.charCodeAt(0);h=Math.imul(h,16777619)}return 'inputs-'+(h>>>0).toString(16).padStart(8,'0')}
function validInputs(v){return v&&typeof v.headline==='string'&&v.headline.length<=400&&Number.isFinite(v.fontSize)&&v.fontSize>=32&&v.fontSize<=120&&Number.isFinite(v.measure)&&v.measure>=35&&v.measure<=100&&Number.isFinite(v.roughness)&&v.roughness>=0&&v.roughness<=100&&['paper','enamel'].includes(v.material)}
function readSaved(){try{const v=JSON.parse(localStorage.getItem(STORAGE_KEY));return validInputs(v?.inputs)?v:null}catch{return null}}
function App(){
  const [inputs,setInputs]=useState({...DEFAULTS});
  const [mode,setMode]=useState('compose');
  const [measurement,setMeasurement]=useState(null);
  const [saved,setSaved]=useState(readSaved);
  const [status,setStatus]=useState('Ready to make a little friction. Your edits stay in this session until you save.');
  const [selected,setSelected]=useState(true);
  const headlineRef=useRef(null), inputRef=useRef(null), materialRef=useRef(null), responseRef=useRef(null), stripRef=useRef(null);
  const inputsRef=useRef(inputs); inputsRef.current=inputs;
  const measureNow=useCallback(()=>{
    const node=headlineRef.current;if(!node)return null;
    const r=node.getBoundingClientRect(); const range=document.createRange();range.selectNodeContents(node);
    const fragments=[...range.getClientRects()].filter(v=>v.width>0&&v.height>0);
    const m={inputIdentity:identity(inputsRef.current),observed:{x:r.x,y:r.y,width:r.width,height:r.height,lineFragmentCount:fragments.length},method:METHOD};
    setMeasurement(m);return m;
  },[]);
  useLayoutEffect(()=>{measureNow()},[inputs,mode,measureNow]);
  useEffect(()=>{
    let active=true;
    const paint=()=>{if(active&&!document.hidden)measureNow()};
    const schedule=()=>{if(!document.hidden)scheduleFrame(paint)};
    const observer=new ResizeObserver(schedule);observer.observe(headlineRef.current);observer.observe(document.body);
    window.addEventListener('scroll',schedule,{passive:true});window.addEventListener('resize',schedule);document.addEventListener('visibilitychange',schedule);
    document.fonts.ready.then(()=>{if(active)schedule()});document.fonts.addEventListener('loadingdone',schedule);
    return()=>{active=false;cancelFrame(paint);observer.disconnect();window.removeEventListener('scroll',schedule);window.removeEventListener('resize',schedule);document.removeEventListener('visibilitychange',schedule);document.fonts.removeEventListener('loadingdone',schedule)};
  },[measureNow]);
  useEffect(()=>{
    const panel=materialRef.current,section=responseRef.current,strip=stripRef.current;
    const reduced=matchMedia('(prefers-reduced-motion: reduce)');let visible=false,px=55,py=35;
    const paint=()=>{if(document.hidden||!visible)return;const box=section.getBoundingClientRect();const phase=Math.max(0,Math.min(1,(innerHeight-box.top)/(innerHeight+box.height)));panel.style.setProperty('--light-x',`${reduced.matches?55:px}%`);panel.style.setProperty('--light-y',`${reduced.matches?35:py}%`);strip.style.transform=`translateX(${reduced.matches?0:(phase-.5)*100}px)`};
    const schedule=()=>{if(visible&&!document.hidden)scheduleFrame(paint)};
    const pointer=e=>{if(reduced.matches)return;const r=panel.getBoundingClientRect();px=Math.max(0,Math.min(100,(e.clientX-r.left)/r.width*100));py=Math.max(0,Math.min(100,(e.clientY-r.top)/r.height*100));schedule()};
    const observer=new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;if(visible)schedule();else{cancelFrame(paint)}},{threshold:0});observer.observe(section);
    const visibility=()=>{if(document.hidden){cancelFrame(paint)}else schedule()};
    panel.addEventListener('pointermove',pointer);window.addEventListener('scroll',schedule,{passive:true});window.addEventListener('resize',schedule);document.addEventListener('visibilitychange',visibility);reduced.addEventListener('change',schedule);
    return()=>{cancelFrame(paint);observer.disconnect();panel.removeEventListener('pointermove',pointer);window.removeEventListener('scroll',schedule);window.removeEventListener('resize',schedule);document.removeEventListener('visibilitychange',visibility);reduced.removeEventListener('change',schedule)};
  },[]);
  function update(key,value){setInputs(v=>({...v,[key]:value}))}
  function openBench(){document.getElementById('workbench').scrollIntoView({behavior:'instant',block:'start'});inputRef.current.focus({preventScroll:true})}
  function save(){try{const record={inputs:{...inputs},savedAt:new Date().toISOString()};localStorage.setItem(STORAGE_KEY,JSON.stringify(record));setSaved(record);setStatus('Direction saved in this browser. Change any input, then replay to return.')}catch{setStatus('This browser blocked local storage. Download the editable JSON to keep your direction.')}}
  function replay(){const record=readSaved();if(!record){setSaved(null);setStatus('No valid saved direction is available. Save this direction first.');return}setInputs({...record.inputs});setSaved(record);setStatus('Saved inputs replayed. The receipt has been measured again in the current viewport.')}
  function reset(){setInputs({...DEFAULTS});setStatus('Default inputs restored. Your locally saved direction is still available to replay.')}
  async function exportJSON(){await document.fonts.ready;const current=measureNow();if(!current){setStatus('The preview is not ready. Try downloading again.');return}const data={version:1,inputs:{...inputsRef.current},designIdentity:DESIGN_ID,measurement:current};const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='deliberate-friction.direction.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);setStatus('Editable JSON downloaded with current inputs, design identity, and a fresh browser measurement.')}
  const obs=measurement?.observed;
  const materialButtons=<div className="material-switch" aria-label="Material"><button data-testid="material-paper" aria-pressed={inputs.material==='paper'} onClick={()=>update('material','paper')}><span className="swatch paper-swatch"/>Paper</button><button data-testid="material-enamel" aria-pressed={inputs.material==='enamel'} onClick={()=>update('material','enamel')}><span className="swatch enamel-swatch"/>Enamel</button></div>;
  return <div {...stylex.props(s.page)}>
    <a className="skip-link" href="#workbench">Skip to the workbench</a>
    <header className={["site-header",stylex.props(s.regionSiteHeader).className].join(" ")}><a className={["wordmark",stylex.props(s.regionWordmark).className].join(" ")} href="#intent" aria-label="Deliberate Friction home"><svg width="33" height="35" viewBox="0 0 33 35" aria-hidden="true"><path d="M1 1h12v33H1zM20 1h12L20 34H8z" fill="currentColor"/></svg><span>Deliberate<br/>Friction</span></a><nav aria-label="Chapters"><a href="#intent"><span>01</span> Intent</a><a href="#response"><span>02</span> Response</a><a href="#workbench"><span>03</span> Workbench</a><a href="#keep"><span>04</span> Keep</a></nav><span className="header-note">An open design field</span></header>
    <main>
      <section id="intent" className="intent section-pad" data-testid="intent-section" aria-labelledby="intent-title">
        <h1 id="intent-title"><span>Make the rules.</span><span className="second-line">Then <em>bend</em> them.</span></h1>
        <div className={["hero-bottom",stylex.props(s.regionHeroBottom).className].join(" ")}><p className={["hero-deck",stylex.props(s.regionHeroDeck).className].join(" ")}>A design field for<br/>deliberate friction.</p><p className={["hero-copy",stylex.props(s.regionHeroCopy).className].join(" ")}>For developers with a point of view.<br/>For art directors who want to pull a value<br className="desktop-break"/> and see what actually changes.</p><button className={[stylex.props(s.button).className, "primary-button"].join(" ")} data-testid="open-workbench" onClick={openBench}>Open the workbench<Arrow diagonal/></button></div>
        <div className={["hero-foot",stylex.props(s.regionHeroFoot).className].join(" ")}><span>Authored choices. Observable consequences.</span><span className="down-indicator">Scroll to feel the difference <svg width="14" height="18" viewBox="0 0 14 18" aria-hidden="true"><path d="M7 0v16M1 10l6 6 6-6" fill="none" stroke="currentColor"/></svg></span></div>
      </section>
      <section id="response" ref={responseRef} className="response section-pad" data-testid="response-section" aria-labelledby="response-title">
        <div className="section-rule"><span>02 / Feel the response</span><span>Material study</span></div>
        <div className={["response-layout",stylex.props(s.regionResponseLayout).className].join(" ")}>
          <div className={["response-copy",stylex.props(s.regionResponseCopy).className].join(" ")}><h2 id="response-title">Same words.<br/><em>Different pull.</em></h2><p>Material changes the way a message lands. Move across the surface. Switch the finish. Notice what stays readable.</p>{materialButtons}<p className="material-description">{inputs.material==='paper'?'Paper / warm, diffuse, quietly tactile.':'Enamel / cool, saturated, sharply reflective.'}</p><p className="technical-note">CSS light approximation.<br/>Pointer light is decorative; the content has a stable, opaque shield.</p></div>
          <div className={["material-stage",stylex.props(s.regionMaterialStage).className].join(" ")}><article ref={materialRef} data-testid="material-surface" className={`material-surface ${stylex.props(s.regionMaterialSurface).className} ${inputs.material}`} style={{'--roughness':inputs.roughness/100}} aria-label={`${inputs.material} material study`}><div className={["surface-top",stylex.props(s.regionSurfaceTop).className].join(" ")}><span>DELIBERATE FRICTION</span><Cross/></div><div className={["material-message",stylex.props(s.regionMaterialMessage).className].join(" ")}><p>A little tension<br/>makes a lot<br/>of difference.</p></div><TensionArt/><div className={["surface-foot",stylex.props(s.regionSurfaceFoot).className].join(" ")}><span>A study in surface & substance</span><span>{inputs.material==='paper'?'P—01':'E—02'}</span></div></article><div className={["material-caption",stylex.props(s.regionMaterialCaption).className].join(" ")}><span>Live DOM surface</span><span>{inputs.material==='paper'?'Diffuse reflection':'Specular reflection'}</span></div></div>
        </div>
        <div className="registration-window" aria-hidden="true"><div ref={stripRef} className="registration" data-testid="scroll-registration">{Array.from({length:22},(_,i)=><span key={i}>{i%4===0?<Cross/>:<i/>}<small>{String(i*5).padStart(3,'0')}</small></span>)}</div></div>
      </section>
      <section id="workbench" className="workbench section-pad" data-testid="workbench-section" aria-labelledby="workbench-title">
        <div className="section-rule"><span>03 / Inspect the consequence</span><span>Inputs → composition → evidence</span></div>
        <div className={["bench-heading",stylex.props(s.regionBenchHeading).className].join(" ")}><div><h2 id="workbench-title">Put it under pressure.</h2><p>Pull a value. Watch the composition answer.</p></div><div className="mode-switch" aria-label="Workbench mode"><button data-testid="mode-compose" aria-pressed={mode==='compose'} onClick={()=>setMode('compose')}>Compose</button><button data-testid="mode-inspect" aria-pressed={mode==='inspect'} onClick={()=>{setMode('inspect');setSelected(true)}}>Inspect<svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true"><path d="M1 6V1h5m6 0h5v5m0 6v5h-5M6 17H1v-5" stroke="currentColor" strokeWidth="1.5"/></svg></button></div></div>
        <div className={["bench-layout",stylex.props(s.regionBenchLayout).className].join(" ")}>
          <form className={["controls",stylex.props(s.regionControls).className].join(" ")} onSubmit={e=>e.preventDefault()} aria-label="Composition inputs">
            <div className={["control-heading",stylex.props(s.regionControlHeading).className].join(" ")}><h3>Your inputs</h3><span>Live</span></div>
            <label className={["field-label",stylex.props(s.regionFieldLabel).className].join(" ")} htmlFor="headline">Headline <span>{inputs.headline.length}/400</span></label><textarea id="headline" data-testid="headline-input" ref={inputRef} maxLength="400" rows="4" value={inputs.headline} onChange={e=>update('headline',e.target.value)} spellCheck="false"/>
            <p className="field-note">Your line breaks are part of the composition.</p>
            {[{key:'fontSize',test:'font-size',label:'Type size',min:32,max:120,unit:'px',hint:'32 — 120 px'},{key:'measure',test:'measure',label:'Measure',min:35,max:100,unit:'%',hint:'Share of the available canvas width'},{key:'roughness',test:'roughness',label:'Finish roughness',min:0,max:100,unit:'%',hint:'Smooth reflection → diffuse surface'}].map(c=><div className={["range-field",stylex.props(s.regionRangeField).className].join(" ")} key={c.key}><label className={["field-label",stylex.props(s.regionFieldLabel).className].join(" ")} htmlFor={c.test}>{c.label}<output htmlFor={c.test}>{inputs[c.key]}<span>{c.unit}</span></output></label><input id={c.test} data-testid={c.test} type="range" min={c.min} max={c.max} step="1" value={inputs[c.key]} onChange={e=>update(c.key,Number(e.target.value))}/><p className="field-note">{c.hint}</p></div>)}
            <div className={["current-material",stylex.props(s.regionCurrentMaterial).className].join(" ")}><span className={`swatch ${inputs.material}-swatch`}/><span>{inputs.material==='paper'?'Warm paper':'Cobalt enamel'}<small>Shared with the material study</small></span><a href="#response" aria-label="Change material in the response section">Change<Arrow/></a></div>
            <p className="input-footnote">These are authored inputs, not an optimization result.</p>
          </form>
          <div className={["preview-column",stylex.props(s.regionPreviewColumn).className].join(" ")}><div className="preview-heading"><span>THE COMPOSITION</span><span>{mode==='inspect'?'Inspect / headline selected':'Compose / live preview'}</span></div><article className={`composition ${stylex.props(s.regionComposition).className} ${inputs.material}`} style={{'--roughness':inputs.roughness/100}} aria-label="Editable composition preview"><div className={["composition-top",stylex.props(s.regionCompositionTop).className].join(" ")}><span>Design is a decision.</span><Cross/></div><h3 ref={headlineRef} data-testid="preview-headline" className={`preview-headline ${mode==='inspect'?'selectable':''}`} style={{fontSize:`${inputs.fontSize/16}rem`,width:`${inputs.measure}%`}} tabIndex={mode==='inspect'?0:undefined} role={mode==='inspect'?'button':undefined} aria-label={mode==='inspect'?'Select headline for inspection':undefined} onClick={()=>{if(mode==='inspect'){setSelected(true);measureNow()}}} onKeyDown={e=>{if(mode==='inspect'&&(e.key==='Enter'||e.key===' ')){e.preventDefault();setSelected(true);measureNow()}}}>{inputs.headline}</h3><div className={["composition-bottom",stylex.props(s.regionCompositionBottom).className].join(" ")}><p>Enough structure to hold.<br/>Enough freedom to move.</p><svg className="bend-mark" viewBox="0 0 130 100" aria-hidden="true"><path d="M8 90V10h30v80m20 0V10h30v80m20 0V10" fill="none" stroke="currentColor" strokeWidth="8"/><path d="m12 82 108-60" stroke="currentColor" strokeWidth="2"/></svg></div><div className={["composition-meta",stylex.props(s.regionCompositionMeta).className].join(" ")}><span>DELIBERATE FRICTION</span><span>{inputs.material.toUpperCase()} / {inputs.roughness}%</span></div></article>
          <div className="preview-caption"><span>{mode==='inspect'?'Select the headline with a click or Enter.':'Every edit stays with you when you switch modes.'}</span><span>Lato Black / local font</span></div></div>
        </div>
        <aside className={`inspector ${stylex.props(s.regionInspector).className} ${mode==='inspect'?'is-inspecting':''}`} aria-label="Renderer observations"><div className={["inspector-intro",stylex.props(s.regionInspectorIntro).className].join(" ")}><h3>{mode==='inspect'?'The actual, not the ideal.':'A receipt, not a rating.'}</h3><p>{mode==='inspect'?'The outline follows the selected headline’s current browser rectangle. Scroll, resize, or edit to see it update.':'Switch to Inspect to select the real headline and see its bounds. The current browser observation is available below.'}</p><span className="observation-tag"><span/> Current renderer observation</span></div><div className={["observation-data",stylex.props(s.regionObservationData).className].join(" ")}><div className={["metric-pair",stylex.props(s.regionMetricPair).className].join(" ")}><div><span className="metric-label">Observed width</span><strong>{obs?obs.width.toFixed(1):'—'}<small>px</small></strong></div><div><span className="metric-label">Observed height</span><strong>{obs?obs.height.toFixed(1):'—'}<small>px</small></strong></div><div><span className="metric-label">Text fragments</span><strong>{obs?.lineFragmentCount??'—'}</strong></div></div><div className={["proposed",stylex.props(s.regionProposed).className].join(" ")}><span>Proposed</span><span>{inputs.fontSize}px type · {inputs.measure}% measure · {inputs.roughness}% roughness</span></div><p className="method-note">Viewport CSS pixels. Text fragments use Range.getClientRects(); blank lines are excluded. Fragments may differ from semantic lines. Font size scales with user text settings.</p><details><summary>Read the measured receipt <span>{measurement?.inputIdentity}</span></summary><pre data-testid="measurement-output">{JSON.stringify(measurement,null,2)}</pre></details></div></aside>
      </section>
      <section id="keep" className="keep section-pad" data-testid="keep-section" aria-labelledby="keep-title"><div className="section-rule"><span>04 / Keep a direction</span><span>Carry the reasoning with the result</span></div><div className={["keep-layout",stylex.props(s.regionKeepLayout).className].join(" ")}><div className={["keep-copy",stylex.props(s.regionKeepCopy).className].join(" ")}><h2 id="keep-title">Worth keeping?<br/><em>Make it yours.</em></h2><p>Save a point of view. Come back to it.<br/>Or take the inputs and their measured<br className="desktop-break"/> consequences somewhere new.</p></div><div className={["keep-actions",stylex.props(s.regionKeepActions).className].join(" ")}><div className={["save-state",stylex.props(s.regionSaveState).className].join(" ")}><Cross/><div><strong>{saved?'A direction is saved.':'An open possibility.'}</strong><p>{saved?`Saved in this browser · ${new Date(saved.savedAt).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}`:'No saved direction in this browser yet.'}</p></div></div><div className={["action-pair",stylex.props(s.regionActionPair).className].join(" ")}><button className={[stylex.props(s.button).className, "dark-button"].join(" ")} data-testid="save" onClick={save}>Save direction<Arrow/></button><button className={[stylex.props(s.button).className, "plain-button"].join(" ")} data-testid="replay" onClick={replay} disabled={!saved}>Replay saved<svg width="21" height="21" viewBox="0 0 24 24" aria-hidden="true" fill="none"><path d="M4 10a8 8 0 1 1 1 7M4 4v6h6" stroke="currentColor" strokeWidth="1.7"/></svg></button></div><button className={[stylex.props(s.button).className, "export-button"].join(" ")} data-testid="export" onClick={exportJSON}><span>Download editable JSON<small>Inputs + design identity + current receipt</small></span><svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 2v13m-5-5 5 5 5-5M4 16v5h16v-5" stroke="currentColor" strokeWidth="1.7"/></svg></button><div className={["reset-row",stylex.props(s.regionResetRow).className].join(" ")}><span>Want a clean starting point?</span><button data-testid="reset" onClick={reset}>Reset to defaults</button></div><p data-testid="status" role="status" className={["status",stylex.props(s.regionStatus).className].join(" ")}>{status}</p></div></div></section>
    </main><footer><a className="footer-brand" href="#intent">Deliberate Friction<Arrow diagonal/></a><p>A working study. No perfect answers.</p><span>Original demonstration / local by design</span></footer>
    <div data-testid="inspection-overlay" className="inspection-overlay" aria-hidden="true" style={{display:mode==='inspect'&&selected&&obs?'block':'none',left:obs?.x??0,top:obs?.y??0,width:obs?.width??0,height:obs?.height??0}}/>
  </div>
}
createRoot(document.getElementById('root')).render(<App/>);
