"use client";

import type { ChangeEvent, FormEvent } from "react";
import { ArrowRight, Loader2, LocateFixed, Search } from "lucide-react";

export function IPQueryInput({ value, disabled, onChange, onSubmit, onLocate }: {
  value: string;
  disabled: boolean;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onLocate?: () => void;
}) {
  return (
    <form onSubmit={onSubmit} aria-busy={disabled} className="query-bar">
      <Search aria-hidden="true" />
      <input
        value={value} onChange={onChange} disabled={disabled}
        type="text" autoComplete="off" autoCapitalize="none" spellCheck={false}
        aria-label="IP 地址，留空查询我的 IP" placeholder="输入 IPv4 或 IPv6 地址"
        className="query-field"
      />
      {onLocate && (
        <button type="button" disabled={disabled} onClick={onLocate} className="query-locate" aria-label="查询我的 IP" title="查询我的 IP">
          <LocateFixed />
        </button>
      )}
      <button type="submit" disabled={disabled} className="query-submit" aria-label={value.trim() ? "查询 IP 地址" : "查询我的 IP"}>
        {disabled ? <Loader2 className="animate-spin" /> : <ArrowRight />}
      </button>
    </form>
  );
}
