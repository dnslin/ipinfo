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

# 拷贝 standalone 产物和静态文件
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

# GeoIP 数据库不打进镜像：应用首次访问 /api/init 时自动下载到 lib/data。
# 目录需对 node 用户可写，下载器才能落盘。
RUN mkdir -p /app/lib/data && chown -R node:node /app/lib/data

# 声明数据卷，用于持久化已下载的数据库
VOLUME ["/app/lib/data"]

# 切换到非root用户
USER node

EXPOSE 3000

CMD ["node", "server.js"]
