FROM node:20-alpine

RUN apk add --no-cache ffmpeg

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY server ./server
COPY public ./public

ENV NODE_ENV=production
ENV PORT=8080
ENV VIDEO_ROOT=/videos

RUN mkdir -p /tmp/test-player-thumbs && chown -R node:node /tmp/test-player-thumbs

USER node

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8080/api/health || exit 1

CMD ["node", "server/index.js"]
