#!/usr/bin/env python3
"""Génère src/icons.js à partir des SVG Hugeicons locaux (trait en currentColor).
Usage : python3 build_icons.py <sortie.js> cle=nom-hugeicons [cle=nom ...]
Ex.   : python3 build_icons.py src/icons.js clock=clock-01 takeoff=airplane-take-off-01 mail=mail-01
Dans le HTML : <i data-icon="clock"></i>, puis mountIcons() dans main.js.
Noms disponibles : ls ~/Developer/ui-libraries/hugeicons_hugeicons/icons
"""
import json, os, re, sys

SRC = os.path.expanduser('~/Developer/ui-libraries/hugeicons_hugeicons/icons')
out, pairs = sys.argv[1], sys.argv[2:]
if not pairs:
    sys.exit(__doc__)
icons, missing = {}, []
for p in pairs:
    key, _, name = p.partition('=')
    path = os.path.join(SRC, (name or key) + '.svg')
    if not os.path.exists(path):
        missing.append(name or key); continue
    inner = re.search(r'<svg[^>]*>(.*)</svg>', open(path).read(), re.S).group(1)
    inner = re.sub(r'#141B34', 'currentColor', inner, flags=re.I)
    icons[key] = re.sub(r'\s+', ' ', inner).strip()
js = '// Icônes Hugeicons (stroke rounded) — générées par build_icons.py\n'
js += 'export const ICONS = ' + json.dumps(icons, indent=1, ensure_ascii=False) + ';\n\n'
js += '''export function mountIcons(root = document) {
  root.querySelectorAll('[data-icon]').forEach((el) => {
    const body = ICONS[el.dataset.icon];
    if (!body) return;
    el.innerHTML = `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true">${body}</svg>`;
    el.classList.add('icon');
  });
}
'''
os.makedirs(os.path.dirname(out) or '.', exist_ok=True)
open(out, 'w').write(js)
print(f'{len(icons)} icônes → {out}')
if missing:
    print('introuvables :', ', '.join(missing), '(cherche : ls', SRC, '| grep <mot>)')
