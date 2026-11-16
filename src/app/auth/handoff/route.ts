import { NextResponse, type NextRequest } from "next/server";
import { openSession, redeem, SESSION_COOKIE } from "@/lib/auth";
import { editBase } from "@/lib/hosts";
import { database } from "@/lib/server";
import { CmsError } from "@/lib/store";

/**
 * /auth/handoff?code=…[&back=…]: from 网站内容管理 on the website's 我的账号. The code redeemed, the role read; signed in,
 * on to [back] (a page of this CMS) or the central page; refused, to the sign-in page with the reason.
 */
export async function GET(req: NextRequest) {
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "127.0.0.1";
  const base = editBase(host);
  const code = req.nextUrl.searchParams.get("code") ?? "";
  const back = req.nextUrl.searchParams.get("back") ?? "/";
  try {
    if (!code) throw new CmsError("缺少登录码");
    const who = await redeem(code);
    const id = await openSession(await database(), { ...who });
    // Only this CMS's own pages: never somewhere else by a link someone made.
    const to = back.startsWith("/") && !back.startsWith("//") ? back : "/";
    const res = NextResponse.redirect(new URL(to, base));
    res.cookies.set(SESSION_COOKIE, id, {
      httpOnly: true,
      sameSite: "lax",
      secure: base.startsWith("https://"),
      path: "/",
    });
    return res;
  } catch (e) {
    const reason = e instanceof CmsError ? e.message : "登录失败，请稍后再试";
    return NextResponse.redirect(new URL(`/login?reason=${encodeURIComponent(reason)}`, base));
  }
}
