import { NextResponse, type NextRequest } from "next/server";
import { currentUser, database } from "@/lib/server";
import type { Kind } from "@/lib/store";
import { exportDoc, toXml } from "@/lib/transfer";
import { CmsError, LANG_COOKIE, langOf, say } from "@/lib/words";

/** A download: /api/export?kind=page|component|global|texts|site&id=…&format=json|xml, for a signed-in staff member. */
export async function GET(req: NextRequest) {
  const lang = langOf(req.cookies.get(LANG_COOKIE)?.value);
  if (!(await currentUser()))
    return new NextResponse(say({ key: "errors.signInFirst" }, lang), { status: 401 });
  const q = req.nextUrl.searchParams;
  const kind = (q.get("kind") ?? "site") as Kind | "texts" | "site";
  const id = q.get("id") ?? undefined;
  const xml = q.get("format") === "xml";
  try {
    const doc = await exportDoc(await database(), kind, id);
    // A page as its name (S9: uploaded again under that name, it goes back to it); the rest by kind, id and date.
    const pageName = (doc.kind === "webpage" || doc.kind === "page") && doc.page.name;
    const name =
      pageName ||
      `cms-${kind}${id ? `-${id.replace(/[^\w-]/g, "_")}` : ""}-${new Date().toISOString().slice(0, 10)}`;
    return new NextResponse(xml ? toXml(doc) : JSON.stringify(doc, null, 2) + "\n", {
      headers: {
        "content-type": xml ? "application/xml; charset=utf-8" : "application/json; charset=utf-8",
        // A name in Chinese too: plain in filename, whole in filename* (RFC 6266).
        "content-disposition": `attachment; filename="${name.replace(/[^\x20-\x7e]|"/g, "_")}.${xml ? "xml" : "json"}"; filename*=UTF-8''${encodeURIComponent(`${name}.${xml ? "xml" : "json"}`)}`,
        "cache-control": "no-store",
      },
    });
  } catch (e) {
    return new NextResponse(say(e instanceof CmsError ? e.msg : { key: "errors.failed" }, lang), {
      status: 400,
    });
  }
}
