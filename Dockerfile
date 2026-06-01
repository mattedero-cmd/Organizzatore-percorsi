FROM node:24-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends sqlite3 ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json ./
COPY server ./server
COPY public ./public

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=5174
ENV DATABASE_PATH=/data/work-routes.sqlite

VOLUME ["/data"]
EXPOSE 5174

CMD ["node", "server/index.js"]
