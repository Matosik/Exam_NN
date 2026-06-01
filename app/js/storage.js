/* ============================================================
   storage.js — память прогресса и интервальное повторение (Leitner)
   ------------------------------------------------------------
   Для каждого вопроса храним запись:
     { seen, right, wrong, streak, box, last }
       box    — «ящик» Лейтнера 0..5 (чем выше, тем лучше выучен)
       streak — текущая серия верных ответов подряд
       last   — отметка времени последнего показа
   На основе box вычисляется:
     - вес показа (чаще показываем «слабые» вопросы);
     - статус: fresh (новый) / learning (учится) / learned (выучен, box>=BOX_LEARNED).
   Всё сохраняется в localStorage и переживает перезапуск браузера.
   ============================================================ */
(function (global) {
  "use strict";

  var KEY = "nnq_progress_v2";
  var MAX_BOX = 5;          // ящики 0..5
  var BOX_LEARNED = 4;      // box >= 4 считается «выучен»

  // вес выбора в зависимости от ящика: слабые (низкий box) — намного чаще,
  // выученные (высокий box) — редко.
  var BOX_WEIGHT = [10, 6, 3, 1.5, 0.6, 0.25];
  // вес ещё не показанного («нового») вопроса: ниже, чем у вопроса с ошибкой
  // (box 0 = 10), но выше, чем у вопроса, на который уже отвечали верно (box>=1).
  var FRESH_WEIGHT = 7;

  function nowTick() { return Date.now(); }

  function blank() {
    return { seen: 0, right: 0, wrong: 0, streak: 0, box: 0, last: 0 };
  }

  var Store = {
    data: {},

    load: function () {
      try {
        this.data = JSON.parse(global.localStorage.getItem(KEY)) || {};
      } catch (e) {
        this.data = {};
      }
      return this.data;
    },

    save: function () {
      try {
        global.localStorage.setItem(KEY, JSON.stringify(this.data));
      } catch (e) { /* приватный режим и т.п. — игнорируем */ }
    },

    get: function (id) {
      return this.data[id] || blank();
    },

    /* зафиксировать ответ: correct — true/false */
    record: function (id, correct) {
      var r = this.data[id] || blank();
      r.seen += 1;
      r.last = nowTick();
      if (correct) {
        r.right += 1;
        r.streak += 1;
        r.box = Math.min(MAX_BOX, r.box + 1);       // вверх по ящикам
      } else {
        r.wrong += 1;
        r.streak = 0;
        r.box = Math.max(0, r.box - 2);             // ошибка отбрасывает назад
      }
      this.data[id] = r;
      this.save();
      return r;
    },

    /* вес показа вопроса (больше — показываем чаще).
       Приоритет: ошибочные/слабые (box 0) > новые > отвеченные верно > выученные. */
    weight: function (id) {
      var r = this.get(id);
      if (r.seen === 0) return FRESH_WEIGHT;         // ещё не показывали
      return BOX_WEIGHT[Math.min(r.box, MAX_BOX)] || 1;
    },

    status: function (id) {
      var r = this.get(id);
      if (r.seen === 0) return "fresh";
      if (r.box >= BOX_LEARNED) return "learned";
      return "learning";
    },

    isLearned: function (id) { return this.get(id).box >= BOX_LEARNED; },

    /* сводка по массиву вопросов */
    summary: function (questions) {
      var s = { total: questions.length, fresh: 0, learning: 0, learned: 0,
                seen: 0, right: 0, wrong: 0, mastery: 0 };
      var masterySum = 0;
      for (var i = 0; i < questions.length; i++) {
        var id = questions[i].id;
        var r = this.get(id);
        var st = this.status(id);
        s[st] += 1;
        s.seen += r.seen ? 1 : 0;
        s.right += r.right;
        s.wrong += r.wrong;
        masterySum += Math.min(r.box, MAX_BOX) / MAX_BOX; // вклад 0..1
      }
      s.mastery = questions.length ? Math.round(masterySum / questions.length * 100) : 0;
      return s;
    },

    /* сводка по конкретной теме */
    summaryByTopic: function (questions, topic) {
      return this.summary(questions.filter(function (q) { return q.topic === topic; }));
    },

    reset: function () {
      this.data = {};
      this.save();
    },

    BOX_LEARNED: BOX_LEARNED,
    MAX_BOX: MAX_BOX
  };

  Store.load();
  global.Store = Store;
})(window);
