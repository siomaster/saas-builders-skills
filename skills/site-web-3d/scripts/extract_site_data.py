#!/usr/bin/env python3
"""Récupère les vraies données d'un site de marque : textes, contacts, couleurs, images.
Usage : python3 -I extract_site_data.py <url> <dossier_sortie> [--download] [--pages /a-propos,/services]
Produit <dossier>/site-data.json (+ images/ avec --download). Gère :
  - Inertia/Vue (`data-page`), Next.js (`__NEXT_DATA__`), JSON-LD, HTML classique
  - couleurs hexadécimales les plus fréquentes des feuilles de style
"""
import argparse, html, json, os, re, sys, urllib.parse, urllib.request
from collections import Counter

UA = {'User-Agent': 'Mozilla/5.0 (Macintosh) site-web-3d-skill'}

def get(url, binary=False):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=30) as r:
        data = r.read()
    return data if binary else data.decode('utf-8', 'replace')

def clean(s):
    return re.sub(r'\s+', ' ', re.sub(r'<[^>]+>', ' ', html.unescape(s))).strip()

def walk(o, texts, imgs, base):
    if isinstance(o, dict):
        for k, v in o.items():
            if k.lower().startswith('apikey') or 'token' in k.lower() or 'secret' in k.lower():
                continue
            walk(v, texts, imgs, base)
    elif isinstance(o, list):
        for v in o: walk(v, texts, imgs, base)
    elif isinstance(o, str):
        if re.search(r'\.(jpe?g|png|webp|avif|svg|gif|mp4|webm)(\?|$)', o, re.I):
            imgs.add(urllib.parse.urljoin(base, o.replace('\\/', '/')))
        elif len(o) > 3 and not o.startswith(('http', '/')):
            t = clean(o)
            if t: texts.append(t[:500])

def parse_page(url):
    src = get(url)
    out = {'url': url, 'title': '', 'description': '', 'texts': [], 'json': None}
    m = re.search(r'<title[^>]*>(.*?)</title>', src, re.S | re.I)
    out['title'] = clean(m.group(1)) if m else ''
    m = re.search(r'<meta[^>]+name=["\']description["\'][^>]+content=["\']([^"\']*)', src, re.I)
    out['description'] = clean(m.group(1)) if m else ''
    texts, imgs = [], set()
    m = re.search(r'data-page="([^"]*)"', src)
    if m:
        out['json'] = 'inertia'; walk(json.loads(html.unescape(m.group(1))).get('props', {}), texts, imgs, url)
    m = re.search(r'<script id="__NEXT_DATA__"[^>]*>(.*?)</script>', src, re.S)
    if m:
        out['json'] = 'next'; walk(json.loads(m.group(1)), texts, imgs, url)
    for m in re.finditer(r'<script type="application/ld\+json">(.*?)</script>', src, re.S):
        try: walk(json.loads(m.group(1)), texts, imgs, url)
        except Exception: pass
    for m in re.finditer(r'<(?:img|source|video)[^>]+(?:src|srcset|poster)=["\']([^"\' ]+)', src, re.I):
        imgs.add(urllib.parse.urljoin(url, m.group(1)))
    for m in re.finditer(r'<meta[^>]+property=["\']og:image["\'][^>]+content=["\']([^"\']+)', src, re.I):
        imgs.add(urllib.parse.urljoin(url, m.group(1)))
    body_text = clean(re.sub(r'<(script|style)[^>]*>.*?</\1>', ' ', src, flags=re.S))
    out['texts'] = list(dict.fromkeys(texts))[:200] or [body_text[:3000]]
    out['emails'] = sorted(set(re.findall(r'[\w.+-]+@[\w-]+\.[\w.]+', src)))[:10]
    out['phones'] = sorted(set(re.findall(r'\+\d[\d\s]{7,16}\d', html.unescape(src))))[:10]
    flat = html.unescape(src).replace('\\/', '/')  # inclut les URL cachées dans les données JSON
    out['links'] = sorted(set(re.findall(r'https?://(?:www\.)?(?:facebook|instagram|linkedin|wa\.me|tiktok|youtube|x|twitter)\.?[a-z]*/[^"\'\s<>]+', flat)))
    css = [urllib.parse.urljoin(url, h) for h in re.findall(r'<link[^>]+href=["\']([^"\']+\.css[^"\']*)', src)]
    return out, imgs, css

ap = argparse.ArgumentParser()
ap.add_argument('url'); ap.add_argument('out')
ap.add_argument('--download', action='store_true')
ap.add_argument('--pages', default='')
a = ap.parse_args()
os.makedirs(a.out, exist_ok=True)

result = {'pages': [], 'images': [], 'colors': []}
all_imgs, all_css = set(), set()
urls = [a.url] + [urllib.parse.urljoin(a.url, p) for p in a.pages.split(',') if p]
for u in urls:
    try:
        page, imgs, css = parse_page(u)
        result['pages'].append(page); all_imgs |= imgs; all_css |= set(css)
    except Exception as e:
        print(f'échec {u} : {e}', file=sys.stderr)

colors = Counter()
for c in list(all_css)[:6]:
    try:
        colors.update(h.lower() for h in re.findall(r'#[0-9a-fA-F]{6}\b', get(c)))
    except Exception:
        pass
result['colors'] = colors.most_common(15)
result['images'] = sorted(all_imgs)

if a.download:
    d = os.path.join(a.out, 'images'); os.makedirs(d, exist_ok=True)
    for i, u in enumerate(result['images']):
        name = f'{i:03d}_' + re.sub(r'[^\w.-]', '_', urllib.parse.urlparse(u).path.split('/')[-1])[-60:]
        try:
            open(os.path.join(d, name), 'wb').write(get(u, binary=True))
        except Exception as e:
            print(f'image ignorée {u} : {e}', file=sys.stderr)

json.dump(result, open(os.path.join(a.out, 'site-data.json'), 'w'), ensure_ascii=False, indent=1)
for p in result['pages']:
    print(f"== {p['url']} — {p['title']}\n   {p['description']}\n   contacts : {p['emails']} {p['phones']}\n   réseaux : {p['links'][:6]}")
    for t in p['texts'][:25]: print('   ·', t[:160])
print(f"images : {len(result['images'])} · couleurs : {result['colors'][:8]}")
print(f"→ {os.path.join(a.out, 'site-data.json')}")
