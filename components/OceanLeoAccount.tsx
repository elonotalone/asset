"use client";

import { useCallback, useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { useUI } from "@oceanleo/ui/i18n";
import {
  browserClient,
  signOutEverywhere,
  oceanleoConfigured,
  getCredits,
  getCreditHistory,
  type CreditEvent,
} from "@/lib/oceanleo-auth";

// 统一的 OceanLeo 账户管理页 —— 与 venus 账户页对齐的极简风格。
// 一次登录，全家桶所有 *.oceanleo.com 站点通用。
// 注意：这里只保留「账户信息 + 用量概览 + 退出登录」三块，
// 不含技能 / 连接器 / MCP 服务器 / BYOK 密钥（那是 venus 才有的能力）。

export function OceanLeoAccount() {
  const tt = useUI();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshUser = useCallback(async () => {
    const c = browserClient();
    if (!c) {
      setLoading(false);
      return;
    }
    const { data } = await c.auth.getSession();
    setUser(data.session?.user ?? null);
    setLoading(false);
  }, []);

  useEffect(() => {
    void refreshUser();
    const c = browserClient();
    const sub = c?.auth.onAuthStateChange(() => void refreshUser());
    return () => sub?.data.subscription.unsubscribe();
  }, [refreshUser]);

  if (!oceanleoConfigured()) {
    return (
      <div className="mx-auto max-w-md rounded-xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-800">
        {tt("登录服务尚未配置（缺少 Supabase 环境变量）。")}
      </div>
    );
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-lg animate-pulse space-y-4">
        <div className="h-24 rounded-2xl bg-neutral-100" />
        <div className="h-20 rounded-2xl bg-neutral-100" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg">
      {user ? <SignedIn user={user} /> : <SignedOut onDone={refreshUser} />}
    </div>
  );
}

function SignedOut({ onDone }: { onDone: () => void }) {
  const tt = useUI();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    setMsg(null);
    const c = browserClient();
    if (!c) return;
    setBusy(true);
    try {
      if (mode === "signup") {
        const { error } = await c.auth.signUp({ email: email.trim(), password });
        if (error) setErr(error.message);
        else {
          setMsg(tt("注册成功！已自动登录并赠送 token。"));
          onDone();
        }
      } else {
        const { error } = await c.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (error) setErr(error.message);
        else onDone();
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto mt-8 max-w-sm text-center">
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-neutral-100 text-2xl">
        👤
      </div>
      <h2 className="mt-5 text-[17px] font-semibold text-neutral-900">
        {mode === "signin" ? tt("登录 OceanLeo") : tt("注册 OceanLeo")}
      </h2>
      <p className="mt-2 text-[13px] leading-relaxed text-neutral-500">
        {tt("一次登录，全家桶所有 AI 工具通用。")}
      </p>
      <form onSubmit={submit} className="mt-6 space-y-3 text-left">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          placeholder={tt("邮箱")}
          className="w-full rounded-lg border border-neutral-200 px-3 py-2.5 text-sm outline-none transition focus:border-neutral-400"
        />
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={6}
          placeholder={tt("密码（至少 6 位）")}
          className="w-full rounded-lg border border-neutral-200 px-3 py-2.5 text-sm outline-none transition focus:border-neutral-400"
        />
        {err && <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-600">{err}</p>}
        {msg && <p className="rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-600">{msg}</p>}
        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-xl bg-neutral-900 py-2.5 text-[14px] font-medium text-white transition hover:bg-neutral-800 active:scale-[0.99] disabled:opacity-50"
        >
          {busy ? tt("处理中…") : mode === "signin" ? tt("登录") : tt("注册")}
        </button>
      </form>
      <button
        onClick={() => {
          setMode(mode === "signin" ? "signup" : "signin");
          setErr(null);
          setMsg(null);
        }}
        className="mt-4 text-xs text-neutral-500 transition hover:text-neutral-800"
      >
        {mode === "signin" ? tt("还没有账号？去注册") : tt("已有账号？去登录")}
      </button>
    </div>
  );
}

function SignedIn({ user }: { user: User }) {
  const tt = useUI();
  const [credits, setCredits] = useState<number | null>(null);
  const [monthSpend, setMonthSpend] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void getCredits().then((r) => {
      if (r.ok && r.data) setCredits(r.data.balance_yuan);
    });
    void getCreditHistory(200).then((r) => {
      const events: CreditEvent[] = r.ok && r.data && Array.isArray(r.data.events) ? r.data.events : [];
      const now = new Date();
      let spend = 0; // CNY (yuan)
      for (const ev of events) {
        const yuan = Number(ev?.amount_yuan ?? 0);
        const d = ev?.created_at ? new Date(ev.created_at) : null;
        const inMonth =
          d &&
          d.getUTCFullYear() === now.getUTCFullYear() &&
          d.getUTCMonth() === now.getUTCMonth();
        if (inMonth && yuan < 0) spend += Math.abs(yuan);
      }
      setMonthSpend(spend);
    });
  }, []);

  const signOut = async () => {
    setBusy(true);
    await signOutEverywhere();
    setBusy(false);
  };

  const initial = user.email ? user.email[0].toUpperCase() : "?";

  return (
    <div>
      <div className="flex items-center gap-4 rounded-2xl border border-neutral-200 p-5">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-amber-800 text-lg font-medium text-white">
          {initial}
        </div>
        <div className="min-w-0">
          <p className="truncate text-[16px] font-semibold text-neutral-900">
            {user.email ? user.email.split("@")[0] : tt("未登录")}
          </p>
          <p className="truncate text-[13px] text-neutral-500">{user.email || "—"}</p>
          <p className="mt-1 text-[12px] text-neutral-400">{tt("免费计划")}</p>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-neutral-200 p-3 text-center">
          <p className="text-[18px] font-semibold tabular-nums text-neutral-900">
            {credits !== null ? `¥${credits.toFixed(2)}` : "…"}
          </p>
          <p className="text-[11px] text-neutral-500">{tt("token 余额")}</p>
        </div>
        <div className="rounded-xl border border-neutral-200 p-3 text-center">
          <p className="text-[18px] font-semibold tabular-nums text-neutral-900">
            {monthSpend !== null ? `¥${monthSpend.toFixed(2)}` : "—"}
          </p>
          <p className="text-[11px] text-neutral-500">{tt("本月消耗")}</p>
        </div>
      </div>

      <button
        type="button"
        onClick={signOut}
        disabled={busy}
        className="mt-6 w-full rounded-xl border border-neutral-200 py-2.5 text-[13px] text-red-600 transition hover:border-red-200 hover:bg-red-50 active:scale-[0.99] disabled:opacity-50"
      >
        {busy ? tt("退出中…") : tt("退出登录（全部站点）")}
      </button>
    </div>
  );
}
