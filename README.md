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
- **单域名双栈检测**：同时显示访客的 IPv4 和 IPv6 出口，服务器不需要 IPv6，也不需要额外的子域名。
- **地图定位**：Leaflet + OpenStreetMap，按数据库给出的精度半径标出估算范围；没有坐标时明确说明原因。
- **BGP 邻接观测**：基于 RIPE RIS，按 AS 路径方向区分上游侧与下游侧，附网络名称、观测强度和关系图，可逐级查看邻居的邻接。
- **补充数据源**：可选的美团溯源与代理检测，失败时保留原始结果，不用其他来源冒充。
- **开箱即用的部署**：单个 Docker 镜像，数据库首次启动时自动下载并持久化，以非 root 用户运行。
- **深浅主题**与适配手机的布局。

## 快速开始

### Docker

```bash
docker run -d --name ipinfo -p 3000:3000 \
  -v "$(pwd)/data:/app/lib/data" \
  --restart unless-stopped \
  ghcr.io/dnslin/ipinfo:latest
```

访问 <http://localhost:3000>。首次启动会下载约 70 MB 的数据库到 `./data`，之后重启直接复用。

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

没有转发头时，首页会改用浏览器检测到的地址。

## 配置

所有配置都是可选的。

| 环境变量 | 默认值 | 说明 |
| --- | --- | --- |
| `PORT` | `3000` | 监听端口 |
| `HOSTNAME` | `0.0.0.0` | 监听地址 |
| `IPV4_PROBE_URLS` | ip.sb、ipify、icanhazip | 浏览器检测 IPv4 出口的接口，逗号分隔 |
| `IPV6_PROBE_URLS` | ip.sb、ipify、icanhazip | 浏览器检测 IPv6 出口的接口，逗号分隔 |

### 自建双栈探测入口

默认的公共探测接口在部分网络下可能较慢。如果你有自己的域名，可以添加两个子域名指向本服务，一个只有 A 记录、一个只有 AAAA 记录，再改用它们的 `/api/ip`：

```bash
IPV4_PROBE_URLS=https://ip4.example.com/api/ip
IPV6_PROBE_URLS=https://ip6.example.com/api/ip
```

这时服务器需要能通过 IPv6 访问。不配置时，服务器只有 IPv4 也能正常显示访客的 IPv6。

## API

所有接口都返回 JSON，并允许跨域访问。

| 路径 | 方法 | 说明 |
| --- | --- | --- |
| `/api/ip` | GET | 回显当前连接的来源地址，不查数据库 |
| `/api/query` | GET | 查询访客自己的 IP |
| `/api/query` | POST | 查询指定 IP，请求体 `{"ip": "8.8.8.8"}` |
| `/api/bgp/{asn}` | GET | ASN 的 BGP 邻接观测，含方向、观测强度和网络名称 |
| `/api/meituan` | POST | 美团补充位置，请求体 `{"ip": "..."}`；未收录返回 404 |
| `/api/proxy-detection` | POST | 代理检测，请求体需包含 `"enableProxyDetection": true` |
| `/api/init` | GET / POST | 查看数据库状态 / 重新下载缺失的数据库 |

```bash
curl -s -X POST http://localhost:3000/api/query \
  -H 'Content-Type: application/json' -d '{"ip":"1.1.1.1"}'
```

## 工作原理

### 数据来源

| 数据 | 来源 | 用途 |
| --- | --- | --- |
| `GeoLite2-City.mmdb` | [P3TERX/GeoLite.mmdb](https://github.com/P3TERX/GeoLite.mmdb) | 国家、城市、坐标与精度半径（必需） |
| `GeoLite2-ASN.mmdb` | [P3TERX/GeoLite.mmdb](https://github.com/P3TERX/GeoLite.mmdb) | ASN 与组织名称 |
| `GeoCN.mmdb` | [ljxi/GeoCN](https://github.com/ljxi/GeoCN) | 中国地区的省市区与运营商 |
| BGP 邻接 | [RIPEstat asn-neighbours](https://stat.ripe.net/docs/data-api/api-endpoints/asn-neighbours) | RIS 路由观测 |
| 地图底图 | [OpenStreetMap](https://operations.osmfoundation.org/policies/tiles/) | 浏览器按视图加载，保留署名 |

数据库保存在 `lib/data/`，缺失或损坏时自动下载，已有的有效文件不会被定期更新；需要更新时删除文件后调用 `POST /api/init`。只有 City 库是必需的，ASN 和 GeoCN 不可用时基础查询照常工作。GeoCN 只补充地区和运营商，地图坐标始终使用 MaxMind 的数据，不会根据地名推算坐标。

IP 定位只能反映网络出口的大致位置，不代表设备或街道位置；公共 DNS 等任播地址可能没有坐标。

### 双栈检测

浏览器先请求本站 `/api/ip`，得到当前连接所用协议的地址；另一种协议的地址由浏览器并行请求单栈探测接口获得，取第一个有效结果，最多等待 4 秒。这些接口的域名只有 A 或只有 AAAA 记录，因此返回的一定是对应协议的出口地址。私有和回环地址不计入。

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
proxy.ts        安全响应头与 API 跨域设置
```

### 发布

推送 `v` 开头的 tag 即可发布：CI 构建并推送镜像，然后创建 GitHub Release。Release 说明由 [`.github/scripts/release-notes.sh`](.github/scripts/release-notes.sh) 生成：附注 tag 的说明作为概要，其后按提交类型（`feat`、`fix`、`design`、`docs` 等）列出变更。

```bash
git tag -a v2.0.0 -m "v2.0.0" -m "本次发布的概要"
git push origin v2.0.0
```

## 致谢

[MaxMind GeoLite2](https://www.maxmind.com)、[P3TERX/GeoLite.mmdb](https://github.com/P3TERX/GeoLite.mmdb)、[ljxi/GeoCN](https://github.com/ljxi/GeoCN)、[RIPE NCC RIPEstat](https://stat.ripe.net)、[OpenStreetMap](https://www.openstreetmap.org/copyright) 贡献者。
