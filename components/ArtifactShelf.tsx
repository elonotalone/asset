"use client";

import { useEffect, useRef, useState } from "react";
import { useUI } from "@oceanleo/ui/i18n";
import {
  artifactTypeHasEditor,
  listShelfArtifacts,
  SHELF_SITES,
  ShelfArtifact,
  shelfArtifactTypeLabel,
  shelfEditHref,
  shelfPreviewImageUrl,
  shelfSiteLabel,
} from "@/lib/assets";
import { ArtifactPreviewLayer } from "@/components/ArtifactPreviewLayer";

// 成品货架：素材站上唯一能看到「打得开、编得动的成品」的地方。
//
// 素材站自己在成品库里是 0 行，货架上每一件都来自**别的站**，所以「归属站」不是装饰
// 而是必需信息：它既解释了这件东西为什么在这儿，也是「编辑」那颗按钮要跳去哪的依据。
//
// 一次只查一个站（`?siteKey=`）。不是为了少写代码：不带 siteKey 的宽查询会被网关按
// 1000 行截断，而且全目录宽查询稳定撞上约 8 秒的硬闸返回 503。按站查实测 0.37 s。

const PAGE_SIZE = 24;

function SiteChips({
  active,
  onPick,
}: {
  active: string;
  onPick: (siteKey: string) => void;
}) {
  const tt = useUI();
  return (
    <div className="-mx-1 flex flex-wrap gap-1.5 px-1">
      {SHELF_SITES.map((s) => (
        <button
          key={s.key}
          type="button"
          onClick={() => onPick(s.key)}
          className={`rounded-full px-3 py-1 text-xs font-medium transition ${
            s.key === active
              ? "bg-sky-500 text-white"
              : "bg-white text-zinc-600 ring-1 ring-zinc-200 hover:bg-sky-50 hover:text-sky-700"
          }`}
        >
          {tt(s.label)}
        </button>
      ))}
    </div>
  );
}

function ShelfCard({
  item,
  onPreview,
}: {
  item: ShelfArtifact;
  onPreview: (item: ShelfArtifact) => void;
}) {
  const tt = useUI();
  const thumb = shelfPreviewImageUrl(item);
  // 两颗按钮的判定分开写，因为它们说的是两件不同的事：类型没有已发布编辑器（用户该
  // 知道是这一类没有），与这件成品缺归属 app / 归属站不在名册里（链接落不了地）。
  // 后者是数据缺口，不该说成「这类不能编辑」。
  const typeHasEditor = artifactTypeHasEditor(item.artifactType);
  const editHref = typeHasEditor ? shelfEditHref(item) : "";

  return (
    <div className="group flex flex-col overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
      <button
        type="button"
        onClick={() => onPreview(item)}
        className="relative aspect-[4/3] w-full overflow-hidden bg-zinc-100 focus:outline-none focus:ring-2 focus:ring-sky-400"
        aria-label={tt("全屏预览：{title}", { title: item.title })}
      >
        {thumb ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={thumb}
            alt={item.title}
            loading="lazy"
            className="h-full w-full object-cover transition group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-xs text-zinc-400">
            {tt("无预览图")}
          </div>
        )}
        <span className="absolute left-2 top-2 rounded-full bg-black/55 px-2 py-0.5 text-[10px] font-medium text-white backdrop-blur">
          {tt(shelfSiteLabel(item.siteKey))}
        </span>
        <span className="absolute right-2 top-2 rounded-full bg-white/90 px-2 py-0.5 text-[10px] font-medium text-zinc-600">
          {tt(shelfArtifactTypeLabel(item.artifactType))}
        </span>
      </button>

      <div className="flex min-w-0 flex-1 flex-col gap-0.5 px-3 pt-2">
        <span className="truncate text-sm font-medium text-zinc-800">{item.title}</span>
        {item.summary && (
          <span className="line-clamp-2 text-xs leading-snug text-zinc-500">
            {item.summary}
          </span>
        )}
      </div>

      <div className="flex items-center gap-2 px-3 pb-2.5 pt-2">
        <button
          type="button"
          onClick={() => onPreview(item)}
          className="rounded-lg bg-sky-500 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-sky-600"
        >
          {tt("预览")}
        </button>
        {editHref ? (
          <a
            href={editHref}
            target="_blank"
            rel="noopener noreferrer"
            title={tt("到 {site} 的工作台里打开这份素材", {
              site: tt(shelfSiteLabel(item.siteKey)),
            })}
            className="rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-700 transition hover:border-sky-300 hover:bg-sky-50 hover:text-sky-700"
          >
            {tt("去编辑")} ↗
          </a>
        ) : (
          // 不画一颗点了没有编辑器接住的按钮。说清是哪一种缺口，不含糊成「不可编辑」。
          <span className="text-[11px] text-zinc-400">
            {typeHasEditor
              ? tt("这一件缺归属信息，暂时打不开编辑入口")
              : tt("这一类还没有已发布的编辑器，只能预览")}
          </span>
        )}
      </div>
    </div>
  );
}

