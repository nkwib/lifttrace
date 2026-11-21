# Union both-added hunks (empty base) for safe files: tests, CHANGELOG, docs, en.json. Exit 1 otherwise.
import sys,re
f=sys.argv[1]
if not (f.startswith('scripts/') or f in ('CHANGELOG.md','src/i18n/en.json') or f.startswith('docs/')): sys.exit(1)
s=open(f,newline='').read()
pat=re.compile(r'<<<<<<< [^\n]*\n(.*?)\|\|\|\|\|\|\| [^\n]*\n(.*?)=======\n(.*?)>>>>>>> [^\n]*\n',re.S)
bad=0
def rep(m):
    global bad
    o,b,t=m.groups()
    if b.strip(): bad+=1; return m.group(0)
    return o+t
s=pat.sub(rep,s); open(f,'w',newline='').write(s); sys.exit(1 if bad else 0)
