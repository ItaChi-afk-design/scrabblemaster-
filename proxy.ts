import { NextResponse, type NextRequest } from "next/server";
import { hasMalformedPercentEncoding } from "./app/lib/path-validation";

const WORD_ROUTE_PREFIX = "/api/word/";

export function proxy(request: NextRequest) {
  const pathname = new URL(request.url).pathname;
  if (!pathname.startsWith(WORD_ROUTE_PREFIX)) return NextResponse.next();

  if (hasMalformedPercentEncoding(pathname.slice(WORD_ROUTE_PREFIX.length))) {
    return Response.json(
      { status: "invalid_request", error: "Enter one word using letters A-Z." },
      { status: 400 },
    );
  }

  return NextResponse.next();
}

export const config = {
  matcher: "/api/word/:path*",
};
