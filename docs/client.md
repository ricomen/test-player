# Клиентская часть

Файлы в `public/`: `index.html`, `app.js`, `thumb-app.js`, `videos-api.js`.
Сборщик не используется.

## `index.html`

- Video.js 8.21 с jsDelivr.
- Два ESM-модуля: `/app.js`, `/thumb-app.js`.
- Сетка `#videoGrid` + панель превью кадра.
- В шаблоне ячейки `preload="none"`.

## `videos-api.js`

```js
export function getVideos() // один fetch('/api/videos') на страницу
```

## `app.js` — ленивая сетка

`IntersectionObserver` (`rootMargin: 200px`): вход → init плеера, выход →
dispose. Выбор движка: `.mkv` / неподдерживаемый MIME → native, иначе Video.js.
Кэш `canPlayType` на одном пробном `<video>`.

## `thumb-app.js` — превью кадра

Кнопка «Первый кадр» → `GET /api/thumbnail?p=...`. Object URL ревокается
перед следующим кадром.

## URL-ы

| Путь | Назначение |
|---|---|
| `/api/videos` | список |
| `/api/video?p=` | стрим |
| `/api/thumbnail?p=` | JPEG-превью |
