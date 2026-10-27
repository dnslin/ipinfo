<div align="center">

# IPInfo

自托管的 IP 信息查询服务：地理位置、运营商、ASN、地图定位与 BGP 邻接观测。

[![CI](https://github.com/dnslin/ipinfo/actions/workflows/build.yml/badge.svg)](https://github.com/dnslin/ipinfo/actions/workflows/build.yml)
[![Release](https://img.shields.io/github/v/release/dnslin/ipinfo?sort=semver)](https://github.com/dnslin/ipinfo/releases)
[![Image](https://img.shields.io/badge/image-ghcr.io%2Fdnslin%2Fipinfo-2496ED?logo=docker&logoColor=white)](https://github.com/dnslin/ipinfo/pkgs/container/ipinfo)
[![Next.js](https://img.shields.io/badge/Next.js-16-000000?logo=nextdotjs)](https://nextjs.org)

[在线演示](https://ip.dnsl.in) · [快速开始](#快速开始) · [配置](#配置) · [API](#api)

</div>

## 功能

- **本地数据库查询**：MaxMind GeoLite2 City / ASN 与 GeoCN 合并，中国地区精确到区县与运营商，查询不经过第三方。
- **域名与批量查询**：输入域名会解析全部 A/AAAA 记录并可逐个切换；批量页面一次查询最多 100 个 IP 或域名，可导出 CSV。
- **可分享的链接**：查询结果写入地址栏（`/?q=1.1.1.1`），也可以直接访问 `/1.1.1.1`；浏览器前进后退会切换查询。
- **命令行友好**：`curl` 首页只返回 IP，`curl host/8.8.8.8` 返回对齐的文本摘要，`/json` 返回 JSON。
- **路由与注册信息**：反向解析（PTR）、BGP 前缀与 RPKI 验证状态、RDAP 注册信息与滥用举报邮箱。
- **单域名双栈检测**：同时显示访客的 IPv4 和 IPv6 出口，服务器不需要 IPv6，也不需要额外的子域名。
- **地图定位**：Leaflet + OpenStreetMap，底图由本站转发并缓存，浏览器无需直接访问跨境瓦片服务；按数据库精度半径标出估算范围，查询之间按距离飞行切换。
- **BGP 邻接观测**：基于 RIPE RIS，按 AS 路径方向区分上游侧与下游侧，附网络名称、观测强度和关系图，可逐级查看邻居的邻接。
- **补充检测**：可选的代理检测与 WebRTC 泄露检测，失败时保留原始结果，不用其他来源冒充。
- **开箱即用的部署**：单个 Docker 镜像，数据库启动时自动下载、定期检查更新并持久化，自带健康检查，以非 root 用户运行。
- **API 限流与 Token**：按来源地址限流，携带 Token 的请求不受限制，管理操作需要 Token。
- **深浅主题**与适配手机的布局。

## 快速开始

### Docker

```bash
docker run -d --name ipinfo -p 3000:3000 \
  -v "$(pwd)/data:/app/lib/data" \
  --restart unless-stopped \
  ghcr.io/dnslin/ipinfo:latest
```

访问 <http://localhost:3000>。首次启动会在后台下载约 70 MB 的数据库到 `./data`，之后重启直接复用，并每 24 小时检查一次新版本。

### Docker Compose

```yaml
services:
  ipinfo:
    image: ghcr.io/dnslin/ipinfo:latest
    ports:
      - "3000:3000"
    volumes:
      - ./data:/app/lib/data
    restart: unless-stopped
```

仓库内的 [`docker-compose.yml`](docker-compose.yml) 从源码构建，用法相同。

### 从源码运行

需要 Node.js 24+ 和 pnpm 11。

```bash
git clone https://github.com/dnslin/ipinfo.git && cd ipinfo
pnpm install --frozen-lockfile
pnpm build && pnpm start
```

### 反向代理

服务端从请求头识别访客地址，依次读取 `CF-Connecting-IP`、`EO-Connecting-IP`、`X-Real-IP`、`True-Client-IP`、`X-Forwarded-For` 等。部署在 Nginx、Caddy 或 CDN 之后时，请确保转发了其中之一，例如 Nginx：

```nginx
proxy_set_header X-Real-IP $remote_addr;
proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
```

没有转发头时，首页会改用浏览器检测到的地址。限流同样按这些请求头识别来源；没有转发头时所有请求共用一个配额，公开部署请务必配置。

## 配置

所有配置都是可选的。

| 环境变量 | 默认值 | 说明 |
| --- | --- | --- |
| `PORT` | `3000` | 监听端口 |
| `HOSTNAME` | `0.0.0.0` | 监听地址 |
| `IPV4_PROBE_URLS` | ip.sb、ipify、icanhazip | 浏览器检测 IPv4 出口的接口，逗号分隔 |
| `IPV6_PROBE_URLS` | ip.sb、ipify、icanhazip | 浏览器检测 IPv6 出口的接口，逗号分隔 |
| `API_RATE_LIMIT` | `120` | 每个来源地址每分钟的 API 请求数，`0` 关闭限流。批量查询每 10 条计 1 次 |
| `API_TOKEN` | 无 | 设置后，携带 `Authorization: Bearer <token>` 或 `X-API-Token` 的请求不受限流，`POST /api/init` 也必须携带 |
| `GEOIP_UPDATE_INTERVAL` | `24` | 检查数据库新版本的间隔（小时），`0` 关闭自动更新 |
| `GEOIP_PRELOAD` | `1` | 启动时在后台下载并打开数据库；设为 `0` 改为首次查询时加载 |
| `DNS_SERVERS` | 系统配置 | 域名查询与反向解析使用的 DNS 服务器，逗号分隔，例如 `223.5.5.5,1.1.1.1` |
| `HTTP_PROXY` / `HTTPS_PROXY` | 无 | 服务器出站 HTTP/HTTPS 代理地址；Docker 镜像已启用 Node 24 原生代理支持 |
| `NO_PROXY` | 无 | 不经过出站代理的主机；仓库 Compose 默认包含 `localhost,127.0.0.1,::1` |

### 出站连接

BGP、RPKI、RDAP、地图底图与数据库更新需要服务器访问 RIPEstat、rdap.org、OpenStreetMap 和 GitHub。日志中的 `ETIMEDOUT` 表示对应地址连接超时，`ENETUNREACH` 表示服务器没有到该地址的路由。若 IPv4 超时和 IPv6 不可达同时出现，仅关闭 IPv6 无法保证恢复，需要检查服务器出站连通性，或使用部署环境提供的 HTTP 代理。

Docker 镜像通过 `NODE_USE_ENV_PROXY=1` 启用 [Node.js 原生代理支持](https://nodejs.org/learn/http/enterprise-network-configuration)。配置 `HTTPS_PROXY` 后，外部 HTTPS 请求及重定向会经过该代理，`NO_PROXY` 指定的主机除外。仓库 Compose 会传入宿主环境中的这三个变量。代理地址必须能从容器内访问，容器中的 `127.0.0.1` 指向容器自身。从源码运行时需在启动进程前设置 `NODE_USE_ENV_PROXY=1`。

服务启动时把 Node 双栈地址尝试间隔从默认 250 ms 调到 2000 ms，减少慢线路被过早放弃的情况；这无法修复本身不通的网络。如需其他间隔，可设置 `NODE_OPTIONS=--network-family-autoselection-attempt-timeout=<毫秒>`。日志和接口错误保留每个尝试地址及原因，网络信息或 RPKI 查询失败的响应不会缓存 30 分钟。

地图仅转发当前视图请求的 OSM 瓦片，并按上游缓存头缓存到 `.next/cache/map-tiles`，过期后通过 ETag / Last-Modified 验证。缓存随访问地点增长，目前不会自动清理；可在磁盘不足时清理，未挂载为持久卷时随容器重建清空。地图仍保留 OSM 署名，版权链接只在点击时访问。服务器需能访问 OSM；此方案不能保证所有大陆网络的加载速度。

### 代理检测

检测由浏览器请求本站、国内和国外探测源，再比较同一 IP 协议下的出口地址。服务器不会使用自己的出口代替访客采样；跨协议、探测失败或采样不完整时显示“暂无法判断”。“未发现出口差异”不能排除全局代理，出口不同也可能来自分流或网络出口变化，不能据此判断代理所在国家。

### 自建双栈探测入口

默认的公共探测接口在部分网络下可能较慢。如果你有自己的域名，可以添加两个子域名指向本服务，一个只有 A 记录、一个只有 AAAA 记录，再改用它们的 `/api/ip`：

```bash
IPV4_PROBE_URLS=https://ip4.example.com/api/ip
IPV6_PROBE_URLS=https://ip6.example.com/api/ip
```

这时服务器需要能通过 IPv6 访问。不配置时，服务器只有 IPv4 也能正常显示访客的 IPv6。

## 命令行

`curl`、`wget`、HTTPie、PowerShell 等客户端访问时返回纯文本，浏览器访问同样的路径会跳转到网页：

```bash
curl ip.example.com                 # 只输出你的 IP
curl ip.example.com/info            # 你的 IP 的文本摘要
curl ip.example.com/8.8.8.8         # 指定 IP 或域名的文本摘要
curl ip.example.com/json            # 你的 IP 的 JSON
curl ip.example.com/example.com/json
```

## API

所有接口都返回 JSON（命令行入口除外），并允许跨域访问。除 `/api/ip` 与 `/api/health` 外都受限流约束，响应带有 `X-RateLimit-Limit`、`X-RateLimit-Remaining`，超出时返回 429 与 `Retry-After`。

| 路径 | 方法 | 说明 |
| --- | --- | --- |
| `/api/ip` | GET | 回显当前连接的来源地址，不查数据库 |
| `/api/query` | GET | 查询访客自己的 IP；带 `?q=` 时查询指定 IP 或域名 |
| `/api/query` | POST | 查询指定 IP 或域名 `{"ip": "8.8.8.8"}`；批量查询 `{"ips": ["8.8.8.8", "example.com"]}`，最多 100 条 |
| `/api/network?ip=` | GET | 反向解析、BGP 前缀与 RPKI、RDAP 注册信息，三项分别返回成功或失败 |
| `/api/bgp/{asn}` | GET | ASN 的 BGP 邻接观测，含方向、观测强度和网络名称 |
| `/api/proxy-detection` | GET / POST | GET 回显当前连接，缺少浏览器采样时无法判断；POST 比较浏览器提交的 `domesticIP`、`foreignIP`，需包含 `"enableProxyDetection": true` |
| `/api/map/{z}/{x}/{y}.png` | GET | 同源 OSM 底图，服务器与浏览器按上游缓存规则复用 |
| `/api/health` | GET | 健康检查：数据库版本、构建日期与更新状态；City 库不可用时返回 503 |
| `/api/init` | GET / POST | 查看数据库状态 / 补齐缺失的数据库；`{"update": true}` 立即检查更新（需要 `API_TOKEN`） |

```bash
curl -s -X POST http://localhost:3000/api/query \
  -H 'Content-Type: application/json' -d '{"ip":"1.1.1.1"}'

# 立即检查数据库更新
curl -s -X POST http://localhost:3000/api/init \
  -H "Authorization: Bearer $API_TOKEN" -H 'Content-Type: application/json' -d '{"update":true}'
```

按域名查询时，结果额外包含 `resolvedFrom: {domain, addresses}`。只解析到内网或保留地址的域名会被拒绝，避免暴露服务器所在网络的内部 DNS。

## 工作原理

### 数据来源

| 数据 | 来源 | 用途 |
| --- | --- | --- |
| `GeoLite2-City.mmdb` | [P3TERX/GeoLite.mmdb](https://github.com/P3TERX/GeoLite.mmdb) | 国家、城市、坐标与精度半径（必需） |
| `GeoLite2-ASN.mmdb` | [P3TERX/GeoLite.mmdb](https://github.com/P3TERX/GeoLite.mmdb) | ASN 与组织名称 |
| `GeoCN.mmdb` | [ljxi/GeoCN](https://github.com/ljxi/GeoCN) | 中国地区的省市区与运营商 |
| BGP 邻接 | [RIPEstat asn-neighbours](https://stat.ripe.net/docs/data-api/api-endpoints/asn-neighbours) | RIS 路由观测 |
| 前缀与 RPKI | RIPEstat `network-info`、`rpki-validation` | IP 所在的宣告前缀、起源 AS 与 ROA 验证 |
| 注册信息 | [RDAP](https://about.rdap.org/)（经 rdap.org 跳转到对应 RIR） | 网段名称、所属机构、滥用举报邮箱 |
| 地图底图 | [OpenStreetMap](https://operations.osmfoundation.org/policies/tiles/) | 本站按视图转发并缓存，保留署名 |

数据库保存在 `lib/data/`，缺失或损坏时自动下载。服务每隔 `GEOIP_UPDATE_INTERVAL` 小时比较一次 GitHub Release 的版本标签，标签变化才下载，新文件校验通过且构建时间不早于当前文件时原子替换，并重新打开数据库、清空查询缓存；下载失败时继续使用旧文件。版本记录在 `lib/data/versions.json`，页脚会显示各库的构建日期。只有 City 库是必需的，ASN 和 GeoCN 不可用时基础查询照常工作。GeoCN 只补充地区和运营商，地图坐标始终使用 MaxMind 的数据，不会根据地名推算坐标。

IP 定位只能反映网络出口的大致位置，不代表设备或街道位置；公共 DNS 等任播地址可能没有坐标。

### 双栈检测

浏览器先请求本站 `/api/ip`，得到当前连接所用协议的地址；另一种协议的地址由浏览器并行请求单栈探测接口获得，取第一个有效结果，最多等待 4 秒。这些接口的域名只有 A 或只有 AAAA 记录，因此返回的一定是对应协议的出口地址。私有和回环地址不计入。

### WebRTC 泄露检测

浏览器向 STUN 服务器（Google、Cloudflare）请求候选地址，其中的 srflx 地址就是 WebRTC 看到的公网出口。它与网页请求的出口（双栈检测结果）不同时，说明代理或 VPN 没有接管 WebRTC 流量。检测只在浏览器中进行，结果不会发送到服务器。

### BGP 方向

RIS 记录邻居在 AS 路径中的位置：位于查询目标之前（更靠近观测点）记为上游侧，之后（更靠近路由源）记为下游侧，两侧都出现或无法判断时记为方向不确定。这只描述路径位置，不等同于商业上的上下游或对等关系。网络名称来自 RIPEstat `as-names`，按观测强度最多补充 3000 个。

## 开发

```bash
pnpm dev          # 开发服务器
pnpm lint         # ESLint
pnpm typecheck    # TypeScript
pnpm test:unit    # 单元测试，不依赖外部服务
pnpm build && pnpm test   # 构建后运行单元测试和生产环境冒烟测试
```

技术栈：Next.js 16、React 19、Tailwind CSS 4、Zustand、Leaflet、mmdb-lib。

```text
app/            页面、全局样式与 API 路由
components/     界面组件（components/bgp/ 为 BGP 面板）
lib/geoip/      数据库下载、读取、缓存与合并
lib/dual-stack.ts  IPv4/IPv6 单栈探测
lib/ip-detection.ts 访客 IP 识别与代理检测
lib/lookup.ts   IP 与域名查询、批量查询
lib/network-intel.ts 前缀、RPKI 与 RDAP
lib/api-guard.ts 限流与 Token
instrumentation.ts 启动时预加载数据库并开启定期更新
proxy.ts        命令行入口、安全响应头与 API 跨域设置
```

### 发布

推送 `v` 开头的 tag 即可发布：CI 构建并推送镜像，然后创建 GitHub Release。Release 说明由 [`.github/scripts/release-notes.sh`](.github/scripts/release-notes.sh) 生成：附注 tag 的说明作为概要，其后按提交类型（`feat`、`fix`、`design`、`docs` 等）列出变更。

```bash
git tag -a v2.0.0 -m "v2.0.0" -m "本次发布的概要"
git push origin v2.0.0
```

## 致谢

[MaxMind GeoLite2](https://www.maxmind.com)、[P3TERX/GeoLite.mmdb](https://github.com/P3TERX/GeoLite.mmdb)、[ljxi/GeoCN](https://github.com/ljxi/GeoCN)、[RIPE NCC RIPEstat](https://stat.ripe.net)、[OpenStreetMap](https://www.openstreetmap.org/copyright) 贡献者。
