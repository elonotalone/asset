#!/usr/bin/env python3
"""封面绘制：只画 _cover-data.mjs 从真实界面取回的文字，版面照 style.css 的等号轴。"""
import json
import os
import re
import sys
from PIL import Image, ImageDraw, ImageFont

W, H = 1200, 750
SLATE, CHALK, DIM, FAINT, STRONG, LINE = "#191a1c", "#ecefe7", "#b9bfb4", "#8b918a", "#ffffff", "#43443f"
SERIF = "/host/usr/share/fonts/opentype/noto/NotoSerifCJK-Regular.ttc"
SANS = "/host/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc"

MATH, TAIL, NOTE, KNOWN, SLIP, TAG = 34, 50, 23, 26, 21, 21
AXIS = 322          # 等号左沿：所有行共用这条轴
GAP = 16            # 等号两侧的留白
LEFT, RIGHT = 88, 1112
OPS = re.compile(r"^[×÷+−^(),=≈]$")
SPLIT = re.compile(r"([×÷+−^(),=≈])")

with open(sys.argv[1], encoding="utf-8") as handle:
    data = json.load(handle)

img = Image.new("RGB", (W, H), SLATE)
d = ImageDraw.Draw(img)
cache = {}


def font(size, face=SERIF):
    key = (size, face)
    if key not in cache:
        cache[key] = ImageFont.truetype(face, size)
    return cache[key]


def width(value, size, face=SERIF):
    return d.textlength(str(value), font=font(size, face))


def pieces(text):
    return [chunk for chunk in SPLIT.split(str(text)) if chunk]


def math_width(text, size):
    return sum(width(chunk, size) for chunk in pieces(text))


def draw_math(x, baseline, text, size, term=CHALK, op=STRONG):
    for chunk in pieces(text):
        d.text((x, baseline), chunk, font=font(size), fill=op if OPS.match(chunk) else term, anchor="ls")
        x += width(chunk, size)
    return x


# 背景：顶部漫下来的一点光，再压上石板上极淡的横纹
glow = Image.new("L", (80, 50))
for gy in range(50):
    for gx in range(80):
        far = (((gx - 40) / 46) ** 2 + ((gy + 6) / 34) ** 2) ** 0.5
        glow.putpixel((gx, gy), max(0, int(13 * (1 - min(1.0, far)))))
img = Image.composite(Image.new("RGB", (W, H), "#3a3c3e"), img, glow.resize((W, H), Image.BICUBIC))
d = ImageDraw.Draw(img)
for y in range(0, H, 6):
    d.line([(0, y), (W, y)], fill="#1d1e20")

# 第一行：示例印记、要求的量、已知量
y = 108
x = LEFT
tag_w = width(data["tag"], TAG, SANS) + 34
d.rounded_rectangle([x, y - 24, x + tag_w, y + 12], 18, outline=LINE, width=1)
d.text((x + 17, y), data["tag"], font=font(TAG, SANS), fill=FAINT, anchor="ls")
x += tag_w + 30

ask = data["ask"].split(" ")
d.text((x, y), ask[0], font=font(KNOWN, SANS), fill=FAINT, anchor="ls")
x += width(ask[0], KNOWN, SANS) + 10
if len(ask) > 2:
    d.text((x, y), ask[1], font=font(KNOWN, SANS), fill=DIM, anchor="ls")
    x += width(ask[1], KNOWN, SANS) + 8
d.text((x, y), ask[-1], font=font(KNOWN + 4), fill=CHALK, anchor="ls")
x += width(ask[-1], KNOWN + 4) + 30

d.text((x, y), data["knownWord"], font=font(KNOWN, SANS), fill=FAINT, anchor="ls")
x += width(data["knownWord"], KNOWN, SANS) + 18
for known in data["knowns"]:
    if known["name"]:
        d.text((x, y), known["name"], font=font(KNOWN, SANS), fill=DIM, anchor="ls")
        x += width(known["name"], KNOWN, SANS) + 9
    line = known["symbol"] + " = " + known["value"]
    x = draw_math(x, y, line, KNOWN + 4) + 30

# 推导链：每一行都是完整等式，等号落在同一条轴上
rows = data["rows"]
pitch = 84
y = 214
marks = []
for row in rows:
    size = TAIL if row["tail"] else MATH
    eq_size = MATH + (6 if row["tail"] else 0)
    lhs_w = math_width(row["lhs"], MATH)
    draw_math(AXIS - GAP - lhs_w, y, row["lhs"], MATH)
    d.text((AXIS, y), row["eq"], font=font(eq_size), fill=STRONG, anchor="ls")
    marks.append((AXIS + width(row["eq"], eq_size) / 2, y))
    end = draw_math(AXIS + width(row["eq"], eq_size) + GAP, y, row["rhs"], size,
                    term=STRONG if row["tail"] else CHALK)
    if row["slip"]:
        d.text((end + 24, y), row["slip"], font=font(SLIP, SANS), fill=FAINT, anchor="ls")
    d.text((RIGHT, y), row["note"], font=font(NOTE, SANS), fill=FAINT, anchor="rs")
    y += pitch + (18 if row is rows[-2] else 0)

# 引导线：连的是每一行等号的真实位置
for start, stop in zip(marks, marks[1:]):
    d.line([(start[0], start[1] + 12), (stop[0], stop[1] - MATH - 4)], fill=LINE, width=1)

out = sys.argv[2]
os.makedirs(os.path.dirname(out), exist_ok=True)
img.save(out, "WEBP", quality=92, method=6)
print(f"{out}: {img.size[0]}x{img.size[1]} {os.path.getsize(out)} bytes")
