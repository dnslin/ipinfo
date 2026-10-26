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
    <form onSubmit={onSubmit} aria-busy={disabled} className="flex min-w-0 items-center gap-2 rounded-xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface))] p-1.5 shadow-sm focus-within:border-[rgb(var(--color-primary))] focus-within:ring-2 focus-within:ring-[rgb(var(--color-primary)/0.12)]">
      <Search className="ml-3 hidden h-[18px] w-[18px] shrink-0 text-[rgb(var(--color-text-muted))] sm:block" />
      <input
        value={value} onChange={onChange} disabled={disabled}
        type="text" autoComplete="off" autoCapitalize="none" spellCheck={false}
        aria-label="IP 地址，留空查询我的 IP" placeholder="输入 IPv4 或 IPv6 地址"
        className="h-11 min-w-0 flex-1 bg-transparent px-2 text-[15px] text-[rgb(var(--color-text-primary))] outline-none placeholder:text-sm placeholder:text-[rgb(var(--color-text-muted))] focus-visible:outline-none"
      />
      <button type="submit" disabled={disabled} className="ui-button ui-button-primary px-4" aria-label={value.trim() ? "查询 IP 地址" : "查询我的 IP"}>
        {disabled ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
        <span>查询</span>
      </button>
    </form>
  );
}
