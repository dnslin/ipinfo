"use client";

import { useState, type FormEvent } from "react";
import { useIPQueryStore } from "@/lib/store";
import { isValidIP, checkPrivateIP } from "@/lib/ip-detection";
import { IPQueryInput } from "@/components/ui/ip-query-input";
import { toast } from "sonner";

export default function IPQueryForm() {
  const [inputValue, setInputValue] = useState("");
  const { setQuery, executeQuery, isLoading, clearError } = useIPQueryStore();
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

  return <IPQueryInput value={inputValue} disabled={isLoading} onChange={(event) => changeInput(event.target.value)} onSubmit={submit} onLocate={queryMyIP} />;
}
