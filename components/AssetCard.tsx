"use client";

import { Asset } from "@/lib/assets";
import { LicenseBadge } from "@/components/LicenseBadge";

function fmtDuration(sec: number | null): string {
  if (!sec || sec <= 0) return "";
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

function PlayGlyph() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M8 5v14l11-7z" />
    </svg>
  );
}

function CubeGlyph() {
  return (
    <svg className="h-10 w-10 opacity-60" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
      <path d="M12 2l9 5v10l-9 5-9-5V7l9-5z" strokeLinejoin="round" />
      <path d="M12 12l9-5M12 12v10M12 12L3 7" strokeLinejoin="round" />
    </svg>
  );
}

function BookmarkGlyph({ filled }: { filled: boolean }) {
  return (
    <svg
      className="h-4 w-4"
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth="1.8"
      aria-hidden
    >
      <path d="M6 4h12v16l-6-4-6 4z" strokeLinejoin="round" />
    </svg>
  );
}

export function AssetCard({
  asset,
  onOpen,
  saved,
  onToggleSave,
}: {
  asset: Asset;
  onOpen: (a: Asset) => void;
  saved?: boolean;
  onToggleSave?: (a: Asset) => void;
}) {
  const isMedia = asset.type === "audio" || asset.type === "music";
  const isVideo = asset.type === "video";
  const is3d = asset.type === "3d";

  return (
    <div className="group relative flex flex-col overflow-hidden rounded-xl border border-zinc-200 bg-white text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
      <button
        onClick={() => onOpen(asset)}
        className="flex flex-col text-left focus:outline-none focus:ring-2 focus:ring-sky-400"
      >
        <div className="relative aspect-[4/3] w-full overflow-hidden bg-zinc-100">
          {asset.thumb_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={asset.thumb_url}
              alt={asset.title}
              loading="lazy"
              className="h-full w-full object-cover transition group-hover:scale-105"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-zinc-400">
              {is3d ? <CubeGlyph /> : <span className="text-xs">无预览</span>}
            </div>
          )}

          {(isVideo || isMedia) && (
            <span className="absolute left-2 top-2 inline-flex items-center justify-center rounded-full bg-black/55 p-1.5 text-white backdrop-blur">
              <PlayGlyph />
            </span>
          )}
          {asset.duration ? (
            <span className="absolute bottom-2 right-2 rounded bg-black/65 px-1.5 py-0.5 text-[10px] font-medium text-white">
              {fmtDuration(asset.duration)}
            </span>
          ) : null}
          <span className="absolute right-2 top-2">
            <LicenseBadge license={asset.license} />
          </span>
        </div>

        <div className="flex min-w-0 flex-col gap-0.5 px-3 py-2">
          <span className="truncate text-sm font-medium text-zinc-800">{asset.title}</span>
          <span className="truncate text-xs text-zinc-500">
            {asset.author} · {asset.source}
          </span>
        </div>
      </button>

      {/* 收藏：悬浮在左下角，点击不触发放大。已收藏=实心 + 高亮。 */}
      {onToggleSave && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onToggleSave(asset);
          }}
          title={saved ? "从我的素材库移除" : "收藏到我的素材库"}
          className={`absolute bottom-12 left-2 inline-flex items-center justify-center rounded-full p-1.5 backdrop-blur transition ${
            saved
              ? "bg-sky-500 text-white"
              : "bg-black/45 text-white opacity-0 group-hover:opacity-100"
          }`}
        >
          <BookmarkGlyph filled={!!saved} />
        </button>
      )}
    </div>
  );
}
