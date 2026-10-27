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

美团溯源和代理检测仍依赖外部服务。美团未收录某个 IP 时返回 HTTP 404 和 `MEITUAN_LOCATION_NOT_FOUND`，界面保留当前查询结果并说明未收录；连接或上游服务失败返回 503。原始诊断信息保留在服务端，不用其他来源冒充成功结果。

## IPv4 / IPv6 双栈检测

只需要一个域名，服务器也不需要 IPv6。本站 `/api/ip` 回显当前连接所用协议的地址，另一种协议由浏览器直接请求公共的单栈回显接口获得（域名只有 A 或 AAAA 记录，因此只能用对应协议连接）。导航栏的 IPv4 / IPv6 按钮显示检测状态，身份卡同时列出两个地址，点击即可切换查看。访客网络不支持某种协议时显示「未检测到」。

默认探测接口为 ip.sb、ipify 和 icanhazip，并行请求，取第一个有效结果，最多等待 4 秒。如需自建，可以把只有 A 记录或只有 AAAA 记录的子域名指向本服务，再通过环境变量改用它们的 `/api/ip`（逗号分隔）：

```bash
IPV4_PROBE_URLS=https://ip4.example.com/api/ip
IPV6_PROBE_URLS=https://ip6.example.com/api/ip
```

服务端拿不到来源地址（例如没有反向代理转发头）时，首页查询会改用浏览器检测到的地址。

## 界面与主题

首屏以地图为底，导航与查询框浮在顶部，IP 身份卡压在地图左下：IP 地址最大，其次是国家与地区，随后是复制、美团溯源、代理检测等操作。IP 字号按字符数缩放，完整 IPv6 在宽屏保持一行，窄屏在分组处均衡折成两行。舞台下方是运营商、ASN、坐标与时区的摘要条，再往下是地理位置层级与网络注册的完整记录。没有坐标或本地地址时，地图位置显示网格底纹并说明原因。主色为深青蓝，浅色用灰绿白背景，暗色地图做反相降饱和处理。手机端地图在上、身份卡叠在地图下沿，使用单列信息和较大的输入字号、触摸区域。主题切换立即生效并保存选择，不执行整页扩散或叠加颜色动画；存储不可用时遵循系统主题。

BGP 面板顶部是查询目标和按 AS 路径位置划分的邻居数量：上游侧（RIS 的 left，更靠近观测点）、下游侧（right，更靠近路由源）和方向不确定，这些数字同时是方向筛选。左侧是完整邻接列表，显示网络名称、方向、观测强度和协议，支持搜索、协议筛选、按观测强度或 ASN 排序，每页 20 条；右侧关系图把观测强度最高的邻居按方向分布在查询目标周围（上游在上、下游在下），可导出 PNG。在列表或图中选中邻居会显示详情，并可继续查看它的邻接，标题栏记录查看路径。方向只描述路径位置，不等同于商业关系。网络名称来自 RIPEstat `as-names`，按观测强度最多补充 3000 个；名称查询失败不影响邻接数据。上游对大型 ASN 未提供协议计数或观测强度时，邻接仍保留，明确显示“协议未提供”，并隐藏强度排序。

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
| `/api/ip` | GET | 回显当前连接的来源地址和双栈探测接口配置，不查数据库 |
| `/api/query` | GET | 查询请求中识别到的客户端 IP |
| `/api/query` | POST | 查询 JSON 请求体中的 `ip`，留空时识别客户端 IP |
| `/api/bgp/[asn]` | GET | 查询指定 ASN 的 BGP 邻接观测，含方向、观测强度和网络名称；协议未知的记录仅列入 `allPeers` |
| `/api/meituan` | POST | 查询指定 IP 的补充地理信息 |
| `/api/proxy-detection` | GET / POST | 检测代理使用情况；POST 需传入 `enableProxyDetection: true` |
| `/api/init` | GET / POST | 查看数据库初始化状态 / 执行初始化 |

## 代码位置

- `app/`：页面、全局样式和 API 路由。
- `components/`：查询表单、信息卡片、地图和 BGP 图表。
- `lib/geoip/`：数据库下载、读取、缓存和数据合并。
- `lib/store.ts`：查询状态管理。
- `lib/ip-detection.ts`：客户端 IP 识别和代理检测。
- `lib/dual-stack.ts`：IPv4/IPv6 单栈探测。
- `proxy.ts`：安全响应头和 API 跨域设置。
- `.github/workflows/build.yml`：容器镜像构建与发布。
