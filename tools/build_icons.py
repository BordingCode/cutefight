#!/usr/bin/env python3
"""Build PWA icons from the actual Cinder pixel art (parsed out of js/data/sprites.js
and js/data/palette.js so the icon always matches the in-game sprite)."""
import re
from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
pal_src = (ROOT / 'js/data/palette.js').read_text()
spr_src = (ROOT / 'js/data/sprites.js').read_text()

PAL = dict(re.findall(r"^\s*(\w):\s*'(#[0-9a-fA-F]{6})'", pal_src, re.M))

m = re.search(r"CINDER_IDLE_A = \[(.*?)\];", spr_src, re.S)
rows = re.findall(r"'([^']+)'", m.group(1))

SKY = (109, 185, 232)
GRASS = (147, 209, 108)


def build(size: int, out: Path):
    img = Image.new('RGBA', (size, size), SKY)
    d = ImageDraw.Draw(img)
    d.rectangle([0, int(size * 0.82), size, size], fill=GRASS)
    # center the 24x24 sprite, scaled to ~80% of the icon
    scale = max(1, int(size * 0.86) // 24)
    w = 24 * scale
    ox = (size - w) // 2
    oy = int(size * 0.88) - 22 * scale  # feet (row ~21) near the grass line
    for y, row in enumerate(rows):
        for x, ch in enumerate(row):
            if ch in ('.', ' '):
                continue
            c = PAL.get(ch)
            if not c:
                continue
            rgb = tuple(int(c[i:i + 2], 16) for i in (1, 3, 5))
            d.rectangle([ox + x * scale, oy + y * scale,
                         ox + (x + 1) * scale - 1, oy + (y + 1) * scale - 1], fill=rgb)
    img.save(out)
    print(f'wrote {out} ({size}x{size}, sprite scale {scale})')


icons = ROOT / 'assets/icons'
icons.mkdir(parents=True, exist_ok=True)
build(192, icons / 'icon-192.png')
build(512, icons / 'icon-512.png')
