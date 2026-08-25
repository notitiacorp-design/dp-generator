import pypdfium2 as pdfium
doc=pdfium.PdfDocument('/home/openclaw/dp-generator/templates/cerfa_13404.pdf')
for i in [5,6]:
    img=doc[i].render(scale=2).to_pil().convert('RGB')
    img.save(f'/tmp/page_{i}.png')
    print(i, img.size)
