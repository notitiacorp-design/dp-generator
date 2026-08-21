import pypdfium2 as pdfium
import os

pdf = pdfium.PdfDocument('DOSSIER_DP_LEFEBVRE_OFFICIEL.pdf')
os.makedirs('renders/witness_official', exist_ok=True)
for i in range(len(pdf)):
    img = pdf[i].render(scale=2).to_pil()
    img.save(f'renders/witness_official/page_{i+1}.png')
print(f'Rendered {len(pdf)} pages of DOSSIER_DP_LEFEBVRE_OFFICIEL.pdf')
