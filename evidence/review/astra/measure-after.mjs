import { chromium } from 'playwright';
import { writeFile } from 'node:fs/promises';
const browser = await chromium.launch({headless:true});
const page = await browser.newPage({viewport:{width:360,height:1000}});
const out={source:'Fresh headless Playwright Chromium fallback after native cua IAB unavailable and no browser surfaces exposed',baseUrl:'http://127.0.0.1:4392/',rows:[],dynamic:[]};
async function settle(){await page.evaluate(async()=>{await document.fonts.ready;await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));});}
async function measure(){return await page.evaluate(()=>{
 const rect=el=>{let r=el.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,bottom:r.bottom};};
 return {viewport:{width:innerWidth,height:innerHeight},document:{width:document.documentElement.scrollWidth,height:document.documentElement.scrollHeight},fonts:document.fonts.status,bodyMaxWidth:getComputedStyle(document.body).maxWidth,article:{...rect(document.querySelector('article')),padding:getComputedStyle(document.querySelector('article')).padding},blocks:Array.from(document.querySelectorAll('[data-block]')).map(el=>{
 const s=getComputedStyle(el);const groups=new Map();const walk=document.createTreeWalker(el,NodeFilter.SHOW_TEXT);let node;
 while(node=walk.nextNode()){for(let i=0;i<node.textContent.length;i++){const ch=node.textContent[i];if(ch==='\n')continue;const r=document.createRange();r.setStart(node,i);r.setEnd(node,i+1);const q=r.getBoundingClientRect();if(!q.height||!q.width)continue;const key=q.top.toFixed(2);groups.set(key,(groups.get(key)||'')+ch);}}
 return {id:el.getAttribute('data-block'),...rect(el),fontSize:s.fontSize,lineHeight:s.lineHeight,tracking:s.letterSpacing,maxWidth:s.maxWidth,overflowWrap:s.overflowWrap,clientWidth:el.clientWidth,scrollWidth:el.scrollWidth,lines:Array.from(groups.values()).map(x=>x.trim()).filter(Boolean)};
 })};
 });}
try{
 for(const arch of ['hero','editorial'])for(const width of [360,390,834,1024,1440]){
  const id=`${arch}-original-${width}`;await page.setViewportSize({width,height:1000});await page.goto(out.baseUrl+id+'.html');await settle();out.rows.push({id,...await measure()});
  await page.screenshot({path:`artifacts/review/astra/after-browser-${id}.png`,fullPage:true});
 }
 await page.goto(out.baseUrl+'hero-original-360.html');
 for(const width of [360,834,390]){await page.setViewportSize({width,height:1000});await settle();out.dynamic.push({url:page.url(),...await measure()});}
 await writeFile('artifacts/review/astra/after-browser-measurements.json',JSON.stringify(out,null,2)+'\n');
 console.log(JSON.stringify({rows:out.rows.map(x=>({id:x.id,article:x.article,blocks:x.blocks.map(b=>({id:b.id,width:b.width,y:b.y,size:b.fontSize,lines:b.lines})),overflow:x.document.width-x.viewport.width})),dynamic:out.dynamic.map(x=>({viewport:x.viewport,article:x.article,blocks:x.blocks.map(b=>({id:b.id,width:b.width,y:b.y,size:b.fontSize,lines:b.lines}))}))},null,2));
}finally{await browser.close();}
