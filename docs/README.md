# Документация test-player

Внутренняя документация по проекту для агента и разработчиков. Описывает
архитектуру, серверный API, клиентский код и нюансы эксплуатации.

## Содержание

- [overview.md](./overview.md) — что это за проект, стек, запуск, переменные окружения.
- [architecture.md](./architecture.md) — общая схема, компоненты, поток данных.
- [server.md](./server.md) — Express-сервер, эндпоинты, безопасность путей, статика FFmpeg.
- [client.md](./client.md) — `index.html`, `app.js`, `videos-api.js`, `thumb-app.js`.
- [styles.md](./styles.md) — CSS, темизация, ключевые селекторы.
- [media-and-codecs.md](./media-and-codecs.md) — контейнеры/кодеки, fallback.
- [deployment.md](./deployment.md) — локальный запуск, Docker (нужен `ffmpeg`).
- [conventions.md](./conventions.md) — стиль кода, инварианты.
- [todo.md](./todo.md) — идеи и нюансы.

## Быстрый старт

```bash
npm install
npm start
# http://localhost:8082
```

Подробнее — в [overview.md](./overview.md) и [deployment.md](./deployment.md).
