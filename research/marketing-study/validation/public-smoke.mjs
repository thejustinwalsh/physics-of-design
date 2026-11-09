import { chromium, webkit } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
const trial=process.argv[2];
const hosting=JSON.parse(await fs.readFile(path.join(trial,'hosting.json'),'utf8'));
const report={startedAt:new Date().toISOString(),purpose:'Public transport and browser smoke; no aesthetic or complete accessibility claim',runs:[],errors:[]};
for(const [engine,type] of Object.entries({chromium,webkit})){
 const browser=await type.launch({headless:true});
 try{
  for(const [id,url] of Object.entries(hosting.origins))for(const viewport of [{width:390,height:844},{width:1440,height:900}]){
   const page=await browser.newPage({viewport});const errors=[];page.on('pageerror',e=>errors.push(String(e)));const r={id,engine,viewport,url};report.runs.push(r);
   try{
    const response=await page.goto(url,{waitUntil:'networkidle',timeout:60000});await page.evaluate(()=>document.fonts.ready);await page.waitForTimeout(500);
    r.status=response.status();r.initial=await page.evaluate(()=>({h1:[...document.querySelectorAll('h1')].map(e=>e.textContent),overflow:document.documentElement.scrollWidth>innerWidth+1,images:[...document.images].map(e=>({loaded:e.complete&&e.naturalWidth>0,alt:e.alt})),fonts:document.fonts.status,scrollHeight:document.documentElement.scrollHeight}));
    await page.screenshot({path:path.join(trial,'evaluation',`public-${id}-${engine}-${viewport.width}.png`)});
    await page.mouse.wheel(0,600);await page.waitForTimeout(700);r.wheelScrollY=await page.evaluate(()=>scrollY);
    r.failed=!(r.status===200&&r.initial.h1.length===1&&!r.initial.overflow&&r.initial.images.every(e=>e.loaded)&&r.wheelScrollY>0);
   }catch(e){r.failed=true;r.error=String(e);}finally{r.pageErrors=errors;r.failed ||=errors.length>0;await page.close();}
  }
  for(const viewport of [{width:390,height:844},{width:1440,height:900}]){
   const page=await browser.newPage({viewport});const r={viewer:true,engine,viewport,url:hosting.viewer};report.runs.push(r);
   try{
    await page.goto(hosting.viewer,{waitUntil:'networkidle',timeout:60000});r.frames=await page.locator('iframe').count();r.origins=await page.locator('iframe').evaluateAll(es=>es.map(e=>e.src));r.overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1);r.unanswered=await page.locator('input[type=radio]:checked').evaluateAll(es=>es.every(e=>e.value===''));
    await page.getByLabel('Preview width',{exact:true}).selectOption('390');await page.getByRole('button',{name:'Study-720fd5b1',exact:true}).click();r.selected=await page.locator('#single').getAttribute('src');r.failed=r.frames!==3||r.overflow||!r.unanswered||r.selected!==hosting.origins['Study-720fd5b1'];
   }catch(e){r.failed=true;r.error=String(e);}finally{await page.close();}
  }
 }finally{await browser.close();await fs.writeFile(path.join(trial,'public-browser-proof.json'),JSON.stringify(report,null,2)+'\n');}
}
report.completedAt=new Date().toISOString();report.failedRuns=report.runs.filter(r=>r.failed).length;await fs.writeFile(path.join(trial,'public-browser-proof.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({runs:report.runs.length,failed:report.failedRuns}));if(report.failedRuns)process.exitCode=1;
