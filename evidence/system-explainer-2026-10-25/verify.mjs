import {chromium,webkit} from 'playwright';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
const dir=resolve('evidence/system-explainer-2026-10-25');
const digest=b=>createHash('sha256').update(b).digest('hex');
const artifactPaths=['explainer.template.html','index.html','report.html','source.html','build.py','verify.mjs'];
const artifactSources=await Promise.all(artifactPaths.map(async path=>({path,sha256:digest(await readFile(`${dir}/${path}`))})));
const artifactSourceIdentity=digest(JSON.stringify(artifactSources));
await mkdir(`${dir}/screenshots`,{recursive:true});
const checks=[],errors=[];
function check(name,passed,detail){checks.push({name,passed,detail});}
for(const [name,engine] of [['chromium',chromium],['webkit',webkit]]){
 const browser=await engine.launch({headless:true,...(name==='webkit'?{executablePath:process.env.DESIGN_WEBKIT_EXECUTABLE||resolve('artifacts/runtime/playwright/webkit-2370/pw_run.sh')}:{})});
 const page=await browser.newPage({viewport:{width:1440,height:1100},reducedMotion:'reduce'});
 page.on('pageerror',e=>errors.push({browser:name,error:String(e)}));
 await page.goto(`file://${dir}/index.html`);await page.waitForFunction(()=>window.explainerReady===true);
 for(const width of [320,390,834,1440]){
  await page.setViewportSize({width,height:1100});
  for(const panel of ['energy','dependency','workflow','scenario','gate','binding','specialists']){
   await page.locator(`[data-panel="${panel}"]`).click();
   const geometry=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,body:document.body.scrollWidth,gridElements:[...document.querySelectorAll('body *')].filter(e=>e.checkVisibility()&&['grid','inline-grid'].includes(getComputedStyle(e).display)).map(e=>e.id||e.className),controls:[...document.querySelectorAll('button,input,select')].filter(e=>e.checkVisibility()).map(e=>{const r=e.getBoundingClientRect();return {id:e.id||e.textContent,x:r.x,right:r.right,width:r.width}})}));
   check(`${name}/${width}/${panel}/containment`,geometry.scroll<=width&&geometry.controls.every(c=>c.x>=0&&c.right<=width),geometry);
   check(`${name}/${width}/${panel}/no-grid-layout`,geometry.gridElements.length===0,geometry.gridElements);
  }
  await page.locator('[data-panel="energy"]').click();
  await page.screenshot({path:`${dir}/screenshots/${name}-${width}.png`,fullPage:true});
 }
 await page.setViewportSize({width:834,height:1100});
 await page.locator('#weight').selectOption('4');await page.locator('#cap').selectOption('48');
 check(`${name}/preference-and-hard-cap`,(await page.locator('#energy-result').textContent()).includes('48px'),await page.locator('#energy-result').textContent());
 await page.locator('[data-panel="dependency"]').click();await page.locator('#changed-path').selectOption('/colors');
 check(`${name}/dependency-color-path`,(await page.locator('.dependency-layout .stale').count())===3,await page.locator('#dependency-result').textContent());
 await page.locator('[data-panel="workflow"]').click();
 for(const [mode,text] of [['replay','reuse'],['stale','blocked'],['recompute','720px']]){await page.locator(`[data-mode="${mode}"]`).click();check(`${name}/workflow-${mode}`,(await page.locator('#workflow-result').textContent()).includes(text),await page.locator('#workflow-result').textContent());}
 await page.locator('[data-panel="scenario"]').click();await page.locator('#scenario-mode').selectOption('false-name');
 check(`${name}/scenario-rejects-false-name`,(await page.locator('#scenario-result').textContent()).includes('exactly these inputs'),await page.locator('#scenario-result').textContent());
 await page.locator('#scenario details summary').click();await page.locator('#measured-scenario').selectOption('phone-large');
 check(`${name}/actual-recorded-measurement`,(await page.locator('#measured-result').textContent()).includes('text scale 2'),await page.locator('#measured-result').textContent());
 await page.locator('[data-panel="gate"]').click();await page.locator('#gate-mode').selectOption('matching');
 check(`${name}/gate-matching`,(await page.locator('#gate-result').textContent()).includes('complete'),await page.locator('#gate-result').textContent());
 await page.locator('#gate-mode').selectOption('stale-copy');check(`${name}/gate-stale`,(await page.locator('#gate-result').textContent()).includes('blocks'),await page.locator('#gate-result').textContent());
 await page.locator('[data-panel="binding"]').click();await page.locator('#binding-mode').selectOption('wrong-provider');
 check(`${name}/binding-provider`,(await page.locator('#binding-result').textContent()).includes('wrong-evidence'),await page.locator('#binding-result').textContent());
 await page.locator('[data-panel="specialists"]').click();const slider=page.locator('#motion-time');await slider.scrollIntoViewIfNeeded();
 const before=await slider.boundingBox();await page.mouse.move(before.x+4,before.y+before.height/2);await page.mouse.down();
 const samples=[];for(let i=1;i<=20;i++){await page.mouse.move(before.x+4+(before.width-8)*i/20,before.y+before.height/2);samples.push(await slider.boundingBox());}await page.mouse.up();
 check(`${name}/continuous-drag-stable-rail`,samples.every(r=>Math.abs(r.x-before.x)<.1&&Math.abs(r.y-before.y)<.1&&Math.abs(r.width-before.width)<.1),{before,after:samples.at(-1),value:await slider.inputValue()});
 await slider.focus();await page.keyboard.press('Home');await page.keyboard.press('ArrowRight');
 check(`${name}/keyboard-range`,await slider.inputValue()==='1',await slider.inputValue());
 for(const panel of ['dependency','workflow','scenario','gate','binding','specialists']){await page.locator(`[data-panel="${panel}"]`).click();await page.locator(`#${panel}`).screenshot({path:`${dir}/screenshots/${name}-${panel}.png`});}
 await page.evaluate(()=>document.querySelector('h1').textContent='A much longer explanation title: preserve every word while the surrounding page responds to real content changes.');
 await page.addStyleTag({content:'body{font-size:34px!important}button,input,select{font-size:inherit}'});
 await page.setViewportSize({width:390,height:1100});
 const enlarged=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,reduced:matchMedia('(prefers-reduced-motion: reduce)').matches}));
 check(`${name}/changed-text-enlargement-reduced-motion`,enlarged.scroll<=enlarged.width&&enlarged.reduced,enlarged);
 await page.screenshot({path:`${dir}/screenshots/${name}-enlarged.png`,fullPage:true});
 await page.goto(`file://${dir}/report.html`);check(`${name}/report-content`,(await page.locator('body').innerText()).includes('Hard feasibility'),await page.title());
 await browser.close();
}
check('no-uncaught-browser-errors',errors.length===0,errors);
// All local artifact references and line anchors must resolve within the bundle.
const {existsSync}=await import('node:fs');
for(const filename of ['index.html','report.html']){
 const body=await readFile(`${dir}/${filename}`,'utf8');
 for(const [,href] of body.matchAll(/href="([^"]+)"/g)){
  if(/^https?:/.test(href))continue;
  const [path,anchor]=href.split('#');
  const exists=path==='browser-verification.json'||existsSync(`${dir}/${path}`);
  let anchorExists=true;if(exists&&anchor)anchorExists=(await readFile(`${dir}/${path}`,'utf8')).includes(`id="${anchor}"`);
  check(`link/${filename}/${href}`,exists&&anchorExists,{exists,anchorExists});
 }
}
const artifactSourcesAfter=await Promise.all(artifactPaths.map(async path=>({path,sha256:digest(await readFile(`${dir}/${path}`))})));
check('artifact-source-stable',JSON.stringify(artifactSources)===JSON.stringify(artifactSourcesAfter),{before:artifactSourceIdentity,after:digest(JSON.stringify(artifactSourcesAfter))});
const result={checkedAt:new Date().toISOString(),artifactSources,artifactSourceIdentity,scope:'This explanatory artifact only. Browser interaction, geometry, flex-layout and reference checks do not rerun historical product proofs, establish React Native parity or full accessibility.',checks,errors,passed:checks.every(c=>c.passed)};
await writeFile(`${dir}/browser-verification.json`,JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({passed:result.passed,checks:checks.length,failed:checks.filter(c=>!c.passed)},null,2));
if(!result.passed)process.exitCode=1;
