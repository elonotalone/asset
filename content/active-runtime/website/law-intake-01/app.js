// 由 asm-web 生成。零依赖、零构建:直接被 <script src> 加载即可运行。
(function () {
  "use strict";
  var blocks = Array.prototype.slice.call(document.querySelectorAll("section.block"));
  var links = Array.prototype.slice.call(document.querySelectorAll(".nav-link"));
  if (!blocks.length) return;

  function markActive(id) {
    links.forEach(function (a) {
      var on = a.getAttribute("href") === "#" + id;
      if (on) a.classList.add("is-active");
      else a.classList.remove("is-active");
    });
  }

  if (typeof IntersectionObserver === "function") {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) markActive(e.target.id);
      });
    }, { rootMargin: "-45% 0px -45% 0px" });
    blocks.forEach(function (b) { io.observe(b); });
  } else {
    markActive(blocks[0].id);
  }

  // 目录直接从已经渲染的静态正文读取；主动运行闭包不发任何网络请求。
  function renderToc(sections) {
    var main = document.querySelector(".site-main");
    if (!main || !sections.length) return;
    var box = document.createElement("aside");
    box.className = "site-toc";
    box.setAttribute("aria-label", "contents");
    var summary = document.createElement("strong");
    summary.textContent = "本页共 " + sections.length + " 个区块";
    box.appendChild(summary);
    var list = document.createElement("ol");
    sections.forEach(function (s) {
      var id = String((s && s.id) || "");
      var item = document.createElement("li");
      var link = document.createElement("a");
      link.setAttribute("href", "#" + id);
      link.textContent = String((s && (s.heading || s.id)) || "");
      item.appendChild(link);
      list.appendChild(item);
    });
    box.appendChild(list);
    main.insertBefore(box, main.firstChild);
  }

  function fromDom() {
    return blocks.map(function (b) {
      var h = b.querySelector(".block-heading");
      return { id: b.id, heading: h ? h.textContent : b.id };
    });
  }

  renderToc(fromDom());
})();
