import pypdfium2 as pdfium

for p_idx in range(len(pdfium.PdfDocument('templates/cerfa_13404.pdf'))):
    page = pdfium.PdfDocument('templates/cerfa_13404.pdf')[p_idx]
    textpage = page.get_textpage()
    text = textpage.get_text_range()
    if 'Bordereau' in text or 'bordereau' in text or 'DP1' in text or 'pièces à joindre' in text or 'Pièces' in text:
        print(f'Candidate page for Bordereau: Page {p_idx+1}')
        for line in text.split('\n'):
            if any(k in line for k in ['DP1', 'DP2', 'DP6', 'DP7', 'Plan de situation', 'Bordereau']):
                print('   ', line.strip())
