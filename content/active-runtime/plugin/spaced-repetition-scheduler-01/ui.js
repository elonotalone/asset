(function () {
  "use strict";

  var E = window.SpacedRepetitionEngine;
  var DAY_MS = 24 * 60 * 60 * 1000;
  var today = E.todayISO();
  var RATINGS = [
    { q: 1, name: "忘记了", tone: "close" },
    { q: 3, name: "有点吃力", tone: "near" },
    { q: 4, name: "记住了", tone: "mid" },
    { q: 5, name: "很轻松", tone: "far" }
  ];

  var cards = [];
  var nextId = 1;
  var phase = "front";
  var focusId = 0;
  var rated = null;
  var els = {};

  function node(tag, cls, text) {
    var out = document.createElement(tag);
    if (cls) out.className = cls;
    if (text !== undefined && text !== null) out.textContent = String(text);
    return out;
  }
  function clear(target) { while (target.firstChild) target.removeChild(target.firstChild); }
  function excerpt(text, limit) {
    var value = String(text || "").replace(/\s+/g, " ").trim();
    return value.length > limit ? value.slice(0, limit) + "…" : value;
  }
  function daysBetween(from, to) {
    return Math.round((Date.parse(to + "T00:00:00Z") - Date.parse(from + "T00:00:00Z")) / DAY_MS);
  }
  function whenLabel(date) {
    var gap = daysBetween(today, date);
    if (gap <= 0) return "今天再来";
    return gap + " 天后";
  }
  function cardById(id) {
    for (var i = 0; i < cards.length; i++) if (cards[i].id === id) return cards[i];
    return null;
  }
  function replaceCard(next) {
    cards = cards.map(function (card) { return card.id === next.id ? next : card; });
  }

  function currentCard() {
    var due = E.dueCards(cards, today);
    if (!due.length) return null;
    if (focusId) {
      for (var i = 0; i < due.length; i++) if (due[i].id === focusId) return due[i];
    }
    return due[0];
  }

  /* ---------- 一张卡的三步：读正面、揭开答案、评价这次回忆 ---------- */

  function renderReview(card) {
    clear(els.review);
    els.review.className = "card";
    var faces = node("div", "faces");
    faces.appendChild(node("p", "face", card.front));
    els.review.appendChild(faces);

    if (phase === "front") {
      var act = node("div", "act");
      var reveal = node("button", "go", "想好了，看答案");
      reveal.type = "button";
      reveal.addEventListener("click", function () { phase = "back"; show(); });
      act.appendChild(reveal);
      els.review.appendChild(act);
      return;
    }

    faces.appendChild(node("div", "seam"));
    faces.appendChild(node("p", "face face-answer", card.back));

    if (phase === "back") {
      var ask = node("div", "rate");
      RATINGS.forEach(function (rating) {
        var button = node("button", "rate-go", rating.name);
        button.type = "button";
        button.addEventListener("click", function () {
          var done = E.reviewCard(card, rating.q, today);
          if (done.error) { els.warn.textContent = done.error; return; }
          replaceCard(done.card);
          rated = { id: card.id, front: card.front, dueDate: done.card.dueDate, tone: rating.tone, name: rating.name };
          phase = "rated";
          focusId = 0;
          show();
        });
        ask.appendChild(button);
      });
      els.review.appendChild(ask);
      return;
    }

    faces.classList.add("retreat-" + rated.tone);
    var stamp = node("p", "next-see");
    stamp.appendChild(node("span", "next-word", "下次见"));
    stamp.appendChild(node("span", "next-date", rated.dueDate));
    stamp.appendChild(node("span", "next-gap", whenLabel(rated.dueDate)));
    els.review.appendChild(stamp);

    var after = node("div", "act");
    var upcoming = E.dueCards(cards, today);
    var go = node("button", "go go-quiet", upcoming.length
      ? "下一张：" + excerpt(upcoming[0].front, 14)
      : "今天到这里");
    go.type = "button";
    go.addEventListener("click", function () {
      rated = null;
      phase = "front";
      show();
    });
    after.appendChild(go);
    els.review.appendChild(after);
  }

  function renderHeadline() {
    clear(els.headline);
    if (!cards.length || currentCard() || phase === "rated") { els.headline.hidden = true; return; }
    var date = E.nextDueDate(cards);
    els.headline.appendChild(node("p", "headline-main", "今天的卡都复习完了"));
    if (date) {
      var back = cards.filter(function (card) { return card.dueDate === date; })[0];
      var line = node("p", "headline-note");
      line.appendChild(document.createTextNode("最近回来的是「" + excerpt(back.front, 20) + "」，"));
      line.appendChild(node("span", "next-date", date));
      line.appendChild(node("span", "next-gap", whenLabel(date)));
      els.headline.appendChild(line);
    }
    els.headline.hidden = false;
  }

  function keepCard() {
    var made = E.createCard({
      id: nextId,
      front: els.front.value,
      back: els.back.value,
      createdOn: today,
      startNow: true
    });
    if (made.error) { els.warn.textContent = made.error; return; }
    els.warn.textContent = "";
    cards.push(made.card);
    nextId++;
    focusId = made.card.id;
    phase = "front";
    rated = null;
    els.front.value = "";
    els.back.value = "";
    show();
  }

  function show() {
    var card = phase === "rated" && rated ? cardById(rated.id) : currentCard();
    var reviewing = !!card;
    els.review.hidden = !reviewing;
    els.newCard.hidden = reviewing;
    if (reviewing) {
      renderReview(phase === "rated" ? { front: rated.front, back: card.back, id: card.id } : card);
    } else {
      var written = !!els.front.value.trim();
      els.backWrap.hidden = !written;
      els.newAct.hidden = !written;
      els.front.focus();
    }
    renderHeadline();
  }

  function mount() {
    els.front = document.getElementById("front");
    els.back = document.getElementById("back");
    els.backWrap = document.getElementById("back-wrap");
    els.newAct = document.getElementById("new-act");
    els.newCard = document.getElementById("new-card");
    els.review = document.getElementById("review");
    els.headline = document.getElementById("headline");
    els.warn = document.getElementById("new-warn");

    els.front.addEventListener("input", function () { if (!currentCard()) show(); });
    document.getElementById("keep").addEventListener("click", keepCard);
    show();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount);
  else mount();
})();
