import pypdfium2 as pdfium
doc=pdfium.PdfDocument('/home/openclaw/dp-generator/templates/cerfa_13404.pdf')
for pidx in [4,5]:
    tp=doc[pidx].get_textpage()
    n=tp.count_chars()
    print(f"=== PAGE {pidx} — libellés positionnés ===")
    # group chars into rows by top
    items=[]
    for i in range(n):
        c=tp.get_text_range(i,1)
        if c.strip():
            b=tp.get_charbox(i)  # (l,t,r,btm)
            items.append((c,b))
    rows={}
    for c,(l,t,r,bt) in items:
        key=round(t,0)
        rows.setdefault(key,[]).append((c,l,bt))
    for y in sorted(rows,reverse=True):
        chs=sorted(rows[y],key=lambda x:x[1])
        line="".join(x[0] for x in chs)
        lx=min(x[1] for x in chs); ly=min(x[2] for x in chs)
        print(f"y~{ly:6.1f} x~{lx:5.1f}: {line[:100]!r}")