"""Dev-time helper for scripts/subset-icon-font.mjs. Needs: pip install fonttools brotli.

  subset-icon-font.py list   <full.woff2> <icons-all.txt>
  subset-icon-font.py subset <full.woff2> <icons-included.txt> <out.woff2>
"""
import sys
from fontTools import subset
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer


def ligatures(font):
    """{icon name: ligature glyph} from the GSUB ligature lookups."""
    cmap = font.getBestCmap()
    g2c = {g: chr(c) for c, g in cmap.items() if c < 0x80}
    out = {}
    for lookup in font['GSUB'].table.LookupList.Lookup:
        for st in lookup.SubTable:
            st = getattr(st, 'ExtSubTable', st)
            for first, ligs in getattr(st, 'ligatures', {}).items():
                for lg in ligs:
                    name = ''.join(g2c[g] for g in [first] + list(lg.Component))
                    out[name] = lg.LigGlyph
    return out


def main():
    cmd, src = sys.argv[1], sys.argv[2]
    font = TTFont(src)
    if cmd == 'list':
        names = sorted(ligatures(font))
        open(sys.argv[3], 'w').write('\n'.join(names) + '\n')
        print(f'{len(names)} ligatures')
        return
    wanted = [l.strip() for l in open(sys.argv[3]) if l.strip()]
    out = sys.argv[4]
    lig = ligatures(font)
    missing = [n for n in wanted if n not in lig]
    if missing:
        sys.exit(f'not in source font: {missing}')
    # The app pins FILL 0, wght 400, GRAD 0, opsz 24 (src/styles/base.css).
    font = instancer.instantiateVariableFont(font, {'FILL': 0, 'wght': 400, 'GRAD': 0, 'opsz': 24})
    opts = subset.Options()
    opts.layout_features = ['*']
    opts.layout_closure = False  # keep only the wanted ligatures, not every ligature whose letters survive
    opts.hinting = False
    opts.flavor = 'woff2'
    opts.notdef_outline = True
    opts.name_IDs = [0, 1, 2, 3, 4, 5, 6, 13, 14]
    sub = subset.Subsetter(opts)
    keep = [lig[n] for n in wanted]
    sub.populate(glyphs=keep, unicodes=[ord(c) for c in 'abcdefghijklmnopqrstuvwxyz0123456789_ '])
    sub.subset(font)
    font.flavor = 'woff2'
    font.save(out)
    # Verify: every wanted name still forms a ligature. Legacy aliases of a kept
    # glyph (access_alarm -> alarm) survive too, which is harmless.
    got = ligatures(TTFont(out))
    bad = sorted(set(wanted) - set(got))
    if bad:
        sys.exit(f'ligatures lost in subset: {bad[:20]}')
    print(f'{len(got)} ligature names kept ({len(wanted)} wanted)')


main()
