#!/usr/bin/env python3
"""
serve.py — запускает локальный сервер и открывает тренажёр в браузере.
Нужен, только если вы хотите загрузку вопросов через data/questions.json
(fetch). Для обычного использования достаточно открыть index.html двойным
кликом — данные подхватятся из data/questions.js.

Запуск:  python serve.py
"""
import http.server, socketserver, webbrowser, os, threading

PORT = 8000
os.chdir(os.path.dirname(os.path.abspath(__file__)))

Handler = http.server.SimpleHTTPRequestHandler
Handler.extensions_map.update({".js": "application/javascript"})

with socketserver.TCPServer(("", PORT), Handler) as httpd:
    url = f"http://localhost:{PORT}/index.html"
    print("Тренажёр запущен:", url)
    print("Остановить — Ctrl+C")
    threading.Timer(0.7, lambda: webbrowser.open(url)).start()
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nОстановлено.")
