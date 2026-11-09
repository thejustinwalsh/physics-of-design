import datetime,hashlib,json,pathlib,sys
p=pathlib.Path(sys.argv[1]).resolve();m=json.loads((p/'manifest.json').read_text());report={'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'method':'SHA256 recomputation of every recorded frozen file and immutable input, recursively expanding directory maps','arms':[]}
def entries(d,prefix=''):
 for k,v in d.items():
  n=prefix+k
  if isinstance(v,dict):yield from entries(v,n+'/')
  else:yield n,v
for a in m['arms']:
 r={'id':a['id'],'frozenFiles':0,'immutableInputs':0,'mismatches':[]}
 for category,root,hashes in [('frozen',p/'frozen'/a['id'],json.loads((p/'frozen'/a['id']/'snapshot.json').read_text())['hashes']),('immutable',pathlib.Path(a['workspace']),json.loads((p/'inputs'/f"{a['id']}.json").read_text()))]:
  for name,expected in entries(hashes):
   q=root/name;actual=hashlib.sha256(q.read_bytes()).hexdigest() if q.is_file() else None
   r['frozenFiles' if category=='frozen' else 'immutableInputs']+=1
   if actual!=expected:r['mismatches'].append({'category':category,'path':name,'expected':expected,'actual':actual})
 report['arms'].append(r)
(p/'post-evaluation-source-proof.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report));assert not any(r['mismatches'] for r in report['arms'])
