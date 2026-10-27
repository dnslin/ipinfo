# ---- 构建阶段 ----
FROM node:24-alpine AS builder
WORKDIR /app

# 只拷贝依赖文件，安装依赖
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN npm install -g pnpm@11.25.0 && pnpm install --frozen-lockfile

# 拷贝全部源码（lib/data 已在 .dockerignore 中排除）
COPY . .

# 构建 nextjs 产物
RUN pnpm build

# ---- 运行阶段 ----
FROM node:24-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
# Docker 会把 HOSTNAME 设为容器 ID，显式监听所有地址
ENV HOSTNAME=0.0.0.0

# 拷贝 standalone 产物和静态文件
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

# GeoIP 数据库不打进镜像：服务启动时在后台下载到 lib/data，之后按 GEOIP_UPDATE_INTERVAL 定期检查更新。
# 目录需对 node 用户可写，下载器才能落盘。
RUN mkdir -p /app/lib/data && chown -R node:node /app/lib/data

# 声明数据卷，用于持久化已下载的数据库
VOLUME ["/app/lib/data"]

# 切换到非root用户
USER node

EXPOSE 3000

# 首次启动需要下载数据库，给足启动时间；City 库可用即视为健康。
HEALTHCHECK --interval=30s --timeout=5s --start-period=120s --retries=3 \
  CMD wget -qO /dev/null "http://127.0.0.1:${PORT:-3000}/api/health" || exit 1

CMD ["node", "server.js"]
