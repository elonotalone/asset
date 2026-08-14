#!/usr/bin/env python3
"""封面绘制：只画 _cover-data.mjs 从真实界面取回的文字，版面照 style.css 的节奏。"""
import json
import os
import sys
from PIL import Image, ImageDraw, ImageFont

W, H = 1200, 750
PAPER, INK, PENCIL, SOFT = "#fffdf7", "#15171b", "#3a4048", "#6d747d"
HAIR, RULE, MARK, KEY = "#e2ddd0", "#cfc8b6", "#b0281c", "#1f5d3a"
REGULAR = "/host/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc"
BOLD = "/host/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc"

with open(sys.argv[1], encoding="utf-8") as handle:
    data = json.load(handle)

img = Image.new("RGB", (W, H), PAPER)
d = ImageDraw.Draw(img)
cache = {}


def font(size, bold=False):
    key = (size, bold)
    if key not in cache:
        cache[key] = ImageFont.truetype(BOLD if bold else REGULAR, size)
    return cache[key]


def width(value, size, bold=False):
    return d.textlength(str(value), font=font(size, bold))


def text(x, y, value, size=19, fill=INK, bold=False, anchor="la"):
    d.text((x, y), str(value), font=font(size, bold), fill=fill, anchor=anchor)


def wrap(value, size, limit, bold=False):
    rows, line = [], ""
    for char in str(value):
        if width(line + char, size, bold) > limit and line:
            rows.append(line)
            line = char
        else:
            line += char
    if line:
        rows.append(line)
    return rows


def block(x, y, value, size, limit, fill=INK, bold=False, leading=1.5):
    for row in wrap(value, size, limit, bold):
        text(x, y, row, size, fill, bold)
        y += int(size * leading)
    return y


def rule(y, color=RULE, weight=1):
    d.line([(LEFT, y), (RIGHT, y)], fill=color, width=weight)


LEFT, RIGHT = 160, 1040
COLUMN = RIGHT - LEFT

# 卷首评语：整卷答完的那一刻才出现的头号结论。
text(LEFT, 34, data["wrapScore"], 40, INK, True)
block(LEFT, 98, data["wrapNote"], 20, COLUMN, PENCIL)
rule(142, RULE, 2)

# 前一题只在边缘留一点去向感。
text(LEFT, 168, data["edgeDir"], 18, SOFT)
text(LEFT, 194, data["edgeName"], 20, PENCIL)

# 当前这道题：题干压住页面。
y = block(LEFT, 242, data["prompt"], 32, COLUMN, INK, True, 1.45)
y = block(LEFT, y + 14, data["topic"], 19, COLUMN, SOFT)

# 选项行：真实答案文字 + 批改标记。
y += 30
for choice in data["choices"]:
    if choice["mine"] or choice["key"]:
        bar = MARK if choice["mine"] and not choice["key"] else PENCIL
        d.rectangle([LEFT - 14, y - 4, LEFT - 11, y + 30], fill=bar)
    box_top = y + 6
    d.ellipse([LEFT, box_top, LEFT + 17, box_top + 17], outline=SOFT, width=2)
    if choice["mine"]:
        d.ellipse([LEFT + 5, box_top + 5, LEFT + 12, box_top + 12], fill=PENCIL)
    label_x = LEFT + 32
    text(label_x, y, choice["text"], 22, INK, choice["key"])
    if choice["mine"] and not choice["key"]:
        span = width(choice["text"], 22)
        d.line([(label_x, y + 17), (label_x + span, y + 17)], fill=MARK, width=2)
    tag_x = label_x + 260
    for tag in choice["tags"]:
        colour = KEY if tag == "标准答案" else MARK
        text(tag_x, y + 3, tag, 19, colour)
        tag_x += width(tag, 19) + 22
    y += 48

# 判分：贴着刚才的答案往下长。
y += 16
rule(y, RULE, 2)
text(LEFT, y + 24, data["verdictScore"], 38, MARK if not data["verdictScore"].startswith("10 /") else KEY, True)
y = block(LEFT, y + 84, data["verdictReason"], 21, COLUMN, PENCIL)
y = block(LEFT, y + 8, data["verdictMine"], 19, COLUMN, PENCIL)
note_top = y + 22
note_bottom = note_top + 26 * len(wrap(data["verdictNote"], 19, COLUMN - 20))
d.rectangle([LEFT, note_top - 2, LEFT + 2, note_bottom], fill=HAIR)
block(LEFT + 18, note_top, data["verdictNote"], 19, COLUMN - 20, PENCIL, False, 1.38)

out = sys.argv[2]
os.makedirs(os.path.dirname(out), exist_ok=True)
img.save(out, "WEBP", quality=92, method=6)
print(f"{out}: {img.size[0]}x{img.size[1]} {os.path.getsize(out)} bytes")
