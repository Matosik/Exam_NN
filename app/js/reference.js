/* ============================================================
   reference.js — отрисовка справочника (формулы / факты / глоссарий)
   Данные: window.REFERENCE_DATA (из data/reference.js) или fetch reference.json
   ============================================================ */
(function () {
  "use strict";

  var $ = function (id) { return document.getElementById(id); };
  function esc(s) {
    return String(s).replace(/[&<>]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c];
    });
  }

  var TOPICS = {}, REF = [];

  function boot(data) {
    TOPICS = data.topics;
    REF = data.reference;
    renderNav();
    renderContent();
    bindSearch();
  }

  function loadData() {
    if (window.REFERENCE_DATA) { boot(window.REFERENCE_DATA); return; }
    fetch("data/reference.json")
      .then(function (r) { return r.json(); })
      .then(boot)
      .catch(function () {
        $("refContent").innerHTML =
          '<p class="hint">Не удалось загрузить справочник. Откройте через локальный сервер ' +
          '(см. README) или убедитесь, что рядом лежит data/reference.js.</p>';
      });
  }

  /* навигация по темам (якоря) */
  function renderNav() {
    var nav = $("refNav"); nav.innerHTML = "";
    REF.forEach(function (blk) {
      var a = document.createElement("a");
      a.className = "chip";
      a.href = "#sec-" + blk.topic;
      a.textContent = TOPICS[blk.topic].replace(/^Тема \d+\. /, "");
      a.onclick = function (e) {
        e.preventDefault();
        var el = $("sec-" + blk.topic);
        if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
      };
      nav.appendChild(a);
    });
  }

  /* основной контент */
  function renderContent() {
    var box = $("refContent"); box.innerHTML = "";
    REF.forEach(function (blk) {
      var sec = document.createElement("section");
      sec.className = "ref-topic panel";
      sec.id = "sec-" + blk.topic;

      var html = '<h2 class="ref-h">' + esc(TOPICS[blk.topic]) + "</h2>";

      // формулы
      if (blk.formulas && blk.formulas.length) {
        html += '<h3 class="ref-sub">Ключевые формулы</h3><div class="formula-list">';
        blk.formulas.forEach(function (f) {
          var dt = (f.name + " " + f.expr + " " + (f.note || "")).toLowerCase();
          html += '<div class="formula" data-text="' + esc(dt) + '">' +
            '<div class="f-name">' + esc(f.name) + "</div>" +
            '<div class="f-expr">' + esc(f.expr) + "</div>" +
            (f.note ? '<div class="f-note">' + esc(f.note) + "</div>" : "") +
            "</div>";
        });
        html += "</div>";
      }

      // факты
      if (blk.facts && blk.facts.length) {
        html += '<h3 class="ref-sub">Что нужно знать</h3><ul class="fact-list">';
        blk.facts.forEach(function (ft) {
          html += '<li data-text="' + esc(ft.toLowerCase()) + '">' + esc(ft) + "</li>";
        });
        html += "</ul>";
      }

      // глоссарий
      if (blk.glossary && blk.glossary.length) {
        html += '<h3 class="ref-sub">Глоссарий</h3><div class="gloss-list">';
        blk.glossary.forEach(function (g) {
          var dt = (g.term + " " + g.def).toLowerCase();
          html += '<div class="gloss" data-text="' + esc(dt) + '">' +
            '<span class="g-term">' + esc(g.term) + "</span>" +
            '<span class="g-def">' + esc(g.def) + "</span>" +
            "</div>";
        });
        html += "</div>";
      }

      sec.innerHTML = html;
      box.appendChild(sec);
    });
  }

  /* поиск/фильтр по всему справочнику */
  function bindSearch() {
    var inp = $("refSearch");
    if (!inp) return;
    inp.addEventListener("input", function () {
      var q = inp.value.trim().toLowerCase();
      applyFilter(q);
    });
    $("refClear").onclick = function () { inp.value = ""; applyFilter(""); inp.focus(); };
  }

  function applyFilter(q) {
    var anyGlobal = false;
    REF.forEach(function (blk) {
      var sec = $("sec-" + blk.topic);
      if (!sec) return;
      var visibleInSec = 0;

      // элементы с data-text: формулы, факты, глоссарий
      var items = sec.querySelectorAll("[data-text]");
      items.forEach(function (el) {
        var match = !q || el.getAttribute("data-text").indexOf(q) >= 0;
        el.classList.toggle("hidden", !match);
        if (match) visibleInSec++;
      });

      // скрыть заголовки подсекций, если в них ничего не осталось
      hideEmptyBlock(sec, ".formula-list");
      hideEmptyBlock(sec, ".fact-list");
      hideEmptyBlock(sec, ".gloss-list");

      sec.classList.toggle("hidden", visibleInSec === 0 && !!q);
      if (visibleInSec > 0) anyGlobal = true;

      // подсветка в навигации
      var navLink = document.querySelector('#refNav a[href="#sec-' + blk.topic + '"]');
      if (navLink) navLink.classList.toggle("dim", visibleInSec === 0 && !!q);
    });

    var empty = $("refEmpty");
    if (empty) empty.classList.toggle("hidden", anyGlobal || !q);
  }

  /* прячет <h3> перед списком, если все его элементы скрыты */
  function hideEmptyBlock(sec, listSel) {
    var list = sec.querySelector(listSel);
    if (!list) return;
    var visible = list.querySelectorAll("[data-text]:not(.hidden)").length;
    list.classList.toggle("hidden", visible === 0);
    // соответствующий заголовок — предыдущий элемент
    var h = list.previousElementSibling;
    if (h && h.classList.contains("ref-sub")) h.classList.toggle("hidden", visible === 0);
  }

  loadData();
})();
