"""Package completed trial evidence; never modifies original records or frozen entries."""
import datetime,hashlib,json,pathlib,re,sys,zipfile
repo=pathlib.Path(__file__).resolve().parents[3]
trial=pathlib.Path(sys.argv[1]).resolve()
out=repo/'research/evidence';out.mkdir(exist_ok=True)
prefix='2026-11-08-marketing-study'
manifest=json.loads((trial/'manifest.json').read_text())
evaluation=json.loads((trial/'evaluation/report.json').read_text())
assert evaluation.get('completedAt'), 'Do not archive an incomplete matrix'
assert len(evaluation['arms'])==3 and all(len(a['runs'])==20 and all(r.get('completedAt') for r in a['runs']) for a in evaluation['arms'])
assert json.loads((trial/'evaluation/navigation-adjudication.json').read_text()).get('completedAt'), 'Navigation supplement incomplete'
records=[];core={};images={a['id']:{} for a in manifest['arms']}
def sha(b):return hashlib.sha256(b).hexdigest()
def record(name,raw,published=None,changes=None,target=None):
 data=raw if published is None else published
 assert name not in core and all(name not in q for q in images.values()),name
 records.append({'path':name,'originalSha256':sha(raw),'publishedSha256':sha(data),'bytes':len(data),'sanitization':changes or []})
 (core if target is None else images[target])[name]=data

def public_metadata(raw,name):
 changes=[]
 if name.endswith('stdout.jsonl'):
  rows=[json.loads(x) for x in raw.decode().splitlines() if x.strip()]
  kept=[r for r in rows if not str(r.get('method','')).startswith(('account/','auth/'))]
  changes.append({'removedAccountAuthEvents':len(rows)-len(kept)})
  data=''.join(json.dumps(r,separators=(',',':'))+'\n' for r in kept)
 elif name.endswith('manifest.json'):
  d=json.loads(raw); inventory=d.pop('suppressedSkillPaths',[]);d['suppressedSkillInventory']={'count':len(inventory),'originalSha256':sha(json.dumps(inventory,separators=(',',':')).encode()),'omitted':True}
  d['flags']=['[host skill disable inventory omitted]' if str(v).startswith('skills.config=') else v for v in d.get('flags',[])]
  changes.append('Omitted host skill path inventory; suppression count and original file hash retained')
  data=json.dumps(d,indent=2)+'\n'
 elif name.endswith('invocation.json'):
  d=json.loads(raw)
  d['args']=['[host skill disable inventory omitted]' if str(v).startswith('skills.config=') else v for v in d.get('args',[])]
  changes.append('Omitted any host skill disable inventory')
  data=json.dumps(d,indent=2)+'\n'
 else:data=raw.decode()
 # Frozen outputs remain exact, including any author-recorded runtime path. Public
 # metadata gets stable placeholders; original hashes bind all transformations.
 for source,replacement in [(str(trial),'$TRIAL'),('/Users/mini','$HOST_HOME')]:
  if source in data:data=data.replace(source,replacement);changes.append('Path placeholder: '+replacement)
 return data.encode(),changes

# Frozen outputs retain exact bytes, distributed across core + image parts.
for arm in manifest['arms']:
 id=arm['id']
 for p in sorted((trial/'frozen'/id).rglob('*')):
  if p.is_file():record('trial/'+p.relative_to(trial).as_posix(),p.read_bytes(),target=id if p.suffix.lower()=='.png' and 'public' not in p.relative_to(trial/'frozen'/id).parts else None)
 # Supplied inputs, original copied dependencies excluded; their hashes retained.
 for name in ['BRIEF.md','DESIGN.md','CONTENT.md','AGENTS.md','PROMPT.md','GUIDANCE.md','build.mjs','package.json']:
  p=trial/id/name
  if p.exists():record(f'trial/inputs-authored/{id}/{name}',p.read_bytes())
 for p in sorted((trial/'runs'/id).rglob('*')):
  if p.is_file():
   raw=p.read_bytes();data,changes=public_metadata(raw,str(p.relative_to(trial)))
   record('trial/'+p.relative_to(trial).as_posix(),raw,data,changes)
for directory in ['inputs','audit','evaluation']:
 for p in sorted((trial/directory).rglob('*')):
  if not p.is_file():continue
  raw=p.read_bytes();name='trial/'+p.relative_to(trial).as_posix()
  if p.suffix.lower()=='.png':
   matching=[id for id in images if id in p.name]
   assert len(matching)==1, name
   record(name,raw,target=matching[0])
  else:
   data,changes=public_metadata(raw,name);record(name,raw,data,changes)
