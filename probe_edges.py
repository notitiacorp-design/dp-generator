import numpy as np
from PIL import Image

img = np.array(Image.open('sample_roof.jpg').convert('L')).astype(float)
h, w = img.shape
# Sobel
gx = np.zeros_like(img); gy = np.zeros_like(img)
gx[:, 1:-1] = img[:, 2:] - img[:, :-2]
gy[1:-1, :] = img[2:, :] - img[:-2, :]
mag = np.hypot(gx, gy)
ang = np.degrees(np.arctan2(gy, gx)) % 180  # 0 = horizontal edge, 90 = vertical edge

# restrict to roof region (quad approx from vision: TL(145,42) TR(405,31) BR(336,264) BL(26,189))
from PIL import Image, ImageDraw
mask = Image.new('L', (w, h), 0)
ImageDraw.Draw(mask).polygon([(145, 42), (405, 31), (336, 264), (26, 189)], fill=255)
m = np.array(mask) > 0
thr = np.percentile(mag[m], 85)
sel = m & (mag > thr)
print("strong edge pixels in quad:", int(sel.sum()))
hist, _ = np.histogram(ang[sel], bins=18, range=(0, 180))
for i, c in enumerate(hist):
    a0 = i * 10
    print(f"angle {a0:3d}-{a0+10:3d} deg: {c}")