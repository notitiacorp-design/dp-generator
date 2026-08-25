import pypdfium2 as pdfium
doc=pdfium.PdfDocument('/home/openclaw/dp-generator/templates/cerfa_13404.pdf')
# Zone cadastrale page terrain (idx4): y_pdf 385-430 -> px scale3: top=(841.92-430)*3, bot=(841.92-385)*3
img=doc[4].render(scale=3).to_pil().convert('RGB')
c=img.crop((100,int((841.92-432)*3),1786,int((841.92-382)*3)))
c=c.resize((int(c.width*1.6),int(c.height*1.6)))
c.save('/tmp/cadastre_row.png'); print('cadastre_row', c.size)
# Zone cadre 5 page idx7 haut: y_pdf 720-800
img7=doc[7].render(scale=3).to_pil().convert('RGB')
c7=img7.crop((100,int((841.92-800)*3),1700,int((841.92-700)*3)))
c7.save('/tmp/cadre5_real.png'); print('cadre5', c7.size)

# Bordereau pièces : chercher la page avec 'DP1' + 'plan de situation'
for i in range(len(doc)):
    tp=doc[i].get_textpage()
    low=tp.get_text_bounded().replace('\r',' ').replace('\n',' ').lower()
    if 'plan de situation' in low and 'dp1' in low:
        print(f"BORDEREAU possible: page index {i}")