import pypdfium2 as pdfium

pdf = pdfium.PdfDocument('templates/cerfa_13404.pdf')

def scan_text(page_idx):
    page = pdf[page_idx]
    textpage = page.get_textpage()
    print(f'=== PAGE {page_idx+1} ===')
    keywords = ['Nom', 'Prénom', 'Adresse', 'Téléphone', 'Références cadastrales', 'Courte description']
    for kw in keywords:
        search = textpage.search(kw)
        while True:
            match = search.get_next()
            if not match:
                break
            char_idx, count = match
            # get bbox of first char
            rect = textpage.get_charbox(char_idx)
            print(f'  "{kw}" -> left={rect[0]:.1f}, bottom={rect[1]:.1f}, right={rect[2]:.1f}, top={rect[3]:.1f}')

for p in [3, 4, 5]:
    scan_text(p)
