import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { hash } from '../dist/index.js';
const root = process.argv[2] ?? 'artifacts/evaluation-v2',
  products = JSON.parse(await readFile(`${root}/products.json`, 'utf8'));
const cases = [],
  assignments = [];
for (const projectId of new Set(products.map((p) => p.projectId))) {
  for (const [comparison, conditions] of [
    ['guidance-vs-tools', ['guidance-only', 'tools-smooth']],
    ['smooth-vs-musical', ['tools-smooth', 'tools-musical']],
  ]) {
    const pair = conditions.map((condition) =>
      products.find(
        (p) => p.projectId === projectId && p.condition === condition,
      ),
    );
    if (pair.some((p) => !p)) continue;
    const id = hash({ projectId, comparison, seed: pair[0].seed }).slice(0, 16),
      reverse = parseInt(id.slice(0, 2), 16) % 2 === 1,
      ordered = reverse ? [pair[1], pair[0]] : pair;
    const html = await Promise.all(
      ordered.map((p) =>
        readFile(`${p.directory}/proof/specimen.html`, 'utf8'),
      ),
    );
    cases.push({ id, html });
    assignments.push({
      id,
      projectId,
      taskId: pair[0].taskId,
      seed: pair[0].seed,
      comparison,
      reversed: reverse,
    });
  }
}
await mkdir(`${root}/ratings`, { recursive: true });
await writeFile(
  `${root}/ratings/assignment-key.json`,
  JSON.stringify(assignments, null, 2) + '\n',
);
const script = `const cases=${JSON.stringify(cases).replaceAll('<', '\\u003c')};let index=0;const ratings=[];const status=document.querySelector('#status');function show(){if(index>=cases.length){status.textContent='Complete. Download your observations.';return;}status.textContent='Comparison '+(index+1)+' of '+cases.length;document.querySelector('#left').srcdoc=cases[index].html[0];document.querySelector('#right').srcdoc=cases[index].html[1];}document.querySelectorAll('[data-vote]').forEach(b=>b.onclick=()=>{if(index>=cases.length)return;const raterId=document.querySelector('#rater').value.trim();if(!raterId){status.textContent='Enter an anonymous rater ID before rating.';return;}ratings.push({id:cases[index].id,raterId,winner:b.dataset.vote});index++;show();});document.querySelector('#download').onclick=()=>{const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify({ratings},null,2)],{type:'application/json'}));a.download='ratings.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);};show();`;
await writeFile(
  `${root}/ratings/index.html`,
  `<!doctype html><html lang="en"><meta charset="utf-8"><title>Typography preference comparisons</title><style>body{font:16px system-ui;margin:24px}main{display:flex;flex-direction:row;flex-wrap:wrap;gap:20px}iframe{flex:1 1 320px;min-width:0;border:1px solid #aaa;width:100%;height:740px}nav{display:flex;gap:12px;margin:16px 0;flex-wrap:wrap}button,input{font:inherit;padding:8px}</style><h1>Typography preference comparisons</h1><p>Choose the composition you prefer for the displayed content. Consider hierarchy, reading rhythm, and spacing. Each side preserves the same content. No condition names or scores are shown. Resize the window to inspect reflow.</p><label>Anonymous rater ID <input id="rater" required></label><p id="status"></p><main><iframe id="left" title="Left alternative"></iframe><iframe id="right" title="Right alternative"></iframe></main><nav><button data-vote="left">Prefer left</button><button data-vote="tie">Tie</button><button data-vote="right">Prefer right</button><button id="download">Download observations</button></nav><script>${script}</script></html>`,
);
console.log(
  JSON.stringify({
    comparisons: cases.length,
    html: `${root}/ratings/index.html`,
    key: `${root}/ratings/assignment-key.json`,
    scope: 'No ratings have been supplied by creating this file.',
  }),
);
