import { NextRequest, NextResponse } from "next/server";
import { fetchMapTile } from "@/lib/map-tiles";
import { describeFetchError } from "@/lib/network";

export async function GET(request: NextRequest, context: { params: Promise<{ z: string; x: string; y: string }> }) {
  const { z, x, y } = await context.params;
  const row = y.match(/^(0|[1-9]\d*)\.png$/)?.[1];
  const integer = /^(0|[1-9]\d*)$/;
  if (!integer.test(z) || !integer.test(x) || row === undefined || Number(z) > 19 || Number(x) >= 2 ** Number(z) || Number(row) >= 2 ** Number(z)) {
    return NextResponse.json({ error: "无效的地图瓦片坐标" }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }
  try {
    // OSM 跨域直连收到的 Referer 也是页面来源；不向上游传递查询参数中的 IP。
    const referer = new URL(request.headers.get("referer") ?? request.url).origin + "/";
    const { body, headers } = await fetchMapTile(`${z}/${x}/${y}`, referer);
    const etag = headers.get("etag");
    const condition = request.headers.get("if-none-match");
    const notModified = condition && etag
      ? condition.split(",").some((value) => value.trim() === "*" || value.trim().replace(/^W\//, "") === etag.replace(/^W\//, ""))
      : !condition && headers.has("last-modified") && Date.parse(request.headers.get("if-modified-since") ?? "") >= Date.parse(headers.get("last-modified")!);
    return new Response(notModified ? null : new Uint8Array(body), { status: notModified ? 304 : 200, headers });
  } catch (error) {
    const detail = describeFetchError(error);
    console.error(`地图瓦片加载失败（${z}/${x}/${y}）:`, error);
    const timedOut = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
    return NextResponse.json({ error: `地图底图加载失败: ${detail}` }, { status: timedOut ? 504 : 502, headers: { "Cache-Control": "no-store" } });
  }
}
