import pypdfium2 as pdfium

pdf = pdfium.PdfDocument('/home/openclaw/dp-generator/test_output_LEFEBVRE_REAL.pdf')
for i, page in enumerate(pdf):
    img = page.render(scale=2).to_pil()
    out = f'/home/openclaw/dp-generator/renders/real_dp_page_{i+1}.png'
    img.save(out)
    print(f'Done: {out}')
