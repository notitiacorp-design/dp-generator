import pypdfium2 as pdfium
import numpy as np
from scipy import ndimage
doc=pdfium.PdfDocument('/home/openclaw/dp-generator/templates/cerfa_13404.pdf')
P=7
img=doc[P].render(scale=3).to_pil().convert('RGB')
img.save('/tmp/page_7.png')
arr=np.array(img); gray=arr.mean(axis=2)
light=(gray>=200)&(gray<=248)
slices=ndimage.find_objects(ndimage.label(light)[0])
print("=== CHECKBOXES page index 7 ===")
for sl in slices:
    if sl is None: continue
    ys,xs=sl
    w=(xs.stop-xs.start)/3.0; h=(ys.stop-ys.start)/3.0
    if 3.5<=w<=11 and 3.5<=h<=11:
        print(f"CB x={xs.start/3.0:.1f} ytop={841.92-ys.start/3.0:.1f}")
tp=doc[P].get_textpage()
n=tp.count_chars()
items=[]
for i in range(n):
    c=tp.get_text_range(i,1)
    if c.strip():
        items.append((c,tp.get_charbox(i)))
rows={}
for c,(l,t,r,bt) in items:
    rows.setdefault(round(t,0),[]).append((c,l,bt))
print("=== TEXTE (lignes y>500) ===")
for y in sorted(rows,reverse=True):
    chs=sorted(rows[y],key=lambda x:x[1])
    line="".join(x[0] for x in chs)
    ly=min(x[2] for x in chs); lx=min(x[1] for x in chs)
    if ly>500:
        print(f"y={ly:6.1f} x={lx:5.1f}: {line[:100]!r}")