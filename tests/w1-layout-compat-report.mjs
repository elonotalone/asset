// W1 报表工具 —— 版式相容性的「改前 / 改后」快照与差异清单。
//
// 跑法（asset 仓根）：
//   node --import ./tests/register-tsx.mjs tests/w1-layout-compat-report.mjs --out <file.json>
//   node --import ./tests/register-tsx.mjs tests/w1-layout-compat-report.mjs \
//        --baseline <before.json> --out <after.json> --md <regenerate-list.md>
//
// 它只读产品代码，不写产品代码。产出三样：
//   1. 每个子类的候选家族集合（含判据来源：sub / industry / all）
//   2. 每个模板（500 件）实际拿到的家族
//   3. 与基线相比家族发生变化的模板 —— 那就是「要重生成的清单」

import { writeFileSync, readFileSync } from "node:fs";

import * as dna from "../lib/template-dna.ts";
import { INDUSTRIES, allTemplates, countForSub } from "../lib/template-taxonomy.ts";

const argv = process.argv.slice(2);
const argOf = (name) => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : null;
};

const { LAYOUT_FAMILIES, dnaFor, familiesForIndustry } = dna;
// 改前没有这两个导出；报表要能在改前的代码上跑，所以特性探测。
const resolveFamilies = dna.resolveFamilies ?? null;
const familiesForSub = dna.familiesForSub ?? null;

function candidatesFor(subKey, industryKey) {
  if (resolveFamilies) {
    const r = resolveFamilies(subKey, industryKey);
    return { keys: r.families.map((f) => f.key), via: r.via, toppedUp: r.toppedUp };
  }
  if (familiesForSub) {
    return { keys: familiesForSub(subKey, industryKey).map((f) => f.key), via: "sub", toppedUp: [] };
  }
  // 改前：只吃粗行业键；传子类键必然回落到全集。
  const byIndustry = familiesForIndustry(industryKey).map((f) => f.key);
  return {
    keys: byIndustry,
    via: byIndustry.length === LAYOUT_FAMILIES.length ? "all" : "industry",
    toppedUp: [],
  };
}

const subs = [];
for (const ind of INDUSTRIES) {
  for (const sub of ind.subs) {
    const c = candidatesFor(sub.key, ind.key);
    subs.push({
      subKey: sub.key,
      subLabel: sub.label,
      industryKey: ind.key,
      industryLabel: ind.label,
      variants: countForSub(sub.key),
      via: c.via,
      toppedUp: c.toppedUp,
      candidates: c.keys,
    });
  }
}

const templates = allTemplates().map((t) => {
  const d = dnaFor(t.slug, t.industryKey, t.variant);
  return {
    slug: t.slug,
    title: t.title,
    subKey: t.subKey,
    subLabel: t.subLabel,
    industryKey: t.industryKey,
    variant: t.variant,
    layoutKey: d.layout.key,
    layoutLabel: d.layout.label,
  };
});

const byIndustryCandidates = new Map();
for (const ind of INDUSTRIES) {
  byIndustryCandidates.set(
    ind.key,
    LAYOUT_FAMILIES.filter((f) => f.industries?.includes(ind.key)).map((f) => f.key),
  );
}

const snapshot = {
  layoutFamilies: LAYOUT_FAMILIES.map((f) => f.key),
  totalSubs: subs.length,
  totalTemplates: templates.length,
  fellBackToAll: subs.filter((s) => s.via === "all").length,
  toppedUpSubs: subs.filter((s) => s.toppedUp.length).length,
  subs,
  templates,
  industryCandidates: Object.fromEntries(byIndustryCandidates),
};

const outPath = argOf("--out");
if (outPath) {
  writeFileSync(outPath, JSON.stringify(snapshot, null, 2));
  console.log(`[w1-report] wrote ${outPath}`);
}

console.log(`总子类\t${snapshot.totalSubs}`);
console.log(`总模板\t${snapshot.totalTemplates}`);
console.log(`候选集回落到全集的子类数\t${snapshot.fellBackToAll}`);
console.log(`候选不足需从粗行业补齐的子类数\t${snapshot.toppedUpSubs}`);

const sizes = subs.map((s) => s.candidates.length);
console.log(`候选集大小 min/max\t${Math.min(...sizes)}/${Math.max(...sizes)}`);

// 同一粗行业内不同子类能否拿到不同候选集
let discriminating = 0;
for (const ind of INDUSTRIES) {
  const sets = new Set(
    subs.filter((s) => s.industryKey === ind.key).map((s) => s.candidates.join(",")),
  );
  if (sets.size > 1) discriminating += 1;
}
console.log(`候选集能区分子类的粗行业数\t${discriminating}/${INDUSTRIES.length}`);

const baselinePath = argOf("--baseline");
if (baselinePath) {
  const before = JSON.parse(readFileSync(baselinePath, "utf8"));
  const beforeBySlug = new Map(before.templates.map((t) => [t.slug, t]));
  const beforeSubs = new Map(before.subs.map((s) => [s.subKey, s]));

  const changed = [];
  for (const t of templates) {
    const b = beforeBySlug.get(t.slug);
    if (!b) continue;
    if (b.layoutKey !== t.layoutKey) changed.push({ ...t, wasLayoutKey: b.layoutKey, wasLayoutLabel: b.layoutLabel });
  }
  console.log(`版式发生变化的模板数\t${changed.length}/${templates.length}`);

  const mdPath = argOf("--md");
  if (mdPath) {
    const lines = [];
    lines.push("# W1 重生成清单 —— 版式候选下沉到子类之后，版式发生变化的模板");
    lines.push("");
    lines.push("由 `asset/tests/w1-layout-compat-report.mjs` 生成，**不要手改**。");
    lines.push("重跑：见该文件头部注释。");
    lines.push("");
    lines.push(
      "- 模板总数：**" + templates.length + "**（= `template-taxonomy.ts` 算出来的候选池上限，不是货架数）",
    );
    lines.push(`- 版式发生变化、需要重生成的：**${changed.length}**`);
    lines.push(`- 版式不变、不必重生成的：**${templates.length - changed.length}**`);
    lines.push("");
    lines.push("| 模板 id | 子类 | 现在的 family | 应该换成的 family | 理由 |");
    lines.push("|---|---|---|---|---|");
    for (const c of changed) {
      const s = beforeSubs.get(c.subKey);
      const wasEligible = s ? s.candidates.includes(c.wasLayoutKey) : true;
      const reason = wasEligible
        ? `候选集由「${c.industryKey} 全行业」收窄到子类「${c.subKey}」，重排后落到本家族`
        : `旧家族 ${c.wasLayoutKey} 不在子类「${c.subKey}」的相容集内`;
      lines.push(
        `| \`${c.slug}\` | ${c.subLabel}（\`${c.subKey}\`） | ${c.wasLayoutLabel}（\`${c.wasLayoutKey}\`） | ${c.layoutLabel}（\`${c.layoutKey}\`） | ${reason} |`,
      );
    }
    writeFileSync(mdPath, lines.join("\n") + "\n");
    console.log(`[w1-report] wrote ${mdPath}`);
  }

  const tsvPath = argOf("--tsv");
  if (tsvPath) {
    const rows = ["slug\tsubKey\tsubLabel\tfromFamily\ttoFamily\tvariant"];
    for (const c of changed) {
      rows.push(`${c.slug}\t${c.subKey}\t${c.subLabel}\t${c.wasLayoutKey}\t${c.layoutKey}\t${c.variant}`);
    }
    writeFileSync(tsvPath, rows.join("\n") + "\n");
    console.log(`[w1-report] wrote ${tsvPath}`);
  }
}
