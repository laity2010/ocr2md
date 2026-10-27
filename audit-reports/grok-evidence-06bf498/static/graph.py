import re,json,os,sys,sqlite3,subprocess
os.chdir(sys.argv[1])
own=json.load(open('tests/am/ownership.json'))
files=own['files']
imp=re.compile(r'''import\s*(?:([\w${},\s*]+?)\s*from\s*)?['"]([^'"]+)['"]|import\(\s*['"`]([^'"`]+)['"`]\s*\)''')
edges=[];unowned=[]
for f in sorted(os.listdir('ui')):
    if not f.endswith('.js'):continue
    if f not in files: unowned.append(f)
    src=open('ui/'+f).read()
    for m in imp.finditer(src):
        spec=m.group(2) or m.group(3)
        if spec.startswith('.') :
            t=os.path.basename(spec)
            edges.append(dict(src=f,dst=t,sm=files.get(f),dm=files.get(t),names=(m.group(1) or '').strip()))
cross=[e for e in edges if e['sm']!=e['dm']]
# setState writes
writes=[]
for f in sorted(os.listdir('ui')):
    if f.endswith('.js'):
        for i,l in enumerate(open('ui/'+f),1):
            if re.search(r'\.setState\s*\(',l): writes.append(f"{f}:{i}: {l.strip()[:140]}")
# DOM events
ev={}
for f in sorted(os.listdir('ui')):
    if f.endswith('.js'):
        s=open('ui/'+f).read()
        for m in re.finditer(r"new CustomEvent\(\s*['\"]([\w:-]+)",s): ev.setdefault(m.group(1),{'pub':set(),'sub':set()})['pub'].add(f)
        for m in re.finditer(r"addEventListener\(\s*['\"](ocr2md:[\w:-]+)",s): ev.setdefault(m.group(1),{'pub':set(),'sub':set()})['sub'].add(f)
# window globals
glob=[]
for f in sorted(os.listdir('ui')):
    if f.endswith('.js'):
        for i,l in enumerate(open('ui/'+f),1):
            if re.search(r'window\.__\w+\s*=|globalThis\.__\w+\s*=',l): glob.append(f"{f}:{i}: {l.strip()[:140]}")
# registry
db=sqlite3.connect(':memory:');db.executescript(open('tests/am/schema.sql').read());db.executescript(open('tests/am/registry.sql').read())
regmsg={r[0]:r for r in db.execute('select topic,transport from messages')}
regmods=list(db.execute('select id,name,source_file from modules'))
regedges=list(db.execute('select caller_module,target_module,source_file,source_needle,api_id from access_edges'))
print(json.dumps(dict(unowned=unowned,n_edges=len(edges),cross=cross,setState=writes,dom_events={k:{'pub':sorted(v['pub']),'sub':sorted(v['sub']),'registered':k in regmsg} for k,v in ev.items()},registered_msgs=list(regmsg),window_globals=glob,modules=regmods,n_access_edges=len(regedges),access_edges=regedges),indent=1,ensure_ascii=False))
