#!/usr/bin/env python3
"""按真实界面的版面把 _cover-data.mjs 倒出的真实文本画成 1200×750 WebP。

    python3 _cover-draw.py /tmp/legal-cover.json public/previews/tools/legal-calculator-01.cover.webp

只排版，不编数：节点名、事实、采用基数、补偿月数、估算金额与两枚门槛印记
都来自插件自己走完那条链之后屏幕上的字。
"""
import json
import os
import re
import sys
from PIL import Image, ImageDraw, ImageFont

W, H = 1200, 750
PAPER, INK, MUTED, FAINT = "#f2efe9", "#23201c", "#6f6a61", "#a8a29a"
RAIL, RAIL_ON, PIN = "#cdc7bc", "#6a6459", "#8c4a3c"
SANS = "/host/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc"
MONO = "/host/usr/share/fonts/truetype/noto/NotoSansMono-Regular.ttf"

with open(sys.argv[1], encoding="utf-8") as fh:
    data = json.load(fh)

img = Image.new("RGB", (W, H), PAPER)
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


def text(x, y, value, size=17, fill=INK, mono=False):
    if not mono:
        d.text((x, y), str(value), font=font(size), fill=fill)
        return
    for token, ascii_run in runs(value):
        chosen = font(size, ascii_run)
        d.text((x, y), token, font=chosen, fill=fill)
        x += d.textlength(token, font=chosen)


def wrap(value, max_width, size):
    """千分位里的空格换成不断行空格，长金额不会被拆成两行。"""
    value = re.sub(r"(?<=\d) (?=\d)", "\u00a0", str(value))
    lines, current = [], ""
    for char in value:
        if width(current + char, size) > max_width and current:
            lines.append(current)
            current = char
        else:
            current += char
    if current:
        lines.append(current)
    return lines


def fit(value, max_width, start, floor, mono=False):
    size = start
    while size > floor and width(value, size, mono) > max_width:
        size -= 1
    return size


# 一页案卷：暖灰纸，左边缘一道安静的装订阴影。
for x in range(28):
    shade = int(0x23 + (0xF2 - 0x23) * (x / 28.0) ** 0.55)
    d.line([(x, 0), (x, H)], fill=(shade, shade - 3 if shade > 3 else shade, shade - 8 if shade > 8 else shade))

# 判定链：节点按规则发生的先后横过纸面，每个节点自带一段连接线。
# 每一列宽多少由它自己那行字量出来，长金额因此不会顶到下一个节点。
left, right = 78, 1140
rail_y = 290
nodes = data["nodes"]
GAP = 26
read_sizes = [40 if node["big"] else 23 for node in nodes]
needs = [
    max(width(node["name"], 19), width(node["read"], size, True)) + GAP
    for node, size in zip(nodes, read_sizes)
]
span = right - left
columns = []
x = left
for need in needs:
    column = span * need / sum(needs)
    columns.append((x, column))
    x += column

marks = []
for (start, column), node in zip(columns, nodes):
    settled = node["state"] == "settled"
    d.line([(start, rail_y), (start + column, rail_y)], fill=RAIL_ON if settled else RAIL, width=1)
    # 节点头上那颗钉：走到这一步的落稳了。
    if settled:
        d.ellipse([start - 4, rail_y - 4, start + 4, rail_y + 4], fill=RAIL_ON)
    else:
        d.ellipse([start - 4, rail_y - 4, start + 4, rail_y + 4], outline=RAIL, fill=PAPER)

    inner = column - GAP
    name_size = fit(node["name"], inner, 19, 15)
    text(start, rail_y + 22, node["name"], name_size, INK if node["big"] else MUTED)

    read_size = fit(node["read"], inner, 40 if node["big"] else 23, 18, mono=True)
    text(start, rail_y + 58, node["read"], read_size, INK, mono=True)

    if node["mark"]:
        marks.append((start, node["mark"]))

# 门槛印记：贴在它服务的那个节点下面；两枚印记不许压在一起，后一枚顺势往右挪。
edge_x = left
for start, sentence in marks:
    box_left = max(start, edge_x)
    lines = wrap(sentence, min(300, right - box_left - 12), 15)
    box_h = 16 + len(lines) * 24
    box_w = max(width(line, 15) for line in lines) + 22
    d.rounded_rectangle(
        [box_left, rail_y + 128, box_left + box_w, rail_y + 128 + box_h],
        radius=11, outline=(190, 140, 128), width=1,
    )
    y = rail_y + 136
    for line in lines:
        text(box_left + 11, y, line, 15, PIN)
        y += 24
    edge_x = box_left + box_w + 18

# 结论下面只有这一行淡字，不配标题，也不需要打开和关闭。
y = 600
for line in wrap(data["edge"], right - left, 17):
    text(left, y, line, 17, MUTED)
    y += 28

text(left, y + 18, data["again"], 17, FAINT)
d.line([(left, y + 46), (left + width(data["again"], 17), y + 46)], fill=RAIL, width=1)

out = sys.argv[2]
os.makedirs(os.path.dirname(out), exist_ok=True)
img.save(out, "WEBP", quality=92, method=6)
print(f"{out}: {img.size[0]}x{img.size[1]} {os.path.getsize(out)} bytes")
