#!/usr/bin/env python3
"""按真实界面的版面把 _cover-data.mjs 倒出的真实文本画成 1200×750 WebP。

    python3 _cover-draw.py /tmp/unit-converter-cover.json public/previews/tools/unit-converter-01.cover.webp

只排版，不编数：所有数字与单位名都来自插件自己算出来的那一屏。
"""
import json
import os
import sys
from PIL import Image, ImageDraw, ImageFont

W, H = 1200, 750
COOL, COOL_INK = "#e8eef4", "#17242f"
WARM, WARM_INK = "#f6ece1", "#2c211a"
SEAM, BAND, BAND_SOFT = "#ffffff", "#1f6feb", "#c07d2a"
COOL_MUTED, WARM_MUTED = "#5d6b76", "#6b5d52"
SANS = "/host/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc"
MONO = "/host/usr/share/fonts/truetype/noto/NotoSansMono-Regular.ttf"

with open(sys.argv[1], encoding="utf-8") as fh:
    data = json.load(fh)

img = Image.new("RGB", (W, H), SEAM)
d = ImageDraw.Draw(img)
fonts = {}


def font(size, mono=False):
    key = (size, mono)
    if key not in fonts:
        fonts[key] = ImageFont.truetype(MONO if mono else SANS, size)
    return fonts[key]


def runs(value):
    out, current, ascii_run = [], "", None
    for char in str(value):
        is_ascii = ord(char) < 128
        if ascii_run is None or is_ascii == ascii_run:
            current += char
        else:
            out.append((current, ascii_run))
            current = char
        ascii_run = is_ascii
    if current:
        out.append((current, ascii_run))
    return out


def width(value, size=17, mono=False):
    if not mono:
        return d.textlength(str(value), font=font(size))
    return sum(d.textlength(token, font=font(size, ascii_run)) for token, ascii_run in runs(value))


def text(x, y, value, size=17, fill=COOL_INK, mono=False, anchor="la"):
    if not mono:
        d.text((x, y), str(value), font=font(size), fill=fill, anchor=anchor)
        return
    if anchor == "ra":
        x -= width(value, size, True)
    for token, ascii_run in runs(value):
        chosen = font(size, ascii_run)
        d.text((x, y), token, font=chosen, fill=fill, anchor="la")
        x += d.textlength(token, font=chosen)


def fit(value, max_width, start, floor, mono=False):
    """长读数按可用宽度缩到放得下，绝不折行、绝不被单位牌盖住。"""
    size = start
    while size > floor and width(value, size, mono) > max_width:
        size -= 2
    return size


# 两块色面：一端偏冷静，一端带温度，中间留一道亮缝给等值桥。
left_edge, seam_left, seam_right, right_edge = 0, 472, 728, W
d.rectangle([left_edge, 0, seam_left, H], fill=COOL)
d.rectangle([seam_right, 0, right_edge, H], fill=WARM)

pad = 56
left_right_edge = seam_left - pad
right_left_edge = seam_right + pad
band_color = BAND if data["exact"] else BAND_SOFT

# 等值桥：精确定义时带子笔直，近似时边缘软下来（和界面同一套形状）。
if data["exact"]:
    d.rectangle([seam_left, 366, seam_right, 384], fill=band_color)
else:
    d.polygon(
        [(seam_left, 360), (seam_left + 70, 372), (seam_right - 70, 372), (seam_right, 360),
         (seam_right, 390), (seam_right - 70, 378), (seam_left + 70, 378), (seam_left, 390)],
        fill=band_color,
    )

# 桥上那一句压在带子中央，白底衬出来，不配标题。
word = data["relation"]
word_size = 22
word_w = width(word, word_size)
box = [(seam_left + seam_right) / 2 - word_w / 2 - 14, 336, (seam_left + seam_right) / 2 + word_w / 2 + 14, 414]
d.rectangle(box, fill=SEAM)
text((seam_left + seam_right) / 2, 375, word, word_size, band_color, anchor="mm")

# 两端读数取同一个字号：它们是同一个量的两种表达，不该一大一小。
num_size = min(
    fit(data["leftValue"], left_right_edge - pad, 96, 34, mono=True),
    fit(data["rightValue"], right_edge - pad - right_left_edge, 96, 34, mono=True),
)
num_top = 375 - num_size * 0.62

# 左端：用户手里的表达。数字右对齐贴着桥，单位牌就在数字末尾。
text(left_right_edge, 250, data["leftRole"], 21, COOL_MUTED, anchor="ra")
text(left_right_edge, num_top, data["leftValue"], num_size, COOL_INK, mono=True, anchor="ra")
unit_size = fit(data["leftUnit"], left_right_edge - pad, 27, 17)
text(left_right_edge, 470, data["leftUnit"], unit_size, COOL_INK, anchor="ra")
d.line([(left_right_edge - width(data["leftUnit"], unit_size), 470 + unit_size + 10),
         (left_right_edge, 470 + unit_size + 10)], fill=COOL_INK, width=1)

# 右端：他想读懂的表达，落在同一条基线上。
text(right_left_edge, 250, data["rightRole"], 21, WARM_MUTED)
text(right_left_edge, num_top, data["rightValue"], num_size, WARM_INK, mono=True)
unit_size = fit(data["rightUnit"], right_edge - pad - right_left_edge, 27, 17)
text(right_left_edge, 470, data["rightUnit"], unit_size, WARM_INK)
d.line([(right_left_edge, 470 + unit_size + 10),
         (right_left_edge + width(data["rightUnit"], unit_size), 470 + unit_size + 10)], fill=WARM_INK, width=1)

out = sys.argv[2]
os.makedirs(os.path.dirname(out), exist_ok=True)
img.save(out, "WEBP", quality=92, method=6)
print(f"{out}: {img.size[0]}x{img.size[1]} {os.path.getsize(out)} bytes")
