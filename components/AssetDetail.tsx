"use client";

import {
  useEffect,
  useState,
  useSyncExternalStore,
} from "react";
import { createPortal } from "react-dom";
import { useUI } from "@oceanleo/ui/i18n";
import { Asset, assetDetail, downloadHref, pptPageUrls } from "@/lib/assets";
import {
  assetFileName,
  assetFormat,
  dimensionLabel,
  formatByteSize,
  officialDocNumbers,
} from "@/lib/asset-file-meta";
import { LicenseFlags } from "@/components/LicenseBadge";
import { ModelViewer } from "@/components/ModelViewer";
import { AssetProvenance } from "@/components/AssetProvenance";

const subscribeToHydration = () => () => {};

function is3dModel(asset: Asset): boolean {
  if (asset.type !== "3d") return false;
  const u = (asset.full_url || "").toLowerCase();
  return u.endsWith(".gltf") || u.endsWith(".glb");
}

// 交互式图表（pyecharts 生成的 HTML，type="chart" / format="html"）。full_url 是
// 可交互 HTML 的 OSS 直链，直接塞进 iframe 就能在弹窗里悬停/缩放。
function isChartAsset(asset: Asset): boolean {
  return asset.type === "chart" && !!asset.full_url;
}

// 放大图：先用已加载好的缩略图秒显占位，原始大图后台加载完再淡入替换。
// 解决「点开后白屏 / 转圈很久」——尤其是 preview_url 对部分源是几 MB 的大图。
function ZoomImage({ thumb, full, alt }: { thumb: string; full: string; alt: string }) {
  const tt = useUI();
  const [loaded, setLoaded] = useState(false);
  const src = full || thumb;
  return (
    <div className="relative flex max-h-[50vh] w-full items-center justify-center">
      {thumb && !loaded && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={thumb}
          alt=""
          aria-hidden
          className="max-h-[50vh] w-full scale-105 object-contain blur-md"
        />
      )}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        onLoad={() => setLoaded(true)}
        className={`max-h-[50vh] w-full object-contain transition-opacity duration-300 ${
          loaded ? "opacity-100" : "absolute inset-0 opacity-0"
        }`}
      />
      {thumb && !loaded && (
        <span className="absolute bottom-2 right-2 rounded bg-black/55 px-2 py-0.5 text-[11px] text-white">
          {tt("高清加载中…")}
        </span>
      )}
    </div>
  );
}

// PPT 模板专用预览：整页大图 + 底部页缩略条翻阅（p01..pN 命名约定，见 lib/assets.ts）。
function PptPager({ asset }: { asset: Asset }) {
  const tt = useUI();
  const pages = pptPageUrls(asset);
  const [idx, setIdx] = useState(0);
  if (pages.length === 0) {
    return <ZoomImage thumb={asset.thumb_url} full={asset.preview_url} alt={asset.title} />;
  }
  return (
    <div className="flex flex-col gap-2 p-3">
      <div className="relative w-full overflow-hidden rounded-lg border border-zinc-200 bg-white">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={pages[idx]} alt={tt("{title} 第 {n} 页", { title: asset.title, n: idx + 1 })} className="aspect-video w-full object-contain" />
        <span className="absolute bottom-2 right-2 rounded bg-black/55 px-2 py-0.5 text-[11px] text-white">
          {idx + 1} / {pages.length}
        </span>
      </div>
      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {pages.map((u, i) => (
          <button
            key={u}
            onClick={() => setIdx(i)}
            className={`shrink-0 overflow-hidden rounded border-2 transition ${
              i === idx ? "border-sky-500" : "border-transparent opacity-70 hover:opacity-100"
            }`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={u} alt="" loading="lazy" className="aspect-video w-20 object-cover" />
          </button>
        ))}
      </div>
    </div>
  );
}

// 图表专用预览：在 iframe 里加载可交互 HTML，未加载完先用静态封面兜底（避免白屏）。
// sandbox 只放行脚本（图表要跑 echarts JS）——不给同源，隔离掉对宿主页面的访问。
//
// UC-3（docs/architecture/oceanleo-untrusted-content-isolation.md §8.3）：
// full_url 不是第一方白名单。「我的素材库」把整个 asset 快照原样 POST 到
// /v1/assets/collection 再原样取回（backend supa.collection_add 存的就是请求体），
// 后端只校验 https / 无凭据 / 443 端口，**主机名完全由调用方决定**——包括
// asset.oceanleo.com 自身。加上 allow-same-origin 后，这个 iframe 会回到宿主
// origin：既能读 Domain=.oceanleo.com 且非 httpOnly 的 SSO cookie，也能自己摘掉
// sandbox 属性再重载。图表只需要跑 JS，不需要同源能力，因此只给 allow-scripts。
function ChartFrame({ asset }: { asset: Asset }) {
  const tt = useUI();
  const [loaded, setLoaded] = useState(false);
  const cover = asset.preview_url || asset.thumb_url;
  return (
    <div className="relative w-full bg-white">
      {cover && !loaded && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={cover}
          alt=""
          aria-hidden
          className="absolute inset-0 h-full w-full object-contain"
        />
      )}
      <iframe
        src={asset.full_url}
        title={asset.title}
        loading="lazy"
        onLoad={() => setLoaded(true)}
        sandbox="allow-scripts"
        className={`h-[600px] w-full border-0 transition-opacity duration-300 ${
          loaded ? "opacity-100" : "opacity-0"
        }`}
      />
      {cover && !loaded && (
        <span className="absolute bottom-2 right-2 rounded bg-black/55 px-2 py-0.5 text-[11px] text-white">
          {tt("图表加载中…")}
        </span>
      )}
    </div>
  );
}

