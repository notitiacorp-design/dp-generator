import pypdfium2 as pdfium
import numpy as np
from scipy import ndimage
import sys

SCALE=3; H_PDF=841.92
doc=pdfium.PdfDocument('/home/openclaw/dp-generator/templates/cerfa_13404.pdf')
pidx=int(sys.argv[1])
arr=np.array(doc[pidx].render(scale=SCALE).to_pil().convert('RGB'))
gray=arr.mean(axis=2)
light=(gray>=200)&(gray<=248)
lab,nlab=ndimage.label(light)
sizes=ndimage.sum(light,lab,range(1,nlab+1))
boxes=[]
for lid in (sizes>=8).nonzero()[0]:
    ys,xs=(lab==(lid+1)).nonzero()
    if xs.max()-xs.min()>8 and ys.max()-ys.min()>5:
        boxes.append((int(xs.min()),int(ys.min()),int(xs.max()),int(ys.max())))
boxes.sort(key=lambda b:b[1])
rows=[]; cur=[]; lasty=None
for b in boxes:
    if lasty is None or b[1]-lasty<=40: cur.append(b)
    else: rows.append(cur); cur=[b]
    lasty=b[1]
if cur: rows.append(cur)
print(f"=== PAGE index {pidx} ===")
for row in rows:
    row.sort(key=lambda b:b[0])
    print(f"RANGÉE ytop_pdf={H_PDF-row[0][1]/SCALE:.1f} ({len(row)} champs)")
    for x0,y0,x1,y1 in row:
        print(f"   x={x0/SCALE:6.1f} ytop={H_PDF-y0/SCALE:6.1f} ybot={H_PDF-y1/SCALE:6.1f} w={(x1-x0)/SCALE:5.1f}")

# Texte: lignes utiles pour repérer les libellés (checkboxes cadre 5 etc.)
tp=doc[pidx].get_textpage()
txt=tp.get_text_bounded()
print("--- LIGNES TEXTE (avec offsets char) ---")
off=0
for ln in txt.split('\n'):
    s=ln.strip()
    if s and len(s)>3:
        # find char index of this line start
        try:
            idx=tp.get_index(off) if hasattr(tp,'get_index') else None
        except Exception: idx=None
        print(f"{repr(s[:90])}")
    off+=len(ln)+1