export function ArtifactShelf() {
  const tt = useUI();
  const [siteKey, setSiteKey] = useState(SHELF_SITES[0].key);
  const [items, setItems] = useState<ShelfArtifact[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [shown, setShown] = useState(PAGE_SIZE);
  const [active, setActive] = useState<ShelfArtifact | null>(null);
  const reqId = useRef(0);

  useEffect(() => {
    const id = ++reqId.current;
    setLoading(true);
    setError("");
    setShown(PAGE_SIZE);
    listShelfArtifacts(siteKey)
      .then((rows) => {
        if (reqId.current !== id) return;
        setItems(rows);
        setLoading(false);
      })
      .catch((e: unknown) => {
        if (reqId.current !== id) return;
        setItems([]);
        setError(e instanceof Error ? e.message : "加载失败");
        setLoading(false);
      });
  }, [siteKey]);

  const visible = items.slice(0, shown);
  const editable = items.filter((i) => artifactTypeHasEditor(i.artifactType)).length;

  return (
    <section className="mb-8 rounded-2xl border border-zinc-200 bg-white/70 p-4">
      <div className="mb-3">
        <h2 className="text-base font-semibold text-zinc-900">{tt("成品货架")}</h2>
        <p className="mt-1 text-xs leading-relaxed text-zinc-500">
          {tt(
            "上面是可下载的素材原件，这里是各站已经发布出来的成品：文档、表格、图表、PDF 这类打得开的东西。素材站自己还没有成品，货架上每一件都标了它属于哪个站——「去编辑」就是跳回那个站的工作台。",
          )}
        </p>
      </div>

      <SiteChips active={siteKey} onPick={setSiteKey} />

      <p className="mt-3 text-xs text-zinc-500">
        {loading
          ? tt("正在读取 {site} 的成品…", { site: tt(shelfSiteLabel(siteKey)) })
          : error
            ? ""
            : tt("{site} 共 {total} 件，其中 {editable} 件可以去编辑，其余只能预览。", {
                site: tt(shelfSiteLabel(siteKey)),
                total: String(items.length),
                editable: String(editable),
              })}
      </p>

      {error ? (
        <p className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
          {error}
        </p>
      ) : !loading && items.length === 0 ? (
        <p className="mt-3 text-xs text-zinc-500">
          {tt("这个站目前没有已发布的成品。")}
        </p>
      ) : (
        <>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {visible.map((item) => (
              <ShelfCard key={item.id} item={item} onPreview={setActive} />
            ))}
          </div>
          {shown < items.length && (
            <div className="mt-4 text-center">
              <button
                type="button"
                onClick={() => setShown((n) => n + PAGE_SIZE)}
                className="rounded-lg border border-zinc-300 px-4 py-2 text-sm text-zinc-600 transition hover:bg-zinc-50"
              >
                {tt("显示更多（还有 {rest} 件）", {
                  rest: String(items.length - shown),
                })}
              </button>
            </div>
          )}
        </>
      )}

      {active && (
        <ArtifactPreviewLayer item={active} onClose={() => setActive(null)} />
      )}
    </section>
  );
}
