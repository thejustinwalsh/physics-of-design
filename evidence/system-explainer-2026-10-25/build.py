from pathlib import Path
import json, html, re, shutil

root=Path(__file__).resolve().parent
data=json.loads((root/'engine-results.json').read_text())
payload=json.dumps(data,separators=(',',':')).replace('</','<\\/')
(root/'index.html').write_text((root/'explainer.template.html').read_text().replace('__DATA__',payload))
shutil.copyfile(root.parents[1]/'LICENSE',root/'LICENSE.txt')
source=['<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Frozen Design Theory source</title><style>body{font:16px/1.5 system-ui;max-width:1200px;margin:30px auto;padding:0 20px;color:#202a32;background:#f7f5ef}pre{font:13px/1.55 monospace;overflow-x:auto}a{color:#245ab5}li:target{background:#fae4c2}li{white-space:pre;min-height:1.55em}section{margin:50px 0}h2{font-size:24px}</style><h1>Frozen implementation source</h1><p><a href="index.html">Return to the explanation</a>. These files match the source hashes in <a href="manifest.json">manifest.json</a>. Line numbers refer to that snapshot.</p>']
for s in data['manifest']['sources']:
 name=Path(s['path']).stem
 source.append(f'<section><h2>{html.escape(s["path"])}</h2><p>SHA-256 <code>{s["sha256"]}</code></p><pre><ol>')
 for i,line in enumerate((root/s['copy']).read_text().splitlines(),1):
  source.append(f'<li id="{name}-{i}">{html.escape(line)}</li>')
 source.append('</ol></pre></section>')
source.append('</html>');(root/'source.html').write_text('\n'.join(source))

# A minimal local renderer for this authored Markdown: headings, paragraphs,
# fenced code and tables. No third-party content or remote resources.
md=(root.parents[1]/'docs/how-design-theory-works.md').read_text()
md=md.replace('../evidence/system-explainer-2026-10-25/','')
def inline(s):
 s=html.escape(s)
 s=re.sub(r'\[([^\]]+)\]\(([^)]+)\)',r'<a href="\2">\1</a>',s)
 s=re.sub(r'\*\*(.+?)\*\*',r'<strong>\1</strong>',s)
 return re.sub(r'`([^`]+)`',r'<code>\1</code>',s)
parts=[];para=[];table=False
def flush():
 if para: parts.append('<p>'+inline(' '.join(para))+'</p>');para.clear()
for line in md.splitlines():
 if line.startswith('|'):
  flush()
  if not table: parts.append('<div class="table-wrap"><table>');table=True
  if re.match(r'^\|[\s:|\-]+\|$',line):continue
  parts.append('<tr>'+''.join('<td>'+inline(c.strip())+'</td>' for c in line.strip('|').split('|'))+'</tr>');continue
 if table:parts.append('</table></div>');table=False
 if line.startswith('#'):
  flush();level=len(line)-len(line.lstrip('#'));parts.append(f'<h{level}>'+inline(line[level:].strip())+f'</h{level}>')
 elif not line:flush()
 else:para.append(line)
flush()
report='<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>How Design Theory works — report</title><style>body{font:18px/1.65 system-ui;color:#202a32;background:#f7f5ef;max-width:850px;margin:auto;padding:35px 24px}h1{font-size:40px;line-height:1.15;letter-spacing:-.025em}h2{font-size:27px;line-height:1.3;margin-top:45px}a{color:#245ab5;text-underline-offset:3px}code{font-size:.85em;overflow-wrap:anywhere}table{border-collapse:collapse;font-size:15px}td{padding:10px;vertical-align:top;border-bottom:1px solid #d1d5d5}.table-wrap{overflow-x:auto}p{overflow-wrap:anywhere}@media(max-width:500px){body{font-size:16px;padding:22px 18px}h1{font-size:32px}h2{font-size:24px}}</style></head><body><p><a href="index.html">Open the seven interactive machines</a></p>'+''.join(parts)+'</body></html>'
(root/'report.html').write_text(report)
print(json.dumps({'indexBytes':(root/'index.html').stat().st_size,'sources':len(data['manifest']['sources']),'reportWords':len(md.split())}))
