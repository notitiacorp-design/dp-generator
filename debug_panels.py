#!/usr/bin/env python3
"""Debug : détail par panneau du modèle couleur + échantillons hors modèle."""
import json
import numpy as np
from PIL import Image, ImageDraw

img = np.array(Image.open('renders/feedback_loop/orig.jpg').convert('RGB')).astype(float)
h, w, _ = img.shape
quad = [(142, 38), (406, 30), (336, 268), (24, 191)]

pil = Image.new('L', (w, h), 0)
ImageDraw.Draw(pil).polygon([tuple(map(int, p)) for p in quad], fill=255)
mask_roof = np.array(pil) > 0
vel = (100, 112, 153, 153)
mask_roof[int(vel[1]):int(vel[3]), int(vel[0]):int(vel[2])] = False
top_edge = min(p[1] for p in quad)
bot_edge = max(p[1] for p in quad)
y_start = int(top_edge + 0.12 * (bot_edge - top_edge))
model_mask = mask_roof & (np.arange(h)[:, None] >= y_start)
pix = img[model_mask]
mean = pix.mean(0)
std = pix.std(0) + 1e-6
print("model mean", mean.round(1), "std", std.round(1), "n", len(pix))

def mahal(rgb):
    d = (rgb - mean) / std
    return np.sqrt((d ** 2).sum(-1))

def in_poly(x, y, poly):
    inside = False
    n = len(poly)
    j = n - 1
    for i in range(n):
        xi, yi = poly[i]; xj, yj = poly[j]
        if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / (yj - yi) + xi:
            inside = not inside
        j = i
    return inside

panels = json.load(open('renders/feedback_loop/iteration_1_panels.json'))
for p in panels:
    poly = [(float(a), float(b)) for a, b in p['polygon']]
    xs = [q[0] for q in poly]; ys = [q[1] for q in poly]
    ys0, ys1 = max(0, int(min(ys))), min(h, int(max(ys)))
    xs0, xs1 = max(0, int(min(xs))), min(w, int(max(xs)))
    tot = bad = sky = 0
    worst = 0.0
    step_y = max(1, (ys1 - ys0) // 9); step_x = max(1, (xs1 - xs0) // 9)
    for gy in range(ys0, ys1, step_y):
        for gx in range(xs0, xs1, step_x):
            py = min(gy + step_y // 2, ys1 - 1); px = min(gx + step_x // 2, xs1 - 1)
            if not in_poly(px, py, poly): continue
            tot += 1
            m = float(mahal(img[py, px]))
            worst = max(worst, m)
            if not (m < 3.5):
                bad += 1
                if img[py, px, 2] > mean[2] + 1.5 * std[2] and img[py, px, 0] < img[py, px, 2]:
                    sky += 1
    print(f"panel {p['id']:2d}: nonRoofFrac={bad/max(tot,1):.3f} skyFrac={sky/max(tot,1):.3f} maxMahal={worst:.1f} n={tot}")