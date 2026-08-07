// 版式相容性的判据测试（W1）。
//
// 跑法（asset 仓根）：
//   node --import ./tests/register-tsx.mjs --test tests/template-layout-compat.test.mjs
//
// 守住五件事：
//   A. 声明完整性 —— 新增子类忘了声明业态，这里点名，不靠人记得
//   B. 解析走的是子类正路，没有一个子类退到粗行业或全集
//   C. 操作员点名的错配样例（搬家公司 / 诊所）不再发生
//   D. 互质铺开性质仍然成立（同子类的变体走遍不同家族）
//   E. 回落必须留下痕迹 —— 静默回落正是这次错配的机制

// 台账测试会故意造回落，别让 warn 刷屏。
process.env.OCEANLEO_SILENCE_LAYOUT_FALLBACK = "1";

import assert from "node:assert/strict";
import test from "node:test";

import {
  ALL_ARCHETYPES,
  ARCHETYPE_LABEL,
  LAYOUT_FAMILIES,
  MIN_FAMILY_CANDIDATES,
  SUB_ARCHETYPES,
  clearFamilyFallbacks,
  dnaFor,
  familiesForSub,
  familyFallbacks,
  resolveFamilies,
} from "../lib/template-dna.ts";
import {
  ALL_SUB_KEYS,
  INDUSTRIES,
  allTemplates,
  countForSub,
  subByKey,
} from "../lib/template-taxonomy.ts";

const industryOf = (subKey) => subByKey(subKey)?.ind.key;

// ————————————————————————————————————————————————————————————
// A. 声明完整性
// ————————————————————————————————————————————————————————————

test("A1 每个子类都声明了业态（新增子类忘了声明会在这里被点名）", () => {
  const declared = new Set(Object.keys(SUB_ARCHETYPES));
  const missing = ALL_SUB_KEYS.filter((k) => !declared.has(k));
  assert.deepEqual(
    missing,
    [],
    `这些子类没有在 template-dna.ts 的 SUB_ARCHETYPES 里声明业态，` +
      `它们会退回按粗行业选版式，重现「搬家公司套上诊所版式」那类错配：${missing.join(", ")}`,
  );
});

test("A2 SUB_ARCHETYPES 里没有分类树上不存在的幽灵子类", () => {
  const real = new Set(ALL_SUB_KEYS);
  const ghosts = Object.keys(SUB_ARCHETYPES).filter((k) => !real.has(k));
  assert.deepEqual(ghosts, [], `这些子类键在 template-taxonomy.ts 里不存在：${ghosts.join(", ")}`);
});

test("A3 声明的业态都是已定义的业态，且每个子类至少一个", () => {
  const known = new Set(ALL_ARCHETYPES);
  for (const [subKey, archetypes] of Object.entries(SUB_ARCHETYPES)) {
    assert.ok(Array.isArray(archetypes) && archetypes.length > 0, `${subKey} 的业态列表为空`);
    for (const a of archetypes) {
      assert.ok(known.has(a), `${subKey} 声明了未定义的业态 ${a}`);
    }
  }
});

test("A4 每个业态至少有 MIN_FAMILY_CANDIDATES 个家族服务它", () => {
  // 这是候选集下限的来源：低于它，同子类的变体铺不开，用户会看到几个长得一样的模板。
  const thin = [];
  for (const a of ALL_ARCHETYPES) {
    const n = LAYOUT_FAMILIES.filter((f) => f.serves?.includes(a)).length;
    if (n < MIN_FAMILY_CANDIDATES) thin.push(`${a}(${ARCHETYPE_LABEL[a]})=${n}`);
  }
  assert.deepEqual(thin, [], `这些业态的服务家族不足 ${MIN_FAMILY_CANDIDATES} 个：${thin.join(", ")}`);
});

test("A5 每个布局家族都声明了它服务的业态", () => {
  const silent = LAYOUT_FAMILIES.filter((f) => !f.serves?.length).map((f) => f.key);
  assert.deepEqual(silent, [], `这些家族没有 serves 声明，永远选不中：${silent.join(", ")}`);
});

// ————————————————————————————————————————————————————————————
// B. 解析走子类正路
// ————————————————————————————————————————————————————————————

