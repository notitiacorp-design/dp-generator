import pdfplumber
import json

with pdfplumber.open('templates/cerfa_13404.pdf') as pdf:
    # Let's inspect page 4, 5, 6 (1-indexed)
    for p_idx in [3, 4, 5]:
        page = pdf.pages[p_idx]
        words = page.extract_words()
        print(f"--- PAGE {p_idx+1} ({page.width}x{page.height}) ---")
        for w in words:
            text = w['text']
            if any(k in text.lower() for k in ['nom', 'prénom', 'commune', 'voie', 'téléphone', 'courriel', 'électronique', 'cadastre', 'section', 'numéro', 'superficie', 'localité', 'code postal', 'courte description']):
                print(f"[{w['x0']:.1f}, {w['top']:.1f}, {w['x1']:.1f}, {w['bottom']:.1f}] -> '{text}' (y_from_bottom: {page.height - w['bottom']:.1f})")
