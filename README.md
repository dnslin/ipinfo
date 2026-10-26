# IPInfo

基于 Next.js、React 和 TypeScript 的 IP 信息查询工具，支持 IPv4/IPv6 地理位置查询、运营商与 ASN 信息、Leaflet 地图、BGP 对等体和深浅主题切换。

## 本地开发

需要 Node.js 24 或更高版本，以及 pnpm 11.25.0。

```bash
npm install -g pnpm@11.25.0
pnpm install --frozen-lockfile
pnpm dev
```

访问 <http://localhost:3000>。

## 检查与构建

```bash
pnpm lint
pnpm typecheck
pnpm build
pnpm test
pnpm start
```

项目使用 Next.js 16、React 19、Tailwind CSS 4 和 Zustand。依赖版本以 `package.json` 和 `pnpm-lock.yaml` 为准。

`pnpm test` 使用生产构建启动临时本地服务，检查首页、静态资源和 API 参数校验，不触发数据库下载。

## GeoIP 数据库

本地查询使用 `lib/data/` 下的三个数据库文件：

- `GeoLite2-City.mmdb`：城市、国家和坐标。
- `GeoLite2-ASN.mmdb`：ASN 和运营商。
- `GeoCN.mmdb`：中国地区补充数据。

应用会检查并尝试下载缺失或无效的文件，也可以手动放置数据库。下载地址在 `lib/geoip/downloader.ts` 中维护。BGP、代理检测和补充地理信息查询还依赖外部服务。

## Docker

```bash
docker compose up -d --build
docker compose logs -f
docker compose down
```

服务监听 `3000` 端口，Compose 将宿主机的 `./data` 挂载到容器内的 `/app/lib/data`，用于持久化数据库。

也可以手动构建和运行：

```bash
docker build -t ipinfo .
docker run -d --name ipinfo -p 3000:3000 -v "$(pwd)/data:/app/lib/data" ipinfo
```

## API

| 路径 | 方法 | 用途 |
| --- | --- | --- |
| `/api/query` | GET | 查询请求中识别到的客户端 IP |
| `/api/query` | POST | 查询 JSON 请求体中的 `ip`，留空时识别客户端 IP |
| `/api/bgp/[asn]` | GET | 查询指定 ASN 的 BGP 对等体 |
| `/api/meituan` | POST | 查询指定 IP 的补充地理信息 |
| `/api/proxy-detection` | GET / POST | 检测代理使用情况；POST 需传入 `enableProxyDetection: true` |
| `/api/init` | GET / POST | 查看数据库初始化状态 / 执行初始化 |

## 代码位置

- `app/`：页面、全局样式和 API 路由。
- `components/`：查询表单、信息卡片、地图和 BGP 图表。
- `lib/geoip/`：数据库下载、读取、缓存和数据合并。
- `lib/store.ts`：查询状态管理。
- `lib/ip-detection.ts`：客户端 IP 识别和代理检测。
- `proxy.ts`：子域名 IP 版本选择和请求转发。
- `.github/workflows/build.yml`：容器镜像构建与发布。
