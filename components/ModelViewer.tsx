"use client";

import { useEffect, useState } from "react";

// Google <model-viewer> web component, lazy-loaded once from the official CDN.
// We only pull the ~0.5 MB module when a user actually opens a 3D asset, so the
// rest of the library stays light. The component is a custom element, so React
// just renders the tag once the script registers it.
const MV_SRC =
  "https://unpkg.com/@google/model-viewer@4.0.0/dist/model-viewer.min.js";

let mvPromise: Promise<void> | null = null;

function loadModelViewer(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.customElements?.get("model-viewer")) return Promise.resolve();
  if (mvPromise) return mvPromise;
  mvPromise = new Promise<void>((resolve, reject) => {
    const s = document.createElement("script");
    s.type = "module";
    s.src = MV_SRC;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("model-viewer load failed"));
    document.head.appendChild(s);
  });
  return mvPromise;
}

export function ModelViewer({
  src,
  poster,
  alt,
}: {
  src: string;
  poster?: string;
  alt?: string;
}) {
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    loadModelViewer()
      .then(() => alive && setReady(true))
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, []);

  if (failed) {
    return (
      <div className="flex h-[50vh] w-full items-center justify-center text-sm text-zinc-400">
        3D 预览加载失败，可点下方「下载」获取模型文件。
      </div>
    );
  }

  if (!ready) {
    return (
      <div className="relative flex h-[50vh] w-full items-center justify-center bg-zinc-100">
        {poster && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={poster} alt="" className="max-h-full max-w-full object-contain opacity-60" />
        )}
        <span className="absolute bottom-2 right-2 rounded bg-black/55 px-2 py-0.5 text-[11px] text-white">
          3D 加载中…
        </span>
      </div>
    );
  }

  // model-viewer is a registered custom element at this point.
  return (
    // @ts-expect-error -- custom element provided by the @google/model-viewer module
    <model-viewer
      src={src}
      poster={poster}
      alt={alt}
      camera-controls
      auto-rotate
      shadow-intensity="1"
      exposure="1"
      style={{ width: "100%", height: "50vh", backgroundColor: "#f4f4f5" }}
    />
  );
}