test("B1 没有任何子类退到粗行业或全集", () => {
  const degraded = [];
  for (const subKey of ALL_SUB_KEYS) {
    const pick = resolveFamilies(subKey, industryOf(subKey));
    if (pick.via !== "sub") degraded.push(`${subKey}:${pick.via}`);
  }
  assert.deepEqual(degraded, [], `这些子类没走子类判据：${degraded.join(", ")}`);
});

test("B2 没有任何子类需要从粗行业补齐候选", () => {
  const toppedUp = [];
  for (const subKey of ALL_SUB_KEYS) {
    const pick = resolveFamilies(subKey, industryOf(subKey));
    if (pick.toppedUp.length) toppedUp.push(`${subKey}<-${pick.toppedUp.join("/")}`);
  }
  assert.deepEqual(toppedUp, [], `这些子类按业态算出来的候选不够，被粗行业补齐了：${toppedUp.join(", ")}`);
});

test("B3 每个子类的候选家族数够它的变体数铺开", () => {
  const tooFew = [];
  for (const subKey of ALL_SUB_KEYS) {
    const n = familiesForSub(subKey, industryOf(subKey)).length;
    const variants = countForSub(subKey);
    if (n < variants) tooFew.push(`${subKey}: 候选${n} < 变体${variants}`);
  }
  assert.deepEqual(tooFew, [], tooFew.join("; "));
});

test("B4 同一粗行业内的不同子类能拿到不同候选集（子类粒度真的存在）", () => {
  const flat = [];
  for (const ind of INDUSTRIES) {
    const sigs = new Set(
      ind.subs.map((s) => familiesForSub(s.key, ind.key).map((f) => f.key).join(",")),
    );
    if (sigs.size <= 1) flat.push(`${ind.key}(${ind.subs.length} 个子类共用一套候选)`);
  }
  assert.deepEqual(flat, [], `这些粗行业下所有子类仍然区分不开：${flat.join(", ")}`);
});

// ————————————————————————————————————————————————————————————
// C. 操作员点名的错配样例
// ————————————————————————————————————————————————————————————

test("C1 搬家公司的每一个变体都不再拿到「医疗健康」版式", () => {
  const got = allTemplates()
    .filter((t) => t.subKey === "moving")
    .map((t) => ({ slug: t.slug, layout: dnaFor(t.slug, t.industryKey, t.variant).layout.key }));
  assert.ok(got.length > 0, "搬家公司一个模板都没有，样例失效了");
  const clinics = got.filter((g) => g.layout === "clinic");
  assert.deepEqual(clinics, [], `搬家公司仍然拿到诊所版式：${JSON.stringify(clinics)}`);
});

test("C2 搬家公司与家庭保洁的候选集不再一模一样", () => {
  const moving = familiesForSub("moving", "life").map((f) => f.key);
  const cleaning = familiesForSub("cleaning", "life").map((f) => f.key);
  assert.notDeepEqual(moving, cleaning, "两者候选集相同，机制上仍然区分不开");
  assert.ok(!moving.includes("clinic"), "搬家公司的候选集里还有 clinic");
  assert.ok(!cleaning.includes("clinic"), "家庭保洁的候选集里还有 clinic");
});

test("C3 真正到院就诊的子类仍然拿得到「医疗健康」版式", () => {
  // 收窄不能收过头：clinic 家族本身要还有人用。
  for (const subKey of ["hospital", "dental", "medical-beauty"]) {
    const keys = familiesForSub(subKey, industryOf(subKey)).map((f) => f.key);
    assert.ok(keys.includes("clinic"), `${subKey} 的候选集里没有 clinic：${keys.join(",")}`);
  }
});

test("C4 分类树上挂错行业的两个子类，业态判据把它们纠正回来了", () => {
  // 医院挂在 grocery（食品/茶酒/医药保健）下，医学美容挂在 fashion 下。
  // 分类树本身不动（它是导航与 URL 的一级轴），但版式不再跟着行业走。
  assert.equal(industryOf("hospital"), "grocery");
  assert.equal(industryOf("medical-beauty"), "fashion");
  assert.deepEqual(SUB_ARCHETYPES.hospital, ["care-clinic"]);
  assert.ok(SUB_ARCHETYPES["medical-beauty"].includes("care-clinic"));

  // 判据：它们拿到的候选集不等于各自粗行业的候选集 —— 说明行业挂错已不再决定版式。
  const hospital = familiesForSub("hospital", "grocery").map((f) => f.key).join(",");
  const grocerySibling = familiesForSub("snacks", "grocery").map((f) => f.key).join(",");
  assert.notEqual(hospital, grocerySibling, "医院和零食仍然共用一套版式候选");
});

