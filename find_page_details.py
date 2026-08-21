import pypdfium2 as pdfium

pdf = pdfium.PdfDocument('templates/cerfa_13404.pdf')

def dump_lines(page_idx):
    page = pdf[page_idx]
    textpage = page.get_textpage()
    print(f'=== PAGE {page_idx+1} ===')
    # search phrases
    for kw in ['1.1', '1.2', '2.1', '2.2', '3.', '4.', '5.1', '5.2', 'Cadre réservé', 'Déclaration préalable', 'Numéro', 'Voie', 'Lieu-dit', 'Code postal', 'BP', 'Cedex', 'Section', 'Superficie', 'Courte description']:
        s = textpage.search(kw)
        while True:
            m = s.get_next()
            if not m: break
            char_idx, count = m
            rect = textpage.get_charbox(char_idx)
            print(f'  "{kw}" -> x={rect[0]:.1f}, y={rect[1]:.1f}')

dump_lines(3)
dump_lines(4)
dump_lines(5)
