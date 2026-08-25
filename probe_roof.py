import numpy as np
from PIL import Image
img = np.array(Image.open('sample_roof.jpg').convert('RGB')).astype(int)
h, w, _ = img.shape
print("size", w, h)

def stats(y0, y1, x0, x1, label):
    reg = img[y0:y1, x0:x1].reshape(-1, 3)
    print(f"{label}: mean RGB={reg.mean(axis=0).round(0)}, std={reg.std(axis=0).round(0)}")

stats(0, 60, 60, 440, "top-band")
stats(90, 150, 60, 440, "mid-band")
stats(200, 260, 60, 440, "bottom-band")

def skyfrac(y0, y1):
    reg = img[y0:y1]
    b = reg[:, :, 2].astype(int)
    r = reg[:, :, 0].astype(int)
    g = reg[:, :, 1].astype(int)
    blue = (b > r + 15) & (b > g + 10)
    return blue.mean()

for y in range(0, h - 20, 40):
    print("skyfrac row", y, round(float(skyfrac(y, y + 40)), 3))