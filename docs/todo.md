# TODO / нюансы

## Известные нюансы

- **Большие MKV в Chrome:** H.265/AC3 часто не декодируются.
- **Autoplay-policy:** на iOS может понадобиться жест пользователя.
- **Превью:** нужен системный `ffmpeg`; иначе `/api/thumbnail` → `503`.
- **Кэш `/api/videos`:** инвалидация по `mtime` только корня `VIDEO_ROOT`
  (глубокие изменения — после TTL).

## Сделано

- [x] Lazy-init сетки, dispose вне viewport.
- [x] Один клиентский `/api/videos`, серверный кэш walk.
- [x] Async `/api/video` + Cache-Control, compression.
- [x] `/api/thumbnail` с дисковым кэшем.
- [x] Удалён FFmpeg.wasm / `@ffmpeg/*`.
- [x] Docker: `ffmpeg`, `USER node`, `HEALTHCHECK`.

## Идеи дальше

- [ ] Виртуализация DOM при > 200 ячеек.
- [ ] Basic auth через env.
- [ ] Тесты на `safeFileUnderRoot` и thumbnail-кэш.
- [ ] `.editorconfig` + Prettier.
