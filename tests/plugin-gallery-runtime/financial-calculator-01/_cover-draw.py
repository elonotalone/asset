#!/usr/bin/env python3
"""按真实界面的版面把 _cover-data.mjs 倒出的真实文本与真实路径画成 1200×750 WebP。

    python3 _cover-draw.py /tmp/financial-cover.json public/previews/tools/financial-calculator-01.cover.webp

曲线不是示意图：路径点直接取自界面 SVG 里的 d 属性，也就是引擎算出的每一期余额。
"""
import json
import os
import re
import sys
from PIL import Image, ImageDraw, ImageFont

W, H = 1200, 750
PAPER, INK, MUTED, FAINT = "#f7f3ec", "#1b1a17", "#6d6558", "#a89e8e"
LINE, NOW, PAST, ACCENT = "#d8d0c2", "#23201b", "#b3a894", "#8a5a1f"
WASH = (35, 32, 27, 26)
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


def text(x, y, value, size=17, fill=INK, mono=False, anchor="la"):
    if not mono:
        d.text((x, y), str(value), font=font(size), fill=fill, anchor=anchor)
        return
    if anchor == "ra":
        x -= width(value, size, True)
    for token, ascii_run in runs(value):
        chosen = font(size, ascii_run)
        d.text((x, y), token, font=chosen, fill=fill, anchor="la")
        x += d.textlength(token, font=chosen)


def wrap(value, max_width, size):
    """结论按可用宽度折成几行；千分位里的空格换成不断行空格，长金额不会被拆成两行。"""
    value = re.sub(r"(?<=\d) (?=\d)", "\u00a0", str(value))
    tokens = re.findall(r"[^\s]+\s*", value)
    lines, current = [], ""
    for token in tokens:
        if current and width(current + token, size) > max_width:
            lines.append(current.rstrip())
            current = token
        else:
            current += token
    if current:
        lines.append(current.rstrip())
    return lines


# 图纸：曲线区就是界面里那块 SVG（视框 1000×500），按等比映射铺到封面上。
PLOT = (48, 74, 1152, 556)


def points(path):
    out = []
    for chunk in re.findall(r"[ML]\s*(-?[\d.]+)[ ,]+(-?[\d.]+)", path or ""):
        vx, vy = float(chunk[0]), float(chunk[1])
        out.append((
            PLOT[0] + vx / 1000.0 * (PLOT[2] - PLOT[0]),
            PLOT[1] + vy / 500.0 * (PLOT[3] - PLOT[1]),
        ))
    return out


# 曲线下那层薄染：用同一路径闭合，不另画竖条。
shade = points(data["shade"])
if shade:
    layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    ImageDraw.Draw(layer).polygon(shade, fill=WASH)
    img = Image.alpha_composite(img.convert("RGBA"), layer).convert("RGB")
    d = ImageDraw.Draw(img)

# 对比方案：轻而干的旧笔迹，和当前轨迹共用同一套坐标尺度。
past = points(data["past"])
if len(past) > 1:
    step, drawn = 14, 0
    while drawn + 1 < len(past):
        end = min(len(past) - 1, drawn + step)
        d.line([past[drawn], past[end]], fill=PAST, width=2)
        drawn = end + max(6, step // 2)

now = points(data["now"])
if len(now) > 1:
    d.line(now, fill=NOW, width=3, joint="curve")

# 时间刻度只透出几个年份，不围成格子；终点那一个是期限把手，所以它实一点、带虚线底。
for tick in data["axis"]:
    x = PLOT[0] + tick["at"] * (PLOT[2] - PLOT[0])
    grip = tick.get("grip")
    size = 17 if grip else 16
    text(x, PLOT[3] + 14, tick["text"], size, INK if grip else FAINT, anchor="ma")
    if grip:
        half = width(tick["text"], size) / 2
        base = PLOT[3] + 14 + size + 10
        for seg in range(int(x - half), int(x + half), 8):
            d.line([(seg, base), (min(seg + 4, x + half), base)], fill=ACCENT, width=2)

# 对比方案的名字贴在它自己的终点旁，用户认得的名字，不是 A／B。
if data["pastName"] and past:
    text(past[-1][0] - 6, past[-1][1] - 34, data["pastName"], 17, PAST, anchor="ra")

# 终点那句取舍结论：右上角，像铅笔批注，单独站住。
lines = wrap(data["verdict"], 520, 27)
y = 96
for line in lines:
    text(PLOT[2], y, line, 27, INK, anchor="ra")
    y += 40

# 当前在回答哪个问题：名字写全，选中的那个落了下划线。先量它，再决定操作带能铺到哪。
band_top = 620
d.line([(0, band_top), (W, band_top)], fill=LINE, width=1)
x = W - 48
for question in reversed(data["questions"]):
    label_w = width(question["text"], 17)
    x -= label_w
    text(x, 661, question["text"], 17, INK if question["on"] else MUTED)
    if question["on"]:
        d.line([(x, 688), (x + label_w, 688)], fill=ACCENT, width=2)
    x -= 26
questions_left = x

# 操作带贴着时间轴：本金、年利率、还款方式、期限卡扣。
x = 48
for knob in data["knobs"]:
    text(x, 660, knob["name"], 17, MUTED)
    x += width(knob["name"], 17) + 10
    if knob.get("slider") is not None:
        rail_w = max(60, min(150, questions_left - x - width(knob["value"], 17, True) - 40))
        d.line([(x, 670), (x + rail_w, 670)], fill=LINE, width=3)
        thumb = x + knob["slider"] * rail_w
        d.line([(x, 670), (thumb, 670)], fill=ACCENT, width=3)
        d.ellipse([thumb - 7, 663, thumb + 7, 677], fill=ACCENT)
        x += rail_w + 14
        text(x, 660, knob["value"], 17, INK, mono=True)
        continue
    text(x, 660, knob["value"], 17, INK, mono=True)
    x += width(knob["value"], 17, True) + 7
    if knob["unit"]:
        text(x, 661, knob["unit"], 16, MUTED)
        x += width(knob["unit"], 16) + 28
    else:
        x += 22

out = sys.argv[2]
os.makedirs(os.path.dirname(out), exist_ok=True)
img.save(out, "WEBP", quality=92, method=6)
print(f"{out}: {img.size[0]}x{img.size[1]} {os.path.getsize(out)} bytes")
