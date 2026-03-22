FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY server ./server
COPY public ./public

ENV NODE_ENV=production
ENV PORT=8080
ENV VIDEO_ROOT=/videos

EXPOSE 8080

CMD ["node", "server/index.js"]
