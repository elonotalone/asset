// 一次性：把 18 件重做后的展厅文案落进 content/plugin-gallery.json。
// 文案取自各 owner 的 verdicts/W*-delivery.md「建议展厅文案」；W4 三件该节缺失，
// 由父 agent 按其交付说明「服务的那个人」「缩小／改变了什么承诺」原话转写。
import { readFileSync, writeFileSync } from "node:fs";

const PATH = "content/plugin-gallery.json";

const COPY = {
  "unit-converter": {
    summary: "把手里的陌生单位和你习惯的单位摆成一对，改任意一端，另一端立刻跟着变。",
    does: [
      "左右各挑一个单位，改哪一端都行，另一端原位换算，不新增结果行",
      "桥上直接写这一对是精确定义还是近似换算，血糖会写出「葡萄糖」",
    ],
  },
  "financial-calculator": {
    summary: "把一笔贷款画成从本金走到清零的轨迹，改一个假设就读出两个方案差多少。",
    does: [
      "拖期限卡扣，原方案留成对比线，结论当场写出月供多付多少、总利息少付多少",
      "游标落在曲线上，就地给出那一期的还款、利息、本金与余额",
    ],
  },
  "legal-calculator": {
    summary: "按公开口径把你填的事实走成一条链，看清哪一道门槛改变了金额。",
    does: [
      "填月工资、当地月平均工资和工龄，链尾给出采用基数、补偿月数与估算金额",
      "门槛触发时就地写明白：3 倍工资封顶会同时把补偿月数压到 12 个月",
    ],
  },
  "three-statement-model": {
    summary: "改一个假设，三张表一起走一遍，看现金在哪一年不够。",
    does: [
      "收入、毛利、账期、资本开支的旋钮长在它驱动的那一行上，改完立刻走一遍三张表",
      "每个结果都能追回是哪个假设算出来的",
    ],
  },
  "ledger-register": {
    summary: "一卷账从上往下记：记一笔，合计、余额和当前读数立刻跟着动。",
    does: [
      "一卷账从上往下记，录入行就是下一行，最新一笔和当前读数始终在眼前",
      "从某一笔追到余额为什么变成现在这个数",
    ],
  },
  "metrics-dashboard": {
    summary: "把几个指标放到同一条时间轴上，看它们怎么一起转向。",
    does: [
      "每个指标一条轨道，实际走势和目标参照用同一把尺子，名字写在轨道上",
      "几条轨道共用一条时间轴，转向发生在同一周就看得出来",
    ],
  },
  "annotatable-city-map": {
    summary: "把手上的一串地址按真实比例摆开，看清它们的相对位置和跑完要多远。",
    does: [
      "点下地点并写上名字，名字就留在图上，不用回头对编号",
      "按顺序连成路线，读出分段直线距离与总长",
    ],
  },
  "self-test-quiz": {
    summary: "自己出一题，当场作答，立刻知道对错和错在哪。",
    does: [
      "写下题干就长出该题型要填的空，填空、连线、排序都不用你自己敲格式",
      "判分直接贴回你刚点的那个选项、刚写的那个空上，不给成绩报告",
    ],
  },
  "spaced-repetition-scheduler": {
    summary: "只给你今天该复习的那一张卡：看一眼、诚实评一下、知道下次什么时候再见。",
    does: [
      "屏幕中央永远只有一张卡，走三步：正面、揭开答案、评价这次回忆",
      "评价用「忘记了／想起来很费劲／有点犹豫／一下就想起」，不是 0–5 打分",
    ],
  },
  "formula-derivation-walkthrough": {
    summary: "沿着每一个等号往下核，找出自己漏在平方、代入还是最后一次乘法。",
    does: [
      "推导由原式自己长出来：代入、每个因子、逐次乘、近似，每行都是完整等式",
      "每行右边写着能核对的依据名，改数、改单位、改近似位数都不用提交",
    ],
  },
  "literature-matrix": {
    summary: "把一批检索结果摊成一张能横着比的证据表：逐条判定进出，最终纳入多少一直摆在最上面。",
    does: [
      "同一个维度横着看，逐条判定纳入、排除还是待定",
      "待定不会被算成已纳入，所以合计不会对着你喊「对不上」",
    ],
  },
  "search-query-builder": {
    summary: "把一句研究问题排成一条能直接贴进数据库的查询串，换库时哪个词被改写了就写在那个词下面。",
    does: [
      "读得懂自己拼出来的那条式子，而不是只拿到一串括号",
      "换检索库时，被改写或降级的那个词就地标出来",
    ],
  },
  "executable-notebook": {
    summary: "一份会算的文稿：可以反复改的量和由它们算出来的结论写在同一篇里。",
    does: [
      "改一个数，被它影响的那几行当场亮一下",
      "出错时错误钉在出错的那一格上，不是丢一条堆栈给你",
    ],
  },
  "contract-assembly": {
    summary: "一句一句把合同拼出来，缺的那项、打架的那两条，就写在正文旁边。",
    does: [
      "从「这是一笔什么交易」开始，条款一条条落进正文，变量就是句子里的空位",
      "漏填和冲突指到正文里那一句上，不用回头翻条款库",
    ],
  },
  "dialogue-branch-script": {
    summary: "一句话说出去，对方可能怎么接——每条接法都写成完整台词，走不通的那句会被点名。",
    does: [
      "写下开场，在当前这句下面补出对方的回应和你的下一句",
      "断掉的岔路会被点名，不用自己顺着树找",
    ],
  },
  "voiceover-script": {
    summary: "把要念的话写成一条能对着镜头读的稿子，每段讲到第几秒、还剩多久，就在字的旁边。",
    does: [
      "填一个目标时长，之后只管写，语速与计数都不用碰",
      "每段的累计时刻与剩余时长贴在那段字旁边",
    ],
  },
  "floorplan-annotation": {
    summary: "按真实尺寸画墙、门、窗，随手读出每个房间和整套空间的面积与尺寸。",
    does: [
      "沿网格拉一条线就是一面墙，松手即显示实际长度",
      "围合出房间后立刻读到面积，共享墙不会被重复计算",
    ],
  },
  "relationship-graph": {
    summary: "把一堆人和机构摆成一张网，问「他们通过谁连上」。",
    does: [
      "填进去的名字就写在节点上，不用回头对编号",
      "选两个人，把连接他们的那条路径高亮出来",
    ],
  },
};

const raw = readFileSync(PATH, "utf8");
const doc = JSON.parse(raw);
const items = Array.isArray(doc) ? doc : doc.items || doc.plugins;

let changed = 0;
const missing = [];
for (const [id, copy] of Object.entries(COPY)) {
  const item = items.find((entry) => entry.id === id);
  if (!item) {
    missing.push(id);
    continue;
  }
  item.summary = copy.summary;
  item.does = copy.does;
  changed += 1;
}

writeFileSync(PATH, `${JSON.stringify(doc, null, 2)}\n`);
console.log(`落入文案 ${changed}/18 件`);
if (missing.length) console.log(`展厅里找不到的 id: ${missing.join(" ")}`);
