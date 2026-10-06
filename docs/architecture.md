# Архитектура

## Высокоуровневая схема

```text
┌──────────────────────────┐    HTTP     ┌──────────────────────────────┐
│ Browser                  │ ──────────► │ Express (server/index.js)    │
│                          │             │  compression + Cache-Control │
│  index.html              │ ◄────────── │  GET  / …                    │ static
│   ├─ videos-api.js       │             │                              │
│   ├─ app.js (lazy grid)  │             │  GET  /api/videos            │ кэш TTL
│   └─ thumb-app.js        │             │  GET  /api/video?p=…         │ Range
│                          │             │  GET  /api/thumbnail?p=…     │ ffmpeg
│  Video.js (CDN)          │             │  GET  /api/health            │
└──────────────────────────┘             └───────────────┬──────────────┘
                                                         │
                              ┌──────────────────────────┼──────────────┐
                              ▼                          ▼              ▼
                     VIDEO_ROOT (FS)              THUMB_CACHE      ffmpeg (bin)
                     *.mp4 *.mkv …                *.jpg
```

## Компоненты

### Сервер

- Раздаёт `public/`.
- Сканирует `VIDEO_ROOT` (параллельно, с TTL-кэшем).
- Стримит видео; извлекает JPEG-превью через системный `ffmpeg`.

### Клиент

- `videos-api.js` — один `fetch('/api/videos')` на страницу.
- `app.js` — ячейки сразу, плееры только в viewport (`IntersectionObserver`).
- `thumb-app.js` — превью через `/api/thumbnail`.

## Потоки

### Список

1. Оба модуля зовут `getVideos()` → один HTTP.
2. Сервер отдаёт закэшированный массив `[{ name, path, mime }]`.

### Сетка

1. Пустые `<video preload="none">` в DOM.
2. Вход в viewport → native или Video.js + muted autoplay.
3. Выход → dispose / сброс `src`.

### Превью

`GET /api/thumbnail?p=…` → кэш на диске или `ffmpeg -frames:v 1`.
Без системного `ffmpeg` → `503`.

## Инварианты

- Пути от клиента только через `safeFileUnderRoot`.
- `path` в JSON — относительный, разделитель `/`.
- Thumbnail-кэш не внутри read-only `VIDEO_ROOT`.
