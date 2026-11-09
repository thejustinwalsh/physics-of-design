import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomInt } from 'node:crypto';

const args = process.argv.slice(2);
const prepareOnly = args.includes('--prepare-plan');
const positional = [];
let servedArm;
for (let index = 0; index < args.length; index++) {
  if (args[index] === '--prepare-plan') continue;
  if (args[index] === '--arm') { servedArm = args[++index]; if (!servedArm) throw new Error('--arm requires ID'); continue; }
  if (args[index].startsWith('--')) throw new Error('Unknown flag');
  positional.push(args[index]);
}
if (!positional[0]) {
  console.error('Usage: node scripts/serve-marketing-study.mjs TRIAL_DIR [PORT=8663] [--prepare-plan] [--arm ID]');
  process.exit(2);
}
const trial = await fs.realpath(path.resolve(positional[0]));
const port = Number(positional[1] || 8663);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid port');
const manifest = JSON.parse(await fs.readFile(path.join(trial, 'manifest.json'), 'utf8'));
const ids = manifest.arms?.map(arm => arm.id);
if (!Array.isArray(ids) || ids.length !== 3 || ids.some(id => typeof id !== 'string' || !/^[A-Za-z0-9_-]+$/.test(id)) || new Set(ids).size !== 3) throw new Error('Expected three unique safe manifest arm IDs');
if (servedArm && !ids.includes(servedArm)) throw new Error('--arm must match a manifest ID');
const planPath = path.join(trial, 'review-plan.json');
let plan;
try { plan = JSON.parse(await fs.readFile(planPath, 'utf8')); }
catch (error) {
  if (error.code !== 'ENOENT') throw error;
  const pairs = [];
  for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
    const side = randomInt(2) ? [ids[i], ids[j]] : [ids[j], ids[i]];
    pairs.push({ left: side[0], right: side[1] });
  }
  for (let i = pairs.length - 1; i > 0; i--) { const j = randomInt(i + 1); [pairs[i], pairs[j]] = [pairs[j], pairs[i]]; }
  plan = { version: 1, createdAt: new Date().toISOString(), randomization: 'crypto.randomInt Fisher-Yates pair order, independent random side', pairs: pairs.map((pair, index) => ({ pair: index + 1, ...pair })) };
  // Link a fully written file exclusively, so parallel root servers agree on one
  // complete plan without overwriting it or reading another writer's partial JSON.
  const temporaryPlan = `${planPath}.${process.pid}.${randomInt(1_000_000_000)}.tmp`;
  try {
    await fs.writeFile(temporaryPlan, JSON.stringify(plan, null, 2) + '\n', { flag: 'wx' });
    try { await fs.link(temporaryPlan, planPath); }
    catch (linkError) {
      if (linkError.code !== 'EEXIST') throw linkError;
      plan = JSON.parse(await fs.readFile(planPath, 'utf8'));
    }
  } finally { await fs.rm(temporaryPlan, { force: true }); }
}
if (plan.version !== 1 || !Array.isArray(plan.pairs) || plan.pairs.length !== 3 || plan.pairs.some(pair => !ids.includes(pair.left) || !ids.includes(pair.right) || pair.left === pair.right) || new Set(plan.pairs.map(pair => [pair.left, pair.right].sort().join(':'))).size !== 3) throw new Error('Existing review plan does not match the three manifest IDs');
if (prepareOnly) {
  console.log(`Review plan preserved at ${planPath}`);
  process.exit(0);
}
// Expose only randomized IDs, never the manifest, workspaces, raw events or config.
let origins = {};
try { origins = JSON.parse(await fs.readFile(path.join(trial, 'hosting.json'), 'utf8')).origins; }
catch (error) { if (error.code !== 'ENOENT') throw error; }
if (!origins || typeof origins !== 'object') throw new Error('hosting.json requires origins object');
for (const id of ids) if (origins[id] !== undefined) {
  const url = new URL(origins[id]);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new Error('Hosting origin must be an http(s) root URL');
}
const viewerData = JSON.stringify({ ids, origins: Object.fromEntries(ids.filter(id => origins[id]).map(id => [id, origins[id]])), plan: { version: plan.version, createdAt: plan.createdAt, pairs: plan.pairs.map(({ pair, left, right }) => ({ pair, left, right })) } }).replaceAll('<', '\\u003c');
const viewer = `<!doctype html>
<html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Marketing study review</title>
<style>
*{box-sizing:border-box}body{font:16px/1.5 system-ui,sans-serif;margin:0;background:#f4f5f6;color:#18212a}main{max-width:1500px;margin:auto;padding:clamp(12px,3vw,32px)}h1{font-size:clamp(1.5rem,3vw,2rem);margin:0 0 8px}h2{font-size:1.2rem;margin:0 0 10px}p{max-width:78ch}button,select,input,a{font:inherit}button,select{padding:8px 12px;border:1px solid #7b8793;border-radius:5px;background:white;color:inherit}button{cursor:pointer}button[aria-pressed=true]{background:#193c59;color:white}a{color:#124c7a}button:focus-visible,select:focus-visible,a:focus-visible,input:focus-visible{outline:3px solid #d46a00;outline-offset:3px}.controls,.tabs{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-block:12px}.preview-shell{width:100%;min-width:0;overflow:auto;background:#dfe4e8;padding:8px}.preview-shell iframe{display:block;margin:auto;width:min(100%,var(--preview-width,1440px));height:74vh;min-height:360px;background:white;border:1px solid #7b8793}.pair-grid{display:flex;flex-wrap:wrap;gap:14px}.pair-grid iframe{width:100%;height:65vh;min-height:360px;border:1px solid #7b8793;background:white}.panel{margin-block:24px;padding:16px;background:white;border:1px solid #c6ced5;border-radius:8px;min-width:0}.side{min-width:0;flex:1 1 360px}.side a{display:inline-block;margin-bottom:8px}.criterion{display:flex;gap:12px;flex-wrap:wrap;align-items:center;padding:10px 0;border-bottom:1px solid #e0e5e9}.criterion>span{flex-basis:170px}.criterion label{white-space:nowrap}.note{color:#445463;font-size:.92rem}fieldset{border:0;padding:0;margin:0}legend{font-weight:600;padding:0;margin-bottom:8px}#pair-status{font-weight:600}textarea{display:block;width:100%;min-height:80px;max-width:100%;font:inherit}#export-status{overflow-wrap:anywhere}@media(max-width:760px){.pair-grid{flex-direction:column}.side{flex-basis:auto}.pair-grid iframe{height:70vh}.panel{padding:12px}.preview-shell iframe{height:75vh}}@media(prefers-reduced-motion:reduce){*{scroll-behavior:auto!important}}
</style><main>
<h1>Marketing study review</h1><p>Explore each page with its own scrolling and motion. The identifiers below are neutral. Open a page directly for a full-width or mobile review.</p>
<section class="panel" aria-labelledby="explore-title"><h2 id="explore-title">Explore pages</h2><div id="tabs" class="tabs" aria-label="Page selection"></div><div class="controls"><label for="width">Preview width</label><select id="width"><option value="390">390 px · phone</option><option value="834">834 px · tablet</option><option value="1440" selected>1440 px · desktop</option></select><a id="open-page" target="_blank" rel="noopener">Open selected page</a></div><p class="note">Preview width is capped by your available window width. Use a wider window for desktop review. On a phone, direct links use the full screen.</p><div class="preview-shell"><iframe id="single" title="Selected study page"></iframe></div></section>
<section class="panel" aria-labelledby="compare-title"><h2 id="compare-title">Pairwise observations</h2><p>Each pair appears once in a stored randomized order. A and B indicate the current left and right page. Answers are optional and begin unanswered. These are your observations; no ratings have been generated.</p><div class="controls"><label for="pair">Comparison</label><select id="pair"></select><span id="pair-status"></span></div><div class="pair-grid"><div class="side"><h3>A</h3><a id="open-a" target="_blank" rel="noopener">Open A in full page</a><iframe id="frame-a" title="Comparison A"></iframe></div><div class="side"><h3>B</h3><a id="open-b" target="_blank" rel="noopener">Open B in full page</a><iframe id="frame-b" title="Comparison B"></iframe></div></div><form id="observations"><fieldset><legend>Your optional observations</legend><div id="criteria"></div><label for="notes">Optional notes for this pair</label><textarea id="notes"></textarea></fieldset></form><p class="note">Answers stay in this page's memory. Reloading clears them. Nothing is sent or saved to the server. Export downloads a JSON file only when you click the button.</p><button id="export" type="button">Download my observations as JSON</button><p id="export-status" role="status"></p></section></main>
<script>
const data=${viewerData};
const criteria=[['overall','Overall preference'],['hierarchy','Hierarchy and readability'],['coherence','Coherence and character'],['motion','Motion and imagery']];
const answers=data.plan.pairs.map(pair=>({pair:pair.pair,left:pair.left,right:pair.right,overall:null,hierarchy:null,coherence:null,motion:null,notes:''}));
let activePair=0;
const byId=id=>document.getElementById(id);
const route=id=>data.origins[id]||'/'+encodeURIComponent(id)+'/';
function selectPage(id){byId('single').src=route(id);byId('open-page').href=route(id);for(const button of byId('tabs').children)button.setAttribute('aria-pressed',String(button.dataset.id===id));}
for(const id of data.ids){const button=document.createElement('button');button.type='button';button.dataset.id=id;button.textContent=id;button.addEventListener('click',()=>selectPage(id));byId('tabs').append(button);}
byId('width').addEventListener('change',()=>byId('single').style.setProperty('--preview-width',byId('width').value+'px'));
for(const [key,label]of criteria){const row=document.createElement('div');row.className='criterion';const title=document.createElement('span');title.id='criterion-'+key;title.textContent=label;row.setAttribute('role','group');row.setAttribute('aria-labelledby',title.id);row.append(title);for(const [value,text]of [['A','A'],['B','B'],['tie','Tie'],['','Unanswered']]){const wrapper=document.createElement('label');const input=document.createElement('input');input.type='radio';input.name=key;input.value=value;input.addEventListener('change',()=>{answers[activePair][key]=value||null;updateStatus();});wrapper.append(input,document.createTextNode(' '+text));row.append(wrapper);}byId('criteria').append(row);}
for(let index=0;index<data.plan.pairs.length;index++){const option=document.createElement('option');option.value=String(index);option.textContent='Pair '+(index+1)+' of '+data.plan.pairs.length;byId('pair').append(option);}
function updateStatus(){const completed=answers.filter(answer=>answer.overall!==null).length;byId('pair-status').textContent=completed+' / '+answers.length+' overall answers';}
function showPair(index){activePair=index;const pair=data.plan.pairs[index];for(const [side,id]of [['a',pair.left],['b',pair.right]]){byId('frame-'+side).src=route(id);byId('open-'+side).href=route(id);}for(const [key]of criteria){for(const input of document.querySelectorAll('input[name="'+key+'"]'))input.checked=input.value===(answers[index][key]||'');}byId('notes').value=answers[index].notes;updateStatus();}
byId('pair').addEventListener('change',()=>showPair(Number(byId('pair').value)));
byId('notes').addEventListener('input',()=>{answers[activePair].notes=byId('notes').value;});
byId('observations').addEventListener('submit',event=>event.preventDefault());
byId('export').addEventListener('click',()=>{const payload={version:1,exportedAt:new Date().toISOString(),respondent:'human user of review page; identity not collected',plan:data.plan,observations:answers};const url=URL.createObjectURL(new Blob([JSON.stringify(payload,null,2)+'\\n'],{type:'application/json'}));const link=document.createElement('a');link.href=url;link.download='marketing-study-observations.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);byId('export-status').textContent='Downloaded current observations. Unanswered fields remain null.';});
selectPage(data.ids[0]);showPair(0);
</script></html>`;

