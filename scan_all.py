import pypdfium2 as pdfium
doc=pdfium.PdfDocument('/home/openclaw/dp-generator/templates/cerfa_13404.pdf')
needles=[("modifier l","ASPECT"),("destination","DESTINATION"),("surface de plancher","PLANCHER"),("clôturer","CLOTURE"),("construction d'une","CONSTR-NEUVE"),("création d'une","CREATION"),("travaux portant","TRAV-PORTE"),("ravalement","RAVALEMENT")]
for i in range(len(doc)):
    tp=doc[i].get_textpage()
    low=tp.get_text_bounded().replace('\r',' ').replace('\n',' ').lower()
    hits=[]
    for needle,label in needles:
        if needle in low:
            s=tp.search(needle); h=s.get_next()
            pos=''
            if h:
                b=tp.get_charbox(h[0]); pos=f"@y{b[1]:.0f}"
            hits.append(f"{label}{pos}")
    if hits: print(f"page {i}: {', '.join(hits)}")