import pypdfium2 as pdfium
doc=pdfium.PdfDocument('/home/openclaw/dp-generator/templates/cerfa_13404.pdf')
tp=doc[3].get_textpage()
for needle in ["Références","Superficie","Section :","Numéro","Lieu-dit","Localité","Code postal","Adresse du"]:
    s=tp.search(needle); hit=s.get_next()
    if hit:
        st,c=hit
        b=tp.get_charbox(st)
        print(f"{needle!r}: x={b[0]:.1f} ytop={b[1]:.1f}")
    else:
        print(f"{needle!r}: ABSENT")