#!/usr/bin/env python3
"""Convertit / redimensionne des images en JPEG progressifs légers.
Usage : python3 optimize_images.py <fichier_ou_dossier> <dossier_sortie> [--width 1600] [--quality 80]
Le nom de sortie garde le nom de base (extension .jpg). Les PNG transparents sont ignorés (utiliser key_magenta.py ou garder le PNG).
"""
import argparse, os
from PIL import Image

ap = argparse.ArgumentParser()
ap.add_argument('src'); ap.add_argument('dst')
ap.add_argument('--width', type=int, default=1600)
ap.add_argument('--quality', type=int, default=80)
a = ap.parse_args()
os.makedirs(a.dst, exist_ok=True)
files = [a.src] if os.path.isfile(a.src) else [os.path.join(a.src, f) for f in sorted(os.listdir(a.src))]
for f in files:
    if not f.lower().endswith(('.png', '.jpg', '.jpeg', '.webp')) or os.path.basename(f).startswith('._'):
        continue  # ._* = fichiers AppleDouble créés par macOS sur les disques exFAT
    im = Image.open(f)
    if im.mode in ('RGBA', 'LA') and im.getchannel('A').getextrema()[0] < 250:
        print(f'transparent, ignoré : {f}'); continue
    im = im.convert('RGB')
    if im.width > a.width:
        im = im.resize((a.width, round(im.height * a.width / im.width)), Image.LANCZOS)
    out = os.path.join(a.dst, os.path.splitext(os.path.basename(f))[0] + '.jpg')
    im.save(out, 'JPEG', quality=a.quality, optimize=True, progressive=True)
    print(f'{out} {im.size[0]}x{im.size[1]} {os.path.getsize(out)//1024} Ko')
