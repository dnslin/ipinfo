"use client";

import { ArrowRight } from "lucide-react";

export function PlaceholdersAndVanishInput({
  placeholder,
  onChange,
  onSubmit,
  value,
  disabled = false,
}: {
  placeholder: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
  value: string;
  disabled?: boolean;
}) {
  return (
    <form
      className="w-full relative max-w-xl mx-auto bg-white dark:bg-zinc-800 h-12 rounded-full overflow-hidden shadow-[0px_2px_3px_-1px_rgba(0,0,0,0.1),_0px_1px_0px_0px_rgba(25,28,33,0.02),_0px_0px_0px_1px_rgba(25,28,33,0.08)] transition duration-200 focus-within:ring-2 focus-within:ring-blue-500"
      onSubmit={onSubmit}
    >
      <input
        onChange={onChange}
        value={value}
        disabled={disabled}
        type="text"
        aria-label="IP 地址，留空查询我的 IP"
        placeholder={placeholder}
        autoComplete="off"
        autoCapitalize="none"
        spellCheck={false}
        className="w-full relative text-sm sm:text-base border-none dark:text-white bg-transparent text-black h-full rounded-full focus:outline-none pl-4 sm:pl-10 pr-14 placeholder:text-neutral-500 dark:placeholder:text-zinc-400"
      />
      <button
        disabled={disabled}
        type="submit"
        aria-label={value.trim() ? "查询 IP 地址" : "查询我的 IP"}
        className="absolute right-2 top-1/2 -translate-y-1/2 h-8 w-8 rounded-full bg-black dark:bg-zinc-900 disabled:opacity-50 transition duration-200 flex items-center justify-center text-white"
      >
        <ArrowRight className="h-4 w-4" />
      </button>
    </form>
  );
}
