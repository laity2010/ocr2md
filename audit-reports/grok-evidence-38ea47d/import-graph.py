import re,json,pathlib
R=pathlib.Path('.');own=json.load(open('tests/am/ownership.json'))['files']
files=sorted(p.name for p in (R/'ui').glob('*.js'))
print('ui js',len(files),'owned',len(own),'missing',set(files)-set(own),'extra',set(own)-set(files))
rx=re.compile(r'''(?:import\s*(?:\{([^}]*)\}|[\w*\s,{}]+)\s*from\s*|import\s*\(\s*|import\s+)['"](\.[^'"]+)['"]''')
cross=[]
for f in files:
  s=(R/'ui'/f).read_text()
  for m in rx.finditer(s):
    t=pathlib.Path(m.group(2)).name
    if not t.endswith('.js'): continue
    a,b=own[f],own.get(t,'?')
    syms=[x.strip().split(' as ')[0] for x in (m.group(1) or '').split(',') if x.strip()]
    if a!=b: cross.append((f,t,a,b,syms))
for c in cross: print(c)
print('cross',len(cross))
