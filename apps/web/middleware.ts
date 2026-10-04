import { type NextRequest, NextResponse } from "next/server";

import { INVITE_COOKIE } from "@/lib/gate";

// Edge runtime — no node:crypto, so a hand-rolled constant-time compare.
function timingSafeEqual(a: string, b: string): boolean {
  let diff = a.length ^ b.length;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

// --- /admin: HTTP Basic Auth (separate, stronger gate; exposes notify targets) ---
const ADMIN_UNAUTHORIZED = new NextResponse("admin only", {
  status: 401,
  headers: { "WWW-Authenticate": 'Basic realm="admin"' },
});

function checkAdmin(req: NextRequest): NextResponse {
  const password = process.env.ADMIN_PASSWORD ?? "";
  const header = req.headers.get("authorization") ?? "";
  if (!password || !header.startsWith("Basic ")) return ADMIN_UNAUTHORIZED;
  let decoded = "";
  try {
    decoded = atob(header.slice(6));
  } catch {
    return ADMIN_UNAUTHORIZED;
  }
  const i = decoded.indexOf(":");
  const user = i === -1 ? decoded : decoded.slice(0, i);
  const pass = i === -1 ? "" : decoded.slice(i + 1);
  if (timingSafeEqual(user, "admin") && timingSafeEqual(pass, password)) return NextResponse.next();
  return ADMIN_UNAUTHORIZED;
}

// --- everything else: the invite gate (cookie set by /gate after entering the code) ---
export function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;

  if (pathname.startsWith("/admin")) return checkAdmin(req);

  const code = process.env.INVITE_CODE ?? "";
  const cookie = req.cookies.get(INVITE_COOKIE)?.value ?? "";
  if (code && timingSafeEqual(cookie, code)) return NextResponse.next();

  const url = req.nextUrl.clone();
  url.pathname = "/gate";
  url.search = "";
  url.searchParams.set("next", pathname + search);
  return NextResponse.redirect(url);
}

// Run on every page except Next internals and the gate itself (avoids a loop).
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|gate).*)"],
};
