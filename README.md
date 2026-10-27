# IPInfo

基于 Next.js、React 和 TypeScript 的 IP 信息查询工具，支持 IPv4/IPv6 地理位置查询、运营商与 ASN 信息、Leaflet 地图、BGP 邻接观测和深浅主题切换。

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

`pnpm test:unit` 使用 Node 测试运行器和 tsx 检查真实的数据转换、初始化、查询状态、BGP 和坐标处理逻辑，不依赖外部服务。

`pnpm test` 先运行单元测试，再使用已有生产构建启动临时服务，检查首页、静态资源和 API 参数校验，不触发数据库下载。因此运行完整测试前需要先执行 `pnpm build`。

## GeoIP 数据库

本地查询使用 `lib/data/` 下的三个数据库文件：

- `GeoLite2-City.mmdb`：城市、国家和坐标。
- `GeoLite2-ASN.mmdb`：ASN 和运营商。
- `GeoCN.mmdb`：中国地区补充数据。

应用从 [P3TERX/GeoLite.mmdb](https://github.com/P3TERX/GeoLite.mmdb/releases/latest) 和 [ljxi/GeoCN](https://github.com/ljxi/GeoCN/releases/latest) 下载缺失或无效的文件，并通过 MMDB Reader 校验格式。也可以手动放置数据库。已经有效的文件会继续使用；自动初始化不会定期更新它们。

City 库用于基础查询。ASN 或 GeoCN 暂时不可用时，基础查询仍然可用。`/api/init` 会分别返回 `canQuery`（基础查询可用）、`isReady`（三个库均就绪）和各文件的状态、构建日期及错误。显式发送 POST 可重试补充库下载，并在成功后清除旧查询缓存。

当前 GeoCN 使用 `division_code`、`isp`、`type` 字段。行政区名称使用随代码打包的官方码表。GeoCN 只补充地区和运营商，地图坐标及精度半径保留 MaxMind 的实际数据，不通过地名生成坐标。`location.source` 标明坐标来源，未知坐标返回 `null`。本地地址不需要数据库，来源为 `Local`。

IP 定位无法代表设备或街道位置。不同数据库的地区与坐标可能不同；公共 DNS 的任播记录也可能没有位置。界面会显示来源和实际精度半径，并对无坐标记录显示空状态。

地图使用 Leaflet 和 [OpenStreetMap 标准底图](https://operations.osmfoundation.org/policies/tiles/)，由浏览器直接请求并遵循 HTTP 缓存，保留可见署名。底图仅按当前视图加载，不提供批量或离线下载；深浅主题共用同一底图。BGP 使用 [RIPE RIS 邻接观测](https://stat.ripe.net/docs/data-api/api-endpoints/asn-neighbours)，不把观测到的相邻网络推断为商业对等关系或 Tier 层级。

美团溯源和代理检测仍依赖外部服务。美团未收录某个 IP 时返回 HTTP 404 和 `MEITUAN_LOCATION_NOT_FOUND`，界面保留当前查询结果并说明未收录；连接或上游服务失败返回 503。原始诊断信息保留在服务端，不用其他来源冒充成功结果。IPv4/IPv6 版本入口依赖实际部署的 `ip`、`ip4`、`ip6` 子域名和对应网络配置，本地预览禁用无法切换的协议入口。

## 界面与主题

首屏以地图为底，导航与查询框浮在顶部，IP 身份卡压在地图左下：IP 地址最大，其次是国家与地区，随后是复制、美团溯源、代理检测等操作。IP 字号按字符数缩放，完整 IPv6 在宽屏保持一行，窄屏在分组处均衡折成两行。舞台下方是运营商、ASN、坐标与时区的摘要条，再往下是地理位置层级与网络注册的完整记录。没有坐标或本地地址时，地图位置显示网格底纹并说明原因。主色为深青蓝，浅色用灰绿白背景，暗色地图做反相降饱和处理。手机端地图在上、身份卡叠在地图下沿，使用单列信息和较大的输入字号、触摸区域。主题切换立即生效并保存选择，不执行整页扩散或叠加颜色动画；存储不可用时遵循系统主题。

BGP 默认展示完整邻接列表，支持 ASN、名称、描述搜索和协议筛选，每页 20 条。选中一个 ASN 后，关系图只显示它与查询目标的已观测关系，保留缩放、平移与 PNG 导出。返回列表会保留搜索和页码。上游对大型 ASN 未提供协议计数时，邻接仍保留，明确显示“协议未提供”；协议筛选只包含已标记的记录。

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
| `/api/bgp/[asn]` | GET | 查询指定 ASN 的 BGP 邻接观测；协议未知的记录仅列入 `allPeers` |
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
