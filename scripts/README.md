# asset 站脚本

## 模板缩略图管线（真实首屏截图）

`/templates` 网格里每张卡的缩略图 = 该模板 `/templates/<slug>` 整页 HTML 的
**真实首屏截图**（对标稿定 / 云·速成美站，让用户直接看到模板长什么样）。

单一事实源：`lib/template-thumb-url.ts`
- `templateThumbUrl(slug)` → OSS webp 直链（前端 `components/TemplateThumb.tsx` 用）
- `THUMB_VERSION` → 缓存击穿版本号，**每次重跑管线后 +1**

### 重新生成（引擎改版 / 换图源后）

两段，各用对的环境：

1. 本机（有 `playwright` + `sharp`）——截图 + 转 webp：

   ```bash
   cd /root/projects/asset
   node scripts/gen-template-thumbs.mjs                # 全部（slug 从线上网格提取）
   node scripts/gen-template-thumbs.mjs --slugs=a-1,b-2  # 只补指定
   # 产物：scripts/.thumb-out/<slug>.webp（800x600，4:3），可断点续跑
   ```

2. lucy 容器（有 `oss2` + OSS 凭证）——上传公有读：

   ```bash
   docker cp scripts/.thumb-out oceandino-lucy-service:/tmp/tt
   docker exec oceandino-lucy-service \
     python3 /app/scripts/asset_ingest/upload_template_thumbs.py --dir /tmp/tt
   # 产物：OSS assets/template-thumb/<slug>.webp
   ```

3. 把 `lib/template-thumb-url.ts` 的 `THUMB_VERSION` +1，提交推送。

> slug 清单来源 = 线上 `/templates` 网格实际渲染出的所有卡片链接，
> 与部署站零漂移（不在脚本里重算 taxonomy 的 `countForSub` 裁剪逻辑）。

上传脚本源：`lucy-service/scripts/asset_ingest/upload_template_thumbs.py`
（与其它 asset-ingest 上传脚本同目录、同凭证路径）。
