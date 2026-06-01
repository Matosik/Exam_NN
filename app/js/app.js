/* ============================================================
   app.js — логика тренажёра
   Зависит от: window.Store (storage.js) и данных вопросов
   (window.QUIZ_DATA из data/questions.js или fetch data/questions.json)
   ============================================================ */
(function () {
  "use strict";

  var $ = function (id) { return document.getElementById(id); };
  function shuffle(a) {
    a = a.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }
  function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }

  /* подгоняем высоту карточки под содержимое активной стороны,
     чтобы длинные списки ответов не вылезали за границы */
  function fitCard(toBack) {
    var face = toBack ? $("backFace") : document.querySelector(".face.front");
    if (!face) return;
    var card = $("card3d");
    card.style.height = "auto";            // сброс, чтобы можно было и уменьшить высоту
    var h = face.offsetHeight;             // чтение форсирует пересчёт по содержимому
    card.style.height = h + "px";
  }
  function flipToBack() {
    $("card3d").classList.add("flipped");
    fitCard(true);
  }

  /* ----------------- состояние ----------------- */
  var TOPICS = {}, ALL = [];
  var selectedTopics = new Set();
  var desiredCount = 20;
  var queue = [], pos = 0, answered = false;
  var sessOk = 0, sessNo = 0, sessByTopic = {}, sessLog = [];
  var lastWrongIds = [];
  var KEYS = ["A", "B", "C", "D"];

  /* ----------------- загрузка данных ----------------- */
  function boot(data) {
    TOPICS = data.topics;
    ALL = data.questions.map(function (q) { return q; });
    selectedTopics = new Set(Object.keys(TOPICS));
    bindEvents();
    renderChips();
    updateSetup();
  }

  function loadData() {
    if (global_QUIZ_DATA()) { boot(global_QUIZ_DATA()); return; }
    // запасной путь: fetch (работает при запуске через локальный сервер)
    fetch("data/questions.json")
      .then(function (r) { return r.json(); })
      .then(boot)
      .catch(function () {
        $("setup").innerHTML =
          '<p class="section-title">Не удалось загрузить вопросы</p>' +
          '<p class="hint">Откройте index.html через локальный сервер ' +
          '(см. README) или убедитесь, что рядом лежит файл data/questions.js.</p>';
      });
  }
  function global_QUIZ_DATA() { return window.QUIZ_DATA || null; }

  /* ----------------- экран настройки ----------------- */
  function renderChips() {
    var box = $("topicChips"); box.innerHTML = "";
    var allOn = selectedTopics.size === Object.keys(TOPICS).length;
    var allChip = document.createElement("div");
    allChip.className = "chip" + (allOn ? " on" : "");
    allChip.innerHTML = 'Все темы <span class="cnt">' + ALL.length + "</span>";
    allChip.onclick = function () {
      if (allOn) { selectedTopics.clear(); }
      else { selectedTopics = new Set(Object.keys(TOPICS)); }
      renderChips(); updateSetup();
    };
    box.appendChild(allChip);

    Object.keys(TOPICS).forEach(function (k) {
      var n = ALL.filter(function (q) { return q.topic === k; }).length;
      var c = document.createElement("div");
      c.className = "chip" + (selectedTopics.has(k) ? " on" : "");
      c.innerHTML = TOPICS[k].replace(/^Тема \d+\. /, "") + ' <span class="cnt">' + n + "</span>";
      c.onclick = function () {
        if (selectedTopics.has(k)) selectedTopics.delete(k); else selectedTopics.add(k);
        renderChips(); updateSetup();
      };
      box.appendChild(c);
    });
  }

  function pool() { return ALL.filter(function (q) { return selectedTopics.has(q.topic); }); }

  function updateSetup() {
    var p = pool();
    var n = p.length;
    // ограничим желаемое число доступным пулом
    desiredCount = clamp(desiredCount, 1, Math.max(1, n));
    $("countInput").value = desiredCount;
    $("startBtn").disabled = n === 0;
    $("setupHint").textContent = n === 0
      ? "Выберите хотя бы одну тему."
      : "Доступно " + n + " вопрос(ов) в выбранных темах. Будет показано " + Math.min(desiredCount, n) + ".";
    // мини-статистика прогресса по выбранному пулу
    var s = window.Store.summary(p);
    $("miFresh").textContent = s.fresh;
    $("miLearning").textContent = s.learning;
    $("miLearned").textContent = s.learned;
    $("miMastery").textContent = s.mastery + "%";
    // отметим активный пресет
    document.querySelectorAll(".preset").forEach(function (b) {
      b.classList.toggle("on", +b.dataset.v === desiredCount);
    });
    // кнопка повтора ошибок
    var wrongPool = p.filter(function (q) { return window.Store.get(q.id).wrong > 0 && !window.Store.isLearned(q.id); });
    $("reviewBtn").disabled = wrongPool.length === 0;
    $("reviewBtn").textContent = "↻ Повторить трудные" + (wrongPool.length ? " (" + wrongPool.length + ")" : "");
  }

  /* ----------------- выбор вопросов по весам (SRS) ----------------- */
  function weightedPick(candidates, count) {
    var picked = [], avail = candidates.slice();
    count = Math.min(count, avail.length);
    for (var k = 0; k < count; k++) {
      var weights = avail.map(function (q) { return window.Store.weight(q.id); });
      var sum = weights.reduce(function (a, b) { return a + b; }, 0);
      var r = Math.random() * sum, acc = 0, idx = 0;
      for (var i = 0; i < avail.length; i++) {
        acc += weights[i];
        if (r <= acc) { idx = i; break; }
      }
      picked.push(avail[idx]);
      avail.splice(idx, 1);
    }
    return picked;
  }

  /* ----------------- старт сессии ----------------- */
  function buildQueue(list) {
    var shuffleA = $("optShuffleA").checked;
    queue = list.map(function (q) {
      var order = [0, 1, 2, 3];
      if (shuffleA) order = shuffle(order);
      return { ref: q, order: order, correctPos: order.indexOf(q.correct) };
    });
    pos = 0; sessOk = 0; sessNo = 0; sessByTopic = {}; sessLog = [];
  }

  function startSession(list) {
    if (!list.length) return;
    buildQueue(list);
    showView("quiz");
    renderCard();
  }

  function startNormal() {
    var picked = weightedPick(pool(), desiredCount);
    // показываем «слабые» раньше, но при желании перемешиваем
    if ($("optShuffleQ").checked) picked = shuffle(picked);
    else picked.sort(function (a, b) { return window.Store.get(a.id).box - window.Store.get(b.id).box; });
    startSession(picked);
  }

  function startReview() {
    var wrongPool = pool().filter(function (q) {
      return window.Store.get(q.id).wrong > 0 && !window.Store.isLearned(q.id);
    });
    if (!wrongPool.length) return;
    var picked = weightedPick(wrongPool, Math.min(desiredCount, wrongPool.length));
    startSession(shuffle(picked));
  }

  /* ----------------- рендер карточки ----------------- */
  function renderCard() {
    answered = false;
    $("card3d").classList.remove("flipped");
    var item = queue[pos], q = item.ref;
    $("counter").textContent = (pos + 1) + " / " + queue.length;
    $("progBar").style.width = (pos / queue.length * 100) + "%";
    $("okPill").textContent = "✓ " + sessOk;
    $("noPill").textContent = "✗ " + sessNo;
    $("fTopic").textContent = TOPICS[q.topic];
    var st = window.Store.status(q.id);
    var lvl = $("fLevel");
    lvl.textContent = st === "learned" ? "выучен" : st === "learning" ? "в процессе" : "новый";
    lvl.className = "lvlTag" + (st === "learned" ? " learned" : "");
    $("fQ").textContent = q.q;
    var box = $("fAnswers"); box.innerHTML = "";
    item.order.forEach(function (origIdx, i) {
      var b = document.createElement("button");
      b.className = "ans";
      b.innerHTML = '<span class="key">' + KEYS[i] + '</span><span>' + q.a[origIdx] + "</span>";
      b.onclick = function () { choose(i, b); };
      box.appendChild(b);
    });
    fitCard(false);
  }

  /* ----------------- ответ ----------------- */
  function choose(i, btn) {
    if (answered) return;
    answered = true;
    var item = queue[pos], q = item.ref;
    var correct = i === item.correctPos;

    var btns = Array.prototype.slice.call($("fAnswers").children);
    btns.forEach(function (b, idx) {
      b.disabled = true;
      if (idx === item.correctPos) b.classList.add("correct");
      else if (idx === i) b.classList.add("wrong");
      else b.classList.add("dim");
    });

    // учёт сессии
    var t = q.topic;
    sessByTopic[t] = sessByTopic[t] || { ok: 0, total: 0 };
    sessByTopic[t].total++;
    if (correct) { sessOk++; sessByTopic[t].ok++; } else { sessNo++; }
    sessLog.push({
      q: q, correct: correct,
      yourText: q.a[item.order[i]],
      correctText: q.a[q.correct]
    });

    // память / SRS
    window.Store.record(q.id, correct);

    $("okPill").textContent = "✓ " + sessOk;
    $("noPill").textContent = "✗ " + sessNo;

    // задняя сторона
    var bf = $("backFace");
    bf.classList.toggle("ok", correct);
    bf.classList.toggle("no", !correct);
    $("vIcon").className = "vIcon " + (correct ? "ok" : "no");
    $("vIcon").textContent = correct ? "✓" : "✗";
    $("vTitle").textContent = correct ? "Верно!" : "Неверно";
    $("vTopic").textContent = TOPICS[q.topic];
    $("bQ").textContent = q.q;
    $("rightTxt").textContent = KEYS[item.correctPos] + ". " + q.a[q.correct];
    var yb = $("yourBlk");
    if (correct) { yb.classList.add("hidden"); }
    else { yb.classList.remove("hidden"); $("yourTxt").textContent = KEYS[i] + ". " + q.a[item.order[i]]; }
    $("explTxt").textContent = q.explanation;
    $("progBar").style.width = ((pos + 1) / queue.length * 100) + "%";

    fitCard(false); // обновим высоту фронта (подсветка не меняет размер, но на всякий случай)
    if ($("optInstant").checked) setTimeout(flipToBack, 260);
  }

  function next() {
    if (!answered) return;
    if (pos + 1 >= queue.length) { showResults(); return; }
    pos++; renderCard();
  }

  /* ----------------- итоги сессии ----------------- */
  function showResults() {
    showView("results");
    var total = sessOk + sessNo;
    var pct = total ? Math.round(sessOk / total * 100) : 0;
    $("rScorePct").textContent = pct + "%";
    $("rScoreRaw").textContent = sessOk + " из " + total + " верно";

    // по темам
    var box = $("rByTopic"); box.innerHTML = "";
    Object.keys(TOPICS).forEach(function (t) {
      var s = sessByTopic[t]; if (!s) return;
      var p = Math.round(s.ok / s.total * 100);
      var row = document.createElement("div"); row.className = "tStat";
      row.innerHTML = '<span class="name">' + TOPICS[t].replace(/^Тема /, "Т") + "</span>" +
        '<span class="tbar"><i style="width:' + p + '%"></i></span>' +
        '<span class="pct">' + s.ok + "/" + s.total + "</span>";
      box.appendChild(row);
    });

    // подробный список ответов
    renderReview("all");
    lastWrongIds = sessLog.filter(function (x) { return !x.correct; }).map(function (x) { return x.q; });
    $("retryWrongBtn").style.display = lastWrongIds.length ? "inline-block" : "none";

    var msg = pct >= 90 ? "Отличная подготовка! 🎯"
      : pct >= 70 ? "Хороший результат, ещё немного."
      : pct >= 50 ? "Неплохо — стоит повторить слабые темы."
      : "Стоит вернуться к материалам и повторить.";
    $("rMsg").textContent = msg;
    document.querySelectorAll("#revFilter .preset").forEach(function (b) {
      b.classList.toggle("on", b.dataset.f === "all");
    });
  }

  function renderReview(filter) {
    var box = $("review"); box.innerHTML = "";
    var items = sessLog.map(function (x, i) { return { x: x, n: i + 1 }; });
    if (filter === "wrong") items = items.filter(function (o) { return !o.x.correct; });
    if (filter === "right") items = items.filter(function (o) { return o.x.correct; });
    if (!items.length) { box.innerHTML = '<p class="empty">Нет ответов в этой категории.</p>'; return; }
    items.forEach(function (o) {
      var x = o.x;
      var el = document.createElement("div");
      el.className = "rev-item " + (x.correct ? "ok" : "no");
      var html = '<div class="rev-mark ' + (x.correct ? "ok" : "no") + '">' + (x.correct ? "✓" : "✗") + "</div>" +
        '<div class="rev-body">' +
        '<div class="rev-q"><span class="qnum">' + o.n + ".</span>" + esc(x.q.q) + "</div>";
      if (!x.correct) {
        html += '<div class="rev-a you-wrong">Ваш ответ: <b>' + esc(x.yourText) + "</b></div>";
      }
      html += '<div class="rev-a correct-a">Правильно: <b>' + esc(x.correctText) + "</b></div>" +
        '<div class="rev-topic">' + esc(TOPICS[x.q.topic]) + "</div>" +
        "</div>";
      el.innerHTML = html;
      box.appendChild(el);
    });
  }
  function esc(s) { return String(s).replace(/[&<>]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]; }); }

  /* ----------------- экран прогресса ----------------- */
  function renderProgress() {
    var s = window.Store.summary(ALL);
    $("pgMastery").textContent = s.mastery + "%";
    $("pgSeen").textContent = s.learned + s.learning;
    $("pgTotal").textContent = s.total;
    $("pgRight").textContent = s.right;
    $("pgWrong").textContent = s.wrong;

    // общий стек fresh/learning/learned
    var stack = $("pgStack");
    var tot = s.total || 1;
    stack.innerHTML =
      '<i class="g" style="width:' + (s.learned / tot * 100) + '%"></i>' +
      '<i class="a" style="width:' + (s.learning / tot * 100) + '%"></i>' +
      '<i class="b" style="width:' + (s.fresh / tot * 100) + '%"></i>';
    $("pgLegend").innerHTML =
      '<span><i class="dot g"></i>Выучено: ' + s.learned + "</span>" +
      '<span><i class="dot a"></i>В процессе: ' + s.learning + "</span>" +
      '<span><i class="dot b"></i>Новых: ' + s.fresh + "</span>";

    // по темам
    var box = $("pgByTopic"); box.innerHTML = "";
    Object.keys(TOPICS).forEach(function (t) {
      var ts = window.Store.summaryByTopic(ALL, t);
      var row = document.createElement("div"); row.className = "tp-row";
      row.innerHTML =
        '<div class="tp-head"><span class="nm">' + esc(TOPICS[t]) + "</span>" +
        '<span class="meta">' + ts.mastery + "% · выучено " + ts.learned + "/" + ts.total + "</span></div>" +
        '<div class="stack">' +
        '<i class="g" style="width:' + (ts.learned / ts.total * 100) + '%"></i>' +
        '<i class="a" style="width:' + (ts.learning / ts.total * 100) + '%"></i>' +
        '<i class="b" style="width:' + (ts.fresh / ts.total * 100) + '%"></i>' +
        "</div>";
      box.appendChild(row);
    });
  }

  /* ----------------- навигация по экранам ----------------- */
  function showView(name) {
    ["setup", "quiz", "results", "progress"].forEach(function (v) {
      $(v).classList.toggle("hidden", v !== name);
    });
    document.querySelectorAll(".tab").forEach(function (t) {
      t.classList.toggle("on", t.dataset.view === name);
    });
    if (name === "setup") { renderChips(); updateSetup(); }
    if (name === "progress") renderProgress();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  /* ----------------- события ----------------- */
  function bindEvents() {
    $("startBtn").onclick = startNormal;
    $("reviewBtn").onclick = startReview;
    $("nextBtn").onclick = next;
    $("quitBtn").onclick = showResults;
    $("againBtn").onclick = function () { showView("setup"); };
    $("retryWrongBtn").onclick = function () { if (lastWrongIds.length) startSession(shuffle(lastWrongIds.slice())); };

    // вкладки
    document.querySelectorAll(".tab").forEach(function (t) {
      t.onclick = function () { showView(t.dataset.view); };
    });

    // счётчик количества
    $("countMinus").onclick = function () { setCount(desiredCount - 1); };
    $("countPlus").onclick = function () { setCount(desiredCount + 1); };
    $("countInput").onchange = function () { setCount(parseInt(this.value, 10) || 1); };
    document.querySelectorAll(".preset").forEach(function (b) {
      b.onclick = function () { setCount(+b.dataset.v); };
    });

    // фильтр списка ответов в итогах
    document.querySelectorAll("#revFilter .preset").forEach(function (b) {
      b.onclick = function () {
        document.querySelectorAll("#revFilter .preset").forEach(function (x) { x.classList.remove("on"); });
        b.classList.add("on");
        renderReview(b.dataset.f);
      };
    });

    // сброс прогресса
    $("resetBtn").onclick = function () {
      if (confirm("Сбросить весь сохранённый прогресс и статистику?")) {
        window.Store.reset(); renderProgress(); alert("Прогресс сброшен.");
      }
    };

    // переворот по клику (если авто-переворот выключен) + клавиатура
    $("card3d").addEventListener("click", function () {
      if (answered && !$("card3d").classList.contains("flipped") && !$("optInstant").checked) {
        flipToBack();
      }
    });
    document.addEventListener("keydown", function (e) {
      if ($("quiz").classList.contains("hidden")) return;
      if (["1", "2", "3", "4"].indexOf(e.key) >= 0 && !answered) {
        var b = $("fAnswers").children[+e.key - 1]; if (b) b.click();
      } else if ((e.key === "ArrowRight" || e.key === " " || e.key === "Enter") && answered) {
        e.preventDefault();
        if (!$("card3d").classList.contains("flipped")) flipToBack();
        else next();
      }
    });
    window.addEventListener("resize", function () {
      if ($("quiz").classList.contains("hidden")) return;
      fitCard($("card3d").classList.contains("flipped"));
    });
  }

  function setCount(v) {
    var n = pool().length || 1;
    desiredCount = clamp(v || 1, 1, n);
    updateSetup();
  }

  /* старт */
  loadData();
})();
