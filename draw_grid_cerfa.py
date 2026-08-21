import pypdfium2 as pdfium
from PIL import Image, ImageDraw

doc = pdfium.PdfDocument('templates/cerfa_13404.pdf')

for p_num in [4, 5, 6]:
    page = doc[p_num - 1]
    # render at scale 2 (1 pt = 2 px)
    pil_image = page.render(scale=2).to_pil()
    draw = ImageDraw.Draw(pil_image)
    
    # Draw horizontal grid lines every 50 pt (100 px) with labels
    # Note in pdf: y=0 is bottom, y=842 is top
    # In image: y_img = (842 - y_pdf) * 2
    for y_pdf in range(0, 850, 50):
        y_img = (842 - y_pdf) * 2
        draw.line([(0, y_img), (pil_image.width, y_img)], fill='red', width=1)
        draw.text((10, y_img - 15), f"y={y_pdf}", fill='red')

    for x_pdf in range(0, 600, 50):
        x_img = x_pdf * 2
        draw.line([(x_img, 0), (x_img, pil_image.height)], fill='blue', width=1)
        draw.text((x_img + 2, 10), f"x={x_pdf}", fill='blue')

    pil_image.save(f"cerfa_grid_p{p_num}.png")
print("Grid images saved!")
