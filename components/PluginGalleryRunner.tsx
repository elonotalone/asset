"use client";

import { useState } from "react";
import { useUI } from "@oceanleo/ui/i18n";
import { pluginRuntimeSrc, type PluginEntry } from "@/lib/plugin-gallery";

// 工具的**试用位**：不是截图、不是录屏，是那件工具本人在受限 frame 里跑。
//
// 安全形状（改这里之前先跑 scripts/oceanleo-security-gate.sh）：
//   · sandbox 只给 allow-scripts。**绝不与 allow-same-origin 同现**（UC-3）。
//     两个 token 同现时 frame 内的脚本能自己摘掉 sandbox 再重载，沙箱等于没有。
//     这个属性写成**字面量**而不是常量引用：跨仓扫描把「算出来的 sandbox 值」单列一档
//     （UC-3-IFRAME-DYNAMIC-SANDBOX），字面量才能让人一眼看完就判完。
//   · 不用 srcdoc。srcdoc 的文档继承父页面的 origin，域隔离当场作废。
//   · 不开 postMessage 通道。没有通道就没有「父页面替 frame 发请求」这种通用代理面
//     （隔离文档 §7.3）。要尺寸自适应就固定高度，不值当为此开一条消息通道。
//   · allow-popups / allow-top-navigation 一个都不给：工具没有理由把用户带走。

export function PluginGalleryRunner({
  item,
  entryPath,
}: {
  item: PluginEntry;
  /** 实例入口地址；货架上没有实物时给 null。读盘的活在 server component 里做完了。 */
  entryPath: string | null;
}) {
  const tt = useUI();
  const [reloadKey, setReloadKey] = useState(0);

  if (!entryPath) {
    return (
      <section className="rounded-2xl border border-dashed border-zinc-300 bg-white p-5">
        <h2 className="text-sm font-semibold text-zinc-900">{tt("在这里试用")}</h2>
        <p className="mt-2 text-sm leading-7 text-zinc-500">
          {tt(
            "这件工具还没有可运行的实物上架，所以这一格是空的。下面写的是它要做成什么样，不是它已经能用。",
          )}
        </p>
      </section>
    );
  }

  return (
    <section className="overflow-hidden rounded-2xl bg-white shadow-sm">
      <div className="flex flex-wrap items-center gap-3 border-b border-zinc-100 px-5 py-3">
        <h2 className="text-sm font-semibold text-zinc-900">{tt("在这里试用")}</h2>
        <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700 ring-1 ring-emerald-200">
          {tt("真的能用")}
        </span>
        <button
          type="button"
          onClick={() => setReloadKey((n) => n + 1)}
          className="ml-auto rounded-full bg-zinc-100 px-3 py-1 text-xs text-zinc-600 transition hover:bg-zinc-200"
        >
          {tt("重来一次")}
        </button>
      </div>
      <iframe
        key={reloadKey}
        src={pluginRuntimeSrc(entryPath)}
        title={tt(item.name)}
        sandbox="allow-scripts"
        referrerPolicy="no-referrer"
        loading="lazy"
        className="h-[560px] w-full border-0 bg-white"
      />
      <p className="border-t border-zinc-100 px-5 py-3 text-xs leading-6 text-zinc-500">
        {tt(
          "这一格里跑的是工具本身，输进去的东西只留在你的浏览器里：它被关在受限沙箱中，读不到你的登录状态，也没有任何回传通道。",
        )}
      </p>
    </section>
  );
}
