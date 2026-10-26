# ---- 构建阶段 ----
    FROM node:24-alpine AS builder
    WORKDIR /app
    
    # 只拷贝依赖文件，安装依赖
    COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
    RUN npm install -g pnpm@11.25.0 && pnpm install --frozen-lockfile
    
    # 拷贝全部源码（含 public、lib、.next.config.js/ts 等）
    COPY . .
    
    # 构建 nextjs 产物
    RUN pnpm build
    
    # 调试用（可选，排查产物问题时加）
    RUN echo "=== .next/ ===" && ls -lh /app/.next || true
    RUN echo "=== .next/standalone/ ===" && ls -lh /app/.next/standalone || true
    RUN echo "=== public/ ===" && ls -lh /app/public || true
    RUN echo "=== lib/data/ ===" && ls -lh /app/lib/data || true
    
    # ---- 运行阶段 ----
    FROM node:24-alpine AS runner
    WORKDIR /app

    # 拷贝 standalone 产物和静态文件
    COPY --from=builder /app/.next/standalone ./
    COPY --from=builder /app/.next/static ./.next/static
    COPY --from=builder /app/public ./public

    # 创建数据目录并设置权限
    RUN mkdir -p /app/lib/data && chown -R node:node /app/lib/data

    # 拷贝默认数据文件作为初始数据（如果外部没有挂载数据的话）
    COPY --from=builder /app/lib/data ./lib/data-default

    # 声明数据卷，用于持久化数据
    VOLUME ["/app/lib/data"]

    # 创建启动脚本来处理数据初始化
    RUN echo '#!/bin/sh' > /app/init-data.sh && \
        echo '# 如果数据目录为空，则从默认数据复制' >> /app/init-data.sh && \
        echo 'if [ ! "$(ls -A /app/lib/data)" ]; then' >> /app/init-data.sh && \
        echo '  echo "数据目录为空，正在复制默认数据..."' >> /app/init-data.sh && \
        echo '  cp -r /app/lib/data-default/* /app/lib/data/ 2>/dev/null || true' >> /app/init-data.sh && \
        echo '  echo "默认数据复制完成"' >> /app/init-data.sh && \
        echo 'else' >> /app/init-data.sh && \
        echo '  echo "检测到现有数据，跳过初始化"' >> /app/init-data.sh && \
        echo 'fi' >> /app/init-data.sh && \
        echo 'exec "$@"' >> /app/init-data.sh && \
        chmod +x /app/init-data.sh

    # 切换到非root用户
    USER node

    EXPOSE 3000
    ENV NODE_ENV=production

    # 使用初始化脚本启动应用
    ENTRYPOINT ["/app/init-data.sh"]
    CMD ["node", "server.js"]
