// 域名校验，浏览器与服务端共用。要求至少两级、顶级域为字母（或 IDN 的 xn--），排除 localhost、内网后缀等。
const LABEL = /^(?!-)[a-z0-9-]{1,63}(?<!-)$/;
const INTERNAL_SUFFIXES = ["localhost", "local", "internal", "intranet", "lan", "home", "corp", "localdomain", "home.arpa", "arpa", "test", "invalid", "example"];

export function normalizeDomain(input: string): string | null {
  let value = input.trim().toLowerCase();
  // 允许粘贴完整网址：去掉协议、路径、端口与末尾的点。
  value = value.replace(/^[a-z][a-z0-9+.-]*:\/\//, "").replace(/[/?#].*$/, "").replace(/:\d+$/, "").replace(/\.$/, "");
  if (!value || value.length > 253 || value.includes("@")) return null;
  let ascii = value;
  try {
    // URL 解析会把中文等 IDN 转为 punycode
    ascii = new URL(`http://${value}`).hostname;
  } catch {
    return null;
  }
  const labels = ascii.split(".");
  if (labels.length < 2 || !labels.every((label) => LABEL.test(label))) return null;
  const tld = labels[labels.length - 1];
  if (!/^(?:[a-z]{2,63}|xn--[a-z0-9-]{1,59})$/.test(tld)) return null;
  if (INTERNAL_SUFFIXES.some((suffix) => ascii === suffix || ascii.endsWith(`.${suffix}`))) return null;
  return ascii;
}

export function isValidDomain(input: string): boolean {
  return normalizeDomain(input) !== null;
}
