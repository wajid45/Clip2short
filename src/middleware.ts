import { NextResponse, type NextRequest } from "next/server";

/** Fast redirect for signed-out visitors. Real session verification happens server-side in each layout/route. */
export function middleware(req: NextRequest) {
  const hasSession = req.cookies.has("sl_session");
  const { pathname } = req.nextUrl;
  if (!hasSession && (pathname.startsWith("/app") || pathname.startsWith("/admin"))) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = `?next=${encodeURIComponent(pathname + req.nextUrl.search)}`;
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = { matcher: ["/app/:path*", "/admin/:path*"] };
