# Серверная часть — `server/index.js`

## Конфигурация

| Переменная | По умолчанию | Назначение |
|---|---|---|
| `PORT` | `8082` | TCP-порт. |
| `VIDEO_ROOT` | `<repo>/media` | Каталог с видео. |
| `THUMB_CACHE` | `$TMPDIR/test-player-thumbs` | Кэш JPEG (не внутри `VIDEO_ROOT`). |
| `VIDEOS_CACHE_TTL_MS` | `5000` | TTL кэша `/api/videos`. |

## Сканирование

`walkVideos` — параллельный обход (`Promise.all`). Кэш: TTL + `mtime` корня.

## Статика

- `compression()` на ответах.
- `public/` с `maxAge: '5m'`.

## HTTP API

### `GET /api/videos`

Массив `{ name, path, mime }`, `Cache-Control: private, max-age=5`.

### `GET /api/video?p=<relPath>`

Стрим, async `fs.stat`, `Cache-Control: public, max-age=3600`, Range.

### `GET /api/thumbnail?p=<relPath>`

JPEG через системный `ffmpeg`. Дисковый кэш (SHA1 path+mtime+size).
`503`, если ffmpeg не установлен.

### `GET /api/health`

`{ ok, root, thumbCache, ffmpeg }`.

## Инварианты

- Пути только через `safeFileUnderRoot`.
- `child_process` + `ffmpeg` — только для thumbnail.
