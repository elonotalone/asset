"use client";

import { useCallback, useEffect, useState } from "react";
import { Asset, listCollection, removeFromCollection } from "@/lib/assets";
import { AssetCard } from "@/components/AssetCard";
import { AssetDetail } from "@/components/AssetDetail";
import { browserClient } from "@/lib/oceanleo-auth";

export function MyCollection() {
  const [items, setItems] = useState<Asset[] | null>(null);
  const [error, setError] = useState("");
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [active, setActive] = useState<Asset | null>(null);

  useEffect(() => {
    const c = browserClient();
    if (!c) {
      setAuthed(false);
      return;
    }
    void c.auth.getUser().then(({ data }) => setAuthed(!!data.user));
  }, []);

  const reload = useCallback(() => {
    listCollection()
      .then((r) => setItems(r.items))
      .catch((e) => {
        setError(e instanceof Error ? e.message : "加载失败");
        setItems([]);
      });
  }, []);

  useEffect(() => {
    if (authed) reload();
  }, [authed, reload]);

  const remove = useCallback((a: Asset) => {
    setItems((prev) => (prev ? prev.filter((x) => x.id !== a.id) : prev));
    removeFromCollection(a.id).catch(() => reload());
  }, [reload]);

  return (
    <div className="mx-auto max-w-6xl px-5 py-6 sm:py-8">
      <header className="mb-5">
        <h1 className="text-2xl font-semibold text-zinc-900">我的素材库</h1>
        <p className="mt-1 text-sm text-zinc-500">
          你从素材库里收藏的素材都在这里。收藏只保存素材信息（不下载到服务器），随时点开浏览、下载或拿去创作。
        </p>
      </header>

      {authed === false ? (
        <div className="rounded-xl border border-dashed border-zinc-300 py-16 text-center text-sm text-zinc-400">
          请先登录 OceanLeo 账号，登录后即可在这里看到你收藏的素材。
        </div>
      ) : error ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>
      ) : items === null ? (
        <div className="py-8 text-center text-sm text-zinc-400">加载中…</div>
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-300 py-16 text-center text-sm text-zinc-400">
          还没有收藏任何素材。去素材库逛逛，点卡片左下角的书签即可收藏。
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {items.map((a) => (
            <AssetCard key={a.id} asset={a} onOpen={setActive} saved onToggleSave={remove} />
          ))}
        </div>
      )}

      {active && (
        <AssetDetail
          asset={active}
          onClose={() => setActive(null)}
          saved={items?.some((x) => x.id === active.id)}
          onToggleSave={remove}
        />
      )}
    </div>
  );
}
