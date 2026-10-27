"use client";

import type { ChangeEvent, FormEvent } from "react";
import { ArrowRight, Loader2, Search } from "lucide-react";

export function IPQueryInput({ value, disabled, onChange, onSubmit }: {
  value: string;
  disabled: boolean;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <form onSubmit={onSubmit} aria-busy={disabled} className="ip-query-form">
      <Search aria-hidden="true" />
      <input
        value={value} onChange={onChange} disabled={disabled}
        type="text" autoComplete="off" autoCapitalize="none" spellCheck={false}
        aria-label="IP 地址，留空查询我的 IP" placeholder="输入 IPv4 或 IPv6 地址"
        className="ip-query-field focus-visible:outline-none"
      />
      <button type="submit" disabled={disabled} className="ui-button ui-button-primary px-4" aria-label={value.trim() ? "查询 IP 地址" : "查询我的 IP"}>
        {disabled ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
        <span>查询</span>
      </button>
    </form>
  );
}
