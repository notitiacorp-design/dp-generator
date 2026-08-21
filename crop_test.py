from PIL import Image

im = Image.open('/home/openclaw/.hermes/cache/images/img_0991ec29d328.jpg')
print('Size:', im.size)
# The image resolution is probably 1920x960 or similar
w, h = im.size
# Crop left photo
left_box = (int(w * 0.08), int(h * 0.35), int(w * 0.49), int(h * 0.80))
cropped = im.crop(left_box)
cropped.save('/home/openclaw/dp-generator/sample_roof.jpg')
print('Cropped saved, size:', cropped.size)
