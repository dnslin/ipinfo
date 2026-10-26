"use client";

import { useState, type FormEvent } from "react";
import { LocateFixed } from "lucide-react";
import { useIPQueryStore } from "@/lib/store";
import { isValidIP, checkPrivateIP } from "@/lib/ip-detection";
import { IPQueryInput } from "@/components/ui/ip-query-input";
import { toast } from "sonner";

export default function IPQueryForm() {
  const [inputValue, setInputValue] = useState("");
  const { setQuery, executeQuery, isLoading, error, clearError } = useIPQueryStore();
  const changeInput = (value: string) => { setInputValue(value); clearError(); };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isLoading) return;
    const ip = inputValue.trim();
    if (ip && !isValidIP(ip)) {
      toast.error("IP 地址格式错误", { description: "请输入有效的 IPv4 或 IPv6 地址" });
      return;
    }
    if (ip) {
      const privateAddress = checkPrivateIP(ip);
      if (privateAddress.isPrivate) {
        toast.warning(privateAddress.message, { description: privateAddress.description });
        return;
      }
    }
    setQuery(ip);
    await executeQuery(ip || undefined);
  };

  const queryMyIP = async () => {
    changeInput("");
    setQuery("");
    await executeQuery();
  };

  return (
    <div className="mx-auto w-full max-w-[680px]">
      <IPQueryInput value={inputValue} disabled={isLoading} onChange={(event) => changeInput(event.target.value)} onSubmit={submit} />
      {error && <p role="alert" className="mt-3 text-left text-sm text-[rgb(var(--color-error))]">{error}</p>}
      <div className="mt-3 flex flex-wrap items-center justify-center gap-2 text-xs text-[rgb(var(--color-text-muted))] sm:gap-3">
        <button type="button" disabled={isLoading} onClick={queryMyIP} className="ui-button gap-1.5 border-transparent bg-transparent px-2 py-1 text-xs">
          <LocateFixed className="h-3.5 w-3.5" />查询我的 IP
        </button>
        <span className="h-3 w-px bg-[rgb(var(--color-border))]" aria-hidden="true" />
        <span>试一试</span>
        <button type="button" disabled={isLoading} onClick={() => changeInput("8.8.8.8")} className="ui-button px-2.5 py-1 text-xs" aria-label="填入 IPv4 示例 8.8.8.8"><span className="font-mono">8.8.8.8</span></button>
        <button type="button" disabled={isLoading} onClick={() => changeInput("2001:4860:4860::8888")} className="ui-button px-2.5 py-1 text-xs" aria-label="填入 IPv6 示例">IPv6 示例</button>
      </div>
    </div>
  );
}
