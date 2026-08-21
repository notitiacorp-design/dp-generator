import pypdfium2 as pdfium

doc = pdfium.PdfDocument('templates/cerfa_13404.pdf')

for p_num in [4, 5, 6]:
    page = doc[p_num - 1]
    tp = page.get_textpage()
    total = tp.count_chars()
    print(f"\n==================== FULL TEXT WITH POSITIONS PAGE {p_num} ====================")
    
    # Let's find words or chunks
    cur_y = None
    line_buf = ""
    for i in range(total):
        char = tp.get_text_range(i, 1)
        box = tp.get_charbox(i)
        if cur_y is None or abs(box[1] - cur_y) > 3:
            if line_buf:
                print(f"y={cur_y:.1f} | {line_buf}")
            cur_y = box[1]
            line_buf = f"[{box[0]:.1f}] {char}"
        else:
            line_buf += char
    if line_buf:
        print(f"y={cur_y:.1f} | {line_buf}")
