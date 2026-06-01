#!/usr/bin/env python3
"""
build.py — пересобирает JS-бандлы из JSON-источников:
    data/questions.json  -> data/questions.js   (window.QUIZ_DATA)
    data/reference.json  -> data/reference.js   (window.REFERENCE_DATA)

JSON-файлы — ЕДИНСТВЕННЫЙ источник истины. JS-бандлы нужны, чтобы страницы
открывались двойным кликом (file://), когда браузер блокирует fetch() локального
JSON.

После любого изменения JSON запустите:
    python tools/build.py
"""
import json, os, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def header(src_name):
    return ("/* АВТОГЕНЕРАЦИЯ из data/%s — не редактируйте вручную.\n"
            "   Обновить: python tools/build.py */\n" % src_name)


def build_questions():
    src = os.path.join(ROOT, "data", "questions.json")
    dst = os.path.join(ROOT, "data", "questions.js")
    with open(src, encoding="utf-8") as f:
        data = json.load(f)
    qs = data.get("questions", [])
    topics = data.get("topics", {})
    errors, seen = 0, set()
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
        print(f"questions: найдено ошибок: {errors}. Файл НЕ собран."); return False
    with open(dst, "w", encoding="utf-8") as f:
        f.write(header("questions.json") + "window.QUIZ_DATA = " +
                json.dumps(data, ensure_ascii=False) + ";\n")
    print(f"Готово: {len(qs)} вопросов -> data/questions.js")
    return True


def build_reference():
    src = os.path.join(ROOT, "data", "reference.json")
    dst = os.path.join(ROOT, "data", "reference.js")
    if not os.path.exists(src):
        return True
    with open(src, encoding="utf-8") as f:
        data = json.load(f)
    ref = data.get("reference", [])
    topics = data.get("topics", {})
    errors = 0
    for blk in ref:
        if blk.get("topic") not in topics:
            print("reference: неизвестная тема:", blk.get("topic")); errors += 1
    if errors:
        print(f"reference: найдено ошибок: {errors}. Файл НЕ собран."); return False
    with open(dst, "w", encoding="utf-8") as f:
        f.write(header("reference.json") + "window.REFERENCE_DATA = " +
                json.dumps(data, ensure_ascii=False) + ";\n")
    n = sum(len(b.get("formulas", [])) + len(b.get("facts", [])) + len(b.get("glossary", [])) for b in ref)
    print(f"Готово: справочник ({len(ref)} тем, {n} пунктов) -> data/reference.js")
    return True


def main():
    ok = build_questions()
    ok = build_reference() and ok
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
