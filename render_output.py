import pypdfium2 as pdfium
doc=pdfium.PdfDocument('/home/openclaw/dp-generator/output/DP_LEFEBVRE_TORCY_BD_0141.pdf')
print("pages:", len(doc))
for i in range(len(doc)):
    img=doc[i].render(scale=1.6).to_pil()
    img.save(f'/home/openclaw/dp-generator/output/qa_p{i+1}.png')
    print(f"p{i+1}: {img.size}")