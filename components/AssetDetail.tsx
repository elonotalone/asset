"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Asset, assetDetail, downloadHref, pptPageUrls } from "@/lib/assets";
import { LicenseFlags } from "@/components/LicenseBadge";
import { ModelViewer } from "@/components/ModelViewer";

function is3dModel(asset: Asset): boolean {
  if (asset.type !== "3d") return false;
  const u = (asset.full_url || "").toLowerCase();
  return u.endsWith(".gltf") || u.endsWith(".glb");
}

// 放大图：先用已加载好的缩略图秒显占位，原始大图后台加载完再淡入替换。
// 解决「点开后白屏 / 转圈很久」——尤其是 preview_url 对部分源是几 MB 的大图。
function ZoomImage({ thumb, full, alt }: { thumb: string; full: string; alt: string }) {
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
          高清加载中…
        </span>
      )}
    </div>
  );
}

// Where each asset type can be "used" downstream. URL hand-off only (every site
// shares SSO + the gateway), so no per-pair integration is needed.
const USE_TARGETS: Record<string, { label: string; site: string }[]> = {
  image: [
    { label: "PPT 里使用", site: "https://ppt.oceanleo.com" },
    { label: "图片编辑", site: "https://image.oceanleo.com" },
    { label: "在线设计", site: "https://design.oceanleo.com" },
  ],
  vector: [{ label: "在线设计", site: "https://design.oceanleo.com" }],
  sticker: [
    { label: "在线设计", site: "https://design.oceanleo.com" },
    { label: "图片编辑", site: "https://image.oceanleo.com" },
  ],
  font: [{ label: "在线设计", site: "https://design.oceanleo.com" }],
  ppt: [
    { label: "PPT 里使用", site: "https://ppt.oceanleo.com" },
    { label: "在线设计", site: "https://design.oceanleo.com" },
  ],
  video: [{ label: "视频工作室", site: "https://studio.oceanleo.com" }],
  audio: [
    { label: "视频工作室", site: "https://studio.oceanleo.com" },
    { label: "会议助手", site: "https://meeting.oceanleo.com" },
  ],
  music: [{ label: "视频工作室", site: "https://studio.oceanleo.com" }],
  "3d": [{ label: "3D 工作台", site: "https://3d.oceanleo.com" }],
};

// PPT 模板专用预览：整页大图 + 底部页缩略条翻阅（p01..pN 命名约定，见 lib/assets.ts）。
function PptPager({ asset }: { asset: Asset }) {
  const pages = pptPageUrls(asset);
  const [idx, setIdx] = useState(0);
  if (pages.length === 0) {
    return <ZoomImage thumb={asset.thumb_url} full={asset.preview_url} alt={asset.title} />;
  }
  return (
    <div className="flex flex-col gap-2 p-3">
      <div className="relative w-full overflow-hidden rounded-lg border border-zinc-200 bg-white">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={pages[idx]} alt={`${asset.title} 第 ${idx + 1} 页`} className="aspect-video w-full object-contain" />
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

function CopyButton({ text }: { text: string }) {
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
      {done ? "已复制" : "复制署名"}
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
  const [files, setFiles] = useState<{ format: string; url: string }[] | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

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
  const isPpt = asset.type === "ppt" && asset.id.startsWith("library:");
  // PPT 模板的 source_url 按落库约定指向网页版 deck.html。
  const pptHtmlUrl =
    isPpt && asset.source_url.endsWith(".html") ? asset.source_url : "";
  const targets = USE_TARGETS[asset.type] || [];

  function useIn(site: string) {
    const url = new URL(site);
    url.searchParams.set("asset_url", asset.full_url);
    url.searchParams.set("asset_type", asset.type);
    url.searchParams.set("asset_license", asset.license.code);
    if (asset.license.attribution_required) {
      url.searchParams.set("asset_credit", asset.license.attribution_text);
    }
    window.open(url.toString(), "_blank", "noopener");
  }

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
            {isPpt ? (
              <PptPager asset={asset} />
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
              <p className="text-xs uppercase tracking-wide text-zinc-400">作者 / 来源</p>
              <p className="mt-1 text-sm text-zinc-800">{asset.author}</p>
              {pptHtmlUrl ? (
                <a href={pptHtmlUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-sky-600 hover:underline">
                  打开网页版（HTML）↗
                </a>
              ) : (
                <a href={asset.source_url} target="_blank" rel="noopener noreferrer" className="text-xs text-sky-600 hover:underline">
                  在 {asset.source} 查看原始页面 ↗
                </a>
              )}
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-zinc-400">授权</p>
              <a href={asset.license.url} target="_blank" rel="noopener noreferrer" className="mt-1 block text-sm font-medium text-zinc-800 hover:underline">
                {asset.license.name}
              </a>
              <div className="mt-1.5">
                <LicenseFlags license={asset.license} />
              </div>
            </div>
          </div>

          {asset.license.attribution_required && (
            <div className="mt-4 flex items-start justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
              <div className="min-w-0">
                <p className="text-xs font-medium text-amber-800">此素材需署名，使用时请保留：</p>
                <p className="mt-0.5 truncate text-xs text-amber-700">{asset.license.attribution_text}</p>
              </div>
              <CopyButton text={asset.license.attribution_text} />
            </div>
          )}

          {asset.source === "polyhaven" && files && files.length > 0 && (
            <div className="mt-4">
              <p className="text-xs uppercase tracking-wide text-zinc-400">可下载文件</p>
              <div className="mt-1 flex flex-wrap gap-2">
                {files.slice(0, 8).map((f, i) => (
                  <a key={i} href={f.url} target="_blank" rel="noopener noreferrer"
                     className="rounded-md border border-zinc-300 px-2 py-1 text-xs text-zinc-700 hover:bg-zinc-50">
                    {f.format || "文件"} ↓
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
            {isPpt ? "下载 .pptx" : "下载"}
          </a>
          {pptHtmlUrl && (
            <a
              href={pptHtmlUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-lg border border-sky-300 bg-white px-4 py-2 text-sm font-medium text-sky-700 hover:bg-sky-50"
            >
              网页版预览（HTML）
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
              {saved ? "已收藏" : "收藏到我的素材库"}
            </button>
          )}
          {targets.map((t) => (
            <button
              key={t.site}
              onClick={() => useIn(t.site)}
              className="rounded-lg border border-sky-300 bg-sky-50 px-3 py-2 text-sm font-medium text-sky-700 hover:bg-sky-100"
            >
              {t.label} →
            </button>
          ))}
        </div>
      </div>
    </div>,
    document.body,
  );
}
