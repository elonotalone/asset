"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { useUI } from "@oceanleo/ui/i18n";
import {
  ShelfArtifact,
  shelfArtifactTypeLabel,
  shelfPreviewImageUrl,
  shelfSiteLabel,
} from "@/lib/assets";

const subscribeToHydration = () => () => {};

// 「预览」这颗按钮的全部内容：在素材站上**就地**把成品看完。
//
// 就地的意思是三条硬要求：不跳去别的站、不下载文件、不打开编辑器。所以这一层只做
// 一件事——把成品的预览渲染图铺满视口，让用户把它看清楚。不发任何写请求，不碰会话。
//
// 为什么是渲染图而不是把 .docx / .pdf 原件塞进 iframe：原件是 artifact 的 source
// rendition，取它要带凭据、要过下载闸，而且浏览器对 docx 只会触发下载——那正好违反
// 「不下载」这一条。成品库给每一件成品都备了一张服务端渲染好的预览图（`previewUrl`
// 那个 OSS key），它就是为「看」准备的。

export function ArtifactPreviewLayer({
  item,
  onClose,
}: {
  item: ShelfArtifact;
  onClose: () => void;
}) {
  const tt = useUI();
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  // 与 AssetDetail 同一套：SSR 与 hydration 首帧保持一致，之后才允许 portal 打到 body。
  const mounted = useSyncExternalStore(
    subscribeToHydration,
    () => true,
    () => false,
  );

  const src = shelfPreviewImageUrl(item);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  // 全屏层要能用 Esc 关掉，否则在没有可见滚动条的长图上用户会觉得自己被困住了。
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!mounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[95] flex flex-col bg-black/85"
      role="dialog"
      aria-modal="true"
      aria-label={tt("全屏预览：{title}", { title: item.title })}
      onClick={onClose}
    >
      <div
        className="flex shrink-0 items-start justify-between gap-4 px-5 py-3 text-white"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="min-w-0">
          <h2 className="truncate text-sm font-semibold">{item.title}</h2>
          <p className="mt-0.5 truncate text-xs text-white/60">
            {tt("{type} · 来自 {site}", {
              type: tt(shelfArtifactTypeLabel(item.artifactType)),
              site: tt(shelfSiteLabel(item.siteKey)),
            })}
          </p>
        </div>
        <button
          onClick={onClose}
          aria-label={tt("关闭预览")}
          className="shrink-0 rounded-full p-1.5 text-white/70 transition hover:bg-white/10 hover:text-white"
        >
          <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      {/* 图比视口高时这一层自己滚——长文档要能一路看到底，这才叫「看完」。 */}
      <div
        className="flex-1 overflow-auto px-5 pb-5"
        onClick={(e) => e.stopPropagation()}
      >
        {!src || failed ? (
          <div className="flex h-full items-center justify-center">
            <p className="max-w-md text-center text-sm text-white/70">
              {tt("这件成品还没有生成预览图，暂时无法在素材站上看完整内容。")}
            </p>
          </div>
        ) : (
          <div className="mx-auto max-w-5xl">
            {!loaded && (
              <div className="flex h-64 items-center justify-center text-sm text-white/60">
                {tt("预览加载中…")}
              </div>
            )}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={src}
              alt={item.title}
              width={item.width || undefined}
              height={item.height || undefined}
              onLoad={() => setLoaded(true)}
              onError={() => setFailed(true)}
              className={`w-full rounded-lg bg-white shadow-2xl ${loaded ? "" : "hidden"}`}
            />
          </div>
        )}
      </div>

      {item.summary && (
        <div
          className="shrink-0 border-t border-white/10 px-5 py-3"
          onClick={(e) => e.stopPropagation()}
        >
          <p className="mx-auto max-w-5xl text-xs leading-relaxed text-white/70">
            {item.summary}
          </p>
        </div>
      )}
    </div>,
    document.body,
  );
}