function DocGlyph() {
  return (
    <svg className="mx-auto h-16 w-16 text-zinc-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
      <path d="M7 3h8l5 5v13H7zM15 3v5h5M9 12h6M9 16h4" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

/**
 * 文档没有 width/height/duration，不能走 ZoomImage（会把 .doc/.pdf 当图片加载），
 * 也不能把空的宽高直接拼进尺寸行。退化成文件名 + 格式 + 大小 + 编号。
 */
function DocumentPreview({ asset }: { asset: Asset }) {
  const tt = useUI();
  const name = assetFileName(asset);
  const format = assetFormat(asset);
  const size = formatByteSize(asset.file_size);
  const nos = officialDocNumbers(asset.tags);
  return (
    <div className="flex flex-col gap-4 p-6">
      {asset.thumb_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={asset.thumb_url} alt="" className="mx-auto max-h-40 object-contain" />
      ) : (
        <DocGlyph />
      )}
      <dl className="grid gap-2 text-sm">
        <div className="flex gap-3">
          <dt className="w-14 shrink-0 text-xs uppercase tracking-wide text-zinc-400">{tt("文件名")}</dt>
          <dd className="min-w-0 break-all text-zinc-800">{name}</dd>
        </div>
        <div className="flex gap-3">
          <dt className="w-14 shrink-0 text-xs uppercase tracking-wide text-zinc-400">{tt("格式")}</dt>
          <dd className="text-zinc-800">{format ? format.toUpperCase() : tt("未标注")}</dd>
        </div>
        <div className="flex gap-3">
          <dt className="w-14 shrink-0 text-xs uppercase tracking-wide text-zinc-400">{tt("大小")}</dt>
          <dd className="text-zinc-800">{size || tt("未标注")}</dd>
        </div>
        {nos.length > 0 ? (
          <div className="flex gap-3">
            <dt className="w-14 shrink-0 text-xs uppercase tracking-wide text-zinc-400">{tt("编号")}</dt>
            <dd className="font-medium text-zinc-900">{nos.join(" · ")}</dd>
          </div>
        ) : null}
      </dl>
    </div>
  );
}

function CopyButton({ text, label }: { text: string; label?: string }) {
  const tt = useUI();
  const [done, setDone] = useState(false);
  return (
    <button
      onClick={() => {
        navigator.clipboard?.writeText(text).then(() => {
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        });
      }}
      className="rounded-md border border-zinc-300 px-2 py-1 text-xs text-zinc-600 hover:bg-zinc-50"
    >
      {done ? tt("已复制") : tt(label || "复制署名")}
    </button>
  );
}

export function AssetDetail({
  asset,
  onClose,
  saved,
  onToggleSave,
}: {
  asset: Asset;
  onClose: () => void;
  saved?: boolean;
  onToggleSave?: (a: Asset) => void;
}) {
  const tt = useUI();
  const [files, setFiles] = useState<{ format: string; url: string }[] | null>(null);
  // getServerSnapshot=false keeps SSR and the hydration pass identical; once
  // hydrated, React re-reads getSnapshot and the portal can safely target body.
  const mounted = useSyncExternalStore(subscribeToHydration, () => true, () => false);

  useEffect(() => {
    // Only realtime-upstream polyhaven assets need the second files lookup; our
    // own library items (id `library:…`) are fully self-contained on OSS.
    if (asset.source === "polyhaven" && !asset.id.startsWith("library:")) {
      assetDetail(asset.id)
        .then((d) => setFiles(d.files || []))
        .catch(() => setFiles([]));
    }
  }, [asset]);

  // 打开时锁 body 滚动，避免弹窗背后页面还能滚动。
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const isAudio = asset.type === "audio" || asset.type === "music";
  const isVideo = asset.type === "video";
  const is3d = is3dModel(asset);
  const isChart = isChartAsset(asset);
  const isPpt = asset.type === "ppt" && asset.id.startsWith("library:");
  const isDocument = asset.type === "document";
  const dims = dimensionLabel(asset.width, asset.height);
  // PPT 模板的 source_url 按落库约定指向网页版 deck.html。
  const pptHtmlUrl =
    isPpt && asset.source_url.endsWith(".html") ? asset.source_url : "";

  if (!mounted) return null;

  // 通过 portal 挂到 <body>，让弹窗脱离外壳的 .v-page（带 transform 的入场动画）
  // 祖先——否则 position:fixed 会相对那个 transform 祖先定位，弹窗被推到页面中段、
  // 要往下滚才能看见。挂到 body 后 fixed 真正相对视口，永远居中。
  return createPortal(
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-zinc-200 px-5 py-3">
          <h2 className="truncate pr-4 text-base font-semibold text-zinc-800">{asset.title}</h2>
          <button onClick={onClose} className="rounded-full p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700">
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          <div className="overflow-hidden rounded-xl bg-zinc-100">
            {isChart ? (
              <ChartFrame asset={asset} />
            ) : isPpt ? (
              <PptPager asset={asset} />
            ) : isDocument ? (
              <DocumentPreview asset={asset} />
            ) : is3d ? (
              <ModelViewer src={asset.full_url} poster={asset.thumb_url} alt={asset.title} />
            ) : isAudio ? (
              <div className="flex flex-col gap-3 p-6">
                {asset.thumb_url && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={asset.thumb_url} alt="" className="h-24 w-full rounded object-contain" />
                )}
                <audio controls src={asset.preview_url} className="w-full" />
              </div>
            ) : isVideo ? (
              <video controls poster={asset.thumb_url} src={asset.preview_url} className="max-h-[50vh] w-full" />
            ) : (
              <ZoomImage thumb={asset.thumb_url} full={asset.preview_url || asset.thumb_url} alt={asset.title} />
            )}
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <p className="text-xs uppercase tracking-wide text-zinc-400">{tt("作者 / 来源")}</p>
              <p className="mt-1 text-sm text-zinc-800">{asset.author}</p>
              {pptHtmlUrl ? (
                <a href={pptHtmlUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-sky-600 hover:underline">
                  {tt("打开网页版（HTML）")} ↗
                </a>
              ) : isChart ? (
                <a href={asset.source_url || asset.full_url} target="_blank" rel="noopener noreferrer" className="text-xs text-sky-600 hover:underline">
                  {tt("打开网页版（HTML）")} ↗
                </a>
              ) : null}
              {/* 通用出处链接已交给下方 <AssetProvenance/>。它对同一个 source_url 多做
                  两件这里做不到的事：自产素材的 source_url 指向内部 JSON，点开是下载
                  一个文件而不是看到出处，那一支要改指法务页；外部素材没有可跳转出处
                  时要明说「该来源未提供」，而不是留一个 href="" 的死链。
                  剩下的 pptHtmlUrl / isChart 两支不是出处，是「打开网页版」，留在原处。 */}
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-zinc-400">{tt("授权")}</p>
              <a href={asset.license.url} target="_blank" rel="noopener noreferrer" className="mt-1 block text-sm font-medium text-zinc-800 hover:underline">
                {asset.license.name}
              </a>
              <div className="mt-1.5">
                <LicenseFlags license={asset.license} />
              </div>
            </div>
          </div>

          {dims ? (
            <p className="mt-3 text-sm tabular-nums text-zinc-600">{dims}</p>
          ) : null}

          {/* 产权卡：这件素材是谁的、能不能拿走、用了要背什么义务。三个问题在一处
              回答，紧挨着上面的「作者 / 来源」与「授权」，不另开一屏。 */}
          <AssetProvenance asset={asset} />

          {asset.type === "prompt" && asset.prompt && (
            <div className="mt-4 rounded-xl border border-sky-200 bg-sky-50/70 px-4 py-3">
              <div className="mb-2 flex items-center justify-between gap-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-sky-700">
                  {tt("生成 Prompt")}
                </p>
                <CopyButton text={asset.prompt} label="复制 Prompt" />
              </div>
              <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-zinc-800">
                {asset.prompt}
              </p>
            </div>
          )}

          {asset.license.attribution_required && (
            <div className="mt-4 flex items-start justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
              <div className="min-w-0">
                <p className="text-xs font-medium text-amber-800">{tt("此素材需署名，使用时请保留：")}</p>
                <p className="mt-0.5 truncate text-xs text-amber-700">{asset.license.attribution_text}</p>
              </div>
              <CopyButton text={asset.license.attribution_text} />
            </div>
          )}

          {asset.source === "polyhaven" && files && files.length > 0 && (
            <div className="mt-4">
              <p className="text-xs uppercase tracking-wide text-zinc-400">{tt("可下载文件")}</p>
              <div className="mt-1 flex flex-wrap gap-2">
                {files.slice(0, 8).map((f, i) => (
                  <a key={i} href={f.url} target="_blank" rel="noopener noreferrer"
                     className="rounded-md border border-zinc-300 px-2 py-1 text-xs text-zinc-700 hover:bg-zinc-50">
                    {f.format || tt("文件")} ↓
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-zinc-200 px-5 py-3">
          <a
            href={downloadHref(asset)}
            target="_blank"
            rel="noopener noreferrer"
            download
            className="rounded-lg bg-sky-500 px-4 py-2 text-sm font-medium text-white hover:bg-sky-600"
          >
            {isPpt ? tt("下载 .pptx") : isChart ? tt("下载 HTML") : isDocument ? tt("下载文件") : tt("下载")}
          </a>
          {isChart && (
            <a
              href={asset.source_url || asset.full_url}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-lg border border-sky-300 bg-white px-4 py-2 text-sm font-medium text-sky-700 hover:bg-sky-50"
            >
              {tt("在新窗口打开")} ↗
            </a>
          )}
          {pptHtmlUrl && (
            <a
              href={pptHtmlUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-lg border border-sky-300 bg-white px-4 py-2 text-sm font-medium text-sky-700 hover:bg-sky-50"
            >
              {tt("网页版预览（HTML）")}
            </a>
          )}
          {onToggleSave && (
            <button
              type="button"
              onClick={() => onToggleSave(asset)}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition ${
                saved
                  ? "bg-sky-50 text-sky-700 ring-1 ring-sky-300 hover:bg-sky-100"
                  : "border border-zinc-300 text-zinc-700 hover:bg-zinc-50"
              }`}
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill={saved ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.8">
                <path d="M6 4h12v16l-6-4-6 4z" strokeLinejoin="round" />
              </svg>
              {saved ? tt("已收藏") : tt("收藏到我的素材库")}
            </button>
          )}
          <span className="text-xs text-zinc-500">
            {tt("下载后请按授权说明使用。")}
          </span>
        </div>
      </div>
    </div>,
    document.body,
  );
}
