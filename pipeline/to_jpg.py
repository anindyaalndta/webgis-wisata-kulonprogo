import sys, glob, os
from PIL import Image
d = sys.argv[1]; o = os.path.join(d, 'jpg'); os.makedirs(o, exist_ok=True)
for f in glob.glob(os.path.join(d, '[01]*.png')):
    im = Image.open(f).convert('RGB')
    if im.width > 1800: im = im.resize((1800, round(im.height * 1800 / im.width)), Image.LANCZOS)
    im.save(os.path.join(o, os.path.basename(f)[:-4] + '.jpg'), quality=84, optimize=True)
print('ok')
