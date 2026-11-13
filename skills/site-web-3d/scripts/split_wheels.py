#!/usr/bin/env python3
"""Véhicule de profil (déjà détouré, ex. via key_magenta.py) → roues découpées + géométrie.
Usage : python3 split_wheels.py vehicule.webp <dossier_img> <sortie_geometrie.json> [--recolor #179138]
Produit : wheel-rear.webp, wheel-front.webp (disques à faire tourner) + JSON {w, h, wheels:[{name,cx,cy,d}]}
à utiliser avec templates/starter/src/vehicle.js. Le véhicule doit être en profil STRICT, roues bien rondes.
--recolor : recale la teinte de la carrosserie (pixels verts/colorés saturés) sur une couleur de marque.
"""
import argparse, json
import numpy as np
from PIL import Image, ImageDraw

ap = argparse.ArgumentParser()
ap.add_argument('src'); ap.add_argument('out_dir'); ap.add_argument('geometry')
ap.add_argument('--recolor')
a = ap.parse_args()
car = Image.open(a.src).convert('RGBA')

if a.recolor:
    import colorsys
    t = a.recolor.lstrip('#'); th, ts, _ = colorsys.rgb_to_hsv(*(int(t[i:i + 2], 16) / 255 for i in (0, 2, 4)))
    arr = np.asarray(car).astype(np.float32) / 255
    rgb, al = arr[..., :3], arr[..., 3]
    mx, mn = rgb.max(-1), rgb.min(-1); sat = np.where(mx > 0, (mx - mn) / np.maximum(mx, 1e-6), 0)
    mask = (sat > 0.35) & (al > 0.5)
    h = np.full_like(mx, th); s = np.clip(sat * (ts / max(np.median(sat[mask]) if mask.any() else 1, 1e-3)), 0, 1); v = mx * 0.9
    i = np.floor(h * 6).astype(int) % 6; f = h * 6 - np.floor(h * 6)
    p, q, tt = v * (1 - s), v * (1 - f * s), v * (1 - (1 - f) * s)
    ch = [(v, tt, p), (q, v, p), (p, v, tt), (p, q, v), (tt, p, v), (v, p, q)]
    new = np.dstack([np.select([i == k for k in range(6)], [c[j] for c in ch]) for j in range(3)])
    rgb = np.where(mask[..., None], new, rgb)
    car = Image.fromarray((np.dstack([rgb, al]) * 255).astype(np.uint8), 'RGBA')
    car.save(a.src.rsplit('.', 1)[0] + '.webp', 'WEBP', quality=90, method=6)

W, H = car.size
px = np.asarray(car).astype(np.float32)
mx, mn = px[..., :3].max(-1), px[..., :3].min(-1)
grey = (mx < 120) & ((mx - mn) / np.maximum(mx, 1) < 0.25) & (px[..., 3] > 200)  # pneus/jantes : sombres et peu saturés
grey[: int(H * 0.5)] = False
prof = np.convolve(grey.sum(0).astype(float), np.ones(15) / 15, 'same')
runs, start = [], None
for x, on in enumerate(prof > prof.max() * 0.3):
    if on and start is None: start = x
    if not on and start is not None: runs.append((start, x)); start = None
if start is not None: runs.append((start, W))
runs = sorted(sorted(runs, key=lambda r: r[1] - r[0], reverse=True)[:2])
if len(runs) < 2: raise SystemExit('roues introuvables : vérifier que le véhicule est bien de profil')
geo = {'w': W, 'h': H, 'wheels': []}
for name, (x0, x1) in zip(['rear', 'front'], runs):
    rt = (x1 - x0) / 2; cx = (x0 + x1) / 2
    y1 = np.where(px[:, int(cx), 3] > 200)[0].max(); cy = y1 - rt
    r = rt * 0.965  # juste à l'intérieur du pneu pour ne pas emporter le passage de roue
    crop = car.crop((round(cx - r), round(cy - r), round(cx + r), round(cy + r)))
    m = Image.new('L', crop.size, 0); ImageDraw.Draw(m).ellipse([0, 0, crop.size[0] - 1, crop.size[1] - 1], fill=255)
    crop.putalpha(m); crop.save(f'{a.out_dir}/wheel-{name}.webp', 'WEBP', quality=92)
    geo['wheels'].append({'name': name, 'cx': round(cx / W, 4), 'cy': round(cy / H, 4), 'd': round(2 * r / W, 4)})
json.dump(geo, open(a.geometry, 'w'), indent=1)
print(json.dumps(geo))
