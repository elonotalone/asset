(function (root) {
  "use strict";

  var DEFAULTS = {
    chineseRate: 216,
    englishRate: 150,
    fps: 25
  };

  function finite(value, fallback) {
    var n = Number(value);
    return isFinite(n) ? n : fallback;
  }

  function positive(value, fallback) {
    var n = finite(value, fallback);
    return n > 0 ? n : fallback;
  }

  function nonNegative(value, fallback) {
    var n = finite(value, fallback);
    return n >= 0 ? n : fallback;
  }

  function countChinese(text) {
    var match = String(text || "").match(/[\u3400-\u9fff]/g);
    return match ? match.length : 0;
  }

  function countEnglishWords(text) {
    var match = String(text || "").match(/[A-Za-z]+(?:['’-][A-Za-z]+)*|\d+(?:[.,]\d+)*/g);
    return match ? match.length : 0;
  }

  function measureText(text, mode) {
    var chosen = mode === "en" || mode === "mixed" ? mode : "zh";
    return {
      chinese: chosen === "en" ? 0 : countChinese(text),
      english: chosen === "zh" ? 0 : countEnglishWords(text),
      mode: chosen
    };
  }

  function budgetFor(targetSeconds, chineseRate) {
    var seconds = nonNegative(targetSeconds, 0);
    var rate = positive(chineseRate, DEFAULTS.chineseRate);
    return Math.round(seconds * rate / 60);
  }

  function paragraphDuration(paragraph, settings) {
    settings = settings || {};
    paragraph = paragraph || {};
    var counts = measureText(paragraph.text, paragraph.mode);
    var chineseRate = positive(settings.chineseRate, DEFAULTS.chineseRate);
    var englishRate = positive(settings.englishRate, DEFAULTS.englishRate);
    var pauseSeconds = nonNegative(paragraph.pauseSeconds, 0);
    var chineseSeconds = counts.chinese / (chineseRate / 60);
    var englishSeconds = counts.english / (englishRate / 60);
    var speakingSeconds = chineseSeconds + englishSeconds;
    return {
      counts: counts,
      chineseSeconds: chineseSeconds,
      englishSeconds: englishSeconds,
      speakingSeconds: speakingSeconds,
      pauseSeconds: pauseSeconds,
      totalSeconds: speakingSeconds + pauseSeconds
    };
  }

  function secondsToFrame(seconds, fps) {
    return Math.round(nonNegative(seconds, 0) * positive(fps, DEFAULTS.fps));
  }

  function frameToSeconds(frame, fps) {
    return nonNegative(frame, 0) / positive(fps, DEFAULTS.fps);
  }

  function pad(value, width) {
    var out = String(Math.max(0, Math.floor(value)));
    while (out.length < width) out = "0" + out;
    return out;
  }

  function formatClock(seconds) {
    var total = Math.max(0, Math.round(nonNegative(seconds, 0)));
    var hours = Math.floor(total / 3600);
    var minutes = Math.floor((total % 3600) / 60);
    var secs = total % 60;
    if (hours) return hours + ":" + pad(minutes, 2) + ":" + pad(secs, 2);
    return minutes + ":" + pad(secs, 2);
  }

  function formatFramecode(frame, fps) {
    var rate = Math.max(1, Math.round(positive(fps, DEFAULTS.fps)));
    var value = Math.max(0, Math.round(nonNegative(frame, 0)));
    var frames = value % rate;
    var wholeSeconds = Math.floor(value / rate);
    var seconds = wholeSeconds % 60;
    var minutes = Math.floor(wholeSeconds / 60) % 60;
    var hours = Math.floor(wholeSeconds / 3600);
    return pad(hours, 2) + ":" + pad(minutes, 2) + ":" + pad(seconds, 2) + ":" + pad(frames, 2);
  }

  function buildTimeline(paragraphs, settings) {
    settings = settings || {};
    var fps = positive(settings.fps, DEFAULTS.fps);
    var cursor = 0;
    var rows = (Array.isArray(paragraphs) ? paragraphs : []).map(function (paragraph, index) {
      var duration = paragraphDuration(paragraph, settings);
      var startSeconds = cursor;
      cursor += duration.totalSeconds;
      var startFrame = secondsToFrame(startSeconds, fps);
      var endFrame = secondsToFrame(cursor, fps);
      return {
        index: index,
        paragraph: paragraph,
        counts: duration.counts,
        speakingSeconds: duration.speakingSeconds,
        pauseSeconds: duration.pauseSeconds,
        durationSeconds: duration.totalSeconds,
        startSeconds: startSeconds,
        endSeconds: cursor,
        startFrame: startFrame,
        endFrame: endFrame,
        alignedSeconds: frameToSeconds(endFrame - startFrame, fps),
        startCode: formatFramecode(startFrame, fps),
        endCode: formatFramecode(endFrame, fps)
      };
    });
    return {
      rows: rows,
      totalSeconds: cursor,
      totalFrames: secondsToFrame(cursor, fps),
      fps: fps
    };
  }

  function languageLabel(mode) {
    if (mode === "en") return "英文·按词";
    if (mode === "mixed") return "中英混排·分开计";
    return "中文·按字";
  }

  function countLabel(row) {
    if (row.counts.mode === "en") return row.counts.english + " 词";
    if (row.counts.mode === "mixed") return row.counts.chinese + " 字 + " + row.counts.english + " 词";
    return row.counts.chinese + " 字";
  }

  function exportScript(paragraphs, settings, targetSeconds) {
    settings = settings || {};
    var timeline = buildTimeline(paragraphs, settings);
    var target = nonNegative(targetSeconds, 0);
    var lines = [
      "口播脚本",
      "目标：" + formatClock(target) + "｜中文 " + positive(settings.chineseRate, DEFAULTS.chineseRate) +
        " 字/分钟｜英文 " + positive(settings.englishRate, DEFAULTS.englishRate) +
        " 词/分钟｜" + positive(settings.fps, DEFAULTS.fps) + " fps",
      "计数口径：中文按字、英文按词；中英混排分别计时后相加，两种单位不等价。",
      ""
    ];
    if (!timeline.rows.length) {
      lines.push("还没有段落。添加第一段后，时间码会在这里同步生成。");
      return lines.join("\n");
    }
    timeline.rows.forEach(function (row) {
      var paragraph = row.paragraph;
      lines.push((row.index + 1) + ". " + (paragraph.title || "未命名段落"));
      lines.push(row.startCode + " --> " + row.endCode + "｜" + languageLabel(paragraph.mode) +
        "｜" + countLabel(row) + "｜停顿 " + row.pauseSeconds.toFixed(1) + " 秒");
      lines.push("口播：" + String(paragraph.text || ""));
      if (paragraph.subtitle) lines.push("字幕：" + paragraph.subtitle);
      if (paragraph.visualNote) lines.push("画面：" + paragraph.visualNote);
      lines.push("");
    });
    lines.push("总计：" + formatClock(timeline.totalSeconds) + "｜末帧 " + timeline.totalFrames);
    return lines.join("\n");
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  var DEMO = [
    {
      id: "segment-1", title: "开场提问", mode: "zh",
      text: "如果每天少买一杯咖啡，把省下的钱持续投入，十年后会发生什么？",
      pauseSeconds: 0.8,
      subtitle: "每天省下一杯咖啡，十年后会怎样？",
      visualNote: "咖啡杯切到逐年增长的储蓄数字"
    },
    {
      id: "segment-2", title: "解释复利", mode: "mixed",
      text: "关键不只看 ROI，还要让每一期收益继续参与下一期增长。",
      pauseSeconds: 0.6,
      subtitle: "收益继续产生收益，时间开始放大差距",
      visualNote: "本金与收益两条数字逐期合并"
    },
    {
      id: "segment-3", title: "行动收束", mode: "zh",
      text: "先从能持续的小额开始，再按自己的现金流慢慢调整。",
      pauseSeconds: 1,
      subtitle: "先持续，再调整",
      visualNote: "回到人物正面，落出行动清单"
    }
  ];

  var CASES = [
    {
      name: "90 秒按 216 字每分钟给出 324 字预算",
      run: function () { return budgetFor(90, 216); },
      expect: 324
    },
    {
      name: "改语速不会缩放段后停顿",
      run: function () {
        var p = { text: "一二三四五六", mode: "zh", pauseSeconds: 1.25 };
        var slow = paragraphDuration(p, { chineseRate: 120 });
        var fast = paragraphDuration(p, { chineseRate: 240 });
        return slow.pauseSeconds + "/" + fast.pauseSeconds + "/" +
          (slow.totalSeconds - slow.speakingSeconds) + "/" + (fast.totalSeconds - fast.speakingSeconds);
      },
      expect: "1.25/1.25/1.25/1.25"
    },
    {
      name: "30.400 秒在 25 fps 对齐到第 760 帧",
      run: function () { return secondsToFrame(30.400, 25); },
      expect: 760
    },
    {
      name: "改第 2 段会等量平移后续起点且末段终点等于时长之和",
      run: function () {
        var settings = { chineseRate: 120, englishRate: 150, fps: 25 };
        var base = [
          { text: "一二三四", mode: "zh", pauseSeconds: 0.5 },
          { text: "五六", mode: "zh", pauseSeconds: 0.5 },
          { text: "七八九", mode: "zh", pauseSeconds: 0.5 },
          { text: "甲乙", mode: "zh", pauseSeconds: 0.5 }
        ];
        var before = buildTimeline(base, settings);
        var changed = clone(base);
        changed[1].text += "十百千万";
        var after = buildTimeline(changed, settings);
        var shift3 = after.rows[2].startFrame - before.rows[2].startFrame;
        var shift4 = after.rows[3].startFrame - before.rows[3].startFrame;
        var sum = after.rows.reduce(function (total, row) { return total + row.durationSeconds; }, 0);
        var last = after.rows[after.rows.length - 1];
        return shift3 > 0 && shift3 === shift4 && Math.abs(last.endSeconds - sum) < 1e-9 ? "ok" : "bad";
      },
      expect: "ok"
    },
    {
      name: "中英混排分别给出中文字与英文词数",
      run: function () {
        var counts = measureText("复利 ROI grows fast", "mixed");
        return counts.chinese + "/" + counts.english;
      },
      expect: "2/3"
    },
    {
      name: "空段落仍保留用户写死的停顿",
      run: function () {
        return paragraphDuration({ text: "", mode: "zh", pauseSeconds: 0.8 }, { chineseRate: 216 }).totalSeconds;
      },
      expect: 0.8
    }
  ];

  function runSelfTest() {
    var failures = [];
    CASES.forEach(function (test) {
      var got;
      try {
        got = test.run();
      } catch (err) {
        failures.push({ name: test.name, why: "抛异常：" + (err && err.message ? err.message : err) });
        return;
      }
      if (got !== test.expect) failures.push({ name: test.name, why: "期望 " + test.expect + "，得到 " + got });
    });
    return { total: CASES.length, passed: CASES.length - failures.length, failures: failures };
  }

  var api = {
    DEFAULTS: DEFAULTS,
    countChinese: countChinese,
    countEnglishWords: countEnglishWords,
    measureText: measureText,
    budgetFor: budgetFor,
    paragraphDuration: paragraphDuration,
    secondsToFrame: secondsToFrame,
    frameToSeconds: frameToSeconds,
    formatClock: formatClock,
    formatFramecode: formatFramecode,
    buildTimeline: buildTimeline,
    languageLabel: languageLabel,
    countLabel: countLabel,
    exportScript: exportScript,
    clone: clone,
    DEMO: DEMO,
    CASES: CASES,
    runSelfTest: runSelfTest
  };

  if (typeof module === "object" && module && module.exports) module.exports = api;
  if (root) root.VoiceoverScriptEngine = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
