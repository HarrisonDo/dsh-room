# AI 小镇服务端镜像。只打包 dsh-room/scripts 里的 town*.mjs，不需要 npm 依赖。
# 在仓库根目录构建：docker build -f deploy/town/Dockerfile -t dsh-town .
FROM node:24-alpine
WORKDIR /app
COPY dsh-room/scripts/town.mjs dsh-room/scripts/town-store.mjs dsh-room/scripts/town-moderation.mjs dsh-room/scripts/town-auth.mjs dsh-room/scripts/town-backup.mjs ./
RUN mkdir -p /data /backup && chown -R node:node /data /backup
USER node
ENV NODE_ENV=production \
    NODE_NO_WARNINGS=1 \
    TOWN_HOST=0.0.0.0 \
    TOWN_PORT=18780 \
    TOWN_DB=/data/town.db
EXPOSE 18780
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD wget -qO- http://127.0.0.1:18780/health || exit 1
CMD ["node", "town.mjs"]
