"use client";

import { useEffect } from "react";
import { useIPQueryStore } from "@/lib/store";
import type { StackVersion } from "@/lib/dual-stack";

const versions: StackVersion[] = ["IPv4", "IPv6"];

const stateLabel = (address: string | null | undefined) => address === undefined ? "检测中" : address === null ? "不可用" : address;

// 单域名双栈：本站回显当前连接的协议，另一种由浏览器请求单栈探测接口获得，服务器无需 IPv6。
export default function VersionSwitcher() {
  const { stack, ipData, isAutoDetected, isLoading, detectStack, executeQuery } = useIPQueryStore();
  useEffect(() => { detectStack(); }, [detectStack]);

  return (
    <nav aria-label="我的连接地址" className="version-switcher">
      {versions.map((version) => {
        const address = stack[version];
        const active = isAutoDetected && Boolean(address) && ipData?.ip === address;
        return (
          <button
            key={version}
            type="button"
            className="version-switcher-option"
            data-state={address === undefined ? "pending" : address === null ? "missing" : "ready"}
            aria-current={active ? "true" : undefined}
            disabled={!address || isLoading}
            title={`${version} · ${stateLabel(address)}`}
            aria-label={`查询我的 ${version} 地址（${stateLabel(address)}）`}
            onClick={() => address && !active && executeQuery(address, { auto: true })}
          >
            <span className="version-switcher-dot" aria-hidden="true" />{version}
          </button>
        );
      })}
    </nav>
  );
}

// 身份卡里的双栈摘要：同时列出两种协议的出口地址，点击即切换到该地址。
export function StackSummary() {
  const { stack, ipData, isLoading, executeQuery } = useIPQueryStore();
  return (
    <dl className="id-stack" aria-label="我的双栈地址">
      {versions.map((version) => {
        const address = stack[version];
        const current = Boolean(address) && ipData?.ip === address;
        return (
          <div key={version} className="id-stack-item" data-current={current || undefined}>
            <dt>{version}</dt>
            <dd>
              {address ? (
                <button type="button" className="font-mono" disabled={current || isLoading} onClick={() => executeQuery(address, { auto: true })} title={current ? "当前显示的地址" : `查看 ${address}`}>
                  {address}
                </button>
              ) : <span className="id-stack-missing">{address === undefined ? "检测中…" : "未检测到"}</span>}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}
