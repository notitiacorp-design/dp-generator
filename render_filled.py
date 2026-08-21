import pypdfium2 as pdfium
import os

pdf = pdfium.PdfDocument('test_cerfa_filled.pdf')
os.makedirs('renders/cerfa_test', exist_ok=True)
for i in range(len(pdf)):
    img = pdf[i].render(scale=2).to_pil()
    img.save(f'renders/cerfa_test/filled_p_{i+1}.png')
print('Rendered filled cerfa test pages')
