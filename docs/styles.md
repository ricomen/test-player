# Стили — `public/styles.css`

Без препроцессоров, CSS-переменные на `:root`, тёмная тема.

## Палитра

```css
:root {
  --bg: #0f1114;
  --text: #e8eaed;
  --muted: #9aa0a6;
  --accent: #8ab4f8;
  --accent-dim: #5f8de5;
  font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
}
```

## Layout

- `body` — `min-height: 100vh`, `--bg`/`--text`, `line-height: 1.5`.
- `.layout` — CSS Grid, `max-width: 1200px`. На ширине ≥ 900px две колонки
  `1fr 320px` (рассчитано на боковой список, сейчас закомментированный).

## Сетка плееров

```css
.video-grid {
  columns: 17.5rem;
  column-gap: 0.75rem;
}

.video-cell {
  display: inline-block;
  width: 100%;
  break-inside: avoid;
  aspect-ratio: 16 / 9;
}

.video-cell--portrait {
  aspect-ratio: 9 / 16;
}

.video-cell .video-js,
.video-cell__player {
  width: 100%;
  height: 100%;
  background: #000;
}

.video-cell .video-js .vjs-tech,
.video-cell__player--native {
  object-fit: contain;
}
```

- `columns: 17.5rem` — столько колонок, сколько влезает по ширине; карточки
  текут сверху вниз по колонкам без фиксированных «рядов» и дыр от grid.
- Высота ячейки — `aspect-ratio` (16/9; портрет 9/16 после `loadedmetadata`).
- `break-inside: avoid` — карточка не рвётся между колонками.
- `object-fit: contain` сохраняет соотношение сторон без обрезки.

## Превью кадра

`.thumb-section` — карточка во всю ширину грида (`grid-column: 1 / -1`),
рамка `rgba(138, 180, 248, 0.25)`, фон полупрозрачный чёрный.

Внутри:

- `.thumb-section__title` — заголовок.
- `.thumb-section__hint` — подсказка, `--muted`.
- `.thumb-section__status` — статусная строка; `--error` → `#f28b82`.
- `.thumb-section__row` — flex-ряд «селект | кнопка».
- `.thumb-section__label` — обёртка для подписи селекта.
- `.thumb-section__preview` — контейнер `<img>`.

## Кнопки

```css
.btn {
  padding: 0.45rem 0.85rem;
  border-radius: 6px;
  border: 1px solid var(--accent-dim);
  background: rgba(138, 180, 248, 0.15);
}
.btn:hover:not(:disabled) { background: rgba(138, 180, 248, 0.28); }
.btn:disabled { opacity: 0.45; cursor: not-allowed; }
```

## Боковой список (наследие)

`.video-list__empty`, `.video-item`, `.video-item--active` — стили для
закомментированной части интерфейса. Сейчас не используются, но удалять рано:
если решим вернуть одиночный плеер со списком, всё уже готово.
