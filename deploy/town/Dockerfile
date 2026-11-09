# AI 小镇和世界服务端镜像，同时带上 Web 站点。运行时不需要 npm 依赖，esbuild 只在构建阶段使用。
# 在仓库根目录构建：docker build -f deploy/town/Dockerfile -t dsh-town .
FROM node:24-alpine AS site
WORKDIR /src
COPY dsh-room/package.json dsh-room/package-lock.json dsh-room/LICENSE ./
RUN npm ci --no-audit --no-fund
COPY dsh-room/scripts/build-site.mjs ./scripts/
COPY dsh-room/scripts/town*.mjs dsh-room/scripts/world*.mjs dsh-room/scripts/account*.mjs ./scripts/
COPY dsh-room/neutral/world-assets.gen.js ./neutral/
COPY dsh-room/demo-theme/whale-girl.js ./demo-theme/
COPY dsh-room/release-dsh/NOTICE.md ./release-dsh/
COPY dsh-room/shared ./shared/
COPY dsh-room/src ./src/
COPY dsh-room/web ./web/
RUN ROOMKIT_SITE_SOURCE=1 node scripts/build-site.mjs /src/site

FROM node:24-alpine
WORKDIR /app
COPY dsh-room/package.json ./
COPY dsh-room/scripts/town*.mjs dsh-room/scripts/world*.mjs dsh-room/scripts/account*.mjs ./scripts/
COPY dsh-room/shared ./shared/
COPY dsh-room/web/roomkit ./web/roomkit/
COPY --from=site /src/site ./site/
RUN mkdir -p /data /backup && chown -R node:node /data /backup
USER node
ENV NODE_ENV=production \
    NODE_NO_WARNINGS=1 \
    TOWN_HOST=0.0.0.0 \
    TOWN_PORT=18780 \
    TOWN_DB=/data/town.db \
    TOWN_WEB_ROOT=/app/site/web \
    TOWN_PUBLIC_WORLDS=/app/site/public-worlds.json
EXPOSE 18780
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD wget -qO- http://127.0.0.1:18780/health || exit 1
WORKDIR /app/scripts
CMD ["node", "town.mjs"]
