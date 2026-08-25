import pypdfium2 as pdfium
import os

pdf = "/home/openclaw/dp-generator/output/DP_LEFEBVRE_TORCY_BD_0141.pdf"
out = "/home/openclaw/dp-generator/output"
doc = pdfium.PdfDocument(pdf)
print(f"Pages: {len(doc)}")
for i in range(len(doc)):
    page = doc[i]
    img = page.render(scale=2.0)
    pil = img.to_pil()
    name = f"dp_page_{i+1}.png"
    pil.save(os.path.join(out, name))
    print(f"  page {i+1}: {pil.size} -> {name}")