# Deliberate allowlist: private preflight actual prompt/config records and account
# source events, tunnel logs, node_modules and model binaries are never copied.
for filename in ['manifest.json','protocol.json','preflight.json','audit.json','audit-review.json','cost-summary.json','tool-influence-review.json','capability-confirmation.json','review-plan.json','predeclared-harness.json','evaluator-refinement-amendment.json','hosting-amendment.json','viewer-and-accounting-hashes.json','shared-input-equality.json','local-serving-proof.json','interim-count-correction.json','orchestrator-context.json','public-serving-proof.json','post-evaluation-source-proof.json','post-evaluation-recheck-correction.json','public-browser-proof.json','hosting.json','origins.local.json','ordered-verification.log','controls.log','server-test.log','evaluation.log']:
 p=trial/filename
 if p.exists():
  raw=p.read_bytes();data,changes=public_metadata(raw,filename);record('trial/'+filename,raw,data,changes)
setup=pathlib.Path('/private/tmp/design-marketing-20261108-a/capability-metrics')
for p in sorted(setup.glob('*')):
 if p.is_file():
  raw=p.read_bytes();data,changes=public_metadata(raw,p.name);record('shared-setup/capability-metrics/'+p.name,raw,data,changes)
setup_browser=pathlib.Path('/private/tmp/design-marketing-capability-20261108/browser-result.json')
if setup_browser.exists():record('shared-setup/browser-result.json',setup_browser.read_bytes())
for p in sorted((repo/'artifacts/verification-marketing-study').rglob('*')):
 if p.is_file():
  raw=p.read_bytes();data,changes=public_metadata(raw,p.name);record('repository/'+p.relative_to(repo).as_posix(),raw,data,changes)
for name in ['marketing-study.mjs','design-builder-metrics.mjs','evaluate-marketing-study.mjs','evaluate-marketing-study.historical.mjs','probe-marketing-controls.mjs','serve-marketing-study.mjs','summarize-marketing-study.mjs','test-marketing-controls.mjs','test-marketing-study-server.mjs','test-summarize-marketing-study.mjs']:
 p=repo/'scripts'/name;record('repository/scripts/'+name,p.read_bytes())
for p in sorted((repo/'research/marketing-study').rglob('*')):
 if p.is_file():record('repository/'+p.relative_to(repo).as_posix(),p.read_bytes())
core['READ-ME-FIRST.md']=b'''# Frozen marketing comparison evidence\n\nExtract core and all image parts into the same directory. Frozen outputs retain exact bytes; use each frozen/public directory as a static origin root. Those pages need no Design Theory or local model at runtime. Source rebuilds require the supplied scaffold dependencies. Engine recipes also require matching toolkit/model provision and path rebinding; these archives do not bundle model binaries or dependencies.\n\nOther public metadata is sanitized: account/auth events removed, host skill inventories omitted, local host/trial paths replaced by documented placeholders. EVIDENCE-MANIFEST.json maps original and published SHA256 per file. Original private files remain local. Do not compare sanitized stdout hashes directly to raw hashes in original receipts. Fonts retain original licenses and artwork provenance. Images belong to frozen author receipts or independent evaluator observations; neither is human preference evidence.\n\nSee repository/research/marketing-study/report.md for measured conclusions and limitations.\n'''
parts=[]
def write_zip(filename,files):
 dest=out/filename
 with zipfile.ZipFile(dest,'w',compression=zipfile.ZIP_DEFLATED,compresslevel=6) as z:
  for name,data in sorted(files.items()):z.writestr(name,data)
 with zipfile.ZipFile(dest) as z:
  assert z.testzip() is None
  for name,data in files.items():assert sha(z.read(name))==sha(data),name
 assert dest.stat().st_size<90_000_000, 'Split archive before public push'
 return {'file':filename,'bytes':dest.stat().st_size,'sha256':sha(dest.read_bytes()),'entries':len(files)}
for arm in manifest['arms']:
 entries=images[arm['id']];batch={};size=0;index=1
 for name,data in sorted(entries.items()):
  if size+len(data)>60_000_000 and batch:
   parts.append(write_zip(f"{prefix}-{arm['condition']}-images-{index}.zip",batch));index+=1;batch={};size=0
  batch[name]=data;size+=len(data)
 if batch:parts.append(write_zip(f"{prefix}-{arm['condition']}-images-{index}.zip",batch))
core['EVIDENCE-MANIFEST.json']=(json.dumps({'version':1,'createdAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'policy':'Frozen bytes exact; other transformations explicitly listed; omitted files are not represented as published. All image parts required for complete listed evidence.','omissions':['private preflight actual prompts/config bytes','account/auth events','host skill-path inventories','node_modules','model binaries','Cloudflare tunnel logs'],'records':records,'imageParts':parts},indent=2)+'\n').encode()
parts.insert(0,write_zip(f'{prefix}.zip',core))
summary={'version':1,'createdAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'archives':parts,'originalAndPublishedFileHashes':'EVIDENCE-MANIFEST.json in core archive','humanPreferenceObservations':0}
(out/f'{prefix}.json').write_text(json.dumps(summary,indent=2)+'\n')
print(json.dumps(summary,indent=2))
