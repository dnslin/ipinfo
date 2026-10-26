import assert from "node:assert/strict";
import { afterEach, beforeEach, mock, test } from "node:test";
import { useIPQueryStore, type IPInfo } from "../lib/store";

const ipInfo = (ip: string): IPInfo => ({
  ip,
  country: "美国",
  countryCode: "US",
  location: { latitude: 37.4, longitude: -122.1, source: "MaxMind" },
  accuracy: "low",
  source: "MaxMind",
  ipVersion: "IPv4",
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

beforeEach(() => {
  useIPQueryStore.setState({
    currentQuery: "",
    ipData: null,
    queryHistory: [],
    isLoading: false,
    error: null,
    isAutoDetected: false,
    isProxyDetecting: false,
  });
});

afterEach(() => mock.restoreAll());

test("a late older response cannot overwrite the latest query or its history", async () => {
  const oldResponse = deferred<Response>();
  mock.method(globalThis, "fetch", (_url: string, init?: RequestInit) => {
    const ip = JSON.parse(String(init?.body)).ip;
    return ip === "8.8.8.8"
      ? oldResponse.promise
      : Promise.resolve(Response.json(ipInfo(ip)));
  });

  const oldQuery = useIPQueryStore.getState().executeQuery("8.8.8.8");
  await useIPQueryStore.getState().executeQuery("1.1.1.1");
  oldResponse.resolve(Response.json(ipInfo("8.8.8.8")));
  await oldQuery;

  assert.equal(useIPQueryStore.getState().ipData?.ip, "1.1.1.1");
  assert.equal(useIPQueryStore.getState().currentQuery, "1.1.1.1");
  assert.deepEqual(useIPQueryStore.getState().queryHistory.map(({ ip }) => ip), ["1.1.1.1"]);
});

test("an older failure cannot clear loading or set an error for a pending newer query", async () => {
  const oldResponse = deferred<Response>();
  const newResponse = deferred<Response>();
  mock.method(globalThis, "fetch", (_url: string, init?: RequestInit) => {
    return JSON.parse(String(init?.body)).ip === "8.8.8.8"
      ? oldResponse.promise
      : newResponse.promise;
  });

  const oldQuery = useIPQueryStore.getState().executeQuery("8.8.8.8");
  const newQuery = useIPQueryStore.getState().executeQuery("1.1.1.1");
  oldResponse.reject(new Error("older request failed"));
  await oldQuery;

  const pendingState = {
    isLoading: useIPQueryStore.getState().isLoading,
    error: useIPQueryStore.getState().error,
  };
  newResponse.resolve(Response.json(ipInfo("1.1.1.1")));
  await newQuery;

  assert.deepEqual(pendingState, { isLoading: true, error: null });
  assert.equal(useIPQueryStore.getState().isLoading, false);
});

test("query errors preserve the server's diagnostic message", async () => {
  mock.method(globalThis, "fetch", async () => Response.json(
    { error: "GeoIP 数据库初始化失败：城市库缺失" },
    { status: 503, statusText: "Service Unavailable" },
  ));

  await useIPQueryStore.getState().executeQuery("8.8.8.8");

  assert.equal(useIPQueryStore.getState().error, "GeoIP 数据库初始化失败：城市库缺失");
  assert.equal(useIPQueryStore.getState().isLoading, false);
});

test("querying my IP does not reuse a previous explicit IP", async () => {
  useIPQueryStore.setState({ currentQuery: "8.8.8.8" });
  let body: { ip?: string } | undefined;
  mock.method(globalThis, "fetch", async (_url: string, init?: RequestInit) => {
    body = JSON.parse(String(init?.body));
    return Response.json(ipInfo("1.1.1.1"));
  });

  await useIPQueryStore.getState().executeQuery();

  assert.deepEqual(body, {});
  assert.equal(useIPQueryStore.getState().isAutoDetected, true);
});

function pendingProxyDetection() {
  const externalResponse = deferred<Response>();
  const started = deferred<void>();
  mock.method(globalThis, "fetch", (url: string) => {
    if (url === "/api/query") {
      return Promise.resolve(Response.json(ipInfo("8.8.8.8")));
    }
    started.resolve();
    return externalResponse.promise.then((response) => response.clone());
  });
  return { externalResponse, started };
}

test("proxy detection always finishes when a new query has cleared the current result", async () => {
  useIPQueryStore.setState({ ipData: ipInfo("8.8.8.8"), isAutoDetected: true });
  const { externalResponse, started } = pendingProxyDetection();
  const detection = useIPQueryStore.getState().executeProxyDetection();
  await started.promise;
  useIPQueryStore.setState({ ipData: null });
  externalResponse.resolve(new Response("8.8.8.8"));
  await detection;

  assert.equal(useIPQueryStore.getState().isProxyDetecting, false);
  assert.equal(useIPQueryStore.getState().ipData, null);
});

test("proxy detection cannot attach its result to a different query", async () => {
  useIPQueryStore.setState({ ipData: ipInfo("8.8.8.8"), isAutoDetected: true });
  const { externalResponse, started } = pendingProxyDetection();
  const detection = useIPQueryStore.getState().executeProxyDetection();
  await started.promise;
  const newerResult = ipInfo("1.1.1.1");
  useIPQueryStore.setState({ ipData: newerResult, isAutoDetected: false });
  externalResponse.resolve(new Response("8.8.8.8"));
  await detection;

  assert.equal(useIPQueryStore.getState().ipData, newerResult);
  assert.equal(useIPQueryStore.getState().ipData?.proxyDetection, undefined);
  assert.equal(useIPQueryStore.getState().isProxyDetecting, false);
});

test("proxy detection still attaches its result when the original query remains current", async () => {
  useIPQueryStore.setState({ ipData: ipInfo("8.8.8.8"), isAutoDetected: true });
  const { externalResponse, started } = pendingProxyDetection();
  const detection = useIPQueryStore.getState().executeProxyDetection();
  await started.promise;
  externalResponse.resolve(new Response("8.8.8.8"));
  await detection;

  assert.equal(useIPQueryStore.getState().ipData?.ip, "8.8.8.8");
  assert.equal(useIPQueryStore.getState().ipData?.proxyDetection?.headerIP, "8.8.8.8");
  assert.equal(useIPQueryStore.getState().isProxyDetecting, false);
});
