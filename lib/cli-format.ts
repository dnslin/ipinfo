import type { IPInfo } from "./store";

// 终端里中文占两列，按显示宽度补齐标签。
const width = (text: string) => [...text].reduce((sum, char) => sum + (/[ᄀ-ᅟ⺀-꓏가-힣豈-﫿︰-﹏＀-｠￠-￦]/.test(char) ? 2 : 1), 0);
const pad = (label: string, size: number) => label + " ".repeat(Math.max(1, size - width(label)));

export function formatText(data: IPInfo): string {
  const location = [...new Set([data.country, data.province, data.city, data.district].filter(Boolean))].join(" · ");
  const { latitude, longitude, accuracy_radius } = data.location;
  const operator = data.isp || data.as?.info || data.as?.name;
  const rows: [string, string | undefined][] = [
    ["IP", `${data.ip} (${data.ipVersion})`],
    ["域名", data.resolvedFrom ? `${data.resolvedFrom.domain} → ${data.resolvedFrom.addresses.join(", ")}` : undefined],
    ["位置", data.source === "Local" ? "本地网络" : location || undefined],
    ["运营商", operator],
    ["ASN", data.as?.number ? `AS${data.as.number}${data.as.name ? ` ${data.as.name}` : ""}` : undefined],
    ["网络段", data.net],
    ["坐标", latitude !== null && longitude !== null ? `${latitude.toFixed(4)}, ${longitude.toFixed(4)}${accuracy_radius !== undefined ? ` (±${accuracy_radius} km)` : ""}` : undefined],
    ["时区", data.timezone],
    ["来源", data.source],
  ];
  const present = rows.filter((row): row is [string, string] => Boolean(row[1]));
  const size = Math.max(...present.map(([label]) => width(label))) + 2;
  return present.map(([label, value]) => `${pad(label, size)}${value}`).join("\n") + "\n";
}

// 常见命令行客户端：返回纯文本而不是网页。
const CLI_AGENT = /^(curl|wget|httpie|xh|aria2|fetch|python-requests|python-urllib|go-http-client|okhttp|libwww-perl)\b|powershell/i;

export function isCLIRequest(userAgent: string | null): boolean {
  return Boolean(userAgent && CLI_AGENT.test(userAgent));
}
