import { NextRequest, NextResponse } from "next/server";

const KONG = process.env.KONG_URL || "http://localhost:8000";

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ path?: string[] }> },
) {
  const { path = [] } = await ctx.params;
  const sub = path.join("/");
  const target = `${KONG}/api/v1/live-commerce/${sub}${req.nextUrl.search}`;
  const r = await fetch(target, { headers: { Accept: req.headers.get("accept") || "*/*" } });
  const ct = r.headers.get("content-type") || "application/json";
  const body = await r.arrayBuffer();
  return new NextResponse(body, { status: r.status, headers: { "content-type": ct } });
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ path?: string[] }> },
) {
  const { path = [] } = await ctx.params;
  const sub = path.join("/");
  const target = `${KONG}/api/v1/live-commerce/${sub}`;
  const body = await req.text();
  const r = await fetch(target, {
    method: "POST",
    headers: {
      "Content-Type": req.headers.get("content-type") || "application/json",
      "X-Live-Merchant-Api-Key": req.headers.get("x-live-merchant-api-key") || "",
    },
    body,
  });
  const data = await r.text();
  return new NextResponse(data, {
    status: r.status,
    headers: { "content-type": r.headers.get("content-type") || "application/json" },
  });
}
