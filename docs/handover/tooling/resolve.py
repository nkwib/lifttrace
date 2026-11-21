# usage: resolve.py file mode   mode: union (ours then theirs) | ours | theirs | pick:<spec> where spec per hunk like "o1t2" (line choices not supported) 
# union-lines: merges by keeping ours, then theirs lines not already present (by exact text)
import sys,re
f,mode=sys.argv[1],sys.argv[2]
s=open(f,newline='').read()
pat=re.compile(r'<<<<<<< [^\n]*\n(.*?)(?:\|\|\|\|\|\|\| [^\n]*\n.*?)?=======\n(.*?)>>>>>>> [^\n]*\n',re.S)
def rep(m):
    o,t=m.group(1),m.group(2)
    if mode=='ours': return o
    if mode=='theirs': return t
    if mode=='union': return o+t
    if mode=='dedup':
        ol=o.splitlines(True); return o+''.join(l for l in t.splitlines(True) if l not in ol)
    raise SystemExit('bad mode')
n=len(pat.findall(s))
s=pat.sub(rep,s)
open(f,'w',newline='').write(s)
print(f'{f}: {n} hunks resolved with {mode}')
