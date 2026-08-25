import pypdfium2 as pdfium
doc=pdfium.PdfDocument('/home/openclaw/dp-generator/templates/cerfa_13404.pdf')
print("nb pages:", len(doc))
for i in range(len(doc)):
    tp=doc[i].get_textpage()
    txt=tp.get_text_bounded().replace('\r',' ').replace('\n',' ')
    low=txt.lower()
    hits=[]
    for needle in ['cadre 5','travaux sur une construction','construction existante','projet de construction']:
        if needle in low:
            # position char -> coords
            s=tp.search(needle); hit=s.get_next()
            pos=''
            if hit:
                b=tp.get_charbox(hit[0])
                pos=f"(x={b[0]:.0f},ytop={b[1]:.0f})"
            hits.append(f"{needle!r}{pos}")
    if hits:
        print(f"page {i}: {'; '.join(hits)}")