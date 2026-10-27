"use client";

import type { ChangeEvent, FormEvent, Ref } from "react";
import { ArrowRight, Loader2, LocateFixed, Search } from "lucide-react";

export function IPQueryInput({ value, disabled, invalid, onChange, onSubmit, onLocate, onEscape, formRef, inputRef }: {
  value: string;
  disabled: boolean;
  invalid?: boolean;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onLocate?: () => void;
  onEscape?: () => void;
  formRef?: Ref<HTMLFormElement>;
  inputRef?: Ref<HTMLInputElement>;
}) {
  return (
    <form ref={formRef} onSubmit={onSubmit} aria-busy={disabled} className="query-bar" data-invalid={invalid || undefined}>
      <Search aria-hidden="true" />
      <input
        ref={inputRef} value={value} onChange={onChange} disabled={disabled}
        onKeyDown={(event) => { if (event.key === "Escape" && onEscape) { event.preventDefault(); onEscape(); } }}
        type="text" autoComplete="off" autoCapitalize="none" spellCheck={false}
        aria-label="IP 地址或域名，留空查询我的 IP" aria-invalid={invalid || undefined} aria-keyshortcuts="/"
        placeholder="输入 IP 地址或域名"
        className="query-field"
      />
      {!value && <kbd className="query-kbd" aria-hidden="true">/</kbd>}
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
