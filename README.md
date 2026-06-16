# asset.oceanleo.com — OceanLeo 素材库

免费 · 开源授权的素材库门户：图片 / 矢量 / 视频 / 音乐 / 音效 / 3D。
浏览后可直接下载，或一键带入 PPT / 设计 / 视频 / 3D 等创作工具。

## 架构

瘦前端客户端（Next.js 16 + `@oceanleo/ui`），所有素材搜索 / 详情 / 下载逻辑都在
统一网关 `api.oceanleo.com` 的 `/v1/assets/*` 路由里 —— 本站不持有任何素材源
的 API key，也不重复实现搜索逻辑。其他创作站通过同一组路由复用同一批素材。

后端 + 授权归一化设计见 oceandino 仓库
`docs/architecture/oceanleo-asset-library.md`。

## 素材源（6 个，全部开源授权）

| 来源 | 类型 | 授权 |
|---|---|---|
| Openverse | 图片 / 矢量 | CC0 / CC-BY 系列 |
| Pexels | 图片 / 视频 | Pexels License |
| Pixabay | 图片 / 视频 | Pixabay Content License |
| Poly Haven | 3D / HDRI / 贴图 | CC0 |
| Freesound | 音效 | CC0 / CC-BY 系列 |
| Jamendo | 音乐 | CC 系列（NC/ND 已默认过滤） |

库内默认只展示「可商用」素材；授权归一化把六种不同的授权字段统一成
`commercial_ok / modify_ok / attribution_required` 三个标志位供筛选。

## 本地开发

```bash
pnpm install
pnpm dev
```

环境变量：`NEXT_PUBLIC_GATEWAY_URL`（默认 `https://api.oceanleo.com`）。

## 部署

push 到 `elonotalone/asset` main → Vercel（`sin1`）自动部署，域名
`asset.oceanleo.com`（CNAME → vercel-dns）。