const mime = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.avif': 'image/avif', '.gif': 'image/gif', '.ico': 'image/x-icon', '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.mp4': 'video/mp4', '.webm': 'video/webm', '.wasm': 'application/wasm' };
async function publicFile(root, relative) {
  const actualRoot = await fs.realpath(root);
  if (actualRoot !== path.resolve(root)) throw Object.assign(new Error('Public root must not be a symlink'), { code: 'EACCES' });
  let actual = await fs.realpath(path.join(actualRoot, relative));
  const contained = candidate => candidate.startsWith(actualRoot + path.sep);
  if (!contained(actual)) throw Object.assign(new Error('Outside public root'), { code: 'EACCES' });
  if ((await fs.stat(actual)).isDirectory()) actual = await fs.realpath(path.join(actual, 'index.html'));
  if (!contained(actual)) throw Object.assign(new Error('Outside public root'), { code: 'EACCES' });
  const stat = await fs.stat(actual);
  if (!stat.isFile()) throw Object.assign(new Error('Not a file'), { code: 'ENOENT' });
  return { actual, stat };
}
const server = http.createServer(async (request, response) => {
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('Referrer-Policy', 'no-referrer');
  response.setHeader('Cache-Control', 'no-store');
  if (!['GET','HEAD'].includes(request.method)) { response.writeHead(405, { Allow: 'GET, HEAD' }); response.end(); return; }
  try {
    // Decode raw path before URL normalization, so encoded or literal traversal is rejected.
    const pathname = decodeURIComponent(request.url.split('?')[0]);
    if (!pathname.startsWith('/') || pathname.includes('\\') || pathname.includes('\0') || pathname.split('/').some(segment => segment === '.' || segment === '..')) { response.writeHead(400); response.end('Invalid path'); return; }
    if (pathname === '/' && !servedArm) { response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); response.end(request.method === 'HEAD' ? undefined : viewer); return; }
    const segments = pathname.split('/').filter(Boolean);
    let file;
    let screenshotRequest = false;
    if (servedArm) {
      file = await publicFile(path.join(trial, 'frozen', servedArm, 'public'), segments.join('/') || 'index.html');
    } else if (segments[0] === 'screens' && segments.length === 2 && /^[A-Za-z0-9_.-]+\.png$/.test(segments[1])) {
      file = await publicFile(path.join(trial, 'evaluation'), segments[1]);
      screenshotRequest = true;
      if (path.extname(file.actual).toLowerCase() !== '.png') throw Object.assign(new Error('Not a PNG'), { code: 'EACCES' });
    } else if (ids.includes(segments[0])) {
      if (segments.length === 1 && !pathname.endsWith('/')) { response.writeHead(302, { Location: '/'+segments[0]+'/' }); response.end(); return; }
      file = await publicFile(path.join(trial, 'frozen', segments[0], 'public'), segments.slice(1).join('/') || 'index.html');
    } else { response.writeHead(404); response.end('Not found'); return; }
    const contents = await fs.readFile(file.actual);
    if (screenshotRequest && !contents.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) throw Object.assign(new Error('Invalid PNG'), { code: 'EACCES' });
    response.writeHead(200, { 'Content-Type': mime[path.extname(file.actual).toLowerCase()] || 'application/octet-stream', 'Content-Length': contents.length });
    response.end(request.method === 'HEAD' ? undefined : contents);
  } catch (error) {
    response.writeHead(error instanceof URIError ? 400 : ['ENOENT','ENOTDIR','EACCES'].includes(error.code) ? 404 : 500);
    response.end('Unavailable');
  }
});
server.listen(port, '127.0.0.1', () => console.log(`${servedArm ? 'Frozen '+servedArm : 'Study viewer'}: http://127.0.0.1:${port}/`));
