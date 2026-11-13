#!/usr/bin/env python3
"""Détoure un sujet généré sur fond magenta #FF00FF → WebP transparent recadré.
Usage : python3 key_magenta.py brut.png sortie.webp [--preview apercu.png]
"""
import argparse
import numpy as np
from PIL import Image

ap = argparse.ArgumentParser()
ap.add_argument('src')
ap.add_argument('dst')
ap.add_argument('--preview')
ap.add_argument('--low', type=float, default=40, help='seuil où le magenta commence à devenir transparent')
ap.add_argument('--high', type=float, default=150, help='seuil totalement transparent')
a = ap.parse_args()

im = np.asarray(Image.open(a.src).convert('RGB')).astype(np.float32)
R, G, B = im[..., 0], im[..., 1], im[..., 2]
mag = np.minimum(R, B) - G                      # "magenta-ité" du pixel
alpha = 1 - np.clip((mag - a.low) / (a.high - a.low), 0, 1)
spill = np.clip(mag, 0, None) * (1 - alpha * 0.6)  # retire le reflet magenta sur les bords
out = np.dstack([np.clip(R - spill, 0, 255), G, np.clip(B - spill, 0, 255), alpha * 255]).astype(np.uint8)
img = Image.fromarray(out, 'RGBA')
img = img.crop(img.getchannel('A').point(lambda v: 255 if v > 8 else 0).getbbox())
img.save(a.dst, 'WEBP', quality=90, method=6)
if a.preview:
    img.save(a.preview)
print(f'{a.dst} {img.size[0]}x{img.size[1]}')
