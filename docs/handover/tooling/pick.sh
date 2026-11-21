#!/bin/bash
# pick.sh <file of "slug sha" lines> : cherry-pick each; auto-resolve linewise; stop on unresolved
T="$(cd "$(dirname "$0")" && pwd)"; cd "${REPO:-$PWD}"
while read s h; do
  git merge-base --is-ancestor $h HEAD 2>/dev/null && { echo "skip $s (already)"; continue; }
  git log --format=%B HEAD~60..HEAD 2>/dev/null | grep -q "cherry-src: $h" && { echo "skip $s"; continue; }
  if git cherry-pick $h >/dev/null 2>&1; then echo "ok $s"; continue; fi
  files=$(git diff --name-only --diff-filter=U)
  okall=1
  for f in $files; do
    if [ -z "$(grep -c '<<<<<<<' $f | grep -v '^0$')" ]; then git add "$f"; continue; fi
    git checkout -m "$f" >/dev/null 2>&1
    if python3 $T/linewise.py "$f" >/dev/null || python3 $T/imports.py "$f" || python3 $T/addunion.py "$f"; then git add "$f"; else okall=0; fi
  done
  if [ $okall = 1 ]; then
    for f in $files; do case $f in *.json) node -e "JSON.parse(require('fs').readFileSync('$f','utf8'))" || { echo "BADJSON $f"; exit 1; } ;; esac; done
    GIT_EDITOR=true git cherry-pick --continue >/dev/null && echo "ok(resolved) $s: $files"
  else echo "CONFLICT $s: $files"; exit 1; fi
done < "$1"
