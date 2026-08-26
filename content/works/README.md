# 精选成品清单（`content/works/`）

每份 JSON 对应一个 `artifactType`，字段形状照抄现有 `document.json` 条目，
**不要自创字段**。装载器在 `lib/works.ts`：坏的一条跳过，页面不崩。

公共字段（每一条都要有）：

| 字段 | 含义 |
|---|---|
| `id` | 站内主键，`^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$` |
| `artifactType` | 14 类之一，且必须与文件名一致 |
| `title` | 上屏标题 |
| `styleId` | 对应设计指南文件名 |
| `summary` | 一句话 |
| `cover` | 站内绝对路径，文件必须在 `public/` 下真实存在 |
| `view.kind` | `VIEW_KINDS` 表里的一档 |
| `view.src` | 站内绝对路径，指向 `public/works/<type>/…` |
| `view.download` | 可下载时给；与 `src` 可以相同 |
| `downloadable` | 只认显式 `true` |
| `attribution` | 非空；每条至少有 `text` |

`workflow` / `readings` 可选。`sourceFile` 由装载器补，清单里不要写。

## `composite_image` 怎么填

`content/works/composite_image.json` **现在必须是空数组**。稿定来源的包
`internal-reference-only`，不能上架。D 链（`ol-*` 骨架洗白）与 F 链（`OLP-*`
PSD 洗白）产出之后，由父代理跑本仓的登记 CLI 追加，**不要手写一条空壳进去**。

字节落点（相对本仓根）：

```
public/works/composite_image/<id>.<ext>          # 主文件（png / webp / json …）
public/works/composite_image/<id>.cover.webp     # 列表封面
```

清单里对应：

```
cover = /works/composite_image/<id>.cover.webp
view.src = /works/composite_image/<id>.<ext>
view.download = 同上（可下载时）
view.kind = image            # 渲染成品图（F 的 PNG、D 的出图）
           或 design-document # 若主文件是 oceanleo.design-document.v1 的 json
```

族归属（列表页再分一层）看 `components/WorksKinds.tsx` 的 `MATERIAL_FAMILIES.composite_image`：
`resume` / `logo` / `xhs` / `namecard`。新件按 `styleId` / `id` 前缀或 `workflow.id`
的场景段落族；对不上的进「其他设计稿」。

简历族目前读的是 `composite_image.json` 这份主清单。LOGO / 小红书 / 名片各有
旁路文件（`composite_image.logo.json` 等），那些也是空数组，同样等真产出。

## 登记 CLI

```
node scripts/register-work.mjs \
  --meta /path/to/meta.json \
  --file /path/to/bytes.png \
  [--cover /path/to/cover.png] \
  [--type composite_image]
```

`meta.json` 必须同时满足：

1. `all_slots_replaced === true`（布尔，字符串 `"true"` 不行）
2. `provenance.kind === "geometry-only"`
3. 整份 JSON 任意深度都没有 `license.status === "internal-reference-only"`

三条任一不满足就拒绝，退出码 1，仓内一个文件都不写。稿定来源的东西
永远进不了这个仓。同 `id` 再跑一次是覆盖，不追加。
