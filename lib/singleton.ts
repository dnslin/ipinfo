// instrumentation 与各个路由可能被打包成不同的模块实例；进程级状态挂在 globalThis 上，保证只有一份。
export function singleton<T>(key: string, create: () => T): T {
  const store = globalThis as typeof globalThis & { __ipinfo?: Map<string, unknown> };
  store.__ipinfo ??= new Map();
  if (!store.__ipinfo.has(key)) store.__ipinfo.set(key, create());
  return store.__ipinfo.get(key) as T;
}
