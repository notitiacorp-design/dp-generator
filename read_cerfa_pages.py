import pypdfium2 as pdfium

pdf = pdfium.PdfDocument('templates/cerfa_13404.pdf')
for i in range(min(8, len(pdf))):
    page = pdf[i]
    text = page.get_textpage().get_text_range()
    print(f'=== PAGE {i+1} ===')
    lines = [l.strip() for l in text.split('\n') if l.strip()]
    print('\n'.join(lines[:6]))
