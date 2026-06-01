#!/usr/bin/env python3
"""
build.py — пересобирает data/questions.js из data/questions.json.

data/questions.json — ЕДИНСТВЕННЫЙ источник истины для вопросов.
Файл data/questions.js нужен только для того, чтобы приложение открывалось
двойным кликом (file://), когда браузер блокирует fetch() локального JSON.

После любого изменения questions.json запустите:
    python tools/build.py
"""
import json, os, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "data", "questions.json")
DST = os.path.join(ROOT, "data", "questions.js")


def main():
    with open(SRC, encoding="utf-8") as f:
        data = json.load(f)

    qs = data.get("questions", [])
    topics = data.get("topics", {})

    # лёгкая валидация
    errors = 0
    seen = set()
    for q in qs:
        qid = q.get("id")
        if not qid or qid in seen:
            print("Дубликат/пустой id:", qid); errors += 1
        seen.add(qid)
        if len(q.get("a", [])) != 4:
            print("Не 4 варианта:", qid); errors += 1
        if not (0 <= q.get("correct", -1) < 4):
            print("Неверный correct:", qid); errors += 1
        if q.get("topic") not in topics:
            print("Неизвестная тема:", qid); errors += 1
    if errors:
        print(f"Найдено ошибок: {errors}. Файл НЕ собран.")
        sys.exit(1)

    header = (
        "/* АВТОГЕНЕРАЦИЯ из data/questions.json — не редактируйте вручную.\n"
        "   Обновить: python tools/build.py */\n"
    )
    with open(DST, "w", encoding="utf-8") as f:
        f.write(header + "window.QUIZ_DATA = " +
                json.dumps(data, ensure_ascii=False) + ";\n")

    print(f"Готово: {len(qs)} вопросов записано в data/questions.js")


if __name__ == "__main__":
    main()
