import { NextResponse, type NextRequest } from "next/server";
import { TYPES } from "@/lib/catalog";
import { currentUser, database } from "@/lib/server";
import { getCode, revisionsById } from "@/lib/store";
import { LANG_COOKIE, langOf, say } from "@/lib/words";

/**
 * A built-in template's code as its own file (S6): /api/code?id=<type>, its working copy, or &version=<id>, one of its
 * versions; <type>.tsx, for a signed-in staff member (anyone may read it; replacing it is 超级管理员's).
 */
export async function GET(req: NextRequest) {
  const lang = langOf(req.cookies.get(LANG_COOKIE)?.value);
  if (!(await currentUser()))
    return new NextResponse(say({ key: "errors.signInFirst" }, lang), { status: 401 });
  const q = req.nextUrl.searchParams;
  const id = q.get("id") ?? "";
  const version = Number(q.get("version")) || 0;
  const pg = await database();
  const source = !TYPES[id]
    ? undefined
    : version
      ? ((await revisionsById(pg, [version])).get(`code:${id}`)?.data as { source?: string } | undefined)
          ?.source
      : (await getCode(pg, id))?.source;
  if (source === undefined)
    return new NextResponse(say({ key: "errors.noFile", values: { id: `${id}.tsx` } }, lang), {
      status: 404,
    });
  return new NextResponse(source, {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "content-disposition": `attachment; filename="${id}.tsx"`,
      "cache-control": "no-store",
    },
  });
}
