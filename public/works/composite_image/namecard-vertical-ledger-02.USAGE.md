# 随件说明 · 明衡记账事务所名片（`namecard-vertical-ledger-02`）

风格：竖版横线台账（`namecard-vertical-ledger`）｜竖幅双面拼版｜无彩

| 件 | 是什么 | 拿它做什么 |
|---|---|---|
| `namecard-vertical-ledger-02.json` | `oceanleo.design-document.v1` 工程文件 | **要改字段就改这一份**，改完重出像素 |
| `namecard-vertical-ledger-02.full.webp` | 1466 × 1134 全尺寸拼版像素 | 送印 / 存档 |
| `namecard-vertical-ledger-02.cover.webp` | 733 × 567 封面 | 货架上那一张 |

## 送印

- 单面成品 90 × 54 mm（本件是**竖版**，即 54 × 90 mm），含 3 mm 出血 → 60 × 96 mm。
- 300 dpi，单面 709 × 1134 px；拼版 = 正面 + 48 px 装订间隙 + 反面 = 1466 × 1134 px。
- 间隙里那枚圆点是套准标记，**裁切时一并去除**；灰底也只是为了让裁切边界看得见，不印。
- 安全边：距单面画布边 8 mm（95 px）以内不放关键信息。本件实测 30 个字段全部在安全边内，
  最紧的一行右侧还余 67.7 px（5.7 mm）。

## 可替换字段

正面 15 行、反面 15 行，都在工程文件的 `document.elements[].text` 上，改字即可：

- **机构**（`f-org`、`f-orgsub`）、**姓名**（`f-name`）、**职务**（`f-title`）、**业务口径**（`f-dept`）
- **联络四行**（`f-tel`／`f-mobile`／`f-mail`／`f-web`）——每行都自带字段名，
  **不要把字段名换成小图标**：几周后翻出来找电话的人是靠那两个字定位的。
- **地址与时间四行**（`f-addr`／`f-addr2`／`f-hours`／`f-hours2`）、**备注两行**（`f-note`／`f-note2`）
- **反面清单五项**，每项两行：业务名（`b-item1`…）与口径（`b-item1sub`…）

## 加减清单行要动什么

一项占两行文字 + 一条发丝线，纵向节距 114 px（42 + 42 + 发丝线与间隙）。

- **加一项**：把它下面的整组（含落款那条分区线与三行落款）往下顺移 114 px，
  并确认最后一行的底不越过 `1134 − 95 = 1039`。本件最后一行底在 969，**还能加半项，不够加一整项**——
  真要加第六项就得先把落款压到两行。
- **减一项**：整组往上顺移同样的量，不要留一段空带；这一版留白大到让人以为没排完就是破版。
- 改完重跑两步（下面的复现命令），别手改像素。

## 复现

```bash
export PATH="/host/usr/bin:$PATH"
cd /opt/cursor-workspaces/oceandino
W=docs/design-guides/composite_image/namecard/_workshop
# ① 工程文件（可再编辑的那一份）
node scripts/material-infra/assemblers/tools/project-json.mjs \
  --in $W/vertical-ledger-02-sheet.json \
  --out /root/projects/asset/public/works/composite_image/namecard-vertical-ledger-02.json --receipt -
# ② 像素（站内看到的那一件）
node scripts/material-infra/assemblers/tools/design-doc-raster.mjs \
  --in $W/vertical-ledger-02-raster.json \
  --out /root/projects/asset/public/works/composite_image --receipt -
```

## 字号档不是自己填的

工程文件里的字号来自载体的字号档（`annotations[].rung` × 画板短边）：
本件用到 `h1` / `h2` / `body` 三档 = 69 / 46 / 29 px = 5.84 / 3.89 / 2.46 mm。
**`caption` 一档没用**：在这个画板上它只有 19 px（1.63 mm，约 4.6 pt），
名片是手持一臂之内看的东西，联络信息落到那一档就是在赌对方眼睛好。

## 署名

版面、文字与配色：OceanLeo 第一方原创，CC0 1.0。
全文在工程文件的 `attribution.entries` 里，随件走，不用另找。
