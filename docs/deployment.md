# Развёртывание

## Локально

```bash
npm install
brew install ffmpeg   # нужен для /api/thumbnail
PORT=8082 VIDEO_ROOT=./media npm start
# http://localhost:8082
```

Без `ffmpeg` сервер стартует, но превью отвечает `503`.

## Docker

Образ ставит `ffmpeg` через `apk`, `USER node`, `HEALTHCHECK` на `/api/health`.

```bash
docker compose up --build
# http://localhost:8080
```

`./media` → `/videos:ro`. Кэш превью в `/tmp/test-player-thumbs` внутри
контейнера.
