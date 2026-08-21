import pypdfium2 as pdfium
import json

doc = pdfium.PdfDocument('templates/cerfa_13404.pdf')

for page_idx in [3, 4, 5]:
    page = doc[page_idx]
    textpage = page.get_textpage()
    num_rects = textpage.count_rects()
    print(f"=== PAGE {page_idx+1} ===")
    
    # Extract all text fragments with their bounding boxes
    # In pypdfium2, we can inspect text box by character or word
    num_chars = textpage.count_chars()
    
    # Let's extract line by line
    full_text = textpage.get_text_range()
    lines = full_text.split('\n')
    for line in lines:
        if any(w in line.lower() for w in ['nom', 'prénom', 'adresse', 'téléphone', 'courriel', 'électronique', 'localité', 'section', 'numéro', 'superficie', 'cadastrale', 'description']):
            # find box for this line
            idx = full_text.find(line)
            if idx >= 0:
                rect = textpage.get_charbox(idx)
                print(f"Line: '{line.strip()}' -> first char box: left={rect[0]:.1f}, bottom={rect[1]:.1f}, right={rect[2]:.1f}, top={rect[3]:.1f}")
