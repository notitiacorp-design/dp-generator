from PIL import Image
import numpy as np

img = np.array(Image.open('/tmp/photomontage_test.jpg').convert('RGB')).astype(float)
h, w, _ = img.shape
lum = img.mean(axis=2)
dark = lum < 70

# Bande centrale verticale du champ (éviter les bords ombrés)
band = dark[int(h*0.25):int(h*0.75), :]
col_dark = band.mean(axis=0)
in_panel = col_dark > 0.35

segs = []
start = None
for i, v in enumerate(in_panel):
    if v and start is None: start = i
    elif not v and start is not None:
        if i - start > 20: segs.append((start, i))
        start = None
if start is not None: segs.append((start, len(in_panel)))
print(f"COLONNES de panneaux : {len(segs)}")
for s,e in segs: print(f"  {s}-{e} (l={e-s})")

if len(segs) >= 2:
    # Rangées dans la colonne du 2e segment (panneau entier visible)
    mid = segs[1]
    zone = dark[:, mid[0]+10:mid[1]-10]
    row_dark = zone.mean(axis=1)
    in_row = row_dark > 0.4
    rsegs=[]; start=None
    for i,v in enumerate(in_row):
        if v and start is None: start=i
        elif not v and start is not None:
            if i-start>18: rsegs.append((start,i))
            start=None
    if start is not None: rsegs.append((start,len(in_row)))
    print(f"RANGÉES : {len(rsegs)}")
    for s,e in rsegs: print(f"  {s}-{e} (h={e-s})")

# Largeur d'interstice moyenne entre segments
gaps=[segs[i+1][0]-segs[i][1] for i in range(len(segs)-1)]
print(f"Interstices horizontaux (px) : {gaps}")
