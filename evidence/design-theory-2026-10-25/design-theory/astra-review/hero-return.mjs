import {createServer} from 'node:http';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {chromium} from 'playwright';
const root=path.resolve('artifacts/vela/web/design-theory'), out='artifacts/design-theory/astra-review';
const server=createServer(async(req,res)=>{try{const pathname=new URL(req.url,'http://localhost').pathname;const file=path.resolve(root,'.'+(pathname==='/'?'/index.html':pathname));if(!file.startsWith(root+'/'))return res.writeHead(403).end();res.setHeader('Content-Type',({'.html':'text/html','.js':'application/javascript','.svg':'image/svg+xml','.ttf':'font/ttf'})[path.extname(file)]??'application/octet-stream');res.end(await readFile(file));}catch{res.writeHead(404).end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const report={capturedAt:new Date().toISOString(),implementation:{},cases:[],errors:[]};
for(const f of ['examples/design-theory/web.jsx','examples/design-theory/profiles.js','examples/design-theory/Surface.jsx','examples/design-theory/surface-scene.js','artifacts/vela/web/design-theory/app.js'])report.implementation[f]=createHash('sha256').update(await readFile(f)).digest('hex');
let browser;
try{browser=await chromium.launch({headless:true});report.browser=browser.version();const page=await browser.newPage({reducedMotion:'reduce',acceptDownloads:true});page.on('pageerror',e=>report.errors.push(String(e)));
for (const width of [320,834]) { await page.setViewportSize({width,height:900});await page.goto(`http://127.0.0.1:${server.address().port}`);await page.waitForFunction(()=>window.__DESIGN_THEORY__?.ready);await page.evaluate(()=>document.fonts.ready);await page.waitForTimeout(1500);await page.screenshot({path:`${out}/hero-initial-${width}.png`});await page.locator('[data-profile-choice="editorial"]').click();await page.evaluate(()=>{document.activeElement?.blur();scrollTo(0,0)});await page.waitForTimeout(2000);await page.screenshot({path:`${out}/hero-return-${width}.png`});report.cases.push(await page.evaluate(()=>({width:innerWidth,surfaces:window.__DESIGN_THEORY__.runtime.stats.surfaces})));}
}finally{await browser?.close();server.close();await writeFile(`${out}/hero-return.json`,JSON.stringify(report,null,2)+'\n');}
console.log(JSON.stringify({cases:report.cases.length,errors:report.errors,dampingEdited:report.dampingEdited,download:report.download}));
