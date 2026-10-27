import * as net from "node:net";

// Node 的双栈连接（autoSelectFamily）是串行的：每个地址只等若干毫秒，超时就取消并换下一个，
// 只有最后一个地址才用完整超时。默认 250ms 对跨洲线路太短——例如香港到阿姆斯特丹的握手约 200ms，
// 能连上的 IPv4 会被提前掐断，再落到不通的 IPv6 上，整个请求在一秒内失败（fetch failed）。
export const CONNECT_ATTEMPT_TIMEOUT = 2000;
const NODE_DEFAULT_ATTEMPT_TIMEOUT = 250;

// 只在仍是 Node 默认值时调整，尊重通过 NODE_OPTIONS 显式设置的值。
export function configureOutboundConnections(): void {
  if (net.getDefaultAutoSelectFamilyAttemptTimeout() === NODE_DEFAULT_ATTEMPT_TIMEOUT) {
    net.setDefaultAutoSelectFamilyAttemptTimeout(CONNECT_ATTEMPT_TIMEOUT);
  }
}

/**
 * fetch 在网络层失败时只给出 "fetch failed"，真正原因在 error.cause：
 * 单个错误（ECONNREFUSED 等），或依次尝试多个地址时的 AggregateError。
 * 转成一行可读的说明，例如 "fetch failed: ETIMEDOUT 193.0.6.150:443, ENETUNREACH 2001:67c::1:443"。
 */
export function describeFetchError(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  const cause = (error as Error & { cause?: unknown }).cause;
  if (!(cause instanceof Error)) return error.message;
  const attempts = cause instanceof AggregateError && cause.errors.length ? cause.errors : [cause];
  const details = attempts.map((attempt: NodeJS.ErrnoException & { address?: string; port?: number }) => {
    const target = attempt.address ? ` ${attempt.address.includes(":") ? `[${attempt.address}]` : attempt.address}${attempt.port ? `:${attempt.port}` : ""}` : "";
    return attempt.code ? `${attempt.code}${target}` : attempt.message;
  });
  return `${error.message}: ${details.join(", ")}`;
}
