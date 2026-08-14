#!/usr/bin/env python3
import json
import os
import sys
from PIL import Image, ImageDraw, ImageFont

W, H = 1200, 750
INK, MUTED, FAINT = "#17191d", "#68707b", "#969da6"
DIVIDER, RULE, SHADE, ACCENT, BG = "#dfe3e7", "#aeb5bd", "#f6f7f8", "#1d4ed8", "#ffffff"
SANS = "/host/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc"
MONO = "/host/usr/share/fonts/truetype/noto/NotoSansMono-Regular.ttf"

with open(sys.argv[1], encoding="utf-8") as fh:
    data = json.load(fh)
img = Image.new("RGB", (W, H), BG)
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

def text(x, y, value, size=17, fill=INK, mono=False, anchor="la"):
    if not mono:
        d.text((x, y), str(value), font=font(size), fill=fill, anchor=anchor)
        return
    if anchor == "ra":
        x -= width(value, size, True)
    for token, ascii_run in runs(value):
        selected = font(size, ascii_run)
        d.text((x, y), token, font=selected, fill=fill, anchor="la")
        x += d.textlength(token, font=selected)

def ellipsis(value, max_width, size=17, mono=False):
    value = str(value)
    if width(value, size, mono) <= max_width:
        return value
    while value and width(value + "…", size, mono) > max_width:
        value = value[:-1]
    return value + "…"

def line(x0, y, x1, color=DIVIDER, weight=1):
    d.line([(x0, y), (x1, y)], fill=color, width=weight)

pad, split, right = 42, 398, 1160
text(pad, 28, data["title"], 23)
text(pad + width(data["title"], 23) + 16, 34, ellipsis(data["sub"], 900, 15), 15, MUTED)
line(0, 70, W)
d.line([(split, 70), (split, 704)], fill=DIVIDER, width=1)

# 左：录卡输入与算法摘要，全部取自真实 DOM。
text(pad, 91, data["editorTitle"], 14, MUTED)
text(pad, 126, data["frontLabel"], 13, MUTED)
text(pad, 153, ellipsis(data["front"], split - pad - 25, 15), 15)
line(pad, 184, split - 24)
text(pad, 205, data["backLabel"], 13, MUTED)
text(pad, 232, ellipsis(data["back"], split - pad - 25, 15), 15)
line(pad, 263, split - 24)
d.rectangle([pad, 284, pad + 14, 298], outline=ACCENT, width=1)
d.line([(pad + 3, 291), (pad + 6, 295), (pad + 12, 287)], fill=ACCENT, width=2)
text(pad + 26, 283, data["startNow"], 13, MUTED)
d.rectangle([pad, 317, pad + 108, 350], outline=DIVIDER, width=1)
text(pad + 12, 324, data["addButton"], 13)
line(pad, 380, split - 24)
text(pad, 399, data["rulesTitle"], 14, MUTED)
y = 431
for label, value in data["rules"]:
    text(pad, y, label, 12, MUTED)
    text(split - 24, y, value, 12, INK, mono=True, anchor="ra")
    line(pad, y + 23, split - 24)
    y += 34
for note in data["ruleNotes"]:
    text(pad, y + 3, ellipsis(note, split - pad - 24, 11), 11, MUTED)
    y += 29

# 右：真实结论读数与本次评分理由。
rx, y = split + 30, 92
x = rx
for cell in data["headline"]:
    text(x, y, cell["k"], 13, ACCENT)
    text(x, y + 24, cell["v"], 31, INK, mono=True)
    x += 225
text(rx, 155, ellipsis(data["basis"], right - rx, 13), 13, MUTED)
line(rx, 184, right)
text(rx, 204, data["queueTitle"], 14, MUTED)
text(rx, 236, data["queueEmpty"], 17)
text(rx, 268, ellipsis(data["actionNote"], right - rx, 12), 12, MUTED)

# 卡片登记：真实评分后的次数、间隔、EF 与日期。
line(rx, 307, right)
text(rx, 326, data["registryTitle"], 14, MUTED)
y = 365
cols = [rx, rx + 330, rx + 430, rx + 520, right]
for i, heading in enumerate(data["registryHead"]):
    text(cols[i], y, heading, 12, MUTED, anchor="ra" if i else "la")
line(rx, y + 24, right, RULE, 2)
y += 36
for row in data["registryRows"]:
    text(cols[0], y, ellipsis(row[0], 300, 14), 14)
    for i in range(1, len(row)):
        text(cols[i], y, row[i], 14, INK, mono=True, anchor="ra")

# 未来日期轴：取真实 UI 的前五行，灰阶隔行底纹。
y += 52
line(rx, y, right)
text(rx, y + 18, data["timelineTitle"], 14, MUTED)
y += 55
tcols = [rx, rx + 350, right]
for i, heading in enumerate(data["timelineHead"]):
    text(tcols[i], y, heading, 12, MUTED, anchor="ra" if i else "la")
line(rx, y + 23, right, RULE, 2)
y += 32
for n, row in enumerate(data["timelineRows"][:5]):
    if n % 2:
        d.rectangle([rx, y - 4, right, y + 23], fill=SHADE)
    text(tcols[0], y, row[0], 13, INK, mono=True)
    text(tcols[1], y, row[1], 13, MUTED, anchor="ra")
    text(tcols[2], y, row[2], 13, INK, mono=True, anchor="ra")
    y += 29

line(0, 704, W)
d.rectangle([pad, 716, pad + 88, 743], outline=DIVIDER, width=1)
text(pad + 10, 720, data["selftestButton"], 13)
text(pad + 108, 720, data["selftest"], 13, MUTED, mono=True)

out = sys.argv[2]
os.makedirs(os.path.dirname(out), exist_ok=True)
img.save(out, "WEBP", quality=92, method=6)
print(f"{out}: {img.size[0]}x{img.size[1]} {os.path.getsize(out)} bytes")
