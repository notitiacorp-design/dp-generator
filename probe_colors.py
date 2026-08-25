import numpy as np
from PIL import Image

img = np.array(Image.open('sample_roof.jpg').convert('RGB')).astype(float)
h, w, _ = img.shape
px = img.reshape(-1, 3)
# k-means k=3 on downsampled pixels
rng = np.random.default_rng(0)
sample = px[rng.choice(len(px), 20000, replace=False)]
k = 3
cent = sample[rng.choice(len(sample), k, replace=False)]
for it in range(20):
    d = ((sample[:, None, :] - cent[None, :, :]) ** 2).sum(-1)
    lab = d.argmin(1)
    for c in range(k):
        m = lab == c
        if m.sum() > 0:
            cent[c] = sample[m].mean(0)
print("centroids RGB:", cent.round(0))
print("class fractions:", np.bincount(d.argmin(1), minlength=k) / len(sample))

# class map
lab = ((img.reshape(-1, 3)[:, None, :] - cent[None, :, :]) ** 2).sum(-1).argmin(1).reshape(h, w)
# print class grid 5x10
for r in range(0, h, 30):
    row = ""
    for c in range(0, w, 50):
        cell = lab[r:r+30, c:c+50]
        row += str(int(np.bincount(cell.ravel(), minlength=k).argmax()))
    print(r, row)