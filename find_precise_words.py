import pypdfium2 as pdfium

doc = pdfium.PdfDocument('templates/cerfa_13404.pdf')

def scan_words_page(p_num):
    page = doc[p_num - 1]
    tp = page.get_textpage()
    total = tp.count_chars()
    print(f"\n==================== WORDS & EXACT COORDS PAGE {p_num} ====================")
    
    # Extract words
    text = tp.get_text_range()
    import re
    for match in re.finditer(r'\S+', text):
        w = match.group()
        start, end = match.span()
        b_start = tp.get_charbox(start)
        b_end = tp.get_charbox(end - 1)
        # Check if word is of interest
        if any(k in w.lower() for k in ['nom', 'prénom', 'né', 'commune', 'département', 'pays', 'numéro', 'voie', 'lieu-dit', 'localité', 'code', 'postal', 'téléphone', 'indicatif', 'courriel', 'adresse', 'section', 'parcelle', 'superficie', 'description']):
            print(f"'{w}' -> x={b_start[0]:.1f}..{b_end[2]:.1f}, y={b_start[1]:.1f}")

scan_words_page(4)
scan_words_page(5)
scan_words_page(6)
