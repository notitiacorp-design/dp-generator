import pypdfium2 as pdfium
import os

pdf = pdfium.PdfDocument('templates/cerfa_13404.pdf')
os.makedirs('renders/cerfa_pages', exist_ok=True)
for p in [0, 1, 2, 3, 4, 5, 6, 7]:
    img = pdf[p].render(scale=2).to_pil()
    img.save(f'renders/cerfa_pages/p_{p+1}.png')
print('Rendered pages 1-8')
