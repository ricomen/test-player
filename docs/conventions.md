# Конвенции и правила правок

## Язык

- UI-строки — на русском.
- Логи в консоль — допустимо на русском.
- Комментарии в коде — на русском, по сути.

## Серверные правила

- Путь от клиента → `safeFileUnderRoot(VIDEO_ROOT, p)`, иначе `404`.
- `/api/videos` всегда массив; `path` через `/`; `mime` из таблицы `MIME`.
- Новый формат: `VIDEO_EXT` + `MIME` + [media-and-codecs.md](./media-and-codecs.md).
- В обработчиках — `fs.promises`, не sync.
- Порт/корни только через `process.env`.
- `child_process` + `ffmpeg` — **только** для `/api/thumbnail`.

## Клиентские правила

- `app.js` и `thumb-app.js` — ESM. Список только через `getVideos()` из
  `videos-api.js`.
- Стрим: `streamUrl(path)`, превью: `thumbUrl` / `/api/thumbnail`.
- Плееры лениво через `IntersectionObserver`; вне viewport — dispose.
- `URL.createObjectURL` → обязательно `revokeObjectURL` предыдущего.

## Видеоплеер

- `.mkv` / неизвестный MIME → native `<video>`; иначе Video.js при
  уверенном `canPlayType`.
- `autoplay` только с `muted`; `playsinline` обязателен.

## Стили

- Цвета через CSS-переменные; БЭМ-подобные классы (`.thumb-section__…`).
- Без `!important`, кроме крайних случаев Video.js.

## Зависимости

- Без сборщиков. Caret-диапазоны в `package.json`.

## Что не делать

- Не вводить сессии/куки без нужды.
- Не транскодировать поток на сервере (только один JPEG-кадр).
- Не live-обновлять список без явного запроса.
