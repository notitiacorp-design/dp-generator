import pypdfium2 as pdfium

for p_idx in [2, 3, 4, 5]:
    page = pdfium.PdfDocument('templates/cerfa_13404.pdf')[p_idx]
    textpage = page.get_textpage()
    n_chars = len(textpage.get_text_range())
    print(f'=== PAGE {p_idx+1} === ({n_chars} chars)')
    for i in range(0, n_chars, 50):
        t = textpage.get_text_range(i, min(50, n_chars - i))
        b = textpage.get_charbox(i)
        print(f'  [{b[0]:.1f}, {b[1]:.1f}] : {repr(t)}')
