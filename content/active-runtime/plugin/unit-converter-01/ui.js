(function () {
  "use strict";

  var E = window.UnitConverterEngine;

  function el(id) { return document.getElementById(id); }

  var pair = el("pair");
  var bridge = el("bridge");
  var relation = el("relation");
  var sides = {
    left: { box: el("side-left"), num: el("value-left"), unit: el("unit-left"), role: el("role-left") },
    right: { box: el("side-right"), num: el("value-right"), unit: el("unit-right"), role: el("role-right") }
  };

  /** 当前正在被编辑的那一端；另一端是跟着变的结果。 */
  var source = "left";
  var other = function (which) { return which === "left" ? "right" : "left"; };

  function unitText(unit) {
    return unit.label + "（" + unit.symbol + "）";
  }

  /** 单位下拉按量纲分组：用户点单位名就换单位，量纲随之确定，不另立类别栏。 */
  function fillUnitSelect(select) {
    E.CATEGORIES.forEach(function (cat) {
      var group = document.createElement("optgroup");
      group.label = cat.label;
      cat.units.forEach(function (unit) {
        var option = document.createElement("option");
        option.value = unit.id;
        option.textContent = unitText(unit);
        group.appendChild(option);
      });
      select.appendChild(group);
    });
  }

  function fitNumber(node, text) {
    node.classList.remove("long", "longer");
    if (text.length > 18) node.classList.add("longer");
    else if (text.length > 11) node.classList.add("long");
  }

  /** 结果那一端换数时滚一下：让人看见哪一端是输入、哪一端是响应。 */
  function roll(node) {
    node.classList.add("rolling");
    window.setTimeout(function () { node.classList.remove("rolling"); }, 20);
  }

  function writeResult(which, text, waiting) {
    var node = sides[which].num;
    if (node.value === text) return;
    roll(node);
    node.value = text;
    node.classList.toggle("waiting", waiting === true);
    fitNumber(node, text);
  }

  function markRoles() {
    sides[source].role.textContent = "原数";
    sides[other(source)].role.textContent = "结果";
  }

  function render() {
    var fromId = sides[source].unit.value;
    var toId = sides[other(source)].unit.value;
    markRoles();

    var word = E.relationOf(fromId, toId);
    relation.textContent = word;
    bridge.setAttribute("data-exact", word === "精确定义" ? "true" : "false");

    var value = E.parse(sides[source].num.value);
    if (value === null) {
      writeResult(other(source), "等一个数", true);
      return;
    }
    var out = E.convert(fromId, value, toId);
    writeResult(other(source), E.format(out.value), false);
    fitNumber(sides[source].num, sides[source].num.value);
  }

  /** 换到另一个量纲时，另一端落到这一对的默认搭档上，画面仍然只有一对数。 */
  function alignCategories(changed) {
    var changedUnit = sides[changed].unit.value;
    var partnerSide = other(changed);
    var here = E.categoryOfUnit(changedUnit);
    var there = E.categoryOfUnit(sides[partnerSide].unit.value);
    if (here && there && here.id === there.id) {
      if (sides[partnerSide].unit.value !== changedUnit) return;
    }
    sides[partnerSide].unit.value = E.partnerOf(changedUnit);
  }

  function mount() {
    ["left", "right"].forEach(function (which) {
      fillUnitSelect(sides[which].unit);
      sides[which].num.addEventListener("input", function () {
        source = which;
        render();
      });
      sides[which].num.addEventListener("focus", function () {
        source = which;
        markRoles();
      });
      sides[which].unit.addEventListener("change", function () {
        alignCategories(which);
        render();
      });
    });

    var start = E.DEFAULT;
    sides.left.unit.value = start.from;
    sides.right.unit.value = start.to;
    sides.left.num.value = E.format(start.value);
    fitNumber(sides.left.num, sides.left.num.value);
    render();
    pair.setAttribute("data-ready", "true");
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount);
  else mount();
})();
