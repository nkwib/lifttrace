# Union-resolve conflicts whose ours/theirs lines are all import lines (or blank). Exit 1 if any other hunk.
import sys,re
f=sys.argv[1]; s=open(f,newline='').read()
pat=re.compile(r'<<<<<<< [^\n]*\n(.*?)(?:\|\|\|\|\|\|\| [^\n]*\n(.*?))?=======\n(.*?)>>>>>>> [^\n]*\n',re.S)
bad=0
def rep(m):
    global bad
    o,t=m.group(1),m.group(3)
    if (m.group(2) or '').strip(): bad+=1; return m.group(0)
    lines=(o+t).splitlines()
    if not all(l.strip()=='' or l.lstrip().startswith(('import ','COPY ')) for l in lines): bad+=1; return m.group(0)
    ol=o.splitlines(True); return o+''.join(l for l in t.splitlines(True) if l not in ol)
s=pat.sub(rep,s); open(f,'w',newline='').write(s); sys.exit(1 if bad else 0)
