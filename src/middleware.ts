import { NextRequest, NextResponse } from "next/server";

/**
 * Desktop mode only: the app server listens on loopback, and every request must carry the
 * per-launch token cookie that the Electron shell installs. Other local processes get 403.
 */
export function middleware(req: NextRequest) {
  if (process.env.GUIONISTA_DESKTOP !== "1") return NextResponse.next();
  if (req.nextUrl.pathname === "/api/health") return NextResponse.next();
  const token = process.env.GUIONISTA_TOKEN;
  if (token && req.cookies.get("gt")?.value === token) return NextResponse.next();
  return new NextResponse("Forbidden", { status: 403 });
}
export const config = { matcher: ["/((?!_next/static|_next/image).*)"] };
