(function () {
  "use strict";

  var E = window.SpacedRepetitionEngine;
  var today = E.todayISO();
  var cards = [];
  var nextId = 1;
  var els = {};

  function node(tag, cls, value) {
    var out = document.createElement(tag);
    if (cls) out.className = cls;
    if (value !== undefined && value !== null) out.textContent = String(value);
    return out;
  }
  function clear(target) { while (target.firstChild) target.removeChild(target.firstChild); }
  function value(id) { return document.getElementById(id).value; }
  function replaceCard(next) {
    cards = cards.map(function (card) { return card.id === next.id ? next : card; });
  }
  function offsetLabel(offset) {
    if (offset === 0) return "今天";
    if (offset === 1) return "明天";
    return "+" + offset + " 天";
  }

  function renderSummary() {
    var due = E.dueCards(cards, today);
    var next = E.nextDueDate(cards);
    els.cardCount.textContent = cards.length + " 张";
    els.dueCount.textContent = due.length + " 张";
    els.nextDue.textContent = next || "—";
    els.basis.textContent = cards.length
      ? "日期按 UTC 日历日计算；间隔始终从上一轮已经取整的天数继续。"
      : "零张卡是正常起点；算法摘要与未来日期轴已展开。";
    els.add.textContent = cards.length ? "再加一张卡" : "加第一张卡";
  }

  function ratingButton(card, q, back, rating) {
    var button = node("button", null, String(q));
    button.type = "button";
    button.setAttribute("aria-label", "评分 " + q);
    button.addEventListener("click", function () {
      var reviewed = E.reviewCard(card, q, today);
      if (reviewed.error) { els.note.textContent = reviewed.error; return; }
      replaceCard(reviewed.card);
      els.note.textContent = reviewed.reason + " 下次复习：" + reviewed.card.dueDate;
      back.hidden = true;
      rating.hidden = true;
      renderAll();
    });
    return button;
  }

  function renderQueue() {
    var due = E.dueCards(cards, today);
    clear(els.queueList);
    els.queueEmpty.hidden = due.length > 0;
    due.forEach(function (card) {
      var article = node("article", "due-card");
      var head = node("div", "card-head");
      head.appendChild(node("strong", null, card.front));
      head.appendChild(node("span", "card-meta", "下次复习：" + card.dueDate));
      article.appendChild(head);

      var reveal = node("button", "reveal", "显示答案");
      reveal.type = "button";
      var back = node("p", "card-back", card.back);
      back.hidden = true;
      var rating = node("div", "rating");
      rating.hidden = true;
      rating.appendChild(node("span", null, "回忆质量 q"));
      for (var q = 0; q <= 5; q++) rating.appendChild(ratingButton(card, q, back, rating));
      reveal.addEventListener("click", function () {
        back.hidden = false;
        rating.hidden = false;
        reveal.hidden = true;
      });
      article.appendChild(reveal);
      article.appendChild(back);
      article.appendChild(rating);
      els.queueList.appendChild(article);
    });
  }

  function appendCell(row, value) { row.appendChild(node("td", null, value)); }

  function renderRegistry() {
    clear(els.cardRows);
    els.registryEmpty.hidden = cards.length > 0;
    cards.forEach(function (card) {
      var row = document.createElement("tr");
      appendCell(row, card.front);
      appendCell(row, String(card.repetitions));
      appendCell(row, card.intervalDays + " 天");
      appendCell(row, card.easeFactor.toFixed(2));
      appendCell(row, card.dueDate);
      els.cardRows.appendChild(row);
    });
  }

  function renderTimeline() {
    clear(els.timelineRows);
    E.buildTimeline(cards, today, 7).forEach(function (item) {
      var row = document.createElement("tr");
      if (item.offset === 0) row.className = "today-row";
      appendCell(row, item.date);
      appendCell(row, offsetLabel(item.offset));
      appendCell(row, item.count + " 张");
      els.timelineRows.appendChild(row);
    });
  }

  function renderAll() {
    renderSummary();
    renderQueue();
    renderRegistry();
    renderTimeline();
  }

  function addCard() {
    var made = E.createCard({
      id: nextId,
      front: value("front"),
      back: value("back"),
      createdOn: today,
      startNow: document.getElementById("start-now").checked
    });
    if (made.error) { els.error.textContent = made.error; return; }
    els.error.textContent = "";
    cards.push(made.card);
    nextId++;
    document.getElementById("front").value = "";
    document.getElementById("back").value = "";
    els.note.textContent = "已加入“" + made.card.front + "”；下次复习：" + made.card.dueDate;
    renderAll();
  }

  function runTest() {
    var report = E.runSelfTest();
    els.testOut.textContent = report.passed + " / " + report.total + " 通过";
    clear(els.testDetail);
    report.failures.forEach(function (failure) { els.testDetail.appendChild(node("li", null, failure.name + " —— " + failure.why)); });
    if (report.failures.length === 0) els.testDetail.appendChild(node("li", null, "SM-2 起点、更新式、失败保 EF、取整间隔与日期运算均通过。"));
  }

  function mount() {
    els.add = document.getElementById("add-card");
    els.error = document.getElementById("editor-error");
    els.cardCount = document.getElementById("card-count");
    els.dueCount = document.getElementById("due-count");
    els.nextDue = document.getElementById("next-due");
    els.basis = document.getElementById("basis-line");
    els.queueEmpty = document.getElementById("queue-empty");
    els.queueList = document.getElementById("queue-list");
    els.note = document.getElementById("action-note");
    els.cardRows = document.getElementById("card-rows");
    els.registryEmpty = document.getElementById("registry-empty");
    els.timelineRows = document.getElementById("timeline-rows");
    els.testOut = document.getElementById("test-out");
    els.testDetail = document.getElementById("test-detail");
    els.add.addEventListener("click", addCard);
    document.getElementById("run-test").addEventListener("click", runTest);
    renderAll();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount);
  else mount();
})();
