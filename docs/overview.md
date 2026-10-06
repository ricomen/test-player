# Обзор проекта

## Назначение

`test-player` — локальный веб-плеер для просмотра видеофайлов из каталога на
диске. Поднимается одной командой, по умолчанию читает видео из `./media`,
рендерит ленивую сетку превью (Video.js / нативный `<video>`, только в
viewport) и умеет показать первый кадр через серверный `ffmpeg`.

Используется как «тестовый стенд» (отсюда имя): удобно бросить файлы в папку и
проверить их воспроизведение в разных движках.

## Стек

- **Node.js** ≥ 18, рантайм Docker — `node:20-alpine` (+ пакет `ffmpeg`).
- **Express 4** — HTTP-сервер, статика, JSON API.
- **Video.js 8** — браузерный плеер (jsDelivr).
- **ffmpeg** (системный) — JPEG-превью через `/api/thumbnail`.
- Чистый HTML/CSS/JS на клиенте, без сборщика.

## Структура

```text
test-player/
├── server/index.js           Express-сервер
├── public/
│   ├── index.html
│   ├── styles.css
│   ├── videos-api.js         общий fetch /api/videos
│   ├── app.js                ленивая сетка плееров
│   └── thumb-app.js          превью кадра
├── media/                    каталог с видео (по умолчанию VIDEO_ROOT)
├── Dockerfile
├── docker-compose.yml
└── package.json
```

## Переменные окружения

| Переменная | По умолчанию | Назначение |
|---|---|---|
| `PORT` | `8082` (локально), `8080` (Docker) | Порт HTTP-сервера. |
| `VIDEO_ROOT` | `<repo>/media` (локально), `/videos` (Docker) | Корневой каталог. |
| `THUMB_CACHE` | `$TMPDIR/test-player-thumbs` | Кэш JPEG-превью. |
| `VIDEOS_CACHE_TTL_MS` | `5000` | TTL кэша списка видео. |

## Запуск

```bash
npm install
# brew install ffmpeg   # для /api/thumbnail
npm start               # http://localhost:8082
```

Docker: `docker compose up --build` → `http://localhost:8080`.

## Что на странице

1. **Сетка видео** — плееры только в viewport.
2. **Превью кадра** — `/api/thumbnail` (нужен системный ffmpeg).
