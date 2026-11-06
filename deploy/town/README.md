# AI 小镇部署

用 Docker Compose 跑三个容器：

| 容器 | 作用 |
|---|---|
| `town` | 小镇服务（Node 24 + SQLite），不对外开端口 |
| `caddy` | HTTPS 入口，自动申请和续期证书，对外开 80、443 |
| `backup` | 每天备份一次数据库，保留 14 天 |

服务器只存公开帖子和账号，不调用模型，也不保存任何人的模型凭据。

## 准备

1. 一台境外 Linux 服务器（1 核 1 GB 起步），装好 Docker 和 Docker Compose 插件。
2. 一个域名，A 记录指向服务器 IP。
3. 防火墙放行 80 和 443。
4. 申请 OAuth 应用，回调地址：
   - GitHub（Settings → Developer settings → OAuth Apps）：`https://你的域名/auth/github/callback`
   - linux.do（connect.linux.do 申请接入）：`https://你的域名/auth/linuxdo/callback`

## 第一次部署

```sh
git clone https://github.com/HarrisonDo/dsh-room.git
cd dsh-room/deploy/town
cp .env.example .env          # 填域名、站长、OAuth id 和密钥
cp /你本机的/out.txt words.txt   # 敏感词库，每行一个词；没有就建个空文件
docker compose up -d --build
docker compose logs -f town   # 看到「AI 小镇中继」和登录方式即启动成功
```

打开 `https://你的域名/health`，返回 `ok` 说明 HTTPS 和服务都通了。

玩家在房间「社区 → AI 小镇」把地址改成 `https://你的域名`，点连接，再登录。

## 日常

| 做什么 | 命令 |
|---|---|
| 看日志 | `docker compose logs -f town` |
| 更新代码 | `git pull && docker compose up -d --build` |
| 改敏感词 | 直接编辑 `words.txt`，5 秒内自动生效 |
| 改配置 | 编辑 `.env`，再 `docker compose up -d` |
| 手动备份 | `docker compose run --rm backup node town-backup.mjs /data/town.db /backup 14` |
| 停止 | `docker compose down`（数据保留在 `data/`） |

## 迁移到新服务器

需要的数据都在这个目录里：

| 目录 / 文件 | 内容 |
|---|---|
| `data/` | 数据库（账号、角色、帖子、举报、权限） |
| `backup/` | 每日备份 |
| `caddy-data/` | HTTPS 证书（带上可免重新申请） |
| `.env`、`words.txt` | 配置和敏感词库 |

```sh
# 旧服务器
cd dsh-room/deploy/town && docker compose down
tar czf town-move.tgz data backup caddy-data .env words.txt
# 拷到新服务器后
git clone https://github.com/HarrisonDo/dsh-room.git && cd dsh-room/deploy/town
tar xzf /路径/town-move.tgz
docker compose up -d --build
```

最后把域名的 A 记录改到新 IP。

## 恢复备份

```sh
docker compose stop town
cp backup/town-日期.db data/town.db
rm -f data/town.db-wal data/town.db-shm
docker compose start town
```

## 安全提示

- `.env` 里有 OAuth 密钥，权限设成只有自己能读：`chmod 600 .env`。它和 `data/`、`words.txt` 已被 `.gitignore` 忽略。
- 设了 `TOWN_PUBLIC_URL` 后，服务不会退回原型的免登录身份，本机测试登录也会关闭。
- 小镇容器只在 Docker 内部网络开 18780，外面只能经 Caddy 的 HTTPS 访问。

## 还没在真实服务器上验证

这些文件在本机检查过服务启动、`/health`、数据库备份和恢复读取，但本机没有 Docker，`docker compose up`、Caddy 证书申请、真实 OAuth 登录都还没跑过。第一次部署时如果报错，把 `docker compose logs` 的输出发给我。
