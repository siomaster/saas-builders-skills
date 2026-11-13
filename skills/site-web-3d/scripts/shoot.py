#!/usr/bin/env python3
"""Captures de contrôle d'un site animé au scroll (ordinateur + mobile) + planches + erreurs console.
Usage : python3 shoot.py <url> <dossier> [--stops 0,1,2,3,5,8] [--mobile] [--wait 1800]
--stops : positions en hauteurs d'écran (1 = un écran plus bas). Utilise Chrome installé (channel='chrome').
"""
import argparse, asyncio, glob, os
from playwright.async_api import async_playwright
from PIL import Image

ap = argparse.ArgumentParser()
ap.add_argument('url'); ap.add_argument('out')
ap.add_argument('--stops', default='0,1,2,3,4,6,8,10')
ap.add_argument('--mobile', action='store_true')
ap.add_argument('--wait', type=int, default=1800)
ap.add_argument('--intro', type=int, default=4500, help='attente du loader (ms)')
a = ap.parse_args()
os.makedirs(a.out, exist_ok=True)
stops = [float(s) for s in a.stops.split(',')]

async def run(tag, w, h):
    async with async_playwright() as p:
        b = await p.chromium.launch(channel='chrome', headless=True,
            args=['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
        pg = await b.new_page(viewport={'width': w, 'height': h})
        errs = []
        pg.on('console', lambda m: errs.append(f'{m.type}: {m.text}') if m.type in ('error', 'warning') and 'GL Driver' not in m.text else None)
        pg.on('pageerror', lambda e: errs.append(f'pageerror: {e}'))
        await pg.goto(a.url, wait_until='networkidle')
        await pg.wait_for_timeout(a.intro)
        await pg.mouse.move(w / 2, h / 2)
        total = await pg.evaluate('document.documentElement.scrollHeight')
        for i, s in enumerate(stops):
            await pg.evaluate(f'window.scrollTo(0,{int(s * h)})')
            await pg.wait_for_timeout(a.wait)
            await pg.screenshot(path=f'{a.out}/{tag}-{i:02d}.jpg', type='jpeg', quality=62)
        await b.close()
        print(f'[{tag}] hauteur page {total}px ({total / h:.1f} écrans)')
        print('\n'.join(errs[:20]) or f'[{tag}] aucune erreur console')

def sheet(tag, cols, tw):
    fs = sorted(glob.glob(f'{a.out}/{tag}-*.jpg'))
    if not fs: return
    first = Image.open(fs[0]); th = round(first.height * tw / first.width)
    for k in range(0, len(fs), cols * 2):
        part = fs[k:k + cols * 2]; rows = (len(part) + cols - 1) // cols
        s = Image.new('RGB', (cols * (tw + 6), rows * (th + 6)), (220, 30, 30))
        for i, f in enumerate(part):
            s.paste(Image.open(f).resize((tw, th)), ((i % cols) * (tw + 6), (i // cols) * (th + 6)))
        path = f'{a.out}/planche-{tag}-{k // (cols * 2)}.jpg'; s.save(path, quality=80); print('planche :', path)

asyncio.run(run('d', 1440, 900)); sheet('d', 2, 720)
if a.mobile:
    asyncio.run(run('m', 390, 844)); sheet('m', 6, 260)
