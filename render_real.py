import pypdfium2 as pdfium
import os

pdf_path = '/home/openclaw/dp-generator/test_output_LEFEBVRE_REAL.pdf'
pdf = pdfium.PdfDocument(pdf_path)
for i, page in enumerate(pdf):
    img = page.render(scale=2).to_pil()
    out_path = f'/home/openclaw/dp-generator/renders/real_dp_page_{i+1}.png'
    img.save(out_path)
    print(f'Rendered: {out_path}')
