# Resolve diff3 conflicts when ours/base/theirs have equal line counts: per line take the side that changed.
import sys,re
f=sys.argv[1]
s=open(f,newline='').read()
pat=re.compile(r'<<<<<<< [^\n]*\n(.*?)\|\|\|\|\|\|\| [^\n]*\n(.*?)=======\n(.*?)>>>>>>> [^\n]*\n',re.S)
bad=0
def rep(m):
    global bad
    o,b,t=[x.splitlines(True) for x in m.groups()]
    if not (len(o)==len(b)==len(t)): bad+=1; return m.group(0)
    out=[]
    for lo,lb,lt in zip(o,b,t):
        if lo==lb: out.append(lt)
        elif lt==lb or lt==lo: out.append(lo)
        else: bad+=1; return m.group(0)
    return ''.join(out)
s=pat.sub(rep,s)
open(f,'w',newline='').write(s)
print(f, 'unresolved hunks:', bad)
sys.exit(1 if bad else 0)