// ————————————————————————————————————————————————————————————
// D. 互质铺开性质
// ————————————————————————————————————————————————————————————

test("D1 同一子类的多个变体走遍不同布局家族，零重复", () => {
  const bySub = new Map();
  for (const t of allTemplates()) {
    const layout = dnaFor(t.slug, t.industryKey, t.variant).layout.key;
    if (!bySub.has(t.subKey)) bySub.set(t.subKey, []);
    bySub.get(t.subKey).push(layout);
  }
  const degraded = [];
  for (const [subKey, layouts] of bySub) {
    const uniq = new Set(layouts);
    if (uniq.size < layouts.length) {
      degraded.push(`${subKey}: ${layouts.length} 个变体只落到 ${uniq.size} 个家族（${layouts.join("/")}）`);
    }
  }
  assert.deepEqual(degraded, [], degraded.join("; "));
});

test("D2 收窄没把任何一个布局家族饿死，也没让某一个家族独大", () => {
  // 收窄候选集有两个反向副作用，都会让用户觉得「模板都长得差不多」：
  // 一是某个家族再也选不中（等于白写一套版式），二是某个家族吃掉大半个货架。
  const usage = new Map(LAYOUT_FAMILIES.map((f) => [f.key, 0]));
  const templates = allTemplates();
  for (const t of templates) {
    const key = dnaFor(t.slug, t.industryKey, t.variant).layout.key;
    usage.set(key, (usage.get(key) ?? 0) + 1);
  }
  const starved = [...usage].filter(([, n]) => n === 0).map(([k]) => k);
  assert.deepEqual(starved, [], `这些布局家族一件模板都选不中，等于白写：${starved.join(", ")}`);

  const hog = [...usage].filter(([, n]) => n / templates.length > 0.15);
  assert.deepEqual(
    hog.map(([k, n]) => `${k}=${((n / templates.length) * 100).toFixed(1)}%`),
    [],
    "有家族占比超过 15%，货架会显得单调",
  );
});

// ————————————————————————————————————————————————————————————
// E. 回落必须留下痕迹
// ————————————————————————————————————————————————————————————

test("E1 全量生成 500 个模板，回落台账是空的", () => {
  clearFamilyFallbacks();
  for (const t of allTemplates()) dnaFor(t.slug, t.industryKey, t.variant);
  const fallbacks = familyFallbacks();
  assert.deepEqual(
    fallbacks.map((f) => `${f.subKey}:${f.via}`),
    [],
    `全量生成时出现了回落：${JSON.stringify(fallbacks, null, 2)}`,
  );
});

test("E2 未声明业态的子类退到粗行业，并且记账", () => {
  clearFamilyFallbacks();
  const pick = resolveFamilies("brand-new-sub-never-declared", "life");
  assert.equal(pick.via, "industry");
  assert.deepEqual(pick.families.map((f) => f.key), [
    "agency", "portfolio", "clinic", "auto-service", "wedding-photo", "editorial", "fullscreen-scroll",
  ]);
  const ledger = familyFallbacks();
  assert.equal(ledger.length, 1);
  assert.equal(ledger[0].subKey, "brand-new-sub-never-declared");
  assert.equal(ledger[0].via, "industry");
  assert.match(ledger[0].note, /没有在 SUB_ARCHETYPES 里声明业态/);
  clearFamilyFallbacks();
});

test("E3 连粗行业都没人声明时退到全集，并且记账", () => {
  clearFamilyFallbacks();
  const pick = resolveFamilies("brand-new-sub", "no-such-industry");
  assert.equal(pick.via, "all");
  assert.equal(pick.families.length, LAYOUT_FAMILIES.length);
  const ledger = familyFallbacks();
  assert.equal(ledger.length, 1);
  assert.equal(ledger[0].via, "all");
  clearFamilyFallbacks();
});

test("E4 同一个回落只记一次，台账不会被刷爆", () => {
  clearFamilyFallbacks();
  for (let i = 0; i < 50; i++) resolveFamilies("brand-new-sub", "no-such-industry");
  assert.equal(familyFallbacks().length, 1);
  clearFamilyFallbacks();
});
