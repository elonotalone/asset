#!/usr/bin/env python3
"""封面绘制：只画 _cover-data.mjs 从真实界面取回的文字，版面照 style.css 的节奏。"""
import json
import os
import sys
from PIL import Image, ImageDraw, ImageFilter, ImageFont

W, H = 1200, 750
PAPER, INK, SEAM, EDGE = "#fffdf9", "#1f2328", "#e8e2d6", "#ddd7ca"
SERIF = "/host/usr/share/fonts/opentype/noto/NotoSerifCJK-Regular.ttc"
SERIF_MID = "/host/usr/share/fonts/opentype/noto/NotoSerifCJK-Bold.ttc"
SANS = "/host/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc"

FRONT_SIZE, BACK_SIZE, PILL_SIZE = 31, 27, 21
LEADING = 1.75
PAD_X, PAD_TOP, PAD_BOTTOM = 58, 54, 46
CARD_X0, CARD_X1 = 196, 1004

with open(sys.argv[1], encoding="utf-8") as handle:
    data = json.load(handle)

img = Image.new("RGB", (W, H), "#f4f4f1")
d = ImageDraw.Draw(img)
cache = {}


def font(size, face=SERIF):
    key = (size, face)
    if key not in cache:
        cache[key] = ImageFont.truetype(face, size)
    return cache[key]


def width(value, size, face=SERIF):
    return d.textlength(str(value), font=font(size, face))


def wrap(value, size, limit, face=SERIF):
    rows, line = [], ""
    for char in str(value):
        if width(line + char, size, face) > limit and line:
            rows.append(line)
            line = char
        else:
            line += char
    if line:
        rows.append(line)
    return rows


COLUMN = CARD_X1 - CARD_X0 - PAD_X * 2
front_rows = wrap(data["front"], FRONT_SIZE, COLUMN, SERIF_MID)
back_rows = wrap(data["back"], BACK_SIZE, COLUMN, SERIF)
front_h = int(FRONT_SIZE * LEADING) * len(front_rows)
back_h = int(BACK_SIZE * LEADING) * len(back_rows)
content_h = front_h + 26 + 1 + 30 + back_h + 34 + 48
card_h = PAD_TOP + content_h + PAD_BOTTOM
CARD_Y0 = max(70, (H - card_h) // 2)
CARD_Y1 = CARD_Y0 + card_h

# 背景：光从上方缓慢铺下来的很淡的雾。
for y in range(H):
    ratio = y / (H - 1)
    if ratio < 0.62:
        t, top, bottom = ratio / 0.62, (250, 250, 248), (244, 244, 241)
    else:
        t, top, bottom = (ratio - 0.62) / 0.38, (244, 244, 241), (238, 238, 234)
    d.line([(0, y), (W, y)], fill=tuple(int(top[i] + (bottom[i] - top[i]) * t) for i in range(3)))

overlay = Image.new("RGBA", (W, H), (0, 0, 0, 0))
ImageDraw.Draw(overlay).rounded_rectangle(
    [CARD_X0 + 2, CARD_Y0 + 14, CARD_X1 + 2, CARD_Y1 + 18], 14, fill=(31, 35, 40, 52)
)
img = Image.alpha_composite(img.convert("RGBA"), overlay.filter(ImageFilter.GaussianBlur(17))).convert("RGB")
d = ImageDraw.Draw(img)
d.rounded_rectangle([CARD_X0, CARD_Y0, CARD_X1, CARD_Y1], 12, fill=PAPER, outline=EDGE, width=1)


def draw_rows(x, y, rows, size, face):
    for row in rows:
        d.text((x, y), row, font=font(size, face), fill=INK)
        y += int(size * LEADING)
    return y


LEFT = CARD_X0 + PAD_X
y = draw_rows(LEFT, CARD_Y0 + PAD_TOP, front_rows, FRONT_SIZE, SERIF_MID)
y += 26
d.line([(LEFT, y), (CARD_X1 - PAD_X, y)], fill=SEAM, width=1)
y = draw_rows(LEFT, y + 30, back_rows, BACK_SIZE, SERIF)

y += 34
x = LEFT
for name in data["ratings"]:
    pill = width(name, PILL_SIZE, SANS) + 46
    d.rounded_rectangle([x, y, x + pill, y + 48], 24, outline=EDGE, width=1)
    d.text((x + 23, y + 10), name, font=font(PILL_SIZE, SANS), fill=INK)
    x += pill + 14

out = sys.argv[2]
os.makedirs(os.path.dirname(out), exist_ok=True)
img.save(out, "WEBP", quality=92, method=6)
print(f"{out}: {img.size[0]}x{img.size[1]} {os.path.getsize(out)} bytes")
