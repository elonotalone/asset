/*
 * 检索式构造 · 编译内核
 * 规格：docs/specs/oceanleo-plugins-v1/plugins/search-query-builder.md
 *
 * 唯一真相来源：页面与自测加载同一份字节。不碰 DOM、不碰存储、不发请求、不用 eval。
 *
 * 它只编译查询串，**不替用户执行检索**（规格原话）。
 */
(function (root) {
  "use strict";

  var FIELD_LABELS = {
    tiab: "标题与摘要",
    ti: "标题",
    mesh: "主题词",
    all: "全字段"
  };

  /**
   * 数据库方言。
   * `supports` 之外的字段要**降级并说明**，不许默默丢掉 —— 规格点名要求
   * 「不支持的字段需要向用户说明如何降级」。
   */
  var DIALECTS = {
    pubmed: {
      id: "pubmed",
      label: "PubMed",
      style: "suffix",
      tags: { tiab: "[Title/Abstract]", ti: "[Title]", mesh: "[MeSH Terms]", all: "[All Fields]" },
      supports: ["tiab", "ti", "mesh", "all"],
      truncation: true,
      truncationInQuotes: false,
      hint: "字段标签写在词后面的方括号里；截词符 * 不能写在引号内。"
    },
    arxiv: {
      id: "arxiv",
      label: "arXiv",
      style: "prefix",
      tags: { tiab: "abs:", ti: "ti:", all: "all:" },
      supports: ["tiab", "ti", "all"],
      downgrade: { mesh: "all" },
      truncation: false,
      truncationInQuotes: false,
      hint: "字段前缀写在词前面；没有主题词表，也不支持截词。"
    },
    generic: {
      id: "generic",
      label: "通用布尔",
      style: "none",
      tags: { tiab: "", ti: "", mesh: "", all: "" },
      supports: ["tiab", "ti", "mesh", "all"],
      dropsFields: true,
      truncation: true,
      truncationInQuotes: false,
      hint: "只保留词与布尔关系，字段限定一律丢掉 —— 换库时先用它对一遍逻辑。"
    }
  };

  var DIALECT_IDS = ["pubmed", "arxiv", "generic"];

  function pushNote(notes, text) {
    if (notes.indexOf(text) < 0) notes.push(text);
  }

  /**
   * 一个词编译成一段。
   * 括号、引号这些结构符号从用户输入里剔掉 —— 用户打的是词，结构由工具加，
   * 让用户的字直接进结构位会把整条查询的括号配平弄坏。
   *
   * 返回的不只是那一段字符串，还有**这个词身上发生了什么**（changes）：
   * 字段被降级、截词符被拿掉。规格 §3 要求降级说明贴着被改写的那一个词，
   * 汇成一份远处的说明列表就等于让用户自己猜是哪个词变了（§6 点名这是做坏了）。
   */
  function renderPiece(term, dialect, notes) {
    var raw = String((term && term.text) || "").trim();
    var text = raw
      .replace(/[()\[\]"']/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (!text) return null;

    var truncated = /\*$/.test(text);
    if (truncated) text = text.replace(/\*+$/, "").trim();
    if (!text) return null;

    var multiword = /\s/.test(text);
    var field = (term && term.field) || "tiab";
    if (!FIELD_LABELS[field]) field = "tiab";

    var used = field;
    var changes = [];
    if (dialect.supports.indexOf(field) < 0) {
      used = (dialect.downgrade && dialect.downgrade[field]) || "all";
      changes.push({
        kind: "field",
        why: dialect.label + " 没有「" + FIELD_LABELS[field] + "」这一路，改成「" +
          FIELD_LABELS[used] + "」——命中范围放宽了"
      });
      pushNote(notes,
        "「" + FIELD_LABELS[field] + "」" + dialect.label + " 不支持，已降级为「" +
        FIELD_LABELS[used] + "」。降级会放宽命中范围，复算时要记这一笔。");
    }

    if (truncated && !dialect.truncation) {
      changes.push({ kind: "truncation", why: dialect.label + " 不支持截词，结尾的 * 去掉了" });
      pushNote(notes, dialect.label + " 不支持截词，「" + text + "*」的截词符已去掉。");
      truncated = false;
    }
    if (truncated && multiword && !dialect.truncationInQuotes) {
      changes.push({ kind: "truncation", why: "词组要加引号，引号里不能截词，结尾的 * 去掉了" });
      pushNote(notes,
        "「" + text + "」是词组，必须加引号，而截词符不能写在引号里；已去掉截词符。");
      truncated = false;
    }

    var body = multiword ? '"' + text + '"' : text + (truncated ? "*" : "");
    var tag = dialect.tags[used] || "";
    var rendered = dialect.style === "prefix" ? tag + body
      : dialect.style === "suffix" ? body + tag
        : body;
    return {
      raw: raw,
      text: text,
      body: body,
      tag: tag,
      tagStyle: dialect.style,
      field: field,
      fieldLabel: FIELD_LABELS[field],
      used: used,
      usedLabel: FIELD_LABELS[used],
      dialectLabel: dialect.label,
      rendered: rendered,
      changes: changes
    };
  }

  function renderTerm(term, dialect, notes) {
    var piece = renderPiece(term, dialect, notes || []);
    return piece ? piece.rendered : null;
  }

  /* 查询串的骨架。界面靠它把「人写的词」和「工具加的结构」分开排，
     并且把更正贴到具体那一个词上；拼起来必须逐字等于 query。 */
  function tokenText(token, pieces) {
    if (token.t === "term") return pieces[token.piece].rendered;
    if (token.t === "open") return "(";
    if (token.t === "close") return ")";
    if (token.t === "and") return " AND ";
    return " OR ";
  }

  /**
   * 概念块编译成查询串。
   *
   * 规矩（规格「已查证的知识」）：
   *   - 同一概念块里的同义词用 OR；
   *   - 概念块之间用 AND；
   *   - **括号一律显式写出**，避免 `A OR B AND C` 在不同数据库里按不同优先级解释。
   */
  function compile(blocks, dialectId) {
    var dialect = DIALECTS[dialectId] || DIALECTS.pubmed;
    var notes = [];
    var pieces = [];
    var groups = [];
    var tokens = [];
    var empties = [];
    var blockCount = 0;
    var termCount = 0;

    if (!Array.isArray(blocks)) blocks = [];

    for (var i = 0; i < blocks.length; i++) {
      var block = blocks[i] || {};
      var terms = Array.isArray(block.terms) ? block.terms : [];
      var label = block.label || "";
      var mine = [];
      for (var j = 0; j < terms.length; j++) {
        var piece = renderPiece(terms[j], dialect, notes);
        if (!piece) continue;
        piece.block = i;
        piece.term = j;
        piece.blockLabel = label;
        piece.index = pieces.length;
        pieces.push(piece);
        mine.push(piece);
      }
      if (mine.length === 0) {
        if (terms.length > 0 || label) {
          empties.push({ block: i, label: label });
          pushNote(notes, "概念块「" + (label || "第 " + (i + 1) + " 块") + "」还没有可用的词，这一块没有进查询串。");
        }
        continue;
      }
      blockCount++;
      termCount += mine.length;
      if (tokens.length) tokens.push({ t: "and" });
      var group = { block: i, label: label, from: tokens.length, pieces: mine };
      tokens.push({ t: "open" });
      for (var k = 0; k < mine.length; k++) {
        if (k) tokens.push({ t: "or" });
        tokens.push({ t: "term", piece: mine[k].index });
      }
      tokens.push({ t: "close" });
      group.to = tokens.length;
      groups.push(group);
    }

    if (dialect.dropsFields) {
      pushNote(notes, "通用布尔式不带字段限定，字段信息只留在左边的概念结构里。");
    }
    if (blockCount > 1) {
      pushNote(notes, "块内用 OR、块间用 AND，每一块都套了显式括号 —— 不依赖各库默认的优先级。");
    }

    var query = "";
    for (var t = 0; t < tokens.length; t++) query += tokenText(tokens[t], pieces);

    return {
      dialect: dialect.id,
      dialectLabel: dialect.label,
      hint: dialect.hint,
      query: query,
      blockCount: blockCount,
      termCount: termCount,
      pieces: pieces,
      groups: groups,
      tokens: tokens,
      empties: empties,
      changed: pieces.filter(function (p) { return p.changes.length > 0; }),
      notes: notes
    };
  }

  /** 一次编译出全部方言 —— 同一份概念结构重编译，不必手工维护多份字符串。 */
  function compileAll(blocks) {
    var out = {};
    for (var i = 0; i < DIALECT_IDS.length; i++) {
      out[DIALECT_IDS[i]] = compile(blocks, DIALECT_IDS[i]);
    }
    return out;
  }

  /**
   * 可追溯记录：规格说「可复制的查询串与检索日期本身就足以形成可追溯记录」。
   * 日期由调用方传进来，内核不读时钟 —— 读了自测就不确定了。
   */
  function provenance(result, isoDate) {
    return [
      "数据库：" + result.dialectLabel,
      "检索日期：" + isoDate,
      "概念块 " + result.blockCount + " 个 · 检索词 " + result.termCount + " 条",
      "查询串：" + result.query
    ].join("\n");
  }

  function countTerms(blocks) {
    var n = 0;
    (blocks || []).forEach(function (b) {
      (((b && b.terms) || [])).forEach(function (t) {
        if (t && String(t.text || "").trim()) n++;
      });
    });
    return n;
  }

  /** 示例问题。首屏**不预填**，用户点「载入一个示例」才进来（规格：首次打开不预置内容）。 */
  var DEMO = {
    question: "运动干预能不能降低老年人跌倒的发生？",
    blocks: [
      {
        label: "人群",
        terms: [
          { text: "aged", field: "tiab" },
          { text: "elderly", field: "tiab" },
          { text: "older adults", field: "tiab" }
        ]
      },
      {
        label: "干预",
        terms: [
          { text: "exercise", field: "tiab" },
          { text: "physical activity", field: "tiab" }
        ]
      },
      {
        label: "结局",
        terms: [
          { text: "accidental falls", field: "mesh" },
          { text: "fall*", field: "tiab" }
        ]
      }
    ]
  };

  /* 自测用例：期望值是**逐字写死的查询串**，编译器一改行为就红。 */
  var CASES = [
    {
      name: "块内 OR：一块两词",
      run: function () {
        return compile([{ label: "人群", terms: [{ text: "aged" }, { text: "elderly" }] }], "pubmed").query;
      },
      expect: "(aged[Title/Abstract] OR elderly[Title/Abstract])"
    },
    {
      name: "块间 AND，且每块都有显式括号",
      run: function () {
        return compile([
          { label: "A", terms: [{ text: "aged" }] },
          { label: "B", terms: [{ text: "exercise" }] }
        ], "pubmed").query;
      },
      expect: "(aged[Title/Abstract]) AND (exercise[Title/Abstract])"
    },
    {
      name: "词组加引号，单词不加",
      run: function () {
        return compile([{ terms: [{ text: "older adults" }, { text: "aged" }] }], "pubmed").query;
      },
      expect: '("older adults"[Title/Abstract] OR aged[Title/Abstract])'
    },
    {
      name: "PubMed 主题词字段照写",
      run: function () {
        return compile([{ terms: [{ text: "accidental falls", field: "mesh" }] }], "pubmed").query;
      },
      expect: '("accidental falls"[MeSH Terms])'
    },
    {
      name: "PubMed 支持截词",
      run: function () {
        return compile([{ terms: [{ text: "fall*" }] }], "pubmed").query;
      },
      expect: "(fall*[Title/Abstract])"
    },
    {
      name: "arXiv 用前缀而不是后缀标签",
      run: function () {
        return compile([{ terms: [{ text: "transformer" }] }], "arxiv").query;
      },
      expect: "(abs:transformer)"
    },
    {
      name: "arXiv 不支持主题词 → 降级为全字段",
      run: function () {
        return compile([{ terms: [{ text: "neural networks", field: "mesh" }] }], "arxiv").query;
      },
      expect: '(all:"neural networks")'
    },
    {
      name: "arXiv 不支持截词 → 去掉截词符",
      run: function () {
        return compile([{ terms: [{ text: "quantum*" }] }], "arxiv").query;
      },
      expect: "(abs:quantum)"
    },
    {
      name: "通用布尔丢掉字段，只留词与逻辑",
      run: function () {
        return compile([
          { terms: [{ text: "aged", field: "mesh" }, { text: "older adults" }] },
          { terms: [{ text: "exercise" }] }
        ], "generic").query;
      },
      expect: '(aged OR "older adults") AND (exercise)'
    },
    {
      name: "词组 + 截词冲突：去掉截词符（截词不能写在引号里）",
      run: function () {
        return compile([{ terms: [{ text: "older adult*" }] }], "pubmed").query;
      },
      expect: '("older adult"[Title/Abstract])'
    },
    {
      name: "用户输入里的括号与引号被剔掉，不破坏结构",
      run: function () {
        return compile([{ terms: [{ text: 'ag(ed) "x"' }] }], "generic").query;
      },
      expect: '("ag ed x")'
    },
    {
      name: "空块被跳过，不产生空括号",
      run: function () {
        return compile([
          { label: "空的", terms: [] },
          { terms: [{ text: "aged" }] }
        ], "pubmed").query;
      },
      expect: "(aged[Title/Abstract])"
    },
    {
      name: "全空 → 空串，不是 () 也不是 undefined",
      run: function () { return compile([], "pubmed").query; },
      expect: ""
    },
    {
      name: "示例问题编译成一条完整的 PubMed 查询",
      run: function () { return compile(DEMO.blocks, "pubmed").query; },
      expect:
        '(aged[Title/Abstract] OR elderly[Title/Abstract] OR "older adults"[Title/Abstract])' +
        ' AND (exercise[Title/Abstract] OR "physical activity"[Title/Abstract])' +
        ' AND ("accidental falls"[MeSH Terms] OR fall*[Title/Abstract])'
    },
    {
      name: "同一份概念结构换个方言重编译，不必手工维护第二份字符串",
      run: function () { return compileAll(DEMO.blocks).arxiv.query; },
      expect:
        '(abs:aged OR abs:elderly OR abs:"older adults")' +
        ' AND (abs:exercise OR abs:"physical activity")' +
        ' AND (all:"accidental falls" OR abs:fall)'
    },
    {
      name: "降级与去截词都留下了说明，不是默默改掉",
      run: function () {
        var r = compile(DEMO.blocks, "arxiv");
        var hasDown = r.notes.some(function (n) { return n.indexOf("降级") >= 0; });
        var hasTrunc = r.notes.some(function (n) { return n.indexOf("截词") >= 0; });
        return hasDown && hasTrunc ? "ok" : "缺说明：" + r.notes.join(" | ");
      },
      expect: "ok"
    },
    {
      name: "括号配平：左右数量相等",
      run: function () {
        var q = compile(DEMO.blocks, "pubmed").query;
        var l = (q.match(/\(/g) || []).length, r = (q.match(/\)/g) || []).length;
        return l === r && l === 3 ? "ok" : l + "/" + r;
      },
      expect: "ok"
    },
    {
      name: "更正记在具体那一个词上：arXiv 的主题词降级点名到 accidental falls",
      run: function () {
        var r = compile(DEMO.blocks, "arxiv");
        var hit = r.changed.filter(function (p) {
          return p.changes.some(function (c) { return c.kind === "field"; });
        });
        if (hit.length !== 1) return "点名了 " + hit.length + " 个词";
        var only = hit[0];
        return only.text + " / " + only.fieldLabel + " → " + only.usedLabel +
          (/arXiv/.test(only.changes[0].why) ? " / 带库名" : " / 缺库名");
      },
      expect: "accidental falls / 主题词 → 全字段 / 带库名"
    },
    {
      name: "去掉截词也记在那一个词上，不只汇进说明列表",
      run: function () {
        var r = compile(DEMO.blocks, "arxiv");
        var hit = r.changed.filter(function (p) {
          return p.changes.some(function (c) { return c.kind === "truncation"; });
        });
        return hit.length === 1 ? hit[0].text : hit.map(function (p) { return p.text; }).join(",");
      },
      expect: "fall"
    },
    {
      name: "骨架拼起来逐字等于查询串",
      run: function () {
        var bad = [];
        DIALECT_IDS.forEach(function (id) {
          var r = compile(DEMO.blocks, id);
          var joined = "";
          r.tokens.forEach(function (token) { joined += tokenText(token, r.pieces); });
          if (joined !== r.query) bad.push(id);
        });
        return bad.length ? bad.join(",") : "ok";
      },
      expect: "ok"
    },
    {
      name: "可追溯记录带上数据库与检索日期",
      run: function () {
        var line = provenance(compile([{ terms: [{ text: "aged" }] }], "pubmed"), "2026-08-13");
        return /PubMed/.test(line) && /2026-08-13/.test(line) ? "ok" : line;
      },
      expect: "ok"
    }
  ];

  function runSelfTest() {
    var failures = [];
    for (var i = 0; i < CASES.length; i++) {
      var c = CASES[i];
      var got;
      try {
        got = c.run();
      } catch (err) {
        failures.push({ name: c.name, why: "抛异常：" + (err && err.message ? err.message : err) });
        continue;
      }
      if (got !== c.expect) {
        failures.push({ name: c.name, why: "期望\n         " + c.expect + "\n       得到\n         " + got });
      }
    }
    return { total: CASES.length, passed: CASES.length - failures.length, failures: failures };
  }

  var api = {
    FIELD_LABELS: FIELD_LABELS,
    DIALECTS: DIALECTS,
    DIALECT_IDS: DIALECT_IDS,
    compile: compile,
    compileAll: compileAll,
    provenance: provenance,
    countTerms: countTerms,
    renderTerm: renderTerm,
    renderPiece: renderPiece,
    tokenText: tokenText,
    CASES: CASES,
    runSelfTest: runSelfTest,
    DEMO: DEMO
  };

  if (typeof module === "object" && module && module.exports) module.exports = api;
  if (root) root.QueryBuilderEngine = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
