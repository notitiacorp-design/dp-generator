import pypdfium2 as pdfium

pdf = pdfium.PdfDocument('templates/cerfa_13404.pdf')
for p in [3, 4, 5, 7, 8]:
    page = pdf[p]
    text = page.get_textpage().get_text_range()
    print(f'=== FULL TEXT PAGE {p+1} ===')
    print(text)
