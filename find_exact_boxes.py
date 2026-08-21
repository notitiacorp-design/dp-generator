import pypdfium2 as pdfium

doc = pdfium.PdfDocument('templates/cerfa_13404.pdf')

def search_text_coords(p_num):
    page = doc[p_num - 1]
    tp = page.get_textpage()
    total = tp.count_chars()
    chars = [tp.get_text_range(i, 1) for i in range(total)]
    full_str = "".join(chars)
    
    print(f"\n==================== PAGE {p_num} ====================")
    keywords = [
        "Nom", "Prénom", "Né(e) le", "Commune", "Département", "Pays",
        "Numéro", "Voie", "Lieu-dit", "Localité", "Code postal", "BP", "Cedex",
        "Téléphone", "indicatif", "Adresse électronique", "courriel", "électronique",
        "terrain", "Section", "Numéro", "Superficie", "Courte description"
    ]
    
    for kw in set(keywords):
        start = 0
        while True:
            pos = full_str.find(kw, start)
            if pos == -1:
                break
            box = tp.get_charbox(pos)
            end_box = tp.get_charbox(pos + len(kw) - 1)
            print(f"'{kw}' found at idx {pos}: x={box[0]:.1f}..{end_box[2]:.1f}, y_bottom={box[1]:.1f}, y_top={box[3]:.1f}")
            start = pos + len(kw)

search_text_coords(4)
search_text_coords(5)
search_text_coords(6)
