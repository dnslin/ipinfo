"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useIPQueryStore } from "@/lib/store";
import { isValidIP, checkPrivateIP } from "@/lib/ip-detection";
import { IPQueryInput } from "@/components/ui/ip-query-input";
import { toast } from "sonner";

const isEditable = (target: EventTarget | null) =>
  target instanceof HTMLElement && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));

export default function IPQueryForm() {
  const [inputValue, setInputValue] = useState("");
  const [invalid, setInvalid] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const { setQuery, executeQuery, isLoading, clearError } = useIPQueryStore();
  const changeInput = (value: string) => { setInputValue(value); setInvalid(false); clearError(); };

  // “/” 聚焦查询框：高频键盘操作，只移动焦点，不加动画。
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey || isEditable(event.target)) return;
      if (document.querySelector("[role=dialog]")) return;
      event.preventDefault();
      inputRef.current?.focus();
      inputRef.current?.select();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // 无效输入：红色描边说明状态，轻微左右摆动作为反馈；减少动态效果时只保留描边。
  const reject = (title: string, description: string, warning = false) => {
    setInvalid(true);
    (warning ? toast.warning : toast.error)(title, { description });
    if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      formRef.current?.animate(
        [{ transform: "translateX(0)" }, { transform: "translateX(-6px)" }, { transform: "translateX(5px)" }, { transform: "translateX(-3px)" }, { transform: "translateX(0)" }],
        { duration: 280, easing: "cubic-bezier(0.23, 1, 0.32, 1)" },
      );
    }
    inputRef.current?.focus();
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isLoading) return;
    const ip = inputValue.trim();
    if (ip && !isValidIP(ip)) {
      reject("IP 地址格式错误", "请输入有效的 IPv4 或 IPv6 地址");
      return;
    }
    if (ip) {
      const privateAddress = checkPrivateIP(ip);
      if (privateAddress.isPrivate) {
        reject(privateAddress.message, privateAddress.description, true);
        return;
      }
    }
    setQuery(ip);
    inputRef.current?.blur();
    await executeQuery(ip || undefined);
  };

  const queryMyIP = async () => {
    changeInput("");
    setQuery("");
    await executeQuery();
  };

  return (
    <IPQueryInput
      formRef={formRef} inputRef={inputRef} value={inputValue} disabled={isLoading} invalid={invalid}
      onChange={(event) => changeInput(event.target.value)}
      onSubmit={submit} onLocate={queryMyIP}
      onEscape={() => (inputValue ? changeInput("") : inputRef.current?.blur())}
    />
  );
}
