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

  // 目录:从内容清单渲染,清单取不到就退回从 DOM 读,两条路都不改正文。
  function renderToc(sections) {
    var main = document.querySelector(".site-main");
    if (!main || !sections.length) return;
    var box = document.createElement("aside");
    box.className = "site-toc";
    box.setAttribute("aria-label", "contents");
    var html = ["<strong>本页共 " + sections.length + " 个区块</strong><ol>"];
    sections.forEach(function (s) {
      html.push("<li><a href=\"#" + s.id + "\">" + (s.heading || s.id) + "</a></li>");
    });
    html.push("</ol>");
    box.innerHTML = html.join("");
    main.insertBefore(box, main.firstChild);
  }

  function fromDom() {
    return blocks.map(function (b) {
      var h = b.querySelector(".block-heading");
      return { id: b.id, heading: h ? h.textContent : b.id };
    });
  }

  try {
    if (typeof fetch === "function") {
      fetch("content.json")
        .then(function (r) { return r.json(); })
        .then(function (doc) {
          var pages = (doc && doc.pages) || [];
          var sections = pages.reduce(function (acc, p) { return acc.concat(p.sections || []); }, []);
          renderToc(sections.length ? sections : fromDom());
        })
        .catch(function () { renderToc(fromDom()); });
    } else {
      renderToc(fromDom());
    }
  } catch (err) {
    renderToc(fromDom());
  }
})